import { supabase } from '../../../lib/supabaseClient';
import bcrypt from 'bcryptjs';
import { consumeVerifyToken } from '../../../lib/otpHelper';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req, res) => {
  // ⏱️ Logger بيطبع الوقت المنقضي من بداية الريكوست لحد كل خطوة
  const t0 = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);
  const log = (step, extra = '') => {
    console.log(`[signup:${reqId}] +${Date.now() - t0}ms | ${step}${extra ? ' | ' + extra : ''}`);
  };
  log('start');

  // السماح فقط بطلبات POST
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { firstName, username, password, phone, email, verifyToken } = req.body;
  log('body parsed', `username=${username} hasEmail=${!!email} hasPhone=${!!phone}`);

  // معالجة رقم الهاتف ليكون null حقيقي إذا لم يتم إدخاله
  const phoneToSave = (phone && phone !== 'null' && phone.trim() !== '') ? phone : null;

  if (!firstName || !username || !password) {
    log('validation failed: missing required fields');
    return res.status(400).json({ success: false, message: 'الاسم واسم المستخدم وكلمة المرور حقول مطلوبة' });
  }

  // 🆕 توافق الإصدارين: البريد إلزامي فقط إذا أرسله الكلاينت (نسخة iOS الجديدة)
  // النسخ القديمة (Android قيد المراجعة) لا ترسل email/verifyToken إطلاقاً
  const isEmailFlow = email !== undefined && email !== null && email !== '';

  let emailToSave = null;

  if (isEmailFlow) {
    if (!EMAIL_REGEX.test(email)) {
      log('validation failed: bad email format');
      return res.status(400).json({ success: false, message: 'يرجى إدخال بريد إلكتروني صحيح' });
    }
    if (!verifyToken) {
      log('validation failed: missing verifyToken');
      return res.status(400).json({ success: false, message: 'يجب التحقق من البريد الإلكتروني أولاً' });
    }
    emailToSave = email.trim().toLowerCase();
  }

  // 3. التحقق من الصيغ
  const usernameRegex = /^[a-zA-Z0-9]+$/;
  if (!usernameRegex.test(username)) {
    log('validation failed: bad username format');
    return res.status(400).json({ success: false, message: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط.' });
  }

  if (password.length < 6) {
    log('validation failed: password too short');
    return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  log('sync validation passed, entering try block', `isEmailFlow=${isEmailFlow}`);

  // wrapper بيلف أي promise ويطبع وقتها لوحدها لما تخلص، عشان نعرف مين المسبب للبطء
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

  try {
    log('parallel checks: start');

    // ⚡ نشغّل كل الفحوصات المستقلة (verifyToken + تكرار username/email/phone)
    // بالتوازي بدل ما ننتظر كل واحدة لوحدها (كانت هي سبب البطء في مسار الـ OTP)
    const [
      isEmailVerified,
      { data: existingUser },
      { data: existingEmail },
      { data: existingPhone },
      hashedPassword,
    ] = await Promise.all([
      timed(
        'consumeVerifyToken',
        isEmailFlow
          ? consumeVerifyToken({ email: emailToSave, purpose: 'signup', verifyToken })
          : Promise.resolve(true)
      ),
      timed(
        'username lookup',
        supabase.from('users').select('id').eq('username', username).maybeSingle()
      ),
      timed(
        'email lookup',
        isEmailFlow
          ? supabase.from('users').select('id').eq('email', emailToSave).maybeSingle()
          : Promise.resolve({ data: null })
      ),
      timed(
        'phone lookup',
        phoneToSave
          ? supabase.from('users').select('id').eq('phone', phoneToSave).maybeSingle()
          : Promise.resolve({ data: null })
      ),
      timed('bcrypt.hash', bcrypt.hash(password, 10)),
    ]);

    log('parallel checks: all settled');

    if (isEmailFlow && !isEmailVerified) {
      log('rejected: invalid/expired verifyToken');
      return res.status(400).json({
        success: false,
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية. يرجى إعادة التحقق من البريد الإلكتروني.',
      });
    }
    const emailVerified = isEmailFlow;

    if (existingUser) {
      log('rejected: username taken');
      return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل، اختر اسماً آخر.' });
    }

    if (isEmailFlow && existingEmail) {
      log('rejected: email taken');
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل.' });
    }

    if (phoneToSave && existingPhone) {
      log('rejected: phone taken');
      return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً. حاول تسجيل الدخول.' });
    }

    const insertPayload = {
      first_name: firstName,
      username: username,
      password: hashedPassword,
      phone: phoneToSave,
      is_admin: false,
      is_blocked: false
    };

    // نضيف حقول الإيميل فقط لو النسخة بترسلها، عشان مانكتبش email: null
    // فوق مستخدمين قدامى/نسخ تانية ممكن يكون عندها constraint مختلف
    if (isEmailFlow) {
      insertPayload.email = emailToSave;
      insertPayload.email_verified = emailVerified;
    }

    log('insert: start');
    const { error: insertError } = await timed('users insert', supabase.from('users').insert(insertPayload));

    if (insertError) throw insertError;

    log('success, sending response', `total=${Date.now() - t0}ms`);
    return res.status(200).json({ success: true, message: 'تم إنشاء الحساب بنجاح!' });

  } catch (error) {
    log('EXCEPTION', `total=${Date.now() - t0}ms | ${error?.message || error}`);
    console.error('Signup Error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
