import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

// ============================================================
// ✅ أدوات التوقيت الخاصة بمصر (تدعم التبديل التلقائي صيفي/شتوي)
// نعتمد على IANA timezone "Africa/Cairo" بدلاً من توقيت السيرفر
// (والذي غالباً ما يكون UTC على Vercel)، فلا يهم متى تتغير قوانين
// التوقيت الصيفي في مصر، فهذا يُحسب تلقائياً حسب بيانات النظام.
// ============================================================

// حساب فرق التوقيت الحالي لمصر (+02:00 شتاءً أو +03:00 صيفاً) لتاريخ معين
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

// تحويل تاريخ مصر (YYYY-MM-DD) إلى لحظة UTC الموافقة لبداية ذلك اليوم بتوقيت القاهرة
const getUtcBoundary = (dateStr) => {
  const offset = getEgyptOffset(`${dateStr}T00:00:00`);
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
};

// استخراج التاريخ (YYYY-MM-DD) بتوقيت القاهرة لأي لحظة زمنية (بدلاً من توقيت السيرفر)
const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
});
const getCairoDateStr = (date) => cairoDateFormatter.format(date);

// إزاحة تاريخ (YYYY-MM-DD) بعدد أيام مع الحفاظ على اليوم التقويمي الصحيح
// (نستخدم ظهر UTC كمرجع حيادي حتى لا يتأثر الحساب بأي انزياح ساعة)
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

