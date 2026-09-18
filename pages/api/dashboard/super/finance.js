import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { getGlobalPlatformPercentage, computeTeacherBilling } from '../../../../lib/teacherBillingHelper';
import { getTeamBadgesForTeachers } from '../../../../lib/teamHelper';

// ✅ دالة ذكية لحساب فرق التوقيت لمصر بناءً على التاريخ (تدعم الصيفي والشتوي)
const getEgyptOffset = (dateString) => {
    try {
        const date = new Date(dateString);
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

// ✅ الدالة الجديدة: تحويل تاريخ مصر إلى UTC (جرينتش) صريح قبل إرساله للداتابيز
const getUtcBoundary = (dateString, isEnd = false) => {
    if (!dateString) return null;
    const offset = getEgyptOffset(dateString);
    const time = isEnd ? '23:59:59' : '00:00:00';
    // بناء التاريخ بتوقيت مصر ثم تحويله لـ ISO (الذي يعطينا توقيت جرينتش بحرف Z)
    return new Date(`${dateString}T${time}${offset}`).toISOString();
};

export default async function handler(req, res) {
  // 🆔 إعداد لوجات التتبع (Logs) لمراقبة الطلبات
  const reqId = Math.random().toString(36).substring(7).toUpperCase();
  const logPrefix = `[FinanceAPI - ${reqId}]`;

  const log = (step, msg, data = null) => {
    console.log(`🔹 ${logPrefix} [${step}] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  };

  const errLog = (step, msg, error) => {
    console.error(`❌ ${logPrefix} [${step}] ${msg}`, error);
  };

  log('START', 'Starting Finance Report Request...', { query: req.query });

  // 1. التحقق من الصلاحية (سوبر أدمن فقط)
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) {
    return; // الرد يتم إرساله داخل requireSuperAdmin
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { startDate, endDate } = req.query;

  // ✅ الاعتماد على التوقيت العالمي الصريح (التحويل لـ UTC صراحةً)
  const formattedStartDate = getUtcBoundary(startDate, false);
  const formattedEndDate = getUtcBoundary(endDate, true);

  log('DATES', `Converted Start: ${formattedStartDate} | End: ${formattedEndDate}`);

  try {
    // ============================================================
    // 1. جلب نسبة المنصة العامة (الافتراضية) من جدول الإعدادات
    // ============================================================
    // ⚠️ ملاحظة: هذه النسبة تُستخدم فقط كـ "افتراضي" للمدرسين على
    // billing_method='percentage' الذين ليس لديهم custom_percentage خاص.
    // كل مدرس الآن قد تكون له طريقة حساب مختلفة تماماً (نسبة / طالب جديد /
    // سعر ثابت للكورس) — راجع lib/teacherBillingHelper.js.
    const GLOBAL_PLATFORM_PERCENTAGE = await getGlobalPlatformPercentage();
    log('CONFIG', `Global Default Platform Percentage: ${GLOBAL_PLATFORM_PERCENTAGE * 100}%`);

    // ============================================================
    // 2. جلب قائمة المدرسين وحساب أرباح كل واحد منهم بحسب طريقته الخاصة
    // ============================================================
    // ⚠️ هام: نجلب teacher_profile_id لأن الأموال مربوطة به في جدول العمليات
    const { data: teachersList, error: teacherError } = await supabase
      .from('users')
      .select('id, first_name, admin_username, teacher_profile_id')
      .eq('role', 'teacher');

    if (teacherError) throw teacherError;

    // ✅ تحسين الأداء: بدلاً من استعلام منفصل لكل مدرس (بروفايل + طلبات)،
    // نجلب كل بيانات كل المدرسين دفعة واحدة، ثم نمرر نصيب كل مدرس منها إلى
    // computeTeacherBilling() عبر preloadedTeacher/preloadedRequests — يقلل
    // عدد الاستعلامات من ~2-4 لكل مدرس إلى استعلامين ثابتين بغض النظر عن
    // عدد المدرسين.
    const teacherProfileIds = teachersList
      .map(t => t.teacher_profile_id)
      .filter(id => id !== null && id !== undefined);

    const [{ data: teacherConfigs, error: configsError }, { data: allRequests, error: allRequestsError }, teamBadgeById] = await Promise.all([
      teacherProfileIds.length
        ? supabase
            .from('teachers')
            .select('id, billing_method, custom_percentage, new_student_price, new_student_lookback_mode, new_student_lookback_since')
            .in('id', teacherProfileIds)
        : Promise.resolve({ data: [] }),
      teacherProfileIds.length
        ? (() => {
            let q = supabase
              .from('subscription_requests')
              .select('*')
              .in('teacher_id', teacherProfileIds)
              .in('status', ['approved', 'rejected'])
              .order('created_at', { ascending: false });
            if (formattedStartDate) q = q.gte('created_at', formattedStartDate);
            if (formattedEndDate) q = q.lte('created_at', formattedEndDate);
            return q;
          })()
        : Promise.resolve({ data: [] }),
      // 👥 شارة الفريق (قائد/عضو + اسم الفريق) لكل مدرس دفعة واحدة، بدلاً من
      // استعلام منفصل لكل مدرس — راجع lib/teamHelper.js
      getTeamBadgesForTeachers(teacherProfileIds),
    ]);

    if (configsError) throw configsError;
    if (allRequestsError) throw allRequestsError;

    const teacherConfigById = new Map((teacherConfigs || []).map(t => [t.id, t]));
    const requestsByTeacherId = new Map();
    for (const r of (allRequests || [])) {
      if (!requestsByTeacherId.has(r.teacher_id)) requestsByTeacherId.set(r.teacher_id, []);
      requestsByTeacherId.get(r.teacher_id).push(r);
    }

    // استخدام Promise.all لتنفيذ الحسابات بشكل متوازي — كل مدرس عبر
    // computeTeacherBilling() الذي يختار طريقة الحساب المناسبة له تلقائياً.
    const teachersDataPromises = teachersList.map(async (teacher) => {

      // إذا لم يكن للمستخدم بروفايل مدرس، لا يمكننا حساب أرباحه (تخطي)
      if (!teacher.teacher_profile_id) {
         return {
            id: teacher.id,
            name: teacher.first_name || teacher.admin_username || 'مدرس (بدون بروفايل)',
            original_sales: 0,
            actual_sales: 0,
            transaction_count: 0,
            platform_fee: 0,
            net_profit: 0,
            billing_method: 'percentage',
            custom_percentage: null,
            new_student_price: null,
            courses_fee: 0,
            packages_fee: 0,
            packages_count: 0,
            team_name: null,
            team_role: null,
         };
      }

      let billing;
      try {
        billing = await computeTeacherBilling(teacher.teacher_profile_id, formattedStartDate, formattedEndDate, {
          preloadedTeacher: teacherConfigById.get(teacher.teacher_profile_id) || null,
          preloadedRequests: requestsByTeacherId.get(teacher.teacher_profile_id) || [],
          globalPercentage: GLOBAL_PLATFORM_PERCENTAGE,
        });
      } catch (billingError) {
        errLog('BILLING_ERROR', `Failed to compute billing for teacher ${teacher.first_name}`, billingError);
        billing = {
          original_amount: 0, actual_amount: 0, platform_fee: 0, net_profit: 0,
          billing_method: 'percentage', meta: { approved_count: 0 }
        };
      }

      if (billing.actual_amount > 0 || billing.original_amount > 0) {
        log('RESULT', `Teacher: ${teacher.first_name} | Method: ${billing.billing_method} | Original: ${billing.original_amount} | Actual: ${billing.actual_amount} | Fee: ${billing.platform_fee}`);
      }

      const badge = teamBadgeById.get(teacher.teacher_profile_id) || null;

      return {
        id: teacher.id, // نُعيد ID المستخدم للفرونت إند لغرض العرض والروابط
        name: teacher.first_name || teacher.admin_username || 'مدرس غير معروف',
        original_sales: billing.original_amount,
        actual_sales: billing.actual_amount,
        transaction_count: billing.meta.approved_count || 0,
        platform_fee: billing.platform_fee,
        net_profit: billing.net_profit,
        // 👇 تفاصيل طريقة الحساب — يستخدمها الفرونت إند لعرض شارة/تسمية مناسبة لكل مدرس
        billing_method: billing.billing_method,
        custom_percentage: billing.meta.effective_percentage !== undefined ? billing.meta.effective_percentage * 100 : null,
        new_student_price: billing.meta.new_student_price ?? null,
        new_student_count: billing.meta.new_student_count ?? null,
        unpriced_items_count: billing.meta.unpriced_items_count ?? null,
        // 👇 تفصيل عمولة "سعر ثابت للكورس" بين الكورسات/المواد المفردة
        // والباقات — راجع lib/teacherBillingHelper.js
        courses_fee: billing.meta.courses_fee ?? null,
        packages_fee: billing.meta.packages_fee ?? null,
        packages_count: billing.meta.packages_count ?? null,
        // 👥 شارة الفريق — null لمدرس بلا فريق (لا تغيير عن اليوم)
        team_name: badge?.teamName ?? null,
        team_role: badge ? (badge.isLeader ? 'leader' : 'member') : null,
      };
    });

    // انتظار اكتمال جميع الحسابات
    const processedTeachersList = await Promise.all(teachersDataPromises);

    // ترتيب القائمة حسب الأكثر مبيعاً فعلياً (تنازلياً)
    const finalTeachersList = processedTeachersList.sort((a, b) => b.actual_sales - a.actual_sales);

    // ============================================================
    // 3. تجميع الإحصائيات العامة للمنصة
    // ============================================================
    // ✅ الإجماليات الآن هي مجموع كل مدرس على حدة (وليست RPC واحدة على
    // الجميع) — ضروري لأن كل مدرس ممكن يكون على طريقة حساب مختلفة تماماً.
    const totalOriginalRevenue = finalTeachersList.reduce((sum, t) => sum + t.original_sales, 0);
    const totalActualRevenue = finalTeachersList.reduce((sum, t) => sum + t.actual_sales, 0);
    const platformProfitTotal = finalTeachersList.reduce((sum, t) => sum + t.platform_fee, 0);
    const teachersDueTotal = finalTeachersList.reduce((sum, t) => sum + t.net_profit, 0);

    log('TOTAL', `Original Revenue: ${totalOriginalRevenue} | Actual Revenue: ${totalActualRevenue} | Platform Fee: ${platformProfitTotal}`);

    // إرسال الرد النهائي المتوافق مع التعديلات
    return res.status(200).json({
      percentage_used: (GLOBAL_PLATFORM_PERCENTAGE * 100) + '%', // النسبة العامة الافتراضية فقط (ليست بالضرورة نسبة كل المدرسين)
      total_original_revenue: totalOriginalRevenue,
      total_actual_revenue: totalActualRevenue,
      platform_profit: platformProfitTotal,
      teachers_due: teachersDueTotal,
      teachers_list: finalTeachersList
    });

  } catch (err) {
    errLog('CRITICAL', 'Finance API Error:', err);
    return res.status(500).json({ error: 'فشل حساب التقارير المالية', details: err.message });
  }
}
