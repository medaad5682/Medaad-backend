import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { checkTeacherPermission } from '../../../../lib/teacherPermissions';
import { sendToTopicOrThrow } from '../../../../lib/pushService';

// ===================================================================
// 🔔 إرسال إشعار فوري لصف فيديو واحد (مخصص لحالة النسخ بعد اكتمال الفيديو)
// نفس منطق sendVideoReadyNotification في bunny-encoding.js لكن بدون logger.
// يُستدعى مباشرةً بعد إدراج الصف الجديد إذا كان encoding_status='ready'
// وكان المعلم قد اختار إشعار الطلاب في واجهة النسخ.
// ===================================================================
async function sendImmediateVideoNotification(newVideoId, chapterId, videoTitle) {
  try {
    // 1. جلب subject_id وعنوان الكورس عبر الفصل
    const { data: chapterInfo } = await supabase
      .from('chapters')
      .select('subject_id, subjects!inner(courses!inner(title))')
      .eq('id', chapterId)
      .single();

    const subjectId = chapterInfo?.subject_id;
    if (!subjectId) return; // لا يمكن إرسال الإشعار بدون subject_id

    const courseTitle = chapterInfo.subjects?.courses?.title || 'تحديث جديد في الكورس';
    const title       = courseTitle;
    const body        = `تم رفع فيديو: ${videoTitle || 'فيديو جديد'}`;

    // 2. إرسال الإشعار (FCM + HMS) لجميع مشتركي المادة
    await sendToTopicOrThrow(`subject_${subjectId}`, {
      title,
      body,
      type: 'subject',
      data: { id: subjectId.toString() },
    });

    // 3. تسجيل الإشعار في جدول notifications
    await supabase.from('notifications').insert({
      title,
      body,
      target_type: 'subject',
      target_id: subjectId.toString(),
      sender_role: 'teacher',
    });

    // 4. إعادة تصفير علَم الإشعار على الصف نفسه (atomic claim) لمنع
    //    الـ webhook من إعادة الإرسال لو مرّ على هذا الصف مستقبلاً
    await supabase
      .from('videos')
      .update({ notify_students: false })
      .eq('id', newVideoId)
      .eq('notify_students', true);

  } catch (err) {
    // فشل الإشعار لا يجب أن يفشّل عملية النسخ
    console.error('⚠️ Advanced Copy — immediate notify error:', err.message);
  }
}

// ===================================================================
// 🗂️ نسخ مجموعة فلاش كاردس (Step 11)
// - تُنسخ المجموعة وبطاقاتها بنفس الترتيب.
// - ⚠️ البطاقات المنسوخة تعيد استخدام نفس أسماء ملفات الصور (لا نكرر الملفات على القرص).
//   فحص صور get-image يسمح بالصورة لأي طالب يملك أي مجموعة تحتويها (Step 6).
// - لا يُحذف أي ملف صورة هنا إطلاقاً.
// - لا نُرسل إشعاراً للطلاب عند النسخ.
// - لو فشل نسخ البطاقات نحذف المجموعة الجديدة (rollback) حتى لا تبقى مجموعة فارغة.
// ===================================================================
const CARD_INSERT_CHUNK = 200;

async function copyFlashcardDeck(oldDeck, targetSubjectId, teacherId, sortOrder) {
  const { data: oldCards, error: cardsErr } = await supabase
    .from('flashcards')
    .select('front_text, back_text, front_image_file_id, back_image_file_id, sort_order')
    .eq('deck_id', oldDeck.id)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (cardsErr) throw new Error(`فشل قراءة بطاقات المجموعة: ${cardsErr.message}`);

  const { data: newDeck, error: deckErr } = await supabase
    .from('flashcard_decks')
    .insert({
      subject_id: targetSubjectId,
      teacher_id: teacherId,
      title: oldDeck.title, // الاسم الأصلي
      description: oldDeck.description,
      sort_order: sortOrder,
      is_active: oldDeck.is_active,
    })
    .select('id')
    .single();
  if (deckErr || !newDeck) throw new Error(`فشل إنشاء المجموعة المنسوخة: ${deckErr?.message || ''}`);

  try {
    const rows = (oldCards || []).map((c, i) => ({
      deck_id: newDeck.id,
      front_text: c.front_text,
      back_text: c.back_text,
      front_image_file_id: c.front_image_file_id, // نفس اسم الملف (مشاركة)
      back_image_file_id: c.back_image_file_id,
      sort_order: i,
    }));
    for (let i = 0; i < rows.length; i += CARD_INSERT_CHUNK) {
      const { error: insErr } = await supabase.from('flashcards').insert(rows.slice(i, i + CARD_INSERT_CHUNK));
      if (insErr) throw new Error(insErr.message);
    }
  } catch (err) {
    await supabase.from('flashcard_decks').delete().eq('id', newDeck.id); // cascade يحذف ما أُدخل من بطاقات
    throw new Error(`فشل نسخ بطاقات المجموعة: ${err.message}`);
  }
  return newDeck.id;
}