export default async function handler(req, res) {
  // 1. التحقق من الصلاحية (سوبر أدمن فقط)
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return; 

  try {
    // ✅ تحديث إحصائيات اليوم في قاعدة البيانات قبل جلبها (لضمان دقة الأرقام الحالية)
    await supabase.rpc('update_daily_user_stats');

    // ✅ تاريخ "اليوم" بتوقيت القاهرة الفعلي (وليس توقيت السيرفر)
    const todayCairoStr = getCairoDateStr(new Date());

    // تحديد نطاق التاريخ (آخر 7 أيام) بتوقيت القاهرة
    const localLimitDateStr = shiftDateStr(todayCairoStr, -7);
    const dateLimit = getUtcBoundary(localLimitDateStr);

    // استخدام Promise.all لتنفيذ جميع الاستعلامات في نفس الوقت
    const [
        studentsResult, 
        teachersResult, 
        coursesResult, 
        revenueRpcResult,
        recentUsersResult,
        chartDataResult, // استعلام الرسم البياني للمبيعات
        dailyStatsResult // ✅ استعلام إحصائيات النشاط اليومي
    ] = await Promise.all([
      // 1. إجمالي الطلاب
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),

      // 2. إجمالي المدرسين
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),

      // 3. الكورسات النشطة
      supabase.from('courses').select('*', { count: 'exact', head: true }),

      // 4. إجمالي المبيعات الفعلية المُحصلة (RPC) — نفس دالة صفحة المالية بدلاً من السعر الافتراضي
      supabase.rpc('get_total_actual_revenue'),

      // 5. أحدث المسجلين
      supabase
        .from('users')
        .select('id, first_name, username, role, created_at')
        .order('created_at', { ascending: false })
        .limit(5),

      // 6. بيانات الرسم البياني (أرباح الفترة المحددة)
      // ✅ نجلب actual_paid_price أيضاً لاستخدام السعر الفعلي المُحصل (وليس السعر الافتراضي فقط)
      //    بنفس منطق صفحة المالية (finance.js) بدلاً من total_price دائماً
      supabase
        .from('subscription_requests')
        .select('created_at, total_price, actual_paid_price')
        .eq('status', 'approved')
        .gte('created_at', dateLimit),

      // 7. ✅ جلب إحصائيات النشاط اليومي بناءً على التاريخ المحلي لتجنب فقدان أي يوم
      supabase
        .from('daily_user_stats')
        .select('record_date, active_users_today')
        .gte('record_date', localLimitDateStr)
        .order('record_date', { ascending: false })
    ]);

    // --- معالجة الأرباح الكلية ---
    // ✅ نعتمد على المبلغ الفعلي المُحصل (actual_paid_price) وليس السعر الافتراضي فقط
    //    بنفس منطق صفحة المالية (finance.js / get_total_actual_revenue)
    let totalRevenue = 0;
    if (!revenueRpcResult.error) {
      totalRevenue = revenueRpcResult.data || 0;
    } else {
      // حساب احتياطي في حال فشل الـ RPC
      const { data: manualData } = await supabase
        .from('subscription_requests')
        .select('total_price, actual_paid_price')
        .eq('status', 'approved');
      totalRevenue = manualData?.reduce((acc, curr) => {
        const priceToUse = (curr.actual_paid_price !== null && curr.actual_paid_price !== undefined)
            ? curr.actual_paid_price
            : curr.total_price;
        return acc + (Number(priceToUse) || 0);
      }, 0) || 0;
    }

    // --- معالجة بيانات الرسوم البيانية ---
    const chartDataFinal = [];
    const activeUsersChartFinal = []; // ✅ مصفوفة بيانات رسم النشاط

    const rawChartData = chartDataResult.data || [];
    const rawDailyStats = dailyStatsResult.data || [];

    // ✅ الترتيب: من 6 أيام للوراء تنازلياً وصولاً لليوم (لضبط اتجاه الرسم البياني من اليسار لليمين)
    // ✅ كل الحسابات هنا مبنية على تاريخ اليوم بتوقيت القاهرة (todayCairoStr) وليس توقيت السيرفر،
    //    فتنضبط تلقائياً سواء كانت مصر بالتوقيت الصيفي (+3) أو الشتوي (+2)
    for (let i = 6; i >= 0; i--) {
        const targetDateStr = shiftDateStr(todayCairoStr, -i);
        const dayName = getDayNameFromDateStr(targetDateStr);

        // ========================================================
        // 💰 الجزء الخاص بالأرباح (تم تصحيحه ليعتمد على توقيت القاهرة بدلاً من UTC)
        // ✅ نستخدم السعر الفعلي المُحصل (actual_paid_price) إن وُجد، وإلا نرجع
        //    للسعر الافتراضي (total_price) — نفس منطق COALESCE المستخدم في صفحة المالية
        // ========================================================
        const dayTotal = rawChartData
            .filter(item => getCairoDateStr(new Date(item.created_at)) === targetDateStr)
            .reduce((sum, item) => {
                const priceToUse = (item.actual_paid_price !== null && item.actual_paid_price !== undefined)
                    ? item.actual_paid_price
                    : item.total_price;
                return sum + (Number(priceToUse) || 0);
            }, 0);
            
        chartDataFinal.push({ 
            name: i === 0 ? 'اليوم' : dayName,
            date: targetDateStr, 
            sales: dayTotal 
        });

        // ========================================================
        // 👥 الجزء الخاص بعدد المستخدمين النشطين (بتوقيت القاهرة الصحيح)
        // ========================================================
        const foundStat = rawDailyStats.find(s => s.record_date === targetDateStr);
        activeUsersChartFinal.push({
            name: i === 0 ? 'اليوم' : dayName,
            date: targetDateStr,
            users: foundStat ? foundStat.active_users_today : 0
        });
    }

    // ✅ استخراج رقم النشطين اليوم (آخر عنصر في المصفوفة لأننا رتبناها تصاعدياً زمنياً)
    const activeUsersToday = activeUsersChartFinal[6]?.users || 0;

    // --- تنسيق المستخدمين الجدد ---
    const formattedRecentUsers = recentUsersResult.data 
        ? recentUsersResult.data.map(u => ({
            id: u.id,
            name: u.first_name || u.username || 'مستخدم جديد',
            role: u.role,
            date: u.created_at
          })) 
        : [];

    return res.status(200).json({
      success: true,
      totalUsers: studentsResult.count || 0,
      totalTeachers: teachersResult.count || 0,
      activeCourses: coursesResult.count || 0,
      totalRevenue: totalRevenue,
      recentUsers: formattedRecentUsers,
      chartData: chartDataFinal,
      activeUsersChartData: activeUsersChartFinal, // ✅ بيانات رسم النشاط
      activeUsersToday: activeUsersToday // ✅ رقم النشطين اليوم للبطاقة
    });

  } catch (err) {
    console.error("Super Admin Stats Error:", err.message);
    return res.status(500).json({ error: 'فشل جلب الإحصائيات' });
  }
}
