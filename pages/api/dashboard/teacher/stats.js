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

// تحويل تاريخ مصر (YYYY-MM-DD) إلى لحظة UTC الموافقة لبداية ذلك اليوم بتوقيت
// القاهرة — نفس الدالة المستخدمة في dashboard/super/stats.js، لازمة لتحويل
// تاريخ بداية احتساب الأرباح الذي يختاره المدرس إلى حد زمني صحيح لـ RPC.
const getUtcBoundary = (dateStr) => {
  const offset = getEgyptOffset(`${dateStr}T00:00:00`);
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
};

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
// ⛔ تم حذف fetchAllRows() ومنطق العدّ اليدوي في JS: كانا يُنزّلان *كل* صفوف
// user_course_access/user_subject_access الخاصة بكورسات هذا المدرس (بحلقة
// .range() كل 1000 صف) في كل تحميل لصفحة لوحة التحكم الرئيسية، فقط لحساب
// عدد الطلاب الفريدين/لكل كورس/لكل مادة. الآن هذا الحساب بالكامل داخل
// Postgres عبر get_teacher_student_counts (انظر sql/teacher_student_counts.sql).
// ============================================================

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
    
    const [coursesResult, pendingResult, teacherConfigResult, dailyStatsResult] = await Promise.all([
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

      // ج. ✅ تاريخ بداية احتساب الأرباح الذي اختاره المدرس (إن وُجد)
      supabase
        .from('teachers')
        .select('earnings_start_date')
        .eq('id', teacherId)
        .maybeSingle(),

      // د. ✅ إحصائيات النشاط اليومي لطلاب هذا المدرس (آخر 7 أيام)
      supabase
        .from('daily_teacher_user_stats')
        .select('record_date, active_users_today')
        .eq('teacher_id', teacherId)
        .gte('record_date', localLimitDateStr)
        .order('record_date', { ascending: false })
    ]);

    // ✅ تاريخ بداية الأرباح: null يعني "كل الوقت" (نفس السلوك القديم)
    const earningsStartDate = teacherConfigResult.data?.earnings_start_date || null;
    const earningsStartBoundary = earningsStartDate ? getUtcBoundary(earningsStartDate) : null;

    // ج. حساب الأرباح (عبر دالة قاعدة البيانات الخاصة بالتحصيل الفعلي)
    // ✅ نمرر تاريخ البداية الذي اختاره المدرس (أو null لكل الوقت كما كان)
    const revenueResult = await supabase.rpc('get_teacher_actual_revenue', {
        teacher_id_arg: teacherId,
        start_date: earningsStartBoundary,
        end_date: null
    });

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
        // ✅ نطبّق نفس تاريخ البداية الذي اختاره المدرس (إن وُجد) هنا أيضاً
        let manualQuery = supabase
            .from('subscription_requests')
            .select('total_price, actual_paid_price')
            .eq('teacher_id', teacherId)
            .eq('status', 'approved');
        if (earningsStartBoundary) manualQuery = manualQuery.gte('created_at', earningsStartBoundary);

        const { data: manualData, error: manualError } = await manualQuery;
            
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
    // 4. حساب إحصائيات الطلاب (إجمالي + لكل كورس + لكل مادة)
    // =========================================================
    // ⚡ استعلام واحد داخل Postgres بدل تنزيل كل صفوف الوصول إلى الذاكرة
    const { data: countsData, error: countsError } = await supabase.rpc('get_teacher_student_counts', {
      p_course_ids: courseIds,
      p_subject_ids: subjectIds
    });
    if (countsError) throw countsError;

    const courseCountById = new Map((countsData?.courses  || []).map(c => [c.id, c.count]));
    const subjectCountById = new Map((countsData?.subjects || []).map(s => [s.id, s.count]));


    // =========================================================
    // 5. الحسابات النهائية وتجهيز الرد
    // =========================================================

    // تفاصيل للكورسات
    const coursesStats = courses.map(course => ({
       id: course.id,
       title: course.title,
       count: courseCountById.get(course.id) || 0
    }));

    // تفاصيل للمواد
    const subjectsStats = subjects.map(subject => ({
       id: subject.id,
       title: subject.title,
       count: subjectCountById.get(subject.id) || 0
    }));

    // إجمالي الطلاب الفريدين
    const totalUniqueStudents = countsData?.total_unique_students || 0;

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
        students: totalUniqueStudents, 
        earnings: totalEarnings, // تم استخراجها بنجاح
        earningsStartDate, // ✅ التاريخ المحفوظ الذي تُحتسب منه الأرباح (أو null لكل الوقت)
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