// ===================================================================
// 🛡️ التأكد أن كل المعرّفات المحددة (مواد/فصول/امتحانات/فيديوهات/ملفات) تتبع الكورس المصدر فعلاً.
// المعرّفات تأتي من العميل، وفحص الملكية السابق يغطي الكورس فقط؛ بدون هذا الفحص يستطيع معلم إرسال
// معرّف امتحان/فيديو/ملف لمعلم آخر ونسخه كاملاً (بأسئلته وإجاباته) إلى كورسه.
// يرجع true إذا كانت كل المعرّفات سليمة.
// ===================================================================
async function selectionBelongsToCourse(selected, sourceCourseId) {
  const keys = ['subjects', 'chapters', 'exams', 'videos', 'pdfs'];
  for (const k of keys) {
    if (selected[k] !== undefined && !Array.isArray(selected[k])) return false;
  }
  const { data: subs, error } = await supabase
    .from('subjects')
    .select('id, chapters ( id, videos ( id ), pdfs ( id ) ), exams ( id )')
    .eq('course_id', sourceCourseId);
  if (error) throw new Error(`فشل التحقق من المحتوى المحدد: ${error.message}`);

  const allowed = { subjects: new Set(), chapters: new Set(), exams: new Set(), videos: new Set(), pdfs: new Set() };
  for (const sub of (subs || [])) {
    allowed.subjects.add(String(sub.id));
    (sub.exams || []).forEach(e => allowed.exams.add(String(e.id)));
    (sub.chapters || []).forEach(ch => {
      allowed.chapters.add(String(ch.id));
      (ch.videos || []).forEach(v => allowed.videos.add(String(v.id)));
      (ch.pdfs || []).forEach(p => allowed.pdfs.add(String(p.id)));
    });
  }
  return keys.every(k => (selected[k] || []).every(id => allowed[k].has(String(id))));
}

