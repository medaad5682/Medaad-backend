import { db } from '../../../../lib/firebaseAdmin';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

// ============================================================================
// 📺 إحصائيات المشاهدات لآخر 7 أيام (Firebase — video_views)
// (نفس المصدر المستخدم في get-video-views.js)
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

  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const teacherId = user.teacherId ? user.teacherId.toString() : null;
  if (!teacherId && user.role !== 'super_admin') {
    return res.status(400).json({ success: false, error: 'لم يتم العثور على بروفايل المدرس' });
  }

  try {
    const todayCairoStr = getCairoDateStr(new Date());

    // ================================================================
    // المشاهدات — Firebase (video_views)
    // ✅ نفلتر دائماً حسب teacherId طالما الحساب مرتبط بملف مدرس — حتى لو كان
    // نفس الحساب يحمل صلاحية super_admin (is_admin = true على حساب مدرس).
    // فقط السوبر أدمن الذي لا يملك teacher_profile_id إطلاقاً يرى بيانات كل المدرسين.
    // ✅ [تعديل] بدلاً من جلب كل المستندات وعدّها يدوياً، نستخدم استعلام العدّ
    // التجميعي (count aggregation) لكل يوم — أرخص بكثير من ناحية القراءات.
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
      dayRanges.map(({ start, end }) => {
        let q = db.collection('video_views')
          .where('lastViewedAt', '>=', start)
          .where('lastViewedAt', '<', end);
        if (teacherId) {
          q = q.where('teacherId', '==', teacherId);
        }
        return q.count().get();
      })
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
    console.error('❌ Watch Stats Error:', err);
    return res.status(500).json({ success: false, error: 'تعذر جلب إحصائيات المشاهدات' });
  }
}
