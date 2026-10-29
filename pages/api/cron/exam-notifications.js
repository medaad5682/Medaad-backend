import { supabase } from '../../../lib/supabaseClient';
import { sendToTopicOrThrow } from '../../../lib/pushService';

// ============================================================
// 🔔 Cron Job: إرسال إشعارات الامتحانات عند موعد بدئها
// ============================================================
// يُستدعى تلقائياً كل دقيقة من GitHub Actions
//
// المنطق:
//   1. نجلب كل الامتحانات التي notify_students=true
//      وstart_time وصل (في الماضي أو الآن) ولم يُرسل إشعارها بعد
//   2. نرسل الإشعار (FCM + HMS) لكل مادة (topic) ونحفظ في سجل الإشعارات
//   3. نضع notify_students=false ليمنع إعادة الإرسال
// ============================================================

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 🔒 حماية المسار بـ secret token لمنع الاستدعاء غير المصرح به
  const authHeader = req.headers['authorization'];
  const providedSecret = authHeader?.replace('Bearer ', '') || req.query.secret;


  // -------------------------------------------------------------

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  try {
    // ============================================================
    // 1. جلب الامتحانات الجاهزة للإشعار:
    //    - notify_students = true  (المعلم طلب الإشعار)
    //    - start_time <= now       (بدأ الامتحان فعلاً)
    //    - is_active = true        (لم يُلغَ)
    // ============================================================
    const { data: exams, error: fetchError } = await supabase
      .from('exams')
      .select(`
        id,
        title,
        subject_id,
        start_time,
        subjects!inner (
          id,
          title,
          courses!inner (
            title
          )
        )
      `)
      .eq('notify_students', true)
      .eq('is_active', true)
      .lte('start_time', now); // start_time وصل أو تجاوز

    if (fetchError) throw fetchError;

    if (!exams || exams.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'لا توجد امتحانات لإشعارها الآن.' });
    }

    const results = [];

    for (const exam of exams) {
      try {
        const subjectId = exam.subject_id;
        const courseTitle = exam.subjects?.courses?.title || 'تحديث جديد';
        const examTitle = exam.title;

        // ============================================================
        // 2. ✅ تعطيل علم الإشعار أولاً (Atomic Lock)
        //    نستخدم UPDATE مع الشرط eq('notify_students', true)
        //    حتى لو نُفِّذ الكرون مرتين في نفس اللحظة، سيُرسل الإشعار مرة واحدة فقط
        // ============================================================
        const { count } = await supabase
          .from('exams')
          .update({ notify_students: false })
          .eq('id', exam.id)
          .eq('notify_students', true) // ← القفل الذري
          .select('id', { count: 'exact', head: true });

        // إذا كان count = 0 يعني كرون آخر سبقنا — نتخطى هذا الامتحان
        if (count === 0) {
          results.push({ examId: exam.id, status: 'skipped (already handled)' });
          continue;
        }

        // ============================================================
        // 3. إرسال إشعار (FCM + HMS) للطلاب المشتركين في المادة
        // ============================================================
        // يرمي خطأ لو فشل الإرسال على كل الشبكات (نفس سلوك FCM السابق)
        await sendToTopicOrThrow(`subject_${subjectId}`, {
          title: courseTitle,
          body: `🔔 بدأ الاختبار الآن: ${examTitle}`,
          type: 'exam',
          data: {
            id: exam.id.toString(),
            subject_id: subjectId.toString()
          }
        });

        // ============================================================
        // 4. حفظ في سجل الإشعارات ليظهر داخل التطبيق
        // ============================================================
        await supabase.from('notifications').insert({
          title: courseTitle,
          body: `🔔 بدأ الاختبار الآن: ${examTitle}`,
          target_type: 'exam',
          target_id: exam.id.toString(),
          sender_role: 'teacher'
        });

        results.push({ examId: exam.id, title: examTitle, status: 'sent ✅' });
        console.log(`✅ [exam-notifications] Sent for exam: "${examTitle}" (id=${exam.id})`);

      } catch (examErr) {
        console.error(`⚠️ [exam-notifications] Failed for exam id=${exam.id}:`, examErr.message);
        results.push({ examId: exam.id, status: `error: ${examErr.message}` });
      }
    }

    return res.status(200).json({
      success: true,
      sent: results.filter(r => r.status.startsWith('sent')).length,
      results
    });

  } catch (err) {
    console.error('❌ [exam-notifications] Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
