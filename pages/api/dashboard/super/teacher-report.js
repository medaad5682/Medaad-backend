import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { getUtcBoundary } from '../../../../lib/egyptTime';
import { computeTeacherBilling } from '../../../../lib/teacherBillingHelper';

export default async function handler(req, res) {
  // 🆔 إعداد لوجات التتبع (Logs)
  const reqId = Math.random().toString(36).substring(7).toUpperCase();
  const logPrefix = `[TeacherReport - ${reqId}]`;

  const log = (step, msg, data = null) => {
    console.log(`🔹 ${logPrefix} [${step}] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  };

  const errLog = (step, msg, error) => {
    console.error(`❌ ${logPrefix} [${step}] ${msg}`, error);
  };

  log('START', 'Requesting Teacher Report...', { query: req.query });

  // التحقق من الصلاحية
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return; 

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { teacherId, startDate, endDate } = req.query;

  if (!teacherId) {
    errLog('VALIDATION', 'Teacher ID is missing');
    return res.status(400).json({ error: 'Teacher ID is required' });
  }

  try {
    // ============================================================
    // 1. جلب بيانات المدرس
    // ============================================================
    const { data: teacher, error: tError } = await supabase
        .from('users')
        .select('first_name, admin_username, teacher_profile_id')
        .eq('id', teacherId)
        .single();
    
    if (tError || !teacher) {
        errLog('FETCH_USER', 'User not found', tError);
        return res.status(404).json({ error: 'المدرس غير موجود' });
    }

    log('USER_FOUND', `User: ${teacher.first_name} | ProfileID: ${teacher.teacher_profile_id}`);

    if (!teacher.teacher_profile_id) {
        log('WARN', 'User is not linked to a teacher profile');
        return res.status(200).json({
            teacherName: teacher.first_name || teacher.admin_username,
            requests: [],
            summary: { total_original_amount: 0, total_actual_amount: 0, total_approved_count: 0, total_rejected_count: 0 },
            platformPercentage: 0,
            billingMethod: 'percentage',
            meta: { approved_count: 0, rejected_count: 0 }
        });
    }

    // ============================================================
    // 2. تنسيق التواريخ للاستعلام مع فرق التوقيت الديناميكي
    // ============================================================
    // الاعتماد على التوقيت العالمي الصريح
    const formattedStartDate = getUtcBoundary(startDate, false);
    const formattedEndDate = getUtcBoundary(endDate, true);

    // ============================================================
    // ✅ 3. حساب أرباح المدرس عبر الدالة المشتركة — تختار تلقائياً طريقة
    // الحساب الخاصة بهذا المدرس (نسبة / طالب جديد / سعر كورس ثابت) بدلاً من
    // افتراض النسبة المئوية دائماً كما في السابق.
    // ============================================================
    log('BILLING', 'Computing teacher billing via computeTeacherBilling()...');

    const billing = await computeTeacherBilling(teacher.teacher_profile_id, formattedStartDate, formattedEndDate);

    // نسبة المنصة المستخدمة فعلياً لهذا المدرس (فقط ذات معنى لو
    // billing_method='percentage' — تبقى القيمة الافتراضية 0 لغير ذلك
    // حتى لا يُفهم خطأً أن هناك نسبة مطبقة).
    const platformPercentage = billing.meta.effective_percentage !== undefined
        ? billing.meta.effective_percentage
        : 0;

    log('BILLING_RESULT', `Method: ${billing.billing_method} | Original: ${billing.original_amount} | Actual: ${billing.actual_amount} | Fee: ${billing.platform_fee}`);

    // ============================================================
    // 4. تجميع الملخص (Summary) — نفس الشكل المستخدم سابقاً في الفرونت إند
    // ============================================================
    const summary = {
        total_original_amount: billing.original_amount,
        total_actual_amount: billing.actual_amount,
        total_approved_count: billing.meta.approved_count || 0,
        total_rejected_count: billing.meta.rejected_count || 0,
        // 👇 جديد: صافي المستحق وعمولة المنصة، محسوبين بحسب طريقة المدرس
        platform_fee: billing.platform_fee,
        net_profit: billing.net_profit
    };

    log('SUCCESS', `Report Ready. Actual Amount: ${summary.total_actual_amount} | Fee: ${summary.platform_fee}`);

    return res.status(200).json({
        teacherName: teacher.first_name || teacher.admin_username,
        requests: billing.requests,
        summary,
        platformPercentage,
        // 👇 جديد: طريقة الحساب + تفاصيل إضافية لكل طلب/عنصر — تستخدمها
        // شاشة التقرير المفصّل لعرض "طالب جديد؟" (طريقة 2) أو السعر
        // المطبّق لكل عنصر (طريقة 3).
        billingMethod: billing.billing_method,
        meta: billing.meta
    });

  } catch (err) {
    errLog('CRITICAL_ERROR', 'Report API Error:', err);
    return res.status(500).json({ error: 'فشل جلب تقرير المدرس', details: err.message });
  }
}
