import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

// ============================================================
// 📅 تاريخ بداية احتساب "إجمالي الأرباح" (بطاقة لوحة تحكم المدرس)
// ------------------------------------------------------------
// GET  -> يرجع التاريخ المحفوظ حالياً (أو null لو لم يُحدَّد = كل الوقت)
// POST -> يحفظ تاريخاً جديداً (أو يمسحه بإرسال date: null) ويبقى
//         سارياً حتى يغيّره المدرس مرة أخرى (لا حاجة لإعادة اختياره
//         في كل زيارة).
// ============================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return; // requireTeacherOrAdmin already sent the error response

  const teacherId = user.teacherId;
  if (!teacherId) return res.status(403).json({ error: 'لا يوجد حساب معلم مرتبط بهذا المستخدم' });

  if (req.method === 'GET') {
    try {
      const { data, error: fetchError } = await supabase
        .from('teachers')
        .select('earnings_start_date')
        .eq('id', teacherId)
        .maybeSingle();
      if (fetchError) throw fetchError;

      return res.status(200).json({ success: true, earningsStartDate: data?.earnings_start_date || null });
    } catch (err) {
      console.error('❌ earnings-start-date GET error:', err.message);
      return res.status(500).json({ error: 'فشل جلب التاريخ المحفوظ' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { date } = req.body || {};

      // date === null (أو '') => إلغاء التاريخ والعودة لاحتساب كل الوقت
      let valueToSave = null;
      if (date !== null && date !== undefined && date !== '') {
        if (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
          return res.status(400).json({ error: 'صيغة التاريخ غير صحيحة (المطلوب YYYY-MM-DD)' });
        }
        // لا نسمح بتاريخ في المستقبل (لا معنى لاحتساب أرباح تبدأ لاحقاً)
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
        if (date > todayStr) {
          return res.status(400).json({ error: 'لا يمكن اختيار تاريخ في المستقبل' });
        }
        valueToSave = date;
      }

      const { error: updateError } = await supabase
        .from('teachers')
        .update({ earnings_start_date: valueToSave })
        .eq('id', teacherId);
      if (updateError) throw updateError;

      return res.status(200).json({ success: true, earningsStartDate: valueToSave });
    } catch (err) {
      console.error('❌ earnings-start-date POST error:', err.message);
      return res.status(500).json({ error: 'فشل حفظ التاريخ' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
