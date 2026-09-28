import { supabase } from './supabaseClient';
import admin from './firebaseAdmin';

/**
 * إرسال إشعار للطالب بنتيجة طلب الاشتراك (قبول / رفض)
 * يُستخدم من كل الأماكن التي تُغيّر حالة subscription_requests:
 * - لوحة تحكم المدرس (الويب): pages/api/dashboard/teacher/requests.js
 * - لوحة تحكم المدرس (التطبيق): pages/api/teacher/students.js
 * - لوحة السوبر أدمن: pages/api/dashboard/super/requests.js
 *
 * لا يرمي أخطاء للخارج أبداً — فشل الإشعار لا يجب أن يفشل عملية القبول/الرفض نفسها.
 */
export async function notifyStudentSubscriptionDecision({
  userId,
  decision,        // 'approve' | 'reject'
  courseTitle,     // نص وصف العناصر (request.course_title أو ملخص مبسط)
  rejectionReason, // اختياري - سبب الرفض
  requestId,
  senderRole = 'teacher' // 'teacher' | 'super_admin'
}) {
  if (!userId) return;

  try {
    const { data: studentUser } = await supabase
      .from('users')
      .select('id, fcm_token')
      .eq('id', userId)
      .maybeSingle();

    if (!studentUser?.fcm_token) return; // الطالب لم يفتح التطبيق بعد، لا يوجد توكن لإرسال إشعار له

    const isApproved = decision === 'approve';
    const title = isApproved ? '✅ تم قبول طلب اشتراكك' : '❌ تم رفض طلب اشتراكك';
    const body = isApproved
      ? `تم تفعيل اشتراكك بنجاح في: ${courseTitle || 'المحتوى المطلوب'}`
      : `تم رفض طلب اشتراكك${rejectionReason ? ' — ' + rejectionReason : ''}`;

    await admin.messaging().send({
      token: studentUser.fcm_token,
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
        type: 'subscription_decision',
        decision,
        id: requestId ? requestId.toString() : ''
      }
    });

    await supabase.from('notifications').insert({
      title,
      body,
      target_type: 'subscription_decision',
      target_id: requestId ? requestId.toString() : null,
      sender_role: senderRole
    });
  } catch (err) {
    // لا نفشل عملية القبول/الرفض بسبب فشل الإشعار فقط
    console.error('⚠️ FCM Student Decision Notify Error:', err.message);
  }
}

/**
 * 🔔 إشعار المعلم (والمشرفين التابعين له) عند تسليم طالب لامتحان حقيقي.
 *
 * حالتان:
 *  1) الامتحان يحتوي أسئلة مقالية (needsGrading = true):
 *     ورقة بانتظار التصحيح → "📝 ورقة بانتظار التصحيح" + اسم الطالب + الامتحان + المادة / الكورس.
 *  2) الامتحان اختياري فقط (needsGrading = false):
 *     "✅ طالب جديد حلّ الامتحان" + اسم الطالب + الامتحان + المادة / الكورس + درجته.
 *
 * يُستدعى من pages/api/exams/submit-attempt.js (المحاولة الحقيقية فقط، وليس وضع التدريب).
 *
 * لا يرمي أخطاء للخارج أبداً — فشل الإشعار لا يجب أن يفشل تسليم الامتحان نفسه.
 */
export async function notifyTeacherExamSubmission({
  attemptId,
  examId,
  studentUserId,
  studentNameInput, // student_name_input المخزّن في المحاولة (احتياطي)
  needsGrading,     // true = يحتوي أسئلة مقالية بانتظار التصحيح
  score,            // درجة الأسئلة الاختيارية
  total,            // عدد الأسئلة الاختيارية
  percentage
}) {
  try {
    if (!examId) return;

    // 1) بيانات الامتحان + المادة + الكورس + المعلم صاحب الامتحان
    const { data: exam } = await supabase
      .from('exams')
      .select('id, title, teacher_id, subjects ( title, courses ( title ) )')
      .eq('id', examId)
      .maybeSingle();

    if (!exam?.teacher_id) return;

    // 2) اسم الطالب
    let studentName = (studentNameInput || '').toString().trim();
    if (!studentName && studentUserId) {
      const { data: student } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', studentUserId)
        .maybeSingle();
      studentName = (student?.first_name || '').toString().trim();
    }
    if (!studentName) studentName = 'طالب';

    // 3) المستلمون: المعلم الرئيسي + المشرفون التابعون له (لديهم توكن فقط)
    const { data: recipients } = await supabase
      .from('users')
      .select('id, fcm_token')
      .eq('teacher_profile_id', exam.teacher_id)
      .in('role', ['teacher', 'moderator']);

    const tokens = Array.from(
      new Set((recipients || []).map(r => r.fcm_token).filter(Boolean))
    );
    if (tokens.length === 0) return;

    // 4) نص الإشعار
    const examTitle = exam.title || 'امتحان';
    const subjectTitle = exam.subjects?.title || '';
    const courseTitle = exam.subjects?.courses?.title || '';
    const location = [subjectTitle, courseTitle].filter(Boolean).join(' / ');

    let title, body, type;
    if (needsGrading) {
      type = 'exam_pending_grading';
      title = '📝 ورقة بانتظار التصحيح';
      body = `${studentName} سلّم امتحان "${examTitle}"${location ? ' — ' + location : ''}. الورقة بانتظار تصحيحك.`;
    } else {
      type = 'exam_submitted';
      title = '✅ طالب جديد حلّ الامتحان';
      body = `${studentName} حلّ امتحان "${examTitle}"${location ? ' — ' + location : ''}. الدرجة: ${score}/${total} (${percentage}%)`;
    }

    // 5) إرسال FCM
    await admin.messaging().sendEachForMulticast({
      tokens,
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
        type,
        exam_id: String(examId),
        attempt_id: attemptId ? String(attemptId) : '',
        id: attemptId ? String(attemptId) : ''
      }
    });

    // 6) سجل الإشعارات (نفس نمط بقية إشعارات المعلم؛ لا يظهر للطلاب لأن
    //    target_type هذا لا يطابق أي شرط في get-notifications للطالب)
    await supabase.from('notifications').insert({
      title,
      body,
      target_type: type,
      target_id: attemptId ? String(attemptId) : String(examId),
      sender_role: 'student'
    });
  } catch (err) {
    // لا نفشل تسليم الامتحان بسبب فشل الإشعار فقط
    console.error('⚠️ FCM Teacher Exam Submission Notify Error:', err.message);
  }
}
