import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

export default async (req, res) => {
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const { examId } = req.query;
  if (!examId) return res.status(400).json({ error: 'Missing Exam ID' });

  try {
    // جلب الامتحان مع التأكد من الملكية
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .eq('teacher_id', user.teacherId) // 🔒 حماية
      .single();

    if (examError || !exam) {
        return res.status(404).json({ error: 'الامتحان غير موجود أو لا تملك صلاحية الوصول إليه' });
    }

    // جلب الأسئلة
    const { data: questions } = await supabase
      .from('questions')
      .select(`
        id, question_text, image_file_id, sort_order, question_type, max_score, model_answer, explanation,
        options ( id, option_text, is_correct, sort_order )
      `)
      .eq('exam_id', examId)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'options', ascending: true });

    const fullExamData = {
        title: exam.title,
        duration_minutes: exam.duration_minutes,
        start_time: exam.start_time,
        end_time: exam.end_time,
        randomizeQuestions: exam.randomize_questions, 
        randomizeOptions: exam.randomize_options,
        allow_retake: exam.allow_retake || false, // ✅ إضافة الحقل هنا ليتم إرساله للوحة التحكم
        notify_students: exam.notify_students || false,
        questions: questions || []
    };

    return res.status(200).json(fullExamData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
