import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';
import admin from '../../../lib/firebaseAdmin'; // ✅ استيراد أداة فايربيز لإرسال الإشعارات

// ============================================================
// 🛠️ دوال مساعدة لمعالجة فيديوهات يوتيوب
// ============================================================
const extractYouTubeID = (url) => {
  if (!url) return null;
  
  // إذا تم إدخال الـ ID مباشرة (11 حرف) بدون رابط
  if (url.length === 11 && !url.includes('/')) return url;

  // تعبير نمطي (Regex) حديث وشامل يدعم جميع روابط يوتيوب بما فيها youtu.be والروابط التي تحتوي على ?si=
  const regExp = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regExp);
  
  return match ? match[1] : url;
};

// 🛠️ دالة مساعدة لحذف الفيديو فعلياً من خوادم Bunny Stream
// (نفس المنطق المستخدم في لوحة تحكم الويب — يضمن عدم بقاء فيديوهات يتيمة
//  على Bunny عند حذف فيديو مرفوع من التطبيق)
async function deleteVideoFromBunny(bunnyVideoId) {
  if (!bunnyVideoId) return;

  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;

  if (!libraryId || !apiKey) {
    console.error('⚠️ [Bunny] Missing credentials for deletion');
    return;
  }

  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey, accept: 'application/json' },
    });

    if (!res.ok) {
      console.error(`⚠️ [Bunny] Failed to delete video ${bunnyVideoId}, status: ${res.status}`);
    } else {
      console.log(`✅ [Bunny] Video ${bunnyVideoId} deleted successfully from Bunny Stream.`);
    }
  } catch (err) {
    console.error('⚠️ [Bunny] Error deleting video:', err.message);
  }
}

// ============================================================
// 🎥 دالة مساعدة: جمع كل معرفات فيديوهات Bunny المرتبطة بفصل/مادة/كورس
// قبل حذفه نهائياً — لتجنب بقاء فيديوهات يتيمة على Bunny عند حذف
// عنصر أعلى في التسلسل الهرمي (وليس فقط عند حذف الفيديو مباشرة)
// ============================================================
async function getBunnyVideoIdsUnder(type, id) {
  try {
    let chapterIds = [];

    if (type === 'chapters') {
      chapterIds = [id];
    } else if (type === 'subjects') {
      const { data: chapters } = await supabase.from('chapters').select('id').eq('subject_id', id);
      chapterIds = (chapters || []).map(c => c.id);
    } else if (type === 'courses') {
      const { data: subjects } = await supabase.from('subjects').select('id').eq('course_id', id);
      const subjectIds = (subjects || []).map(s => s.id);
      if (subjectIds.length) {
        const { data: chapters } = await supabase.from('chapters').select('id').in('subject_id', subjectIds);
        chapterIds = (chapters || []).map(c => c.id);
      }
    }

    if (!chapterIds.length) return [];

    const { data: videos } = await supabase.from('videos').select('bunny_video_id').in('chapter_id', chapterIds);
    return (videos || []).map(v => v.bunny_video_id).filter(Boolean);
  } catch (e) {
    console.error('⚠️ [Bunny] فشل تجميع معرفات الفيديوهات الفرعية للتنظيف:', e.message);
    return [];
  }
}

