import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

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
          exams ( id, title )
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
    const { sourceCourseId, targetCourseId, targetSubjectId, targetChapterId, selected } = req.body;

    if (!sourceCourseId || !targetCourseId || !selected) {
      return res.status(400).json({ error: 'بيانات غير مكتملة' });
    }

    try {
      // 1. التحقق من ملكية الكورسات
      const courseIdsToCheck = sourceCourseId === targetCourseId ? [sourceCourseId] : [sourceCourseId, targetCourseId];
      const { data: courses } = await supabase.from('courses').select('id, teacher_id').in('id', courseIdsToCheck);
      
      if (!courses || courses.length !== courseIdsToCheck.length || courses.some(c => c.teacher_id !== teacherId)) {
          return res.status(403).json({ error: 'أنت لا تملك صلاحية على هذه الكورسات' });
      }

      // ==========================================
      // مسار أ: النسخ داخل مادة موجودة بالفعل
      // ==========================================
      if (targetSubjectId) {
          
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
                          notify_students: v.notify_students, // ✅ نسخ حالة إشعار الطلاب كما كانت على الفيديو الأصلي
                          chapter_id: newChap.id
                      }));
                      await supabase.from('videos').insert(videosToCopy);
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
                          notify_students: v.notify_students, // ✅ نسخ حالة إشعار الطلاب كما كانت على الفيديو الأصلي
                          chapter_id: finalChapterId
                      }));
                      await supabase.from('videos').insert(vidsToCopy);
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
                          notify_students: v.notify_students, // ✅ نسخ حالة إشعار الطلاب كما كانت على الفيديو الأصلي
                          chapter_id: newChap.id
                      }));
                      await supabase.from('videos').insert(videosToCopy);
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
