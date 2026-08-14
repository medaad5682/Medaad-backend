import { supabase } from '../../../lib/supabaseClient';
import bcrypt from 'bcryptjs';

export default async (req, res) => {
  // السماح فقط بطلبات POST
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { firstName, username, password, phone } = req.body;

  // ✅ تعديل 1: معالجة رقم الهاتف ليكون null حقيقي إذا لم يتم إدخاله
  // نعالج الحالة إذا كان "null" كنص، أو نص فارغ، أو undefined
  const phoneToSave = (phone && phone !== 'null' && phone.trim() !== '') ? phone : null;

  // ✅ تعديل 2: إزالة phone من شرط التحقق من وجود البيانات
  if (!firstName || !username || !password) {
    return res.status(400).json({ success: false, message: 'الاسم واسم المستخدم وكلمة المرور حقول مطلوبة' });
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
    // 4. التحقق من عدم تكرار اسم المستخدم
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل، اختر اسماً آخر.' });
    }

    // ✅ تعديل 3: التحقق من تكرار الهاتف فقط إذا كانت القيمة ليست null
    if (phoneToSave) {
      const { data: existingPhone } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneToSave) // نستخدم القيمة المعالجة
        .maybeSingle();

      if (existingPhone) {
        return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً. حاول تسجيل الدخول.' });
      }
    }

    // 6. تشفير كلمة المرور وإنشاء الحساب
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase
      .from('users')
      .insert({
        first_name: firstName,
        username: username,
        password: hashedPassword,
        phone: phoneToSave, // ✅ تعديل 4: حفظ القيمة المعالجة (رقم أو null)
        is_admin: false,
        is_blocked: false
      });

    if (insertError) throw insertError;

    return res.status(200).json({ success: true, message: 'تم إنشاء الحساب بنجاح!' });

  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
