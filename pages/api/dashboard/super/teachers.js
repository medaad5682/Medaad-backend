import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { VALID_BILLING_METHODS } from '../../../../lib/teacherBillingHelper';
import bcrypt from 'bcryptjs';
import { invalidateAllAuthCaches } from '../../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

// --- دالة مساعدة للتحقق من حقول طريقة حساب الأرباح (Billing Method) ---
// ترجع { error } لو في مشكلة، أو { billing_method, custom_percentage, new_student_price,
// new_student_lookback_mode, new_student_lookback_since } بعد التطبيع (Normalization) لو البيانات سليمة.
function validateBillingFields(body) {
  const method = body.billing_method || 'percentage';

  if (!VALID_BILLING_METHODS.includes(method)) {
    return { error: 'طريقة حساب أرباح غير معروفة' };
  }

  let customPercentage = null;
  if (body.custom_percentage !== undefined && body.custom_percentage !== null && body.custom_percentage !== '') {
    const val = Number(body.custom_percentage);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      return { error: 'النسبة الخاصة يجب أن تكون رقماً بين 0 و 100' };
    }
    customPercentage = val;
  }

  let newStudentPrice = 0;
  if (body.new_student_price !== undefined && body.new_student_price !== null && body.new_student_price !== '') {
    const val = Number(body.new_student_price);
    if (!Number.isFinite(val) || val < 0) {
      return { error: 'سعر الطالب الجديد يجب أن يكون رقماً موجباً' };
    }
    newStudentPrice = val;
  }

  // --- نطاق فحص "الطالب الجديد" (new_student_lookback) ---
  // forever (افتراضي) = يفحص كل تاريخ الطالب مع هذا المدرس.
  // since_date = يتجاهل أي اشتراك سابق لتاريخ محدد، فيُعتبر الطالب "جديد" مرة أخرى.
  const lookbackMode = body.new_student_lookback_mode === 'since_date' ? 'since_date' : 'forever';

  let lookbackSince = null;
  if (lookbackMode === 'since_date') {
    const raw = body.new_student_lookback_since;
    if (!raw) {
      return { error: 'من فضلك حدد التاريخ الذي يبدأ منه فحص الاشتراكات القديمة' };
    }
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) {
      return { error: 'تاريخ فحص الاشتراكات القديمة غير صالح' };
    }
    // نخزن جزء التاريخ فقط (عمود من نوع date في قاعدة البيانات)
    lookbackSince = raw.slice(0, 10);
  }

  return {
    billing_method: method,
    custom_percentage: customPercentage,
    new_student_price: newStudentPrice,
    new_student_lookback_mode: lookbackMode,
    new_student_lookback_since: lookbackSince,
  };
}

// --- دالة مساعدة للتحقق من التكرار (Validation) ---
async function checkUniqueness(phone, dashboard_username, app_username, excludeUserId = null) {
  const errors = [];

  // 1. التحقق من رقم الهاتف
  if (phone) {
    let query = supabase.from('users').select('id').eq('phone', phone);
    if (excludeUserId) query = query.neq('id', excludeUserId);
    const { data } = await query;
    if (data && data.length > 0) errors.push('رقم الهاتف مسجل بالفعل لمستخدم آخر.');
  }

  // 2. التحقق من يوزرنيم الداشبورد (admin_username)
  if (dashboard_username) {
    let query = supabase.from('users').select('id').eq('admin_username', dashboard_username);
    if (excludeUserId) query = query.neq('id', excludeUserId);
    const { data } = await query;
    if (data && data.length > 0) errors.push('اسم مستخدم لوحة التحكم (Dashboard) مسجل مسبقاً.');
  }

  // 3. التحقق من يوزرنيم التطبيق (username)
  if (app_username) {
    let query = supabase.from('users').select('id').eq('username', app_username);
    if (excludeUserId) query = query.neq('id', excludeUserId);
    const { data } = await query;
    if (data && data.length > 0) errors.push('اسم مستخدم التطبيق (App) مسجل مسبقاً.');
  }

  return errors;
}

