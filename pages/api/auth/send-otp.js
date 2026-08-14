// pages/api/auth/send-otp.js
import { supabase } from '../../../lib/supabaseClient';
import { requestOtp, maskEmail } from '../../../lib/otpHelper';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;
const PHONE_REGEX = /^01[0-9]{9}$/;
const ALLOWED_PURPOSES = ['signup', 'reset_password', 'change_email'];

export default async (req, res) => {
  // ⏱️ نفس منطق اللوجينج اللي في signup.js عشان نعرف أي خطوة هي المسؤولة
  // عن البطء اللي بيحصل لما المستخدم يدوس "إنشاء حساب" (اللي بيستدعي
  // send-otp فعلياً، مش signup.js — signup.js بيتنفذ بعد التحقق من OTP)
  const t0 = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);
  const log = (step, extra = '') => {
    console.log(`[send-otp:${reqId}] +${Date.now() - t0}ms | ${step}${extra ? ' | ' + extra : ''}`);
  };
  const timed = (label, promise) => {
    const s = Date.now();
    return Promise.resolve(promise).then(
      (result) => {
        log(`⤷ ${label} done`, `took ${Date.now() - s}ms`);
        return result;
      },
      (err) => {
        log(`⤷ ${label} FAILED`, `took ${Date.now() - s}ms | ${err?.message || err}`);
        throw err;
      }
    );
  };
  log('start');

  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  // Same app-secret gate used by the rest of the auth endpoints
  const appSecret = req.headers['x-app-secret'];
  if (appSecret !== process.env.APP_SECRET) {
    log('rejected: bad app secret');
    return res.status(403).json({ success: false, message: 'غير مصرح لك باستخدام هذا الرابط' });
  }

  let { email, purpose, username, phone, identifier } = req.body;
  purpose = ALLOWED_PURPOSES.includes(purpose) ? purpose : 'signup';
  log('body parsed', `purpose=${purpose} username=${username} hasPhone=${!!phone}`);

  try {
    // ============================================================
    // 🆕 reset_password: the user identifies their account with ANY
    // ONE of username / phone / email (not all three). We look the
    // account up, then always send the code to that account's own
    // registered email — never to the raw identifier the user typed
    // (e.g. if they typed their phone, we still email the account's
    // email on file, masked, so the client knows where to check).
    // ============================================================
    if (purpose === 'reset_password') {
      const rawIdentifier = (identifier ?? username ?? phone ?? email ?? '').toString().trim();

      if (!rawIdentifier) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني' });
      }

      // Same generic message no matter which field was wrong/missing —
      // avoids leaking whether a given username/phone/email exists.
      const genericError = { success: false, message: 'لا يوجد حساب مطابق للبيانات المدخلة' };

      let query = supabase.from('users').select('id, email').limit(1);

      if (EMAIL_REGEX.test(rawIdentifier)) {
        query = query.eq('email', rawIdentifier.toLowerCase());
      } else if (PHONE_REGEX.test(rawIdentifier)) {
        query = query.eq('phone', rawIdentifier);
      } else if (USERNAME_REGEX.test(rawIdentifier)) {
        query = query.eq('username', rawIdentifier);
      } else {
        return res.status(400).json(genericError);
      }

      const { data: existing } = await query.maybeSingle();

      if (!existing || !existing.email) {
        return res.status(400).json(genericError);
      }

      const accountEmail = existing.email;

      log('calling requestOtp (DB writes + SMTP send)');
      const result = await requestOtp({ email: accountEmail, purpose, log });

      if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.message });
      }

      return res.status(200).json({
        success: true,
        message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
        // 'email' is the real address — the client needs it to call
        // verify-otp / reset-password next (those endpoints match rows by
        // exact email). 'maskedEmail' is ONLY for display in the UI so the
        // full address is never shown on screen.
        email: accountEmail,
        maskedEmail: maskEmail(accountEmail),
      });
    }

    // ============================================================
    // signup / change_email: unchanged — these always operate on an
    // explicit email address supplied by the client.
    // ============================================================
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال بريد إلكتروني صحيح' });
    }
    email = email.trim().toLowerCase();

    if (purpose === 'signup') {
      // 🆕 التحقق من توفر اسم المستخدم ورقم الهاتف *قبل* إرسال الرمز، حتى لا
      //    يتحقق المستخدم من بريده ثم يُرفض عند إنشاء الحساب لسبب لم يكن يعرفه.
      if (!username || !USERNAME_REGEX.test(username)) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط.' });
      }

      const phoneToCheck = (phone && phone !== 'null' && String(phone).trim() !== '') ? String(phone).trim() : null;
      if (phoneToCheck && !PHONE_REGEX.test(phoneToCheck)) {
        log('rejected: bad phone format');
        return res.status(400).json({ success: false, message: 'رقم هاتف غير صالح (11 رقم يبدأ بـ 01)' });
      }

      // ⚡ الثلاث فحوصات دي مستقلة عن بعضها (كل واحدة بتقرأ عمود مختلف) —
      // كانت بتتنفذ واحدة ورا التانية (3 round-trips للـ DB بالتتابع)،
      // بقت تتنفذ متوازية زي ما عملنا في signup.js بالظبط.
      log('existence checks: start');
      const [
        { data: existingEmail },
        { data: existingUsername },
        { data: existingPhone },
      ] = await Promise.all([
        timed('email lookup', supabase.from('users').select('id').eq('email', email).maybeSingle()),
        timed('username lookup', supabase.from('users').select('id').eq('username', username).maybeSingle()),
        timed(
          'phone lookup',
          phoneToCheck
            ? supabase.from('users').select('id').eq('phone', phoneToCheck).maybeSingle()
            : Promise.resolve({ data: null })
        ),
      ]);
      log('existence checks: all settled');

      if (existingEmail) {
        log('rejected: email taken');
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل' });
      }

      if (existingUsername) {
        log('rejected: username taken');
        return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل، اختر اسماً آخر.' });
      }

      if (phoneToCheck && existingPhone) {
        log('rejected: phone taken');
        return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً. حاول تسجيل الدخول.' });
      }
    }

    log('calling requestOtp (DB writes + SMTP send)');
    const result = await requestOtp({ email, purpose, log });

    if (!result.ok) {
      log('requestOtp rejected', `status=${result.status}`);
      return res.status(result.status).json({ success: false, message: result.message });
    }

    log('success, sending response', `total=${Date.now() - t0}ms`);
    return res.status(200).json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
  } catch (error) {
    log('EXCEPTION', `total=${Date.now() - t0}ms | ${error?.message || error}`);
    console.error('send-otp error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
