import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper';
import { sendToUser, hasPushToken, PUSH_USER_COLUMNS } from '../../../lib/pushService'; // ✅ لإرسال إشعار للمدرس عند وجود تقييم جديد

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  // 🛡️ التحقق من الأمان عبر authHelper (بدون تمرير resourceId ليكون فحصاً عاماً للتوكن والجهاز)
  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) return res.status(401).json({ message: 'Unauthorized access' });

  const { chapter_id, content } = req.body;

  if (!chapter_id || !content) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const { data: newFeedback, error } = await supabase
      .from('chapter_feedback')
      .insert([{ chapter_id, content }])
      .select('id')
      .single();

    if (error) throw error;

    // =========================================================
    // 🔔 إشعار المدرس (صاحب الكورس) بوجود تقييم/ملاحظة جديدة على الفصل
    // العنوان (Head) = اسم الكورس، والنص = اسم المادة + اسم الفصل
    // فشل الإشعار لا يجب أن يفشل عملية إرسال التقييم نفسها
    // =========================================================
    try {
      const { data: chapterData } = await supabase
        .from('chapters')
        .select(`
          title,
          subjects (
            title,
            courses (
              title,
              teacher_id
            )
          )
        `)
        .eq('id', chapter_id)
        .single();

      const chapterTitle = chapterData?.title || '';
      const subjectTitle = chapterData?.subjects?.title || '';
      const courseTitle = chapterData?.subjects?.courses?.title || 'كورس';
      const teacherId = chapterData?.subjects?.courses?.teacher_id;

      if (teacherId) {
        const { data: teacherUser } = await supabase
          .from('users')
          .select(PUSH_USER_COLUMNS)
          .eq('teacher_profile_id', teacherId)
          .eq('role', 'teacher')
          .maybeSingle();

        if (hasPushToken(teacherUser)) {
          const notifTitle = courseTitle; // 👈 اسم الكورس كعنوان (Head) للإشعار
          const notifBody = `📝 تقييم جديد على فصل "${chapterTitle}" — مادة: ${subjectTitle}`;

          const pushResult = await sendToUser(teacherUser, {
            title: notifTitle,
            body: notifBody,
            type: 'chapter_feedback',
            data: {
              chapter_id: chapter_id.toString(),
              id: newFeedback?.id ? newFeedback.id.toString() : ''
            }
          });

          // نفس السلوك السابق: لا نسجّل الإشعار في السجل إذا فشل الإرسال
          if (pushResult.sent) {
            await supabase.from('notifications').insert({
              title: notifTitle,
              body: notifBody,
              target_type: 'chapter_feedback',
              target_id: newFeedback?.id ? newFeedback.id.toString() : chapter_id.toString(),
              sender_role: 'student'
            });
          }
        }
      }
    } catch (notifyErr) {
      console.error('⚠️ Push Teacher Feedback Notify Error:', notifyErr.message);
    }

    return res.status(200).json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
