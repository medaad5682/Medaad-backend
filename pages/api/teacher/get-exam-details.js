import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';

export default async (req, res) => {
  // 1. التحقق من صلاحية المعلم
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { examId } = req.query;

  if (!examId) return res.status(400).json({ error: 'Missing Exam ID' });

  try {
    // 2. جلب بيانات الامتحان الأساسية بما فيها إعدادات العشوائية
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .eq('teacher_id', auth.teacherId) // أمان: التأكد أن المعلم هو صاحب الامتحان
      .single();

    if (examError || !exam) {
        return res.status(404).json({ error: 'Exam not found or you do not have permission' });
    }

    // 3. جلب الأسئلة مع الخيارات
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select(`
        id, question_text, image_file_id, sort_order, question_type, max_score, model_answer, explanation,
        options ( id, option_text, is_correct, sort_order )
      `)
      .eq('exam_id', examId)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'options', ascending: true });

    if (qError) throw qError;

    // 4. دمج البيانات وإرسالها مع تحويل الأسماء للفرونت إند
    const fullExamData = {
        title: exam.title,
        duration_minutes: exam.duration_minutes, // ✅ إرسال الاسم كما هو
        start_time: exam.start_time,
        end_time: exam.end_time,
        
        // ✅ إرسال إعدادات العشوائية التي تمت إضافتها
        randomizeQuestions: exam.randomize_questions, 
        randomizeOptions: exam.randomize_options,
        
        // ✅ إرسال خيار السماح بإعادة الامتحان (التدريب)
        allow_retake: exam.allow_retake || false,

        // ✅ إرسال الحالة الحالية لعلَم الإشعار، ليقرر التطبيق ما يعرضه للمعلم
        //    عند فتح الامتحان للتعديل (مفعّل/غير مفعّل)
        notify_students: exam.notify_students || false,
        
        questions: questions
    };

    return res.status(200).json(fullExamData);

  } catch (err) {
    console.error("Get Exam Details Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
