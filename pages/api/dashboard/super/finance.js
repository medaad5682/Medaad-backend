import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

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

  // تجهيز التواريخ بتنسيق مناسب للدالة (ISO String)
  const formattedStartDate = startDate ? `${startDate}T00:00:00` : null;
  const formattedEndDate = endDate ? `${endDate}T23:59:59` : null;

  try {
    // ============================================================
    // 1. جلب نسبة المنصة من جدول الإعدادات
    // ============================================================
    let PLATFORM_PERCENTAGE = 0.10; // القيمة الافتراضية (10%)

    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'platform_percentage')
      .maybeSingle();

    if (settingsData) {
      const val = parseFloat(settingsData.value);
      if (!isNaN(val)) {
        // تحويل الرقم: إذا كان > 1 (مثل 15) نقسمه على 100، وإلا نستخدمه كما هو
        PLATFORM_PERCENTAGE = val > 1 ? val / 100 : val;
      }
    }

    log('CONFIG', `Platform Percentage: ${PLATFORM_PERCENTAGE * 100}%`);

    // ============================================================
    // 2. حساب الإجمالي الكلي باستخدام RPC
    // ============================================================
    const { data: totalRevenueRPC, error: rpcError } = await supabase
      .rpc('get_total_revenue', { 
        start_date: formattedStartDate, 
        end_date: formattedEndDate 
      });

    if (rpcError) throw rpcError;

    const totalRevenue = totalRevenueRPC || 0;
    log('TOTAL', `Total Revenue: ${totalRevenue}`);

    // ============================================================
    // 3. جلب قائمة المدرسين وحساب أرباح كل مدرس
    // ============================================================
    // ⚠️ هام: نجلب teacher_profile_id لأن الأموال مربوطة به في جدول العمليات
    const { data: teachersList, error: teacherError } = await supabase
      .from('users')
      .select('id, first_name, admin_username, teacher_profile_id')
      .eq('role', 'teacher');

    if (teacherError) throw teacherError;

    // استخدام Promise.all لتنفيذ الحسابات بشكل متوازي
    const teachersDataPromises = teachersList.map(async (teacher) => {
      
      // إذا لم يكن للمستخدم بروفايل مدرس، لا يمكننا حساب أرباحه (تخطي)
      if (!teacher.teacher_profile_id) {
         return {
            id: teacher.id,
            name: teacher.first_name || teacher.admin_username || 'مدرس (بدون بروفايل)',
            sales: 0,
            transaction_count: 0,
            platform_fee: 0,
            net_profit: 0
         };
      }

      // استدعاء دالة RPC لحساب أرباح المدرس باستخدام teacher_profile_id (وليس id المستخدم)
      const { data: teacherSales, error: rpcTeacherError } = await supabase
        .rpc('get_teacher_revenue', { 
            teacher_id_arg: teacher.teacher_profile_id, // ✅ التصحيح الأساسي هنا
            start_date: formattedStartDate, 
            end_date: formattedEndDate
        });
      
      if (rpcTeacherError) {
        errLog('RPC_ERROR', `Failed for teacher ${teacher.first_name}`, rpcTeacherError);
      }

      const sales = teacherSales || 0;
      
      // حساب النسب
      const platformFee = sales * PLATFORM_PERCENTAGE;
      const netProfit = sales - platformFee;

      // حساب عدد العمليات (فقط إذا كان هناك مبيعات لتوفير الموارد)
      let transactionCount = 0;
      if (sales > 0) {
         const { count } = await supabase
           .from('subscription_requests')
           .select('id', { count: 'exact', head: true })
           .eq('teacher_id', teacher.teacher_profile_id) // ✅ استخدام المعرف الصحيح
           .eq('status', 'approved')
           .gte('created_at', formattedStartDate || '1970-01-01')
           .lte('created_at', formattedEndDate || new Date().toISOString());
         transactionCount = count || 0;
         
         log('RESULT', `Teacher: ${teacher.first_name} | Sales: ${sales}`);
      }

      return {
        id: teacher.id, // نُعيد ID المستخدم للفرونت إند لغرض العرض والروابط
        name: teacher.first_name || teacher.admin_username || 'مدرس غير معروف',
        sales: sales,
        transaction_count: transactionCount,
        platform_fee: platformFee,
        net_profit: netProfit
      };
    });

    // انتظار اكتمال جميع الحسابات
    const processedTeachersList = await Promise.all(teachersDataPromises);
    
    // ترتيب القائمة حسب الأكثر مبيعاً (تنازلياً)
    const finalTeachersList = processedTeachersList.sort((a, b) => b.sales - a.sales);

    // 4. تجميع الإحصائيات العامة للمنصة
    const platformProfitTotal = totalRevenue * PLATFORM_PERCENTAGE;
    const teachersDueTotal = totalRevenue - platformProfitTotal;

    // إرسال الرد النهائي
    return res.status(200).json({
      percentage_used: (PLATFORM_PERCENTAGE * 100) + '%',
      total_revenue: totalRevenue,
      platform_profit: platformProfitTotal,
      teachers_due: teachersDueTotal,
      teachers_list: finalTeachersList
    });

  } catch (err) {
    errLog('CRITICAL', 'Finance API Error:', err);
    return res.status(500).json({ error: 'فشل حساب التقارير المالية', details: err.message });
  }
}
