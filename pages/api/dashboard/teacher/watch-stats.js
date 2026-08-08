import { db } from '../../../../lib/firebaseAdmin';
import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

// ============================================================================
// 📺 إحصائيات المشاهدات + 👥 المستخدمين النشطين لآخر 7 أيام
// ============================================================================
// 1) المشاهدات: تعتمد على مجموعة Firebase الموجودة بالفعل: video_views
//    (نفس المصدر المستخدم في get-video-views.js)
// 2) النشطون: يعتمدون على عمود last_active_at في جدول users بـ Supabase
//    (يُحدَّث تلقائياً من get-app-init-data.js في كل مرة يفتح فيها الطالب التطبيق)
//    ونقتصر على الطلاب المرتبطين فعلياً بكورسات/مواد هذا المدرس فقط
//    (نفس منطق حساب "إجمالي الطلاب" الموجود في stats.js)
// ============================================================================
// ⚠️ ملاحظة مهمة عن طبيعة البيانات (تنطبق على المصدرين):
// كلاهما يخزّن "آخر" وقت فقط (آخر مشاهدة / آخر ظهور) وليس سجلاً كاملاً لكل
// حدث. فإذا شاهد طالب فيديو أو فتح التطبيق أكثر من مرة خلال الأسبوع، يظهر
// فقط في اليوم الأحدث من بين هذه المرات — وهو أقرب تقدير ممكن بدون تغيير
// طريقة التسجيل الحالية في كلا المصدرين.
// ============================================================================

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

const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
});
const getCairoDateStr = (date) => cairoDateFormatter.format(date);

const shiftDateStr = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const daysMap = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const getDayNameFromDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return daysMap[new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()];
};

const DAYS = 7;

// ✅ جلب معرّفات الطلاب المرتبطين فعلياً بهذا المدرس (نفس منطق stats.js)
async function getTeacherStudentIds(teacherId) {
  const { data: courses, error: coursesErr } = await supabase
    .from('courses')
    .select('id')
    .eq('teacher_id', teacherId);

  if (coursesErr) throw coursesErr;

  const courseIds = (courses || []).map(c => c.id);
  let subjectIds = [];

  if (courseIds.length > 0) {
    const { data: subjects, error: subjectsErr } = await supabase
      .from('subjects')
      .select('id')
      .in('course_id', courseIds);

    if (subjectsErr) throw subjectsErr;
    subjectIds = (subjects || []).map(s => s.id);
  }

  const [courseAccessResult, subjectAccessResult] = await Promise.all([
    courseIds.length > 0
      ? supabase
          .from('user_course_access')
          .select('user_id, users!inner(role)')
          .in('course_id', courseIds)
          .eq('users.role', 'student')
      : Promise.resolve({ data: [], error: null }),

    subjectIds.length > 0
      ? supabase
          .from('user_subject_access')
          .select('user_id, users!inner(role)')
          .in('subject_id', subjectIds)
          .eq('users.role', 'student')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (courseAccessResult.error) throw courseAccessResult.error;
  if (subjectAccessResult.error) throw subjectAccessResult.error;

  const studentIds = new Set([
    ...(courseAccessResult.data || []).map(a => a.user_id),
    ...(subjectAccessResult.data || []).map(a => a.user_id),
  ]);

  return [...studentIds];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const teacherId = user.teacherId ? user.teacherId.toString() : null;
  if (!teacherId && user.role !== 'super_admin') {
    return res.status(400).json({ success: false, error: 'لم يتم العثور على بروفايل المدرس' });
  }

  try {
    const todayCairoStr = getCairoDateStr(new Date());
    const localLimitDateStr = shiftDateStr(todayCairoStr, -(DAYS - 1));

    // ✅ بداية النطاق الزمني (منتصف ليل اليوم الأول من الأيام السبعة بتوقيت القاهرة)
    const rangeStartOffset = getEgyptOffset(`${localLimitDateStr}T00:00:00`);
    const rangeStart = new Date(`${localLimitDateStr}T00:00:00${rangeStartOffset}`);

    // ================================================================
    // 1) المشاهدات — Firebase (video_views)
    // ✅ نفلتر دائماً حسب teacherId طالما الحساب مرتبط بملف مدرس — حتى لو كان
    // نفس الحساب يحمل صلاحية super_admin (is_admin = true على حساب مدرس).
    // فقط السوبر أدمن الذي لا يملك teacher_profile_id إطلاقاً يرى بيانات كل المدرسين.
    // ================================================================
    let watchQuery = db.collection('video_views').where('lastViewedAt', '>=', rangeStart);
    if (teacherId) {
      watchQuery = watchQuery.where('teacherId', '==', teacherId);
    }

    // ================================================================
    // 2) النشطون — Supabase (users.last_active_at) مقيّد بطلاب هذا المدرس فقط
    // ================================================================
    const studentIdsPromise = teacherId ? getTeacherStudentIds(teacherId) : Promise.resolve(null);

    const [watchSnapshot, studentIds] = await Promise.all([watchQuery.get(), studentIdsPromise]);

    // --- تجميع عدد المشاهدات لكل يوم بتوقيت القاهرة ---
    const watchesByDate = {};
    watchSnapshot.forEach(doc => {
      const data = doc.data();
      const ts = data.lastViewedAt;
      if (!ts || typeof ts.toDate !== 'function') return;

      const dateStr = getCairoDateStr(ts.toDate());
      watchesByDate[dateStr] = (watchesByDate[dateStr] || 0) + 1;
    });

    // --- تجميع عدد المستخدمين النشطين لكل يوم بتوقيت القاهرة ---
    const activeByDate = {};
    if (studentIds === null || studentIds.length > 0) {
      let activityQuery = supabase
        .from('users')
        .select('id, last_active_at')
        .gte('last_active_at', rangeStart.toISOString());

      // السوبر أدمن (بدون teacherId) يرى كل الطلاب النشطين على المنصة
      if (studentIds !== null) {
        activityQuery = activityQuery.in('id', studentIds);
      }

      const { data: activeUsers, error: activeErr } = await activityQuery;
      if (activeErr) throw activeErr;

      (activeUsers || []).forEach(u => {
        if (!u.last_active_at) return;
        const dateStr = getCairoDateStr(new Date(u.last_active_at));
        activeByDate[dateStr] = (activeByDate[dateStr] || 0) + 1;
      });
    }

    // بناء مصفوفة الأيام السبعة كاملة (حتى الأيام بدون بيانات تظهر كـ 0)
    const chart = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = shiftDateStr(todayCairoStr, -i);
      chart.push({
        name: d === todayCairoStr ? 'اليوم' : getDayNameFromDateStr(d),
        date: d,
        watches: watchesByDate[d] || 0,
        activeUsers: activeByDate[d] || 0,
      });
    }

    const todayEntry = chart[chart.length - 1];
    const todayWatches = todayEntry?.watches || 0;
    const todayActiveUsers = todayEntry?.activeUsers || 0;
    const totalWatches7Days = chart.reduce((sum, c) => sum + c.watches, 0);

    return res.status(200).json({
      success: true,
      today: todayWatches,
      todayActiveUsers,
      last7DaysTotal: totalWatches7Days,
      chart,
    });

  } catch (err) {
    console.error('❌ Watch Stats Error:', err.message);
    // ⚠️ لو ظهر خطأ يتعلق بوجود فهرس مركب مطلوب (composite index)، فايربيز نفسه
    // يرسل رابطاً جاهزاً لإنشائه تلقائياً من رسالة الخطأ في اللوجات.
    return res.status(500).json({ success: false, error: 'تعذر جلب إحصائيات المشاهدات' });
  }
}
