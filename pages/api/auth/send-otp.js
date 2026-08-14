// pages/api/auth/send-otp.js
import { supabase } from '../../../lib/supabaseClient';
import { requestOtp, maskEmail } from '../../../lib/otpHelper';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;
const PHONE_REGEX = /^01[0-9]{9}$/;
const ALLOWED_PURPOSES = ['signup', 'reset_password', 'change_email'];

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  // Same app-secret gate used by the rest of the auth endpoints
  const appSecret = req.headers['x-app-secret'];
  if (appSecret !== process.env.APP_SECRET) {
    return res.status(403).json({ success: false, message: 'غير مصرح لك باستخدام هذا الرابط' });
  }

  let { email, purpose, username, phone, identifier } = req.body;
  purpose = ALLOWED_PURPOSES.includes(purpose) ? purpose : 'signup';

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

      const result = await requestOtp({ email: accountEmail, purpose });

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
        return res.status(400).json({ success: false, message: 'رقم هاتف غير صالح (11 رقم يبدأ بـ 01)' });
      }

      const { data: existingEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل' });
      }

      const { data: existingUsername } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل، اختر اسماً آخر.' });
      }

      if (phoneToCheck) {
        const { data: existingPhone } = await supabase
          .from('users')
          .select('id')
          .eq('phone', phoneToCheck)
          .maybeSingle();

        if (existingPhone) {
          return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً. حاول تسجيل الدخول.' });
        }
      }
    }

    const result = await requestOtp({ email, purpose });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    return res.status(200).json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
  } catch (error) {
    console.error('send-otp error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
