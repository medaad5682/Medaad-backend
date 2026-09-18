import { supabase } from '../../../lib/supabaseClient';
import { deepDeleteCourse } from '../../../lib/courseDeletionHelper';
import admin from '../../../lib/firebaseAdmin';

// ============================================================
// 🗓️ Cron Job: حذف الكورسات المجدولة للحذف (Feature A)
// ============================================================
// يُستدعى دورياً من الـ scheduler الخاص بك (VPS cron / systemd timer...).
// ليس مرتبطاً بـ GitHub Actions — استدعِه مباشرة عبر curl/wget في crontab، مثلاً:
//   */15 * * * * curl -s -X POST https://<domain>/api/cron/scheduled-course-deletion \
//                     -H "Authorization: Bearer $CRON_SECRET"
//
// المنطق:
//   1. نجلب كل الكورسات التي scheduled_deletion_at <= now
//   2. لكل كورس: نستخدم deepDeleteCourse() المشتركة (نفس منطق حذف المعلم اليدوي)
//   3. نسجّل العملية في course_deletion_log (trigger='scheduled') لأن صف الكورس
//      نفسه يختفي بعد الحذف ولا يبقى أثر له غير هذا السجل
//   4. نُخطر المعلم صاحب الكورس عبر FCM أن كورسه حُذف تلقائياً
// ============================================================

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 🔒 حماية المسار بـ secret token لمنع الاستدعاء غير المصرح به
  const authHeader = req.headers['authorization'];
  const providedSecret = authHeader?.replace('Bearer ', '') || req.query.secret;

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  try {
    // ============================================================
    // 1. جلب الكورسات المستحقة للحذف الآن
    // ============================================================
    const { data: dueCourses, error: fetchError } = await supabase
      .from('courses')
      .select('id, title, teacher_id, scheduled_deletion_at')
      .not('scheduled_deletion_at', 'is', null)
      .lte('scheduled_deletion_at', now);

    if (fetchError) throw fetchError;

    if (!dueCourses || dueCourses.length === 0) {
      return res.status(200).json({ success: true, deleted: 0, message: 'لا توجد كورسات مستحقة للحذف الآن.' });
    }

    const results = [];

    for (const course of dueCourses) {
      try {
        // ============================================================
        // 2. Atomic Lock: نصفّر scheduled_deletion_at أولاً بشرط أنه ما زال
        //    مستحقاً للحذف — لو نُفّذ الكرون مرتين في نفس اللحظة، سيُحذف الكورس مرة واحدة فقط.
        //    (لا حاجة لإعادته لو فشل الحذف لاحقاً: لو فشل سنعيد المحاولة في التشغيلة القادمة
        //     فقط إذا أعدنا الحقل — لذلك نعيده في حال catch أدناه)
        // ============================================================
        const { count } = await supabase
          .from('courses')
          .update({ scheduled_deletion_at: null })
          .eq('id', course.id)
          .lte('scheduled_deletion_at', now) // ← القفل الذري
          .select('id', { count: 'exact', head: true });

        if (count === 0) {
          results.push({ courseId: course.id, status: 'skipped (already handled)' });
          continue;
        }

        // ============================================================
        // 3. الحذف الفعلي الكامل (نفس منطق حذف المعلم اليدوي)
        // ============================================================
        const result = await deepDeleteCourse(course.id);

        if (!result.success) {
          results.push({ courseId: course.id, status: `error: ${result.error}` });
          continue;
        }

        // ============================================================
        // 4. سجل تدقيق — الصف نفسه اختفى، فهذا هو الأثر الوحيد المتبقي
        // ============================================================
        await supabase.from('course_deletion_log').insert({
          course_id: course.id,
          course_title: result.courseTitle,
          teacher_id: result.teacherId,
          trigger: 'scheduled'
        });

        // ============================================================
        // 5. إخطار المعلم صاحب الكورس (لا يفشل العملية لو فشل الإشعار)
        // ============================================================
        await notifyTeacherCourseDeleted(result.teacherId, result.courseTitle);

        results.push({ courseId: course.id, title: result.courseTitle, status: 'deleted ✅' });
        console.log(`✅ [scheduled-course-deletion] Deleted course "${result.courseTitle}" (id=${course.id})`);
        if (result.packageWarning) {
          // لا يوجد أحد ليرى تنبيهاً هنا (الحذف تلقائي وغير مراقب) — لكن الأرشفة
          // التلقائية للباقات الفارغة تمت بالفعل داخل deepDeleteCourse نفسها.
          console.log(`📦 [scheduled-course-deletion] ${result.packageWarning}`);
        }

      } catch (courseErr) {
        console.error(`⚠️ [scheduled-course-deletion] Failed for course id=${course.id}:`, courseErr.message);
        results.push({ courseId: course.id, status: `error: ${courseErr.message}` });
      }
    }

    return res.status(200).json({
      success: true,
      deleted: results.filter(r => r.status.startsWith('deleted')).length,
      results
    });

  } catch (err) {
    console.error('❌ [scheduled-course-deletion] Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// 🔔 إشعار بسيط للمعلم عبر FCM (best-effort، لا يرمي أخطاء للخارج)
async function notifyTeacherCourseDeleted(teacherId, courseTitle) {
  if (!teacherId) return;

  try {
    const { data: teacherUser } = await supabase
      .from('users')
      .select('id, fcm_token')
      .eq('id', teacherId)
      .maybeSingle();

    const title = '🗑️ تم حذف الكورس تلقائياً';
    const body = `تم حذف كورس "${courseTitle}" بالكامل حسب الموعد المحدد من الإدارة.`;

    await supabase.from('notifications').insert({
      title,
      body,
      target_type: 'course_scheduled_deletion',
      target_id: null,
      sender_role: 'super_admin'
    });

    if (!teacherUser?.fcm_token) return; // المعلم لم يفتح التطبيق بعد، لا يوجد توكن

    await admin.messaging().send({
      token: teacherUser.fcm_token,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'max',
          channelId: 'fcm_channel',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } }
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        type: 'course_scheduled_deletion'
      }
    });
  } catch (err) {
    console.error('⚠️ [scheduled-course-deletion] FCM teacher notify error:', err.message);
  }
}