// المجموعات المحددة (بالمعرّف) بشرط أن تتبع الكورس المصدر فعلاً — لا نثق بالمعرفات القادمة من العميل
async function fetchSourceDecks(deckIds, sourceCourseId, subjectId = null) {
  if (!Array.isArray(deckIds) || deckIds.length === 0) return [];
  let q = supabase
    .from('flashcard_decks')
    .select('*, subjects!inner(course_id)')
    .in('id', deckIds)
    .eq('subjects.course_id', sourceCourseId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (subjectId !== null) q = q.eq('subject_id', subjectId);
  const { data, error } = await q;
  if (error) throw new Error(`فشل قراءة المجموعات: ${error.message}`);
  return data || [];
}

export default async function handler(req, res) {
  // 1. التحقق من صلاحية المعلم
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return res.status(401).json({ error: 'Unauthorized' });
  const teacherId = user.teacherId;

  // ==========================================================
  // GET: جلب شجرة المحتوى الخاصة بالكورس (لعرضها في الواجهة)
  // ==========================================================
  if (req.method === 'GET') {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ error: 'Course ID required' });

    try {
      const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', courseId).single();
      if (!course || course.teacher_id !== teacherId) return res.status(403).json({ error: 'غير مصرح' });

      const { data: subjects } = await supabase
        .from('subjects')
        .select(`
          id, title,
          chapters ( id, title, videos (id, title), pdfs (id, title) ),
          exams ( id, title ),
          flashcard_decks ( id, title, sort_order, flashcards ( count ) )
        `)
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true });

      return res.status(200).json({ subjects: subjects || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ==========================================================
  // POST: خوارزمية النسخ الذكي (متوافقة 100% مع الجداول)
  // ==========================================================
  if (req.method === 'POST') {
    const { sourceCourseId, targetCourseId, targetSubjectId, targetChapterId, selected, notifyStudents = false } = req.body;
    // ✅ القيمة الصريحة التي اختارها المعلم في واجهة النسخ (افتراضي: false)
    const copyNotify = notifyStudents === true || notifyStudents === 'true';

    if (!sourceCourseId || !targetCourseId || !selected) {
      return res.status(400).json({ error: 'بيانات غير مكتملة' });
    }

    // 🛡️ التحقق من صلاحيات المعلم قبل تنفيذ النسخ (السوبر أدمن يتخطى هذا التحقق دائماً)
    // النسخ يُنتج نفس أنواع المحتوى التي تحكمها الصلاحيات (فيديو/PDF/امتحان)،
    // لذا يجب أن يخضع لنفس القيود المفروضة على الرفع/الإنشاء المباشر.
    if (user.role !== 'super_admin') {
      const hasVideos = (selected.videos && selected.videos.length > 0) ||
        (selected.chapters && selected.chapters.length > 0);
      const hasPdfs = (selected.pdfs && selected.pdfs.length > 0) ||
        (selected.chapters && selected.chapters.length > 0);
      const hasExams = selected.exams && selected.exams.length > 0;
      const hasDecks = selected.flashcard_decks && selected.flashcard_decks.length > 0;

      if (hasVideos) {
        const perm = await checkTeacherPermission(teacherId, 'can_upload_video');
        if (!perm.allowed) return res.status(403).json({ error: perm.error });
      }
      if (hasPdfs) {
        const perm = await checkTeacherPermission(teacherId, 'can_upload_pdf');
        if (!perm.allowed) return res.status(403).json({ error: perm.error });
      }
      if (hasExams) {
        const perm = await checkTeacherPermission(teacherId, 'can_create_exam');
        if (!perm.allowed) return res.status(403).json({ error: perm.error });
      }
      // 🗂️ نسخ مجموعات الفلاش كاردس يخضع لصلاحية إدارة الفلاش كاردس
      if (hasDecks) {
        const perm = await checkTeacherPermission(teacherId, 'can_manage_flashcards');
        if (!perm.allowed) return res.status(403).json({ error: perm.error });
      }
    }

    try {
      // 1. التحقق من ملكية الكورسات
      const courseIdsToCheck = sourceCourseId === targetCourseId ? [sourceCourseId] : [sourceCourseId, targetCourseId];
      const { data: courses } = await supabase.from('courses').select('id, teacher_id').in('id', courseIdsToCheck);
      
      if (!courses || courses.length !== courseIdsToCheck.length || courses.some(c => c.teacher_id !== teacherId)) {
          return res.status(403).json({ error: 'أنت لا تملك صلاحية على هذه الكورسات' });
      }

      // 🛡️ كل ما حدده المعلم يجب أن يتبع الكورس المصدر (يمنع نسخ محتوى معلم آخر بتزوير المعرّفات)
      if (!(await selectionBelongsToCourse(selected, sourceCourseId))) {
          return res.status(403).json({ error: 'بعض العناصر المحددة لا تتبع الكورس المصدر' });
      }

      // 🛡️ المادة الوجهة يجب أن تتبع الكورس الهدف (وإلا يمكن النسخ داخل مادة معلم آخر)
      if (targetSubjectId) {
          const { data: tSub } = await supabase.from('subjects').select('course_id').eq('id', targetSubjectId).maybeSingle();
          if (!tSub || String(tSub.course_id) !== String(targetCourseId)) {
              return res.status(403).json({ error: 'المادة الوجهة لا تتبع الكورس الهدف' });
          }
      }

      // ==========================================
      // مسار أ: النسخ داخل مادة موجودة بالفعل
      // ==========================================
      if (targetSubjectId) {

          // 0. 🗂️ نسخ مجموعات الفلاش كاردس المحددة (تُضاف في نهاية مجموعات المادة الوجهة)
          if (selected.flashcard_decks && selected.flashcard_decks.length > 0) {
              const decksToCopy = await fetchSourceDecks(selected.flashcard_decks, sourceCourseId);
              const { data: sortRows } = await supabase.from('flashcard_decks').select('sort_order').eq('subject_id', targetSubjectId);
              let nextSort = (sortRows || []).reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) + 1;
              for (const oldDeck of decksToCopy) {
                  await copyFlashcardDeck(oldDeck, targetSubjectId, teacherId, nextSort++);
              }
          }
          
          // 1. نسخ الامتحانات المحددة
          if (selected.exams && selected.exams.length > 0) {
              const { data: examsToCopy } = await supabase.from('exams').select('*').in('id', selected.exams);
              for (const oldExam of (examsToCopy || [])) {
                  const { data: newExam } = await supabase.from('exams').insert({
                      subject_id: targetSubjectId,
                      teacher_id: teacherId,
                      title: oldExam.title, // الاسم الأصلي
                      duration_minutes: oldExam.duration_minutes,
                      start_time: oldExam.start_time,
                      end_time: oldExam.end_time,
                      requires_student_name: oldExam.requires_student_name,
                      randomize_questions: oldExam.randomize_questions,
                      randomize_options: oldExam.randomize_options,
                      allow_retake: oldExam.allow_retake,
                      is_active: oldExam.is_active,
                      sort_order: oldExam.sort_order,
                      // ⚠️ لا يتم نسخ علَم الإشعار عمداً حتى لا يعيد الكرون إشعار الطلاب بامتحان جديد بالخطأ
                      notify_students: false
                  }).select().single();

                  const { data: oldQuestions } = await supabase.from('questions').select('*, options(*)').eq('exam_id', oldExam.id);
                  for (const oldQ of (oldQuestions || [])) {
                      const questionType = oldQ.question_type === 'essay' ? 'essay' : 'mcq';

                      const { data: newQ } = await supabase.from('questions').insert({
                          exam_id: newExam.id,
                          question_text: oldQ.question_text,
                          image_file_id: oldQ.image_file_id,
                          sort_order: oldQ.sort_order,
                          question_type: questionType,
                          max_score: questionType === 'essay' ? (oldQ.max_score || 1) : 1,
                          model_answer: questionType === 'essay' ? (oldQ.model_answer || null) : null
                      }).select().single();

                      // ✅ الخيارات تُنسخ فقط للأسئلة الاختيارية - الأسئلة المقالية لا تحتاج جدول options
                      if (questionType === 'mcq' && oldQ.options && oldQ.options.length > 0) {
                          const newOptions = oldQ.options.map(opt => ({
                              question_id: newQ.id, option_text: opt.option_text,
                              is_correct: opt.is_correct, sort_order: opt.sort_order
                          }));
                          await supabase.from('options').insert(newOptions);
                      }
                  }
              }
          }

          // 2. نسخ الفصول المحددة (بمحتوياتها)
          if (selected.chapters && selected.chapters.length > 0) {
              const { data: chaptersToCopy } = await supabase.from('chapters').select('*, videos(*), pdfs(*)').in('id', selected.chapters);
              for (const oldChap of (chaptersToCopy || [])) {
                  const { data: newChap } = await supabase.from('chapters').insert({
                      subject_id: targetSubjectId, title: oldChap.title, sort_order: oldChap.sort_order // الاسم الأصلي
                  }).select().single();

                  if (oldChap.videos && oldChap.videos.length > 0) {
                      const videosToCopy = oldChap.videos.map(v => ({
                          title: v.title,
                          youtube_video_id: v.youtube_video_id,
                          bunny_video_id: v.bunny_video_id,
                          duration: v.duration,
                          encoding_status: v.encoding_status,
                          sort_order: v.sort_order,
                          notify_students: copyNotify, // ✅ القيمة التي اختارها المعلم صراحةً في واجهة النسخ
                          chapter_id: newChap.id
                      }));
                      const { data: insertedVids } = await supabase.from('videos').insert(videosToCopy).select('id, title, chapter_id, encoding_status');
                      // 🔔 إشعار فوري لأي فيديو منسوخ وصالح للمشاهدة (ready) — الفيديوهات غير الجاهزة يتولى إشعارها الـ webhook
                      if (copyNotify && insertedVids) {
                          for (const newVid of insertedVids) {
                              if (newVid.encoding_status === 'ready') {
                                  await sendImmediateVideoNotification(newVid.id, newVid.chapter_id, newVid.title);
                              }
                          }
                      }
                  }

                  if (oldChap.pdfs && oldChap.pdfs.length > 0) {
                      const pdfsToCopy = oldChap.pdfs.map(p => ({
                          title: p.title, file_path: p.file_path, sort_order: p.sort_order, chapter_id: newChap.id
                      }));
                      await supabase.from('pdfs').insert(pdfsToCopy);
                  }
              }
          }

          // 3. نسخ الفيديوهات والملفات الفردية
          if ((selected.videos && selected.videos.length > 0) || (selected.pdfs && selected.pdfs.length > 0)) {
              
              let finalChapterId = targetChapterId;
              
              // إذا لم يتم تحديد فصل، قم بإنشاء فصل جديد تلقائياً
              if (!finalChapterId) {
                  const { data: autoChapter } = await supabase.from('chapters').insert({
                      subject_id: targetSubjectId,
                      title: 'فصل جديد', // اسم محايد لا يدل على أنه منسوخ
                      sort_order: 999
                  }).select().single();
                  
                  finalChapterId = autoChapter.id;
              }

              if (selected.videos && selected.videos.length > 0) {
                  const { data: vids } = await supabase.from('videos').select('*').in('id', selected.videos);
                  if (vids && vids.length > 0) {
                      const vidsToCopy = vids.map(v => ({
                          title: v.title, // الاسم الأصلي
                          youtube_video_id: v.youtube_video_id,
                          bunny_video_id: v.bunny_video_id,
                          duration: v.duration,
                          encoding_status: v.encoding_status,
                          sort_order: v.sort_order,
                          notify_students: copyNotify, // ✅ القيمة التي اختارها المعلم صراحةً في واجهة النسخ
                          chapter_id: finalChapterId
                      }));
                      const { data: insertedVids } = await supabase.from('videos').insert(vidsToCopy).select('id, title, chapter_id, encoding_status');
                      // 🔔 إشعار فوري لأي فيديو منسوخ وصالح للمشاهدة (ready) — الفيديوهات غير الجاهزة يتولى إشعارها الـ webhook
                      if (copyNotify && insertedVids) {
                          for (const newVid of insertedVids) {
                              if (newVid.encoding_status === 'ready') {
                                  await sendImmediateVideoNotification(newVid.id, newVid.chapter_id, newVid.title);
                              }
                          }
                      }
                  }
              }

              if (selected.pdfs && selected.pdfs.length > 0) {
                  const { data: pdfs } = await supabase.from('pdfs').select('*').in('id', selected.pdfs);
                  if (pdfs && pdfs.length > 0) {
                      const pdfsToCopy = pdfs.map(p => ({
                          title: p.title, // الاسم الأصلي
                          file_path: p.file_path, sort_order: p.sort_order, chapter_id: finalChapterId
                      }));
                      await supabase.from('pdfs').insert(pdfsToCopy);
                  }
              }
          }

      } 
      // ==========================================
      // مسار ب: النسخ العادي (إنشاء مواد جديدة كاملة)
      // ==========================================
      else {
          const { data: sourceSubjects } = await supabase.from('subjects')
            .select('*, chapters ( *, videos (*), pdfs (*) ), exams ( * )')
            .in('id', selected.subjects);

          for (const oldSub of (sourceSubjects || [])) {
              const { data: newSub } = await supabase.from('subjects').insert({
                  course_id: targetCourseId, title: oldSub.title, price: oldSub.price, sort_order: oldSub.sort_order // الاسم الأصلي
              }).select().single();

              const chaptersToCopy = oldSub.chapters.filter(ch => selected.chapters.includes(ch.id));
              for (const oldChap of chaptersToCopy) {
                  const { data: newChap } = await supabase.from('chapters').insert({
                      subject_id: newSub.id, title: oldChap.title, sort_order: oldChap.sort_order
                  }).select().single();

                  if (oldChap.videos && oldChap.videos.length > 0) {
                      const videosToCopy = oldChap.videos.map(v => ({
                          title: v.title,
                          youtube_video_id: v.youtube_video_id,
                          bunny_video_id: v.bunny_video_id,
                          duration: v.duration,
                          encoding_status: v.encoding_status,
                          sort_order: v.sort_order,
                          notify_students: copyNotify, // ✅ القيمة التي اختارها المعلم صراحةً في واجهة النسخ
                          chapter_id: newChap.id
                      }));
                      const { data: insertedVids } = await supabase.from('videos').insert(videosToCopy).select('id, title, chapter_id, encoding_status');
                      // 🔔 إشعار فوري لأي فيديو منسوخ وصالح للمشاهدة (ready) — الفيديوهات غير الجاهزة يتولى إشعارها الـ webhook
                      if (copyNotify && insertedVids) {
                          for (const newVid of insertedVids) {
                              if (newVid.encoding_status === 'ready') {
                                  await sendImmediateVideoNotification(newVid.id, newVid.chapter_id, newVid.title);
                              }
                          }
                      }
                  }
                  if (oldChap.pdfs && oldChap.pdfs.length > 0) {
                      const pdfsToCopy = oldChap.pdfs.map(p => ({ title: p.title, file_path: p.file_path, sort_order: p.sort_order, chapter_id: newChap.id }));
                      await supabase.from('pdfs').insert(pdfsToCopy);
                  }
              }

              const examsToCopy = oldSub.exams.filter(ex => selected.exams.includes(ex.id));
              for (const oldExam of examsToCopy) {
                  const { data: newExam } = await supabase.from('exams').insert({
                      subject_id: newSub.id,
                      teacher_id: teacherId,
                      title: oldExam.title,
                      duration_minutes: oldExam.duration_minutes,
                      start_time: oldExam.start_time,
                      end_time: oldExam.end_time,
                      requires_student_name: oldExam.requires_student_name,
                      randomize_questions: oldExam.randomize_questions,
                      randomize_options: oldExam.randomize_options,
                      allow_retake: oldExam.allow_retake,
                      is_active: oldExam.is_active,
                      sort_order: oldExam.sort_order,
                      // ⚠️ لا يتم نسخ علَم الإشعار عمداً حتى لا يعيد الكرون إشعار الطلاب بامتحان جديد بالخطأ
                      notify_students: false
                  }).select().single();

                  const { data: oldQuestions } = await supabase.from('questions').select('*, options(*)').eq('exam_id', oldExam.id);
                  for (const oldQ of (oldQuestions || [])) {
                      const questionType = oldQ.question_type === 'essay' ? 'essay' : 'mcq';

                      const { data: newQ } = await supabase.from('questions').insert({
                          exam_id: newExam.id,
                          question_text: oldQ.question_text,
                          image_file_id: oldQ.image_file_id,
                          sort_order: oldQ.sort_order,
                          question_type: questionType,
                          max_score: questionType === 'essay' ? (oldQ.max_score || 1) : 1,
                          model_answer: questionType === 'essay' ? (oldQ.model_answer || null) : null
                      }).select().single();

                      // ✅ الخيارات تُنسخ فقط للأسئلة الاختيارية - الأسئلة المقالية لا تحتاج جدول options
                      if (questionType === 'mcq' && oldQ.options && oldQ.options.length > 0) {
                          const newOptions = oldQ.options.map(opt => ({ question_id: newQ.id, option_text: opt.option_text, is_correct: opt.is_correct, sort_order: opt.sort_order }));
                          await supabase.from('options').insert(newOptions);
                      }
                  }
              }

              // 🗂️ مجموعات الفلاش كاردس المحددة التابعة لهذه المادة (تحافظ على ترتيبها الأصلي)
              const decksToCopy = await fetchSourceDecks(selected.flashcard_decks, sourceCourseId, oldSub.id);
              for (const oldDeck of decksToCopy) {
                  await copyFlashcardDeck(oldDeck, newSub.id, teacherId, oldDeck.sort_order ?? 0);
              }
          }
      }

      return res.status(200).json({ success: true, message: 'تم النسخ بنجاح' });
    } catch (err) {
      console.error("Advanced Copy Error:", err);
      return res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ النسخ' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
