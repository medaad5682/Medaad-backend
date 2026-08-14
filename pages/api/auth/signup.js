import { supabase } from '../../../lib/supabaseClient';
import bcrypt from 'bcryptjs';
import { consumeVerifyToken } from '../../../lib/otpHelper';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req, res) => {
  // السماح فقط بطلبات POST
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { firstName, username, password, phone, email, verifyToken } = req.body;

  // معالجة رقم الهاتف ليكون null حقيقي إذا لم يتم إدخاله
  const phoneToSave = (phone && phone !== 'null' && phone.trim() !== '') ? phone : null;

  if (!firstName || !username || !password) {
    return res.status(400).json({ success: false, message: 'الاسم واسم المستخدم وكلمة المرور حقول مطلوبة' });
  }

  // توافق الإصدارين: البريد إلزامي فقط إذا أرسله الكلاينت (نسخة iOS الجديدة).
  // النسخ القديمة (Android قيد المراجعة) لا ترسل email/verifyToken إطلاقاً.
  const isEmailFlow = email !== undefined && email !== null && email !== '';

  let emailToSave = null;

  if (isEmailFlow) {
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال بريد إلكتروني صحيح' });
    }
    if (!verifyToken) {
      return res.status(400).json({ success: false, message: 'يجب التحقق من البريد الإلكتروني أولاً' });
    }
    emailToSave = email.trim().toLowerCase();
  }

  // 3. التحقق من الصيغ
  const usernameRegex = /^[a-zA-Z0-9]+$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  try {
    // ⚡ نشغّل كل الفحوصات المستقلة (verifyToken + تكرار username/email/phone)
    // بالتوازي بدل ما ننتظر كل واحدة لوحدها.
    const [
      isEmailVerified,
      { data: existingUser },
      { data: existingEmail },
      { data: existingPhone },
      hashedPassword,
    ] = await Promise.all([
      isEmailFlow
        ? consumeVerifyToken({ email: emailToSave, purpose: 'signup', verifyToken })
        : Promise.resolve(true),
      supabase.from('users').select('id').eq('username', username).maybeSingle(),
      isEmailFlow
        ? supabase.from('users').select('id').eq('email', emailToSave).maybeSingle()
        : Promise.resolve({ data: null }),
      phoneToSave
        ? supabase.from('users').select('id').eq('phone', phoneToSave).maybeSingle()
        : Promise.resolve({ data: null }),
      bcrypt.hash(password, 10),
    ]);

    if (isEmailFlow && !isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية. يرجى إعادة التحقق من البريد الإلكتروني.',
      });
    }
    const emailVerified = isEmailFlow;

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل، اختر اسماً آخر.' });
    }

    if (isEmailFlow && existingEmail) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل.' });
    }

    if (phoneToSave && existingPhone) {
      return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً. حاول تسجيل الدخول.' });
    }

    // 6. تشفير كلمة المرور وإنشاء الحساب
    const insertPayload = {
      first_name: firstName,
      username: username,
      password: hashedPassword,
      phone: phoneToSave,
      is_admin: false,
      is_blocked: false
    };

    // نضيف حقول الإيميل فقط لو النسخة بترسلها، عشان مانكتبش email: null
    // فوق مستخدمين قدامى/نسخ تانية ممكن يكون عندها constraint مختلف.
    if (isEmailFlow) {
      insertPayload.email = emailToSave;
      insertPayload.email_verified = emailVerified;
    }

    const { error: insertError } = await supabase
      .from('users')
      .insert(insertPayload);

    if (insertError) throw insertError;

    return res.status(200).json({ success: true, message: 'تم إنشاء الحساب بنجاح!' });

  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
