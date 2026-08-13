// pages/api/auth/reset-password.js
import { supabase } from '../../../lib/supabaseClient';
import bcrypt from 'bcryptjs';
import { consumeVerifyToken } from '../../../lib/otpHelper';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  const appSecret = req.headers['x-app-secret'];
  if (appSecret !== process.env.APP_SECRET) {
    return res.status(403).json({ success: false, message: 'غير مصرح لك باستخدام هذا الرابط' });
  }

  let { email, verifyToken, newPassword } = req.body;

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال بريد إلكتروني صحيح' });
  }
  if (!verifyToken) {
    return res.status(400).json({ success: false, message: 'يجب التحقق من البريد الإلكتروني أولاً' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  const emailToCheck = email.trim().toLowerCase();

  try {
    // تأكيد أن verifyToken صالح وفعلاً ناتج عن تحقق OTP ناجح لهذا البريد
    // بغرض "reset_password" تحديداً (لا يمكن استخدام توكن تسجيل الدخول هنا).
    const isEmailVerified = await consumeVerifyToken({
      email: emailToCheck,
      purpose: 'reset_password',
      verifyToken,
    });

    if (!isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية. يرجى إعادة طلب رمز جديد.',
      });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailToCheck)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({ success: false, message: 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // تحديث كلمة المرور + إبطال أي جلسة دخول حالية (JWT) وتصفير قفل
    // المحاولات الفاشلة، تماماً كما يحدث بعد نجاح تسجيل الدخول.
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        jwt_token: null,
        failed_attempts: 0,
        lockout_until: null,
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    return res.status(200).json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