// ============================================================
// 🛡️ دالة مساعدة: تُرجع فقط معرفات Bunny الآمن حذفها فعلياً من على
// خوادم Bunny — أي التي لم يعد أي صف آخر في جدول videos يشير إليها.
// ============================================================
// لماذا هذا ضروري؟ bunny_video_id ليس مضموناً أن يكون فريداً في DB:
// ميزة "النسخ المتقدم" (advanced-copy.js) تنسخ صف الفيديو إلى فصل/كورس
// آخر بنفس bunny_video_id تماماً دون إنشاء ملف جديد فعلي على Bunny —
// أي أن صفين (أو أكثر) قد يتشاركان نفس الفيديو الحقيقي على Bunny.
// لو حذفنا الفيديو من Bunny فعلياً بمجرد حذف أحد هذين الصفين (أو حذف
// كورس/مادة/فصل يحوي أحدهما)، سينكسر تشغيل الفيديو في كل مكان آخر لا
// يزال يشير لنفس bunny_video_id، رغم أن صفه في DB لم يُحذف.
//
// ⚠️ يجب استدعاء هذه الدالة بعد تنفيذ حذف صفوف DB (وليس قبله)، حتى تعكس
// نتيجة الاستعلام الحالة الحقيقية بعد الحذف (Cascade) — أي صف لا يزال
// موجوداً في هذه اللحظة هو بالتأكيد صف خارج ما حذفناه للتو.
// ============================================================
async function getBunnyIdsSafeToDelete(bunnyVideoIds) {
  const uniqueIds = [...new Set((bunnyVideoIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  try {
    const { data: stillReferenced, error } = await supabase
      .from('videos')
      .select('bunny_video_id')
      .in('bunny_video_id', uniqueIds);

    if (error) {
      // في حالة فشل التحقق: لا نحذف أي شيء من Bunny احتياطاً — تجنّب حذف
      // فيديو قد لا يزال مستخدَماً في مكان آخر أهم من تسريب فيديو يتيم.
      console.error('⚠️ [Bunny] فشل التحقق من الفيديوهات المشتركة قبل الحذف — سيتم تخطي حذف كل الفيديوهات من Bunny احتياطاً:', error.message);
      return [];
    }

    const stillReferencedIds = new Set((stillReferenced || []).map((v) => v.bunny_video_id));
    const idsToSkip = uniqueIds.filter((vid) => stillReferencedIds.has(vid));
    if (idsToSkip.length > 0) {
      console.log(`ℹ️ [Bunny] تخطي حذف ${idsToSkip.length} فيديو من Bunny لأنها لا تزال مستخدَمة في صف آخر (غالباً منسوخة عبر "النسخ المتقدم"):`, idsToSkip);
    }

    return uniqueIds.filter((vid) => !stillReferencedIds.has(vid));
  } catch (e) {
    console.error('⚠️ [Bunny] خطأ غير متوقع أثناء التحقق من الفيديوهات المشتركة قبل الحذف:', e.message);
    return [];
  }
}

// ============================================================
// 🔢 دالة مساعدة: جلب قيمة sort_order التالية لعنصر جديد
// بدلاً من 999 الثابتة، نحسب: MAX(sort_order) + 1 داخل نفس الحاوية
// ============================================================
async function getNextSortOrder(type, data, teacherId = null) {
  try {
    let query = supabase.from(type).select('sort_order');

    if (type === 'courses') {
      if (teacherId) query = query.eq('teacher_id', teacherId);
    } else if (type === 'subjects') {
      if (data.course_id) query = query.eq('course_id', data.course_id);
    } else if (type === 'chapters') {
      if (data.subject_id) query = query.eq('subject_id', data.subject_id);
    } else if (type === 'exams') {
      if (data.subject_id) query = query.eq('subject_id', data.subject_id);
    } else if (type === 'videos' || type === 'pdfs') {
      if (data.chapter_id) query = query.eq('chapter_id', data.chapter_id);
    }

    const { data: rows } = await query;
    if (!rows || rows.length === 0) return 0;

    const maxOrder = Math.max(...rows.map(r => r.sort_order ?? 0));
    return maxOrder + 1;
  } catch {
    return 0; // fallback آمن
  }
}

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. التحقق من الصلاحية
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // ✅ استقبال الخيارات والبيانات
  const { action, type, data } = req.body; 

  // ============================================================
  // 🛡️ دالة للتحقق من ملكية الكورس
  // ============================================================
  const checkCourseOwnership = async (courseId) => {
      if (!courseId) return false;
      const { data: course } = await supabase
          .from('courses')
          .select('teacher_id')
          .eq('id', courseId)
          .single();
      return course && course.teacher_id === auth.teacherId;
  };

  // ============================================================
  // 🛡️ دالة لاستخراج معرف الكورس (Course ID) من العناصر الفرعية
  // ============================================================
  const getParentCourseId = async (itemType, itemData, isUpdateOrDelete = false) => {
      if (itemType === 'subjects') {
          if (!isUpdateOrDelete) return itemData.course_id;
          const { data: subject } = await supabase.from('subjects').select('course_id').eq('id', itemData.id).single();
          return subject?.course_id;
      }

      if (itemType === 'chapters') {
          let subjectId = itemData.subject_id;
          if (isUpdateOrDelete) {
              const { data: chapter } = await supabase.from('chapters').select('subject_id').eq('id', itemData.id).single();
              subjectId = chapter?.subject_id;
          }
          if (subjectId) {
              const { data: subject } = await supabase.from('subjects').select('course_id').eq('id', subjectId).single();
              return subject?.course_id;
          }
      }

      if (itemType === 'videos' || itemType === 'pdfs') {
          let chapterId = itemData.chapter_id;
          if (isUpdateOrDelete) {
              const { data: item } = await supabase.from(itemType).select('chapter_id').eq('id', itemData.id).single();
              chapterId = item?.chapter_id;
          }
          if (chapterId) {
              const { data: chapter } = await supabase
                  .from('chapters')
                  .select('subjects (course_id)')
                  .eq('id', chapterId)
                  .single();
              return chapter?.subjects?.course_id;
          }
      }
      return null;
  };

  // ============================================================
  // 🛡️ دالة مساعدة للحصول على subject_id من chapter_id (للإشعارات)
  // ============================================================
  const getSubjectIdFromChapter = async (chapterId) => {
      if (!chapterId) return null;
      const { data: chapter } = await supabase.from('chapters').select('subject_id, subjects!inner(courses!inner(title))').eq('id', chapterId).single();
      return chapter ? { subjectId: chapter.subject_id, courseTitle: chapter.subjects?.courses?.title } : null;
  };

  try {
    // --- إضافة عنصر جديد (Create) ---
    if (action === 'create') {
      let insertData = { ...data };
      let isBunnyVideo = false; // 👈 يُحدَّد أدناه — يُستخدم لاحقاً لتأجيل الإشعار حتى اكتمال التشفير

      // 🚀 التحقق الإجباري من الفيديو والمدة
      // ✅ ملاحظة: فيديوهات Bunny (المرفوعة كملف من التطبيق) تُحفظ مباشرة عبر
      //    /api/teacher/confirm-upload.js وليس من هنا. هذا المسار (create/videos)
      //    يبقى مخصصاً بشكل أساسي لإضافة فيديوهات بروابط يوتيوب، لكننا لا نمنع
      //    أيضاً إدخالاً يحمل bunny_video_id مباشرة لو احتاج التطبيق ذلك مستقبلاً.
      if (type === 'videos') {
          const hasBunnyId = !!insertData.bunny_video_id;
          isBunnyVideo = hasBunnyId;
          const videoUrl = insertData.url || insertData.youtube_video_id;

          if (!hasBunnyId && !videoUrl) {
              return res.status(400).json({ error: 'رابط الفيديو مطلوب.' });
          }

          if (videoUrl) {
              insertData.youtube_video_id = extractYouTubeID(videoUrl);
          }
          delete insertData.url;
          delete insertData.notifyStudents;

          // 🚨 [تحقق إجباري]: لا تتم الإضافة إلا إذا تم إرسال مدة صحيحة من التطبيق
          // (Bunny قد يرسل المدة لاحقاً تلقائياً عبر الـ Webhook بعد المعالجة)
          if (!hasBunnyId && (!insertData.duration || insertData.duration.trim() === '' || insertData.duration === '00:00')) {
              return res.status(400).json({ error: 'إرسال مدة الفيديو الفعلي إلزامي، ولا يمكن تركها فارغة أو أصفاراً.' });
          }
      }
      
      const shouldNotify = data.notifyStudents === true || data.notifyStudents === 'true';
      if (insertData.notifyStudents !== undefined) {
          delete insertData.notifyStudents;
      }

      // 🔔 فيديوهات Bunny تحتاج وقتاً للمعالجة (Encoding) قبل أن تصبح قابلة للتشغيل.
      // بدلاً من إرسال الإشعار فور الإضافة، نخزّنه كعلَم على صف الفيديو نفسه
      // ليُرسله /api/webhooks/bunny-encoding.js تلقائياً عند اكتمال التشفير فعلاً.
      if (type === 'videos' && isBunnyVideo) {
          insertData.notify_students = shouldNotify;
      }
      
      // 🛡️ التحقق الأمني
      if (type !== 'courses') {
          const targetCourseId = await getParentCourseId(type, insertData, false);

          if (targetCourseId) {
              const isOwner = await checkCourseOwnership(targetCourseId);
              if (!isOwner) {
                  return res.status(403).json({ error: 'غير مسموح لك بالإضافة في هذا الكورس.' });
              }
          } else {
               if (['subjects', 'chapters', 'videos', 'pdfs'].includes(type)) {
                   return res.status(400).json({ error: 'بيانات غير كافية للتحقق من الأمان.' });
               }
          }
      }

      if (type === 'courses') {
        insertData.teacher_id = auth.teacherId;
        // ✅ تعيين الترتيب تلقائياً: آخر كورس للمعلم + 1
        insertData.sort_order = await getNextSortOrder(type, insertData, auth.teacherId);
        if (!insertData.code) insertData.code = Math.floor(100000 + Math.random() * 900000);
      } else {
        // ✅ تعيين الترتيب تلقائياً: آخر عنصر داخل نفس الحاوية + 1
        insertData.sort_order = await getNextSortOrder(type, insertData);
      }
      
      const { data: newItem, error } = await supabase
        .from(type)
        .insert(insertData)
        .select()
        .single();

      if (error) {
          if (error.code === '23505') { 
             return res.status(400).json({ error: 'تكرار في البيانات (Duplicate Code/ID)' });
          }
          throw error;
      }

      if (type === 'courses' && newItem) {
          try {
            const accessList = [];
            const currentUserId = auth.userId || auth.id;
            if (currentUserId) accessList.push({ user_id: currentUserId, course_id: newItem.id });
            const { data: mainTeacherUser } = await supabase.from('users').select('id').eq('teacher_profile_id', auth.teacherId).eq('role', 'teacher').maybeSingle();
            if (mainTeacherUser && mainTeacherUser.id !== currentUserId) accessList.push({ user_id: mainTeacherUser.id, course_id: newItem.id });
            const { data: moderators } = await supabase.from('users').select('id').eq('teacher_profile_id', auth.teacherId).eq('role', 'moderator');
            if (moderators) moderators.forEach(mod => { if (!accessList.some(item => item.user_id === mod.id)) accessList.push({ user_id: mod.id, course_id: newItem.id }); });
            if (accessList.length > 0) await supabase.from('user_course_access').upsert(accessList, { onConflict: 'user_id, course_id' });
          } catch (permError) { console.error("Error granting permissions:", permError); }
      }

      // إرسال الإشعارات فوراً — فقط لفيديوهات يوتيوب (لا معالجة/تشفير لها) والملفات PDF.
      // فيديوهات Bunny (isBunnyVideo) تم تخزين علَم notify_students عليها أعلاه،
      // وسيُرسل الإشعار الفعلي لاحقاً من /api/webhooks/bunny-encoding.js عند الجاهزية.
      if (shouldNotify && (type === 'pdfs' || (type === 'videos' && !isBunnyVideo))) {
          try {
              const subjectInfo = await getSubjectIdFromChapter(insertData.chapter_id);
              if (subjectInfo && subjectInfo.subjectId) {
                  const courseTitle = subjectInfo.courseTitle || 'تحديث جديد';
                  const itemTitle = insertData.title || 'محتوى جديد';
                  const itemTypeName = type === 'videos' ? 'فيديو جديد' : 'ملف جديد';

                  const message = {
                      notification: { title: courseTitle, body: `تم رفع ${itemTypeName}: ${itemTitle}` },
                      topic: `subject_${subjectInfo.subjectId}`, 
                      android: { priority: 'high', notification: { sound: 'default' } },
                      apns: { payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
                      data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', type: 'subject', id: subjectInfo.subjectId.toString() }
                  };

                  await admin.messaging().send(message);

                  await supabase.from('notifications').insert({
                      title: courseTitle,
                      body: `تم رفع ${itemTypeName}: ${itemTitle}`,
                      target_type: 'subject',
                      target_id: subjectInfo.subjectId.toString(),
                      sender_role: 'teacher'
                  });
              }
          } catch (notifyErr) {
              console.error("⚠️ FCM Notify Error:", notifyErr.message);
          }
      }

      return res.status(200).json({ success: true, item: newItem });
    }

    // --- تعديل عنصر (Update) ---
    if (action === 'update') {
       const { id, ...updates } = data;
       let isAuthorized = false;

       if (updates.notifyStudents !== undefined) delete updates.notifyStudents;

       if (type === 'videos') {
           const videoUrl = updates.url || updates.youtube_video_id;
           if (videoUrl) {
               updates.youtube_video_id = extractYouTubeID(videoUrl);
               delete updates.url;
           }

           // 🚨 [تحقق إجباري]: التأكد من أن المدة المرسلة للتحديث صالحة
           if (updates.duration !== undefined && (updates.duration.trim() === '' || updates.duration === '00:00')) {
               return res.status(400).json({ error: 'تحديث مدة الفيديو إلزامي، ولا يمكن تركها فارغة أو أصفاراً.' });
           }
       }

       if (type === 'courses') {
           const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', id).single();
           if (course && course.teacher_id === auth.teacherId) {
               isAuthorized = true;
           }
       } else {
           const targetCourseId = await getParentCourseId(type, { id }, true);
           if (targetCourseId && await checkCourseOwnership(targetCourseId)) {
               isAuthorized = true;
           }
       }

       if (!isAuthorized) {
           return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا المحتوى.' });
       }

       const { error } = await supabase.from(type).update(updates).eq('id', id);
       
       if (error) throw error;
       return res.status(200).json({ success: true });
    }

    // --- حذف عنصر (Delete) ---
    if (action === 'delete') {
       const { id } = data;
       let isAuthorized = false;

       if (type === 'courses') {
           const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', id).single();
           if (course && course.teacher_id === auth.teacherId) {
               isAuthorized = true;
           }
       } else {
           const targetCourseId = await getParentCourseId(type, { id }, true);
           if (targetCourseId && await checkCourseOwnership(targetCourseId)) {
               isAuthorized = true;
           }
       }

       if (!isAuthorized) {
           return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا المحتوى.' });
       }

       // ✅ تنظيف Bunny Stream: نجمع كل معرفات الفيديوهات المرتبطة بالعنصر المحذوف
       // (فيديو مباشرة، أو كل فيديوهات فصل/مادة/كورس سيُحذف عبر Cascade)
       let bunnyVideoIdsToDelete = [];
       if (type === 'videos') {
           const { data: videoRecord } = await supabase.from('videos').select('bunny_video_id').eq('id', id).single();
           if (videoRecord?.bunny_video_id) {
               bunnyVideoIdsToDelete = [videoRecord.bunny_video_id];
           }
       } else if (type === 'chapters' || type === 'subjects' || type === 'courses') {
           bunnyVideoIdsToDelete = await getBunnyVideoIdsUnder(type, id);
       }

       const { error } = await supabase.from(type).delete().eq('id', id);

       if (error) throw error;

       if (bunnyVideoIdsToDelete.length > 0) {
           const idsSafeToDelete = await getBunnyIdsSafeToDelete(bunnyVideoIdsToDelete);
           // لا ننتظر النتيجة حتى لا نؤخر الرد على التطبيق
           idsSafeToDelete.forEach(vid => deleteVideoFromBunny(vid));
       }

       return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error("Teacher Content API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
