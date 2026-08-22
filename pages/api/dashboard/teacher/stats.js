import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

// ============================================================
// ✅ أدوات التوقيت الخاصة بمصر (نفس المنطق المستخدم في super/stats.js)
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

// ============================================================
// ✅ إصلاح: جلب كل الصفوف بدون التقيد بحد PostgREST الافتراضي للصفوف
// (كان الاستعلام يُرجع فقط أول دفعة من الصفوف الافتراضية، ما يجعل
//  عدد الطلاب النشطين يظهر أقل من العدد الحقيقي، مثال: 50 بدلاً من 164)
// نستخدم .range() في حلقة حتى تُرجع الصفحة عدد صفوف أقل من الحجم المطلوب
// ============================================================
const PAGE_SIZE = 1000;
const fetchAllRows = async (queryBuilderFactory) => {
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryBuilderFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < PAGE_SIZE) break; // آخر صفحة
    from += PAGE_SIZE;
  }

  return allRows;
};

export default async (req, res) => {
  // 1. التحقق من الصلاحية
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return res.status(401).json({ error: 'Unauthorized' });

  const teacherId = user.teacherId;

  try {
    // =========================================================
    // ✅ تحديث إحصائيات النشاط اليومي الخاصة بطلاب هذا المدرس فقط
    // (تُنشئ صف اليوم تلقائياً إذا لم يكن موجوداً، وتحدّثه إذا كان موجوداً)
    // =========================================================
    await supabase.rpc('update_daily_teacher_user_stats', { teacher_id_arg: teacherId });

    const todayCairoStr = getCairoDateStr(new Date());
    const localLimitDateStr = shiftDateStr(todayCairoStr, -7);

    // =========================================================
    // 2. التنفيذ المتوازي (Parallel Execution)
    // نجلب الكورسات، الطلبات المعلقة، والأرباح في وقت واحد
    // =========================================================
    
    const [coursesResult, pendingResult, revenueResult, dailyStatsResult] = await Promise.all([
      // أ. جلب الكورسات
      supabase
        .from('courses')
        .select('id, title')
        .eq('teacher_id', teacherId),

      // ب. عدد الطلبات المعلقة (Count فقط)
      supabase
        .from('subscription_requests')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId)
        .eq('status', 'pending'),

      // ج. حساب الأرباح (عبر دالة قاعدة البيانات الجديدة الخاصة بالتحصيل الفعلي)
      // ✅ التعديل هنا: استخدام الدالة get_teacher_actual_revenue
      supabase.rpc('get_teacher_actual_revenue', { 
          teacher_id_arg: teacherId,
          start_date: null,
          end_date: null
      }),

      // د. ✅ إحصائيات النشاط اليومي لطلاب هذا المدرس (آخر 7 أيام)
      supabase
        .from('daily_teacher_user_stats')
        .select('record_date, active_users_today')
        .eq('teacher_id', teacherId)
        .gte('record_date', localLimitDateStr)
        .order('record_date', { ascending: false })
    ]);

    // التحقق من الأخطاء في البيانات الأساسية
    if (coursesResult.error) throw coursesResult.error;

    // معالجة الأرباح (Fallback Logic)
    let totalEarnings = 0;
    
    // التأكد من أن الدالة لم ترجع خطأ وأن النتيجة ليست فارغة
    if (!revenueResult.error && revenueResult.data !== null) {
        totalEarnings = Number(revenueResult.data) || 0;
    } else {
        console.warn("⚠️ RPC Failed or returned null, falling back to manual calculation.", revenueResult.error?.message);
        
        // الحساب اليدوي كاحتياطي
        // ✅ التعديل هنا: جلب actual_paid_price مع total_price لحساب السعر الفعلي
        const { data: manualData, error: manualError } = await supabase
            .from('subscription_requests')
            .select('total_price, actual_paid_price')
            .eq('teacher_id', teacherId)
            .eq('status', 'approved');
            
        if (!manualError && manualData) {
             // ✅ التعديل هنا: محاكاة COALESCE (استخدام actual_paid_price وإلا استخدام total_price)
             totalEarnings = manualData.reduce((sum, item) => {
                 const priceToUse = item.actual_paid_price !== null ? item.actual_paid_price : item.total_price;
                 return sum + (Number(priceToUse) || 0);
             }, 0);
        }
    }

    // استخراج البيانات الأساسية
    const courses = coursesResult.data || [];
    const courseIds = courses.map(c => c.id);
    const pendingRequests = pendingResult.count || 0;

    // =========================================================
    // 3. جلب المواد (Subjects) المرتبطة بالكورسات
    // =========================================================
    
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
    // 4. جلب بيانات الطلاب (مع استثناء المدرسين والمشرفين)
    // =========================================================
    
    const [courseAccess, subjectAccess] = await Promise.all([
        // أ. مشتركو الكورسات (فقط من لديهم دور student)
        // ✅ التعديل: جلب كل الصفوف عبر fetchAllRows بدل استعلام واحد قد يُقتطع
        courseIds.length > 0
            ? fetchAllRows(() =>
                supabase
                  .from('user_course_access')
                  .select('course_id, user_id, users!inner(role)')
                  .in('course_id', courseIds)
                  .eq('users.role', 'student')
                  .order('user_id', { ascending: true })
              )
            : Promise.resolve([]),

        // ب. مشتركو المواد (فقط من لديهم دور student)
        subjectIds.length > 0
            ? fetchAllRows(() =>
                supabase
                  .from('user_subject_access')
                  .select('subject_id, user_id, users!inner(role)')
                  .in('subject_id', subjectIds)
                  .eq('users.role', 'student')
                  .order('user_id', { ascending: true })
              )
            : Promise.resolve([])
    ]);

    // =========================================================
    // 5. الحسابات النهائية وتجهيز الرد
    // =========================================================

    // تفاصيل للكورسات
    const coursesStats = courses.map(course => ({
       id: course.id,
       title: course.title,
       count: courseAccess.filter(a => a.course_id === course.id).length
    }));

    // تفاصيل للمواد
    const subjectsStats = subjects.map(subject => ({
       id: subject.id,
       title: subject.title,
       count: subjectAccess.filter(a => a.subject_id === subject.id).length
    }));

    // إجمالي الطلاب الفريدين
    const allStudentIds = new Set([
      ...courseAccess.map(a => a.user_id),
      ...subjectAccess.map(a => a.user_id)
    ]);

    // =========================================================
    // ✅ بناء مصفوفة رسم النشاط اليومي (آخر 7 أيام) لطلاب هذا المدرس
    // =========================================================
    const rawDailyStats = dailyStatsResult.data || [];
    const activeUsersChartData = [];

    for (let i = 6; i >= 0; i--) {
      const targetDateStr = shiftDateStr(todayCairoStr, -i);
      const dayName = getDayNameFromDateStr(targetDateStr);
      const foundStat = rawDailyStats.find(s => s.record_date === targetDateStr);
      activeUsersChartData.push({
        name: i === 0 ? 'اليوم' : dayName,
        date: targetDateStr,
        users: foundStat ? foundStat.active_users_today : 0
      });
    }

    const activeUsersToday = activeUsersChartData[6]?.users || 0;

    return res.status(200).json({
      success: true,
      summary: {
        students: allStudentIds.size, 
        earnings: totalEarnings, // تم استخراجها بنجاح
        courses: courses.length,
        pending: pendingRequests,
        activeUsersToday // ✅ عدد الطلاب النشطين اليوم
      },
      details: {
          courses: coursesStats,
          subjects: subjectsStats
      },
      activeUsersChartData // ✅ بيانات رسم النشاط لآخر 7 أيام
    });

  } catch (err) {
    console.error("❌ Dashboard Stats Error:", err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
