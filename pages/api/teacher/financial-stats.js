import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';

// ============================================================
// ✅ نفس أدوات توقيت القاهرة المستخدمة في dashboard/teacher/stats.js —
// لازمة لتحويل تاريخ بداية احتساب الأرباح (الذي يختاره المدرس من لوحة
// التحكم) إلى حد زمني UTC صحيح يُمرَّر لدالة get_teacher_actual_revenue.
// ============================================================
const getEgyptOffset = (dateInput) => {
  try {
    const date = new Date(dateInput);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'shortOffset' });
    const parts = fmt.formatToParts(date);
    const offsetString = parts.find(p => p.type === 'timeZoneName').value;
    const hours = parseInt(offsetString.replace(/[^\d+-]/g, '')) || 2;
    const sign = hours >= 0 ? '+' : '-';
    const paddedHours = Math.abs(hours).toString().padStart(2, '0');
    return `${sign}${paddedHours}:00`;
  } catch (e) {
    return '+02:00';
  }
};

const getUtcBoundary = (dateStr) => {
  const offset = getEgyptOffset(`${dateStr}T00:00:00`);
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
};

export default async (req, res) => {
  // 1. التحقق من أن المستخدم مدرس
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // 🛠️ تعديل هام: استخدام teacher_profile_id (الملف المالي) إذا وجد، وإلا استخدام معرف المستخدم
  const teacherId = auth.teacher_profile_id || auth.teacherId;

  try {
    // =========================================================
    // 2. جلب الكورسات والمواد الخاصة بالمدرس
    // =========================================================
    
    // أ. جلب الكورسات (Courses)
    const { data: coursesData, error: coursesError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('teacher_id', teacherId);
    
    if (coursesError) throw coursesError;
    const courses = coursesData || [];
    const courseIds = courses.map(c => c.id);

    // ب. جلب المواد (Subjects) المرتبطة بهذه الكورسات
    let subjects = [];
    let subjectIds = [];

    if (courseIds.length > 0) {
        const { data: subjectsData, error: subjectsError } = await supabase
          .from('subjects')
          .select('id, title') 
          .in('course_id', courseIds);

        if (subjectsError) throw subjectsError;
        subjects = subjectsData || [];
        subjectIds = subjects.map(s => s.id);
    }

    // =========================================================
    // 3. حساب إحصائيات الطلاب (إجمالي + لكل كورس + لكل مادة)
    // =========================================================
    // ⛔ تم حذف تنزيل كل صفوف user_course_access/user_subject_access إلى
    // الذاكرة (وكانت أيضاً عرضة لحد PostgREST الافتراضي 1000 صف، فتُظهر
    // عدداً أقل من الحقيقي لأي مدرس لديه أكثر من 1000 طالب). الحساب الآن
    // بالكامل داخل Postgres عبر get_teacher_student_counts.
    const { data: countsData, error: countsError } = await supabase.rpc('get_teacher_student_counts', {
      p_course_ids: courseIds,
      p_subject_ids: subjectIds
    });
    if (countsError) throw countsError;

    const courseCountById = new Map((countsData?.courses  || []).map(c => [c.id, c.count]));
    const subjectCountById = new Map((countsData?.subjects || []).map(s => [s.id, s.count]));

    // =========================================================
    // 4. معالجة بيانات الطلاب للإحصائيات
    // =========================================================

    const coursesStats = courses.map(course => ({
      title: course.title,
      count: courseCountById.get(course.id) || 0
    }));

    const subjectsStats = subjects.map(subject => ({
      title: subject.title,
      count: subjectCountById.get(subject.id) || 0
    }));

    // حساب إجمالي الطلاب (بدون تكرار)
    const totalUniqueStudents = countsData?.total_unique_students || 0;

    // =========================================================
    // 5. حساب الأرباح (باستخدام الدالة حصراً)
    // =========================================================

    // ✅ نفس تاريخ بداية الأرباح الذي يختاره المدرس من لوحة التحكم
    // (بطاقة "إجمالي الأرباح" -> أيقونة التقويم)، بدل تجاهله هنا والاحتساب
    // من كل الوقت دائماً في هذه الشاشة الخاصة بالتطبيق
    const { data: teacherConfig, error: teacherConfigError } = await supabase
      .from('teachers')
      .select('earnings_start_date')
      .eq('id', teacherId)
      .maybeSingle();
    if (teacherConfigError) throw teacherConfigError;

    const earningsStartDate = teacherConfig?.earnings_start_date || null;
    const earningsStartBoundary = earningsStartDate ? getUtcBoundary(earningsStartDate) : null;

    // ✅ التعديل الجوهري هنا: استدعاء دالة التحصيل الفعلي المحدثة
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_teacher_actual_revenue', { 
          teacher_id_arg: teacherId,
          start_date: earningsStartBoundary,
          end_date: null
      });

    if (rpcError) {
        console.error("RPC Error Details:", rpcError); // طباعة الخطأ للتوضيح
        throw rpcError;
    }

    // اعتماد القيمة القادمة من الدالة فقط
    const totalEarnings = rpcData || 0;

    // =========================================================
    // 6. إرسال الرد
    // =========================================================
    return res.status(200).json({
      totalUniqueStudents,
      totalEarnings,
      earningsStartDate, // ✅ حتى تعرض شاشة التطبيق نفس التاريخ المحفوظ من لوحة التحكم
      coursesStats,
      subjectsStats
    });

  } catch (err) {
    console.error("Financial Stats Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
