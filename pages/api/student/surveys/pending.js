import { supabase } from '../../../../lib/supabaseClient';
import { checkUserAccess } from '../../../../lib/authHelper';

// ==========================================================
// 🟢 GET /api/student/surveys/pending
// يرجّع استبيان واحد فقط (الأقدم أولاً) يستوفي الشروط التالية:
//   - is_active = true
//   - بدأ وقته بالفعل (starts_at is null أو أقل من/يساوي الآن)
//   - لم تنتهِ صلاحيته (expires_at is null أو أكبر من الآن)
//   - المستخدم الحالي لم يجاوب عليه من قبل (لا يوجد صف في survey_responses)
// لو مفيش أي استبيان مطابق -> survey: null
// ==========================================================
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) return res.status(401).json({ message: 'Unauthorized access' });

  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ message: 'Unauthorized access' });

  try {
    const nowIso = new Date().toISOString();

    // 🆕 لازم يكون الحساب عمره 3 أسابيع على الأقل قبل ما نعرضله أي استبيان
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) throw userErr;

    if (userRow?.created_at) {
      const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;
      const accountAgeMs = Date.now() - new Date(userRow.created_at).getTime();
      if (accountAgeMs < THREE_WEEKS_MS) {
        return res.status(200).json({ success: true, survey: null });
      }
    }

    // كل الاستبيانات النشطة، اللي بدأ وقتها، وغير منتهية الصلاحية
    const { data: activeSurveys, error: surveysErr } = await supabase
      .from('surveys')
      .select('*')
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: true });

    if (surveysErr) throw surveysErr;
    if (!activeSurveys || activeSurveys.length === 0) {
      return res.status(200).json({ success: true, survey: null });
    }

    // الاستبيانات التي أجاب عليها هذا المستخدم من قبل
    const { data: answered, error: answeredErr } = await supabase
      .from('survey_responses')
      .select('survey_id')
      .eq('user_id', userId);

    if (answeredErr) throw answeredErr;
    const answeredIds = new Set((answered || []).map(a => a.survey_id));

    const nextSurvey = activeSurveys.find(s => !answeredIds.has(s.id));

    if (!nextSurvey) {
      return res.status(200).json({ success: true, survey: null });
    }

    const { data: questions, error: qErr } = await supabase
      .from('survey_questions')
      .select('id, question_text, question_type, options, max_rating, is_required, order_index')
      .eq('survey_id', nextSurvey.id)
      .order('order_index', { ascending: true });

    if (qErr) throw qErr;

    return res.status(200).json({
      success: true,
      survey: {
        id: nextSurvey.id,
        title: nextSurvey.title,
        description: nextSurvey.description,
        is_obligatory: nextSurvey.is_obligatory,
        starts_at: nextSurvey.starts_at,
        expires_at: nextSurvey.expires_at,
        questions: questions || [],
      },
    });
  } catch (err) {
    console.error('Pending Survey Error:', err);
    return res.status(500).json({ success: false, message: 'فشل جلب الاستبيان' });
  }
}
