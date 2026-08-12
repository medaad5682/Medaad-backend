import { supabase } from '../../../../lib/supabaseClient';
import { checkUserAccess } from '../../../../lib/authHelper';

// ==========================================================
// 🟠 POST /api/student/surveys/submit
// body: {
//   survey_id: number,
//   answers: [
//     { question_id, answer_text }                 // written
//     { question_id, selected_options: [String] }  // mcq_single / mcq_multiple
//     { question_id, rating_value: number }         // rating
//   ]
// }
// ==========================================================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) return res.status(401).json({ message: 'Unauthorized access' });

  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ message: 'Unauthorized access' });

  const { survey_id, answers } = req.body;
  if (!survey_id || !Array.isArray(answers)) {
    return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
  }

  try {
    // تأكد أن الاستبيان لا يزال نشطاً ولم تنتهِ صلاحيته
    const { data: survey, error: surveyErr } = await supabase
      .from('surveys')
      .select('id, is_active, starts_at, expires_at')
      .eq('id', survey_id)
      .single();

    if (surveyErr || !survey) {
      return res.status(404).json({ success: false, message: 'الاستبيان غير موجود' });
    }
    if (survey.starts_at && new Date(survey.starts_at) > new Date()) {
      return res.status(400).json({ success: false, message: 'لم يبدأ هذا الاستبيان بعد' });
    }
    if (!survey.is_active || (survey.expires_at && new Date(survey.expires_at) < new Date())) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية هذا الاستبيان' });
    }

    // امنع الإجابة مرتين على نفس الاستبيان
    const { data: existing } = await supabase
      .from('survey_responses')
      .select('id')
      .eq('survey_id', survey_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ success: true, message: 'تم إرسال ردك على هذا الاستبيان مسبقاً' });
    }

    // تأكد من تعبئة كل الأسئلة الإلزامية
    const { data: questions, error: qErr } = await supabase
      .from('survey_questions')
      .select('id, is_required, question_type')
      .eq('survey_id', survey_id);
    if (qErr) throw qErr;

    const answersByQuestion = {};
    answers.forEach(a => { answersByQuestion[a.question_id] = a; });

    for (const q of questions || []) {
      if (!q.is_required) continue;
      const a = answersByQuestion[q.id];
      const isEmpty =
        !a ||
        (q.question_type === 'written' && !a.answer_text?.toString().trim()) ||
        (['mcq_single', 'mcq_multiple'].includes(q.question_type) && (!Array.isArray(a.selected_options) || a.selected_options.length === 0)) ||
        (q.question_type === 'rating' && !a.rating_value);
      if (isEmpty) {
        return res.status(400).json({ success: false, message: 'يرجى الإجابة على جميع الأسئلة الإلزامية' });
      }
    }

    // أنشئ صف الرد
    const { data: response, error: respErr } = await supabase
      .from('survey_responses')
      .insert({ survey_id, user_id: userId })
      .select('id')
      .single();
    if (respErr) throw respErr;

    const rows = answers
      .filter(a => a.question_id)
      .map(a => ({
        response_id: response.id,
        question_id: a.question_id,
        answer_text: a.answer_text ?? null,
        selected_options: a.selected_options ?? null,
        rating_value: a.rating_value ?? null,
      }));

    if (rows.length > 0) {
      const { error: ansErr } = await supabase.from('survey_answers').insert(rows);
      if (ansErr) throw ansErr;
    }

    return res.status(200).json({ success: true, message: 'شكراً لمشاركتك رأيك معنا 🎉' });
  } catch (err) {
    console.error('Submit Survey Error:', err);
    return res.status(500).json({ success: false, message: 'فشل إرسال الإجابات' });
  }
}