export default async (req, res) => {
  // التحقق من الصلاحية (Super Admin)
  const { error } = await requireSuperAdmin(req, res);
  if (error) return;

  // ============================================================
  // GET: جلب المدرسين + حساباتهم + المشرفين
  // ============================================================
  if (req.method === 'GET') {
    try {
      // نجلب بيانات المدرسين وكافة المستخدمين المرتبطين بهم
      const { data, error: fetchError } = await supabase
        .from('teachers')
        .select(`
          *,
          users!teacher_profile_id (
            id,
            first_name,
            username,
            admin_username,
            phone,
            role,
            is_blocked,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // تنسيق البيانات
      const formatted = data.map(t => {
        // 1. استخراج حساب المدرس الرئيسي (role = teacher)
        const mainAccount = t.users?.find(u => u.role === 'teacher') || {};
        
        // 2. استخراج المشرفين المساعدين (role = moderator)
        const moderators = t.users?.filter(u => u.role === 'moderator') || [];

        return {
          ...t,
          // بيانات المدرس الأساسية (من جدول users)
          user_id: mainAccount.id, // مهم للتعديل
          dashboard_username: mainAccount.admin_username || '',
          app_username: mainAccount.username || '',
          phone: mainAccount.phone || t.phone || '', // الأولوية للهاتف في حساب المستخدم
          is_blocked: mainAccount.is_blocked,
          
          // قائمة المشرفين
          moderators: moderators
        };
      });

      return res.status(200).json(formatted);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // POST: إضافة مدرس جديد
  // ============================================================
  if (req.method === 'POST') {
    const { 
        name, specialty, bio, whatsapp_number, phone, payment_details,
        dashboard_username, dashboard_password, 
        app_username, app_password 
    } = req.body;

    // 1. التحقق من الحقول الإجبارية
    if (!name || !phone || !dashboard_username || !dashboard_password || !app_username || !app_password) {
        return res.status(400).json({ error: 'الرجاء تعبئة كافة الحقول المطلوبة (الاسم، الهاتف، وبيانات الدخول)' });
    }

    // 1ب. التحقق من حقول طريقة حساب الأرباح (اختيارية عند الإنشاء — تأخذ الافتراضي "نسبة")
    const billing = validateBillingFields(req.body);
    if (billing.error) {
        return res.status(400).json({ error: billing.error });
    }

    // 2. فحص التكرار (Uniqueness)
    const uniqueErrors = await checkUniqueness(phone, dashboard_username, app_username);
    if (uniqueErrors.length > 0) {
        return res.status(400).json({ error: uniqueErrors.join(' - ') });
    }

    try {
      // 3. إنشاء البروفايل في جدول teachers (بدون الصورة)
      const { data: teacher, error: tError } = await supabase
        .from('teachers')
        .insert({ 
            name, 
            specialty, 
            bio, 
            whatsapp_number,
            // القيمة الافتراضية للدفع إذا لم تُرسل
            payment_details: payment_details || { "cash_numbers": [], "instapay_links": [], "instapay_numbers": [] },
            billing_method: billing.billing_method,
            custom_percentage: billing.custom_percentage,
            new_student_price: billing.new_student_price,
            new_student_lookback_mode: billing.new_student_lookback_mode,
            new_student_lookback_since: billing.new_student_lookback_since
        })
        .select('id')
        .single();
      
      if (tError) throw tError;

      // 4. تشفير كلمات المرور
      const hashedAdminPass = await bcrypt.hash(dashboard_password, 10);
      const hashedAppPass = await bcrypt.hash(app_password, 10);

      // 5. إنشاء حساب المستخدم الرئيسي
      const { error: uError } = await supabase.from('users').insert({
        first_name: name,
        phone: phone,
        
        // بيانات الداشبورد
        admin_username: dashboard_username,
        admin_password: hashedAdminPass,
        
        // بيانات التطبيق
        username: app_username,
        password: hashedAppPass,
        
        role: 'teacher',
        teacher_profile_id: teacher.id,
        is_admin: false,
        is_blocked: false
      });

      if (uError) {
        // تراجع: حذف البروفايل في حال فشل إنشاء المستخدم
        await supabase.from('teachers').delete().eq('id', teacher.id);
        throw uError;
      }

      return res.status(200).json({ success: true });

    } catch (err) {
      // التعامل مع أخطاء القيود (Constraints) كطبقة حماية إضافية
      if (err.code === '23505') {
          return res.status(400).json({ error: 'بيانات مكررة (هاتف أو اسم مستخدم) موجودة بالفعل.' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // PUT: تعديل بيانات مدرس كاملة
  // ============================================================
  if (req.method === 'PUT') {
    const { 
        id, // Teacher Profile ID
        user_id, // User ID (مهم لاستثنائه من فحص التكرار)
        name, specialty, bio, whatsapp_number, phone, payment_details,
        dashboard_username, dashboard_password, 
        app_username, app_password 
    } = req.body;
    
    // محاولة جلب user_id إذا لم يُرسل من الفرونت (احتياطي)
    let targetUserId = user_id;
    if (!targetUserId) {
        const { data: u } = await supabase.from('users')
            .select('id')
            .eq('teacher_profile_id', id)
            .eq('role', 'teacher')
            .single();
        targetUserId = u?.id;
    }

    // 1. فحص التكرار (مع استثناء المستخدم الحالي)
    const uniqueErrors = await checkUniqueness(phone, dashboard_username, app_username, targetUserId);
    if (uniqueErrors.length > 0) {
        return res.status(400).json({ error: uniqueErrors.join(' - ') });
    }

    // 1ب. التحقق من حقول طريقة حساب الأرباح
    const billing = validateBillingFields(req.body);
    if (billing.error) {
        return res.status(400).json({ error: billing.error });
    }

    try {
      // 2. تحديث جدول teachers (جميع الحقول ما عدا الصورة)
      const { error: tError } = await supabase
        .from('teachers')
        .update({ 
            name, 
            specialty, 
            bio, 
            whatsapp_number, 
            payment_details,
            billing_method: billing.billing_method,
            custom_percentage: billing.custom_percentage,
            new_student_price: billing.new_student_price,
            new_student_lookback_mode: billing.new_student_lookback_mode,
            new_student_lookback_since: billing.new_student_lookback_since
        })
        .eq('id', id);

      if (tError) throw tError;

      // 3. تجهيز تحديثات جدول users
      const userUpdates = { 
        first_name: name,
        phone: phone,
        admin_username: dashboard_username,
        username: app_username
      };

      // تحديث كلمات المرور فقط إذا تم إرسالها
      if (dashboard_password && dashboard_password.trim() !== "") {
        userUpdates.admin_password = await bcrypt.hash(dashboard_password, 10);
      }

      if (app_password && app_password.trim() !== "") {
        userUpdates.password = await bcrypt.hash(app_password, 10);
      }

      // 4. تنفيذ التحديث على المستخدم المرتبط
      const { error: uError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('teacher_profile_id', id)
        .eq('role', 'teacher'); // ضمان عدم تحديث المشرفين بالخطأ

      if (uError) throw uError;

      return res.status(200).json({ success: true });

    } catch (err) {
      if (err.code === '23505') {
          return res.status(400).json({ error: 'بيانات مكررة (هاتف أو اسم مستخدم) موجودة بالفعل.' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // DELETE: حذف مدرس
  // ============================================================
  // ملاحظة مهمة: جدول teachers مرتبط بعلاقات مفتاح أجنبي (Foreign Keys) من عدة
  // جداول (courses, discount_codes, subscription_requests, daily_teacher_user_stats,
  // wheel_prizes)، وجدول users نفسه مرتبط بجدول devices/user_course_access/
  // user_subject_access. الحذف المباشر بدون تنظيف هذه الجداول أولاً كان يفشل
  // بخطأ "foreign key constraint violation" (23503) في أي مدرس سبق له تسجيل
  // الدخول (له بصمة جهاز مسجّلة) أو لديه كورسات/أكواد خصم/طلبات مرتبطة به.
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'معرف المدرس مطلوب' });

    try {
      // 0. جلب معرفات كل الحسابات المرتبطة بهذا المدرس (حسابه الرئيسي + المشرفين)
      const { data: linkedUsers } = await supabase
        .from('users')
        .select('id')
        .eq('teacher_profile_id', id);
      const linkedUserIds = (linkedUsers || []).map(u => u.id);

      // 1. تنظيف كل ما يتبع كورسات المدرس قبل حذفها (نفس منطق حذف المحتوى في content.js)
      const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', id);
      const courseIds = (courses || []).map(c => c.id);

      if (courseIds.length > 0) {
        const { data: subjects } = await supabase.from('subjects').select('id').in('course_id', courseIds);
        const subjectIds = (subjects || []).map(s => s.id);

        if (subjectIds.length > 0) {
          // الامتحانات لا تُحذف تلقائياً (Cascade) — يجب حذف محاولات الطلاب والأسئلة أولاً
          const { data: exams } = await supabase.from('exams').select('id').in('subject_id', subjectIds);
          const examIds = (exams || []).map(e => e.id);
          if (examIds.length > 0) {
            await supabase.from('user_attempts').delete().in('exam_id', examIds);
            await supabase.from('questions').delete().in('exam_id', examIds);
            await supabase.from('exams').delete().in('id', examIds);
          }
          await supabase.from('user_subject_access').delete().in('subject_id', subjectIds);
        }

        await supabase.from('user_course_access').delete().in('course_id', courseIds);

        // حذف الكورسات نفسها (يحذف تلقائياً المواد/الفصول/الفيديوهات المرتبطة بها Cascade)
        await supabase.from('courses').delete().in('id', courseIds);
      }

      // 2. تنظيف الجداول الأخرى المرتبطة مباشرة بمعرف المدرس (teachers.id)
      await supabase.from('discount_codes').delete().eq('teacher_id', id);
      await supabase.from('subscription_requests').delete().eq('teacher_id', id);
      await supabase.from('daily_teacher_user_stats').delete().eq('teacher_id', id);
      // فك ربط جوائز عجلة الحظ بدلاً من حذفها (حفاظاً على سجل مشاركات الطلاب المرتبط بها)
      await supabase.from('wheel_prizes').update({ teacher_id: null }).eq('teacher_id', id);

      // 3. تنظيف بيانات حسابات المستخدمين المرتبطة (المدرس + المشرفين) قبل حذفها
      //    (devices/user_course_access/user_subject_access — نفس منطق حذف الطلاب في students.js)
      if (linkedUserIds.length > 0) {
        await supabase.from('devices').delete().in('user_id', linkedUserIds);
        await supabase.from('user_course_access').delete().in('user_id', linkedUserIds);
        await supabase.from('user_subject_access').delete().in('user_id', linkedUserIds);
      }

      // 4. حذف جميع المستخدمين المرتبطين (المدرس + المشرفين)
      const { error: usersError } = await supabase.from('users').delete().eq('teacher_profile_id', id);
      if (usersError) throw usersError;

      // 5. حذف بروفايل المدرس أخيراً
      const { error } = await supabase.from('teachers').delete().eq('id', id);
      if (error) throw error;

      invalidateAllAuthCaches(); // 🗄️ حذف مدرس يحذف حسابات واشتراكات كثيرة: نبطل الكاش بالكامل
      return res.status(200).json({ success: true });
    } catch (err) {
      invalidateAllAuthCaches(); // 🗄️ قد يكون الحذف تم جزئياً
      console.error('❌ [DeleteTeacher] Error:', err);
      // خطأ قيد المفتاح الأجنبي (Foreign Key) — رسالة أوضح للأدمن بدل الخطأ الخام
      if (err.code === '23503') {
        return res.status(400).json({ error: 'تعذر حذف المدرس، لا تزال هناك بيانات أخرى مرتبطة به لم يتم حذفها.' });
      }
      return res.status(500).json({ error: err.message });
    }
  }
};
