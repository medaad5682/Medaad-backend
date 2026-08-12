import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ==========================================================
// 🟢 GET ?survey_id=123&page=1&page_size=50
// يرجع: أسئلة الاستبيان + إحصائيات مجمّعة لكل سؤال (نسب الاختيارات/متوسط
// التقييم، محسوبة من كل الردود) + صفحة واحدة فقط من الردود الفردية.
//
// ملاحظة أداء (مناسب لـ 500+ مستخدم):
// - الإحصائيات المجمّعة (stats) بتتحسب من جدول survey_answers مباشرة عن
//   طريق فلترة على survey_id (join مع survey_responses) بدل جلب كل صفوف
//   survey_responses الأول وعمل .in() بقائمة IDs ضخمة.
// - قائمة "الردود الفردية" (responses) بترجع مُقسّمة على صفحات (pagination)
//   عن طريق .range() بدل إرجاع كل الردود دفعة واحدة، فيبقى حجم الرد
//   واستهلاك الواجهة ثابت مهما زاد عدد الطلاب.
// ==========================================================
export default async function handler(req, res) {
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return;

  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { survey_id } = req.query;
  if (!survey_id) return res.status(400).json({ success: false, message: 'survey_id مطلوب' });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.page_size) || DEFAULT_PAGE_SIZE));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data: survey, error: surveyErr } = await supabase
      .from('surveys')
      .select('*')
      .eq('id', survey_id)
      .single();
    if (surveyErr) throw surveyErr;

    const { data: questions, error: qErr } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', survey_id)
      .order('order_index', { ascending: true });
    if (qErr) throw qErr;

    // إجمالي عدد الردود (لأغراض العرض والـ pagination) — استعلام عدّ فقط،
    // بدون جلب أي صفوف فعلية.
    const { count: totalResponses, error: countErr } = await supabase
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', survey_id);
    if (countErr) throw countErr;

    // صفحة واحدة فقط من الردود (للعرض التفصيلي لكل طالب)
    const { data: responsesPage, error: rErr } = await supabase
      .from('survey_responses')
      .select('id, user_id, submitted_at, users(first_name, phone, username)')
      .eq('survey_id', survey_id)
      .order('submitted_at', { ascending: false })
      .range(from, to);
    if (rErr) throw rErr;

    const pageResponseIds = (responsesPage || []).map(r => r.id);

    let pageAnswers = [];
    if (pageResponseIds.length > 0) {
      const { data: answersData, error: aErr } = await supabase
        .from('survey_answers')
        .select('response_id, question_id, answer_text, selected_options, rating_value')
        .in('response_id', pageResponseIds);
      if (aErr) throw aErr;
      pageAnswers = answersData || [];
    }

    const answersByResponse = {};
    for (const a of pageAnswers) {
      if (!answersByResponse[a.response_id]) answersByResponse[a.response_id] = [];
      answersByResponse[a.response_id].push(a);
    }

    const detailedResponses = (responsesPage || []).map(r => ({
      response_id: r.id,
      user_id: r.user_id,
      student_name: r.users?.first_name || r.users?.username || r.users?.phone || 'طالب',
      submitted_at: r.submitted_at,
      answers: (answersByResponse[r.id] || []).map(a => ({
        question_id: a.question_id,
        answer_text: a.answer_text,
        selected_options: a.selected_options,
        rating_value: a.rating_value,
      })),
    }));

    // كل إجابات الاستبيان (بأعمدة خفيفة فقط) — تُستخدم لحساب الإحصائيات
    // المجمّعة على كل الردود، مش بس صفحة الردود الحالية. الفلترة بتتم عن
    // طريق join على survey_responses.survey_id فتفادينا تمرير قائمة IDs
    // ضخمة في .in()، وده اللي بيخليها تشتغل بكفاءة مع 500+ مستخدم.
    const { data: allAnswers, error: allAErr } = await supabase
      .from('survey_answers')
      .select('question_id, answer_text, selected_options, rating_value, survey_responses!inner(survey_id)')
      .eq('survey_responses.survey_id', survey_id);
    if (allAErr) throw allAErr;
    const answers = allAnswers || [];

    // إحصائيات مجمّعة لكل سؤال
    const stats = (questions || []).map(q => {
      const questionAnswers = answers.filter(a => a.question_id === q.id);

      if (q.question_type === 'written') {
        return {
          question_id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          written_feedback: questionAnswers
            .filter(a => a.answer_text && a.answer_text.trim())
            .map(a => a.answer_text),
        };
      }

      if (q.question_type === 'rating') {
        const values = questionAnswers.map(a => a.rating_value).filter(v => v != null);
        const avg = values.length ? (values.reduce((s, v) => s + v, 0) / values.length) : 0;
        const distribution = {};
        for (let i = 1; i <= (q.max_rating || 5); i++) distribution[i] = 0;
        values.forEach(v => { distribution[v] = (distribution[v] || 0) + 1; });
        return {
          question_id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          max_rating: q.max_rating || 5,
          average_rating: Math.round(avg * 100) / 100,
          total_ratings: values.length,
          distribution,
        };
      }

      // mcq_single / mcq_multiple
      const optionCounts = {};
      (q.options || []).forEach(opt => { optionCounts[opt] = 0; });
      let totalSelections = 0;
      questionAnswers.forEach(a => {
        const selected = Array.isArray(a.selected_options) ? a.selected_options : [];
        selected.forEach(opt => {
          optionCounts[opt] = (optionCounts[opt] || 0) + 1;
          totalSelections++;
        });
      });
      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options || [],
        option_counts: optionCounts,
        total_respondents: questionAnswers.length,
        total_selections: totalSelections,
      };
    });

    const total = totalResponses || 0;
    return res.status(200).json({
      success: true,
      survey,
      questions: questions || [],
      total_responses: total,
      stats,
      responses: detailedResponses,
      page,
      page_size: pageSize,
      has_more: from + detailedResponses.length < total,
    });
  } catch (err) {
    console.error('Survey Responses GET Error:', err);
    return res.status(500).json({ success: false, message: 'فشل جلب نتائج الاستبيان' });
  }
}
