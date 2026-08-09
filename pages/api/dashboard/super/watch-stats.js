import { db } from '../../../../lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

// ============================================================================
// 📺 إحصائيات المشاهدات لآخر 7 أيام — سوبر أدمن (Firebase — video_views)
// ✅ بدون أي فلترة بـ teacherId — إجمالي مشاهدات المنصة كلها (كل المدرسين)
// (نفس منطق pages/api/dashboard/teacher/watch-stats.js لكن بدون تقييد)
// ============================================================================
// ⚠️ ملاحظة: video_views بتخزّن "آخر" مشاهدة فقط لكل زوج (فيديو، طالب) وليس
// سجلاً كاملاً لكل حدث. فإذا شاهد طالب فيديو أكثر من مرة خلال الأسبوع، يظهر
// فقط في اليوم الأحدث من بين هذه المرات — وهو أقرب تقدير ممكن بدون تغيير
// طريقة التسجيل الحالية.
// ============================================================================

const getEgyptOffset = (utcDateInput) => {
  try {
    // ⚠️ utcDateInput هنا لازم يكون UTC صريح (منتهي بـ Z) قبل أي new Date().
    const date = new Date(utcDateInput);
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  // ✅ سوبر أدمن فقط
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return;

  try {
    const todayCairoStr = getCairoDateStr(new Date());

    // ================================================================
    // المشاهدات — Firebase (video_views)
    // ✅ بدون فلترة بـ teacherId إطلاقاً: إجمالي مشاهدات كل المدرسين على المنصة
    // ✅ [تعديل] بدلاً من جلب كل المستندات (get) وعدّها يدوياً — وهو ما كان
    // يقرأ عشرات آلاف المستندات فعلياً ويستهلك الكوتا بسرعة — نستخدم استعلام
    // العدّ التجميعي (count aggregation) لكل يوم على حدة. هذا النوع من
    // الاستعلامات في Firestore يُحتسب بتكلفة أقل بكثير (لا يقرأ محتوى كل
    // مستند، فقط يعدّه عبر الفهرس) بغض النظر عن حجم البيانات المطابقة.
    // ================================================================
    const dayRanges = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const dayStr = shiftDateStr(todayCairoStr, -i);
      const nextDayStr = shiftDateStr(dayStr, 1);

      const startOffset = getEgyptOffset(`${dayStr}T00:00:00Z`);
      const endOffset = getEgyptOffset(`${nextDayStr}T00:00:00Z`);

      dayRanges.push({
        dayStr,
        start: new Date(`${dayStr}T00:00:00${startOffset}`),
        end: new Date(`${nextDayStr}T00:00:00${endOffset}`),
      });
    }

    const countSnapshots = await Promise.all(
      dayRanges.map(({ start, end }) =>
        db.collection('video_views')
          .where('lastViewedAt', '>=', start)
          .where('lastViewedAt', '<', end)
          .count()
          .get()
      )
    );

    // بناء مصفوفة الأيام السبعة كاملة (حتى الأيام بدون بيانات تظهر كـ 0)
    const chart = dayRanges.map(({ dayStr }, idx) => ({
      name: dayStr === todayCairoStr ? 'اليوم' : getDayNameFromDateStr(dayStr),
      date: dayStr,
      watches: countSnapshots[idx].data().count || 0,
    }));

    const todayEntry = chart[chart.length - 1];
    const todayWatches = todayEntry?.watches || 0;
    const totalWatches7Days = chart.reduce((sum, c) => sum + c.watches, 0);

    const responsePayload = {
      success: true,
      today: todayWatches,
      last7DaysTotal: totalWatches7Days,
      chart,
    };

    return res.status(200).json(responsePayload);

  } catch (err) {
    // ⚠️ بنطبع الـ error object كامل مش بس .message، عشان أي خطأ زي فهرس فايربيز
    // مركب مفقود (composite index) بيبعت رابط إنشاء جاهز جوه رسالة الخطأ نفسها.
    console.error('❌ Super Admin Watch Stats Error:', err);
    return res.status(500).json({ success: false, error: 'تعذر جلب إحصائيات المشاهدات' });
  }
}
