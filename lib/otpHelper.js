// lib/otpHelper.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase } from './supabaseClient';
import { sendMail } from './mailer';


const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_TOKEN_TTL_MINUTES = 15;

/**
 * Masks an email for display purposes, e.g. "ahmed123@gmail.com" -> "ah*****3@g****.com".
 * Never exposes the full address, only enough for the user to recognize their own inbox.
 */
export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!local || !domain) return email;

  const maskedLocal =
    local.length <= 2
      ? local[0] + '*'.repeat(Math.max(local.length - 1, 1))
      : local.slice(0, 2) + '*'.repeat(Math.max(local.length - 3, 1)) + local.slice(-1);

  const domainParts = domain.split('.');
  const domainName = domainParts[0] || '';
  const tld = domainParts.slice(1).join('.');
  const maskedDomainName =
    domainName.length <= 2
      ? domainName[0] + '*'
      : domainName[0] + '*'.repeat(Math.max(domainName.length - 1, 1));

  return `${maskedLocal}@${maskedDomainName}${tld ? '.' + tld : ''}`;
}

function generateNumericCode(length = OTP_LENGTH) {
  // crypto-secure, not Math.random()
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}

function emailTemplate(code) {
  const text =
    `مرحباً،\n\n` +
    `رمز التحقق الخاص بك في تطبيق Medaad هو: ${code}\n` +
    `هذا الرمز صالح لمدة ${OTP_TTL_MINUTES} دقائق فقط. لا تشاركه مع أي شخص.\n\n` +
    `إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.\n\n` +
    `Medaad`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#111">رمز التحقق - Medaad</h2>
      <p>رمز التحقق الخاص بك هو:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f4f4f5;padding:16px 24px;border-radius:8px;text-align:center;color:#111">
        ${code}
      </div>
      <p style="color:#555;margin-top:16px">هذا الرمز صالح لمدة ${OTP_TTL_MINUTES} دقائق فقط. لا تشاركه مع أي شخص.</p>
      <p style="color:#999;font-size:12px">إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.</p>
    </div>`;

  return { text, html };
}

/**
 * Creates + emails a new OTP for `email`.
 * Applies simple rate limiting (cooldown + hourly cap) to avoid mail-bombing abuse.
 * Returns { ok: true } or { ok: false, status, message }.
 */
export async function requestOtp({ email, purpose = 'signup' }) {
  const now = new Date();

  // 1. Rate limiting: look at the most recent row for this email+purpose
  const { data: last } = await supabase
    .from('otp_verifications')
    .select('id, created_at, send_count')
    .eq('email', email)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    const secondsSinceLast = (now.getTime() - new Date(last.created_at).getTime()) / 1000;
    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        status: 429,
        message: `يرجى الانتظار ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast)} ثانية قبل طلب رمز جديد.`,
      };
    }
  }

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('otp_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('purpose', purpose)
    .gte('created_at', oneHourAgo);

  if ((count || 0) >= MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      message: 'تم تجاوز الحد المسموح لطلب رموز التحقق. حاول لاحقاً.',
    };
  }

  // 2. Generate + hash the code (never store it in plain text)
  const code = generateNumericCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from('otp_verifications').insert({
    email,
    code_hash: codeHash,
    purpose,
    attempts: 0,
    max_attempts: MAX_VERIFY_ATTEMPTS,
    verified: false,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error('OTP insert error:', insertError);
    return { ok: false, status: 500, message: 'تعذر إنشاء رمز التحقق' };
  }

  // 3. Send the email over the Hostup relay
  const { text, html } = emailTemplate(code);
  try {
    await sendMail({ to: email, subject: 'رمز التحقق - Medaad', text, html });
  } catch (mailError) {
    console.error('OTP email send error:', mailError);
    return { ok: false, status: 502, message: 'تعذر إرسال البريد الإلكتروني، حاول لاحقاً' };
  }

  return { ok: true };
}

/**
 * Verifies a code for `email`. On success, issues a short-lived one-time
 * `verifyToken` that the client must pass to the following step
 * (e.g. /api/auth/signup) to prove the email was actually confirmed.
 */
export async function verifyOtp({ email, code, purpose = 'signup' }) {
  const now = new Date();

  const { data: row } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('email', email)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return { ok: false, status: 400, message: 'لم يتم طلب رمز تحقق لهذا البريد الإلكتروني' };
  }

  if (row.verified) {
    return { ok: false, status: 400, message: 'تم التحقق من هذا البريد الإلكتروني بالفعل' };
  }

  if (new Date(row.expires_at) < now) {
    return { ok: false, status: 400, message: 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.' };
  }

  if (row.attempts >= row.max_attempts) {
    return { ok: false, status: 429, message: 'تم تجاوز عدد المحاولات المسموح بها. اطلب رمزاً جديداً.' };
  }

  const isMatch = await bcrypt.compare(String(code), row.code_hash);

  if (!isMatch) {
    await supabase
      .from('otp_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);
    return { ok: false, status: 400, message: 'رمز التحقق غير صحيح' };
  }

  // Success: mark verified + issue a one-time token for the next step
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyTokenExpiresAt = new Date(
    now.getTime() + VERIFY_TOKEN_TTL_MINUTES * 60 * 1000
  ).toISOString();

  await supabase
    .from('otp_verifications')
    .update({
      verified: true,
      verify_token: verifyToken,
      verify_token_expires_at: verifyTokenExpiresAt,
    })
    .eq('id', row.id);

  return { ok: true, verifyToken };
}

/**
 * Used by signup.js (or reset-password.js) to confirm that the given
 * verifyToken really corresponds to a verified OTP for that email+purpose,
 * and hasn't expired or been consumed already.
 */
export async function consumeVerifyToken({ email, purpose, verifyToken }) {
  const { data: row } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('email', email)
    .eq('purpose', purpose)
    .eq('verify_token', verifyToken)
    .maybeSingle();

  if (!row || !row.verified) return false;
  if (new Date(row.verify_token_expires_at) < new Date()) return false;

  // one-time use: clear the token so it can't be replayed
  await supabase
    .from('otp_verifications')
    .update({ verify_token: null })
    .eq('id', row.id);

  return true;
}

