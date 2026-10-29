import { supabase } from '../../../../lib/supabaseClient';
import { sendToUser, sendToTopicOrThrow, hasPushToken, PUSH_USER_COLUMNS } from '../../../../lib/pushService';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

export default async (req, res) => {
  // 1. التحقق من أن المرسل هو المدير العام
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return;

  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { title, body, targetType, targetId, userIdentifier } = req.body;

  if (!title || !body || !targetType) {
    return res.status(400).json({ success: false, message: 'عنوان ونص الإشعار مطلوبان.' });
  }

  try {
    let finalTargetId = targetId;
    
    // ==========================================================
    // 🛠️ إعداد الرسالة (الإعدادات الخاصة بالأولوية والقناة تُطبَّق داخل pushService)
    // ==========================================================
    const payload = {
      title,
      body,
      type: targetType,
      // البيانات الإضافية للتوجيه داخل التطبيق
      data: { title, body }
    };
    let targetUserToNotify = null;
    let targetTopic = null;

    // ==========================================================
    // 🎯 استهداف مستخدم معين (طالب، مدرس، أو مشرف)
    // ==========================================================
    if (targetType === 'user') {
        if (!userIdentifier) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال هاتف أو اسم المستخدم.' });
        }

        const { data: targetUser, error: userErr } = await supabase
            .from('users')
            .select(`${PUSH_USER_COLUMNS}, first_name, role`)
            .or(`username.eq.${userIdentifier.trim()},phone.eq.${userIdentifier.trim()}`)
            .single();

        if (userErr || !targetUser) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على مستخدم بهذا الرقم/الاسم.' });
        }

        if (!hasPushToken(targetUser)) {
            const roleName = targetUser.role === 'teacher' ? 'المدرس' : targetUser.role === 'moderator' ? 'المشرف' : 'الطالب';
            return res.status(400).json({ success: false, message: `${roleName} (${targetUser.first_name}) لم يقم بفتح التطبيق حتى الآن.` });
        }

        // إرسال للمستخدم مباشرة (FCM أو HMS حسب جهازه)
        targetUserToNotify = targetUser;
        payload.data.id = targetUser.id.toString();
        finalTargetId = targetUser.id;
    } 
    // ==========================================================
    // 📢 استهداف جماعي (الكل، كورس، أو مادة)
    // ==========================================================
    else {
        let topic = 'all_users'; 
        if (targetType === 'course') {
            if(!targetId) return res.status(400).json({ success: false, message: 'يرجى تحديد الكورس.' });
            topic = `course_${targetId}`;
        } else if (targetType === 'subject') {
            if(!targetId) return res.status(400).json({ success: false, message: 'يرجى تحديد المادة.' });
            topic = `subject_${targetId}`;
        }
        
        targetTopic = topic;
        if (targetId) payload.data.id = targetId.toString();
    }

    // الإرسال الفعلي (FCM + HMS)
    if (targetUserToNotify) {
      const pushResult = await sendToUser(targetUserToNotify, payload);
      if (!pushResult.sent) throw new Error('فشل إرسال الإشعار للمستخدم');
      console.log('Push Success (user):', pushResult.provider);
    } else {
      const pushResult = await sendToTopicOrThrow(targetTopic, payload);
      console.log('Push Success (topic):', targetTopic, JSON.stringify(pushResult));
    }

    // حفظ الإشعار في قاعدة البيانات
    const { error: dbError } = await supabase
      .from('notifications')
      .insert({
        title,
        body,
        target_type: targetType,
        target_id: finalTargetId ? finalTargetId.toString() : null,
        sender_role: 'super_admin'
      });

    if (dbError) throw dbError;

    return res.status(200).json({ 
        success: true, 
        message: targetType === 'user' ? 'تم إرسال الإشعار للمستخدم بنجاح 🚀' : 'تم إرسال الإشعار الجماعي بنجاح 🚀' 
    });

  } catch (error) {
    console.error('Send Notification Error:', error);
    return res.status(500).json({ 
        success: false, 
        message: 'حدث خطأ أثناء الإرسال', 
        error: error.message 
    });
  }
};
