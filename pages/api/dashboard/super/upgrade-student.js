import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import bcrypt from 'bcryptjs';
import { invalidateUserCaches } from '../../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

export default async (req, res) => {
  // التحقق من الصلاحية (Super Admin فقط)
  const { error } = await requireSuperAdmin(req, res);
  if (error) return;

  // ============================================================
  // GET: البحث عن طالب (بالاسم / اليوزرنيم / الهاتف / المعرف)
  // ============================================================
  if (req.method === 'GET') {
    const { search } = req.query;

    if (!search || !search.trim()) {
      return res.status(200).json({ students: [] });
    }

    const term = search.trim();

    try {
      let query = supabase
        .from('users')
        .select('id, first_name, username, phone, created_at, is_blocked')
        .eq('role', 'student');

      let orQuery = `first_name.ilike.%${term}%,username.ilike.%${term}%,phone.ilike.%${term}%`;
      if (/^\d+$/.test(term)) {
        orQuery += `,id.eq.${term}`;
      }

      query = query.or(orQuery).limit(15);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      return res.status(200).json({ students: data || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // POST: ترقية طالب موجود إلى مدرس
  // ============================================================
  if (req.method === 'POST') {
    const {
      user_id, specialty, bio, whatsapp_number, payment_details,
      dashboard_username, dashboard_password
    } = req.body;

    // 1. التحقق من الحقول الإجبارية
    if (!user_id || !specialty || !dashboard_username || !dashboard_password) {
      return res.status(400).json({ error: 'الرجاء تعبئة كافة الحقول المطلوبة (التخصص، وبيانات دخول لوحة التحكم)' });
    }

    try {
      // 2. جلب بيانات الطالب والتأكد من أنه طالب فعلاً
      const { data: student, error: sError } = await supabase
        .from('users')
        .select('id, first_name, username, phone, role, teacher_profile_id')
        .eq('id', user_id)
        .single();

      if (sError || !student) {
        return res.status(404).json({ error: 'لم يتم العثور على هذا الطالب.' });
      }

      if (student.role !== 'student') {
        return res.status(400).json({ error: 'هذا الحساب ليس حساب طالب، لا يمكن ترقيته.' });
      }

      // 3. فحص تكرار اسم مستخدم لوحة التحكم (Dashboard username)
      const { data: dupCheck } = await supabase
        .from('users')
        .select('id')
        .eq('admin_username', dashboard_username)
        .neq('id', user_id);

      if (dupCheck && dupCheck.length > 0) {
        return res.status(400).json({ error: 'اسم مستخدم لوحة التحكم (Dashboard) مسجل مسبقاً.' });
      }

      // 4. إنشاء بروفايل المدرس الجديد
      const { data: teacher, error: tError } = await supabase
        .from('teachers')
        .insert({
          name: student.first_name,
          specialty,
          bio,
          whatsapp_number,
          payment_details: payment_details || { cash_numbers: [], instapay_links: [], instapay_numbers: [] }
        })
        .select('id')
        .single();

      if (tError) throw tError;

      // 5. تشفير كلمة مرور لوحة التحكم
      const hashedAdminPass = await bcrypt.hash(dashboard_password, 10);

      // 6. تحديث حساب الطالب ليصبح حساب مدرس
      // ملاحظة: نُبقي على username/password الخاصين بالتطبيق كما هما (بيانات دخول المدرس للتطبيق)
      const { error: uError } = await supabase
        .from('users')
        .update({
          admin_username: dashboard_username,
          admin_password: hashedAdminPass,
          role: 'teacher',
          teacher_profile_id: teacher.id,
          is_admin: false
        })
        .eq('id', user_id);

      if (uError) {
        // تراجع: حذف بروفايل المدرس في حال فشل تحديث المستخدم
        await supabase.from('teachers').delete().eq('id', teacher.id);
        throw uError;
      }

      invalidateUserCaches(user_id); // 🗄️ تغيّر الدور (طالب ← مدرس)

      return res.status(200).json({ success: true });

    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'بيانات مكررة (اسم مستخدم لوحة التحكم) موجودة بالفعل.' });
      }
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
