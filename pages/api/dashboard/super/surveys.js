import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import admin from '../../../../lib/firebaseAdmin';

// إرسال إشعار جماعي (Push) لكل الطلاب بإنشاء استبيان جديد.
// لا يرمي أخطاء للخارج أبداً — فشل الإشعار لا يجب أن يفشل إنشاء الاستبيان.
async function notifyStudentsAboutSurvey(survey) {
  try {
    const title = '📋 استبيان جديد';
    const body = survey.title || 'يوجد استبيان جديد بانتظارك، شاركنا رأيك!';

    await admin.messaging().send({
      topic: 'all_users',
      notification: { title, body },
      android: {
        priority: 'high',
        notification: { sound: 'default', priority: 'max', channelId: 'fcm_channel', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        type: 'survey',
        id: survey.id.toString(),
      },
    });

    await supabase.from('notifications').insert({
      title,
      body,
      target_type: 'survey',
      target_id: survey.id.toString(),
      sender_role: 'super_admin',
    });

    await supabase.from('surveys').update({ notified_at: new Date().toISOString() }).eq('id', survey.id);

    return true;
  } catch (err) {
    console.error('⚠️ Survey Notify Error:', err.message);
    return false;
  }
}

const QUESTION_TYPES = ['mcq_single', 'mcq_multiple', 'written', 'rating'];

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return 'يجب إضافة سؤال واحد على الأقل';
  }
  for (const q of questions) {
    if (!q.question_text || !q.question_text.trim()) {
      return 'نص السؤال مطلوب لكل سؤال';
    }
    if (!QUESTION_TYPES.includes(q.question_type)) {
      return 'نوع السؤال غير صالح';
    }
    if (['mcq_single', 'mcq_multiple'].includes(q.question_type)) {
      const opts = Array.isArray(q.options) ? q.options.filter(o => o && o.toString().trim()) : [];
      if (opts.length < 2) {
        return 'يجب إضافة خيارين على الأقل لسؤال الاختيار';
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return;
  const adminUser = authResult.user;

  // ==========================================================
  // 🟢 GET: جلب كل الاستبيانات (مع عدد الأسئلة وعدد الردود)
  // ==========================================================
  if (req.method === 'GET') {
    try {
      const { id } = req.query;

      if (id) {
        // تفاصيل استبيان واحد + أسئلته (لصفحة التعديل)
        const { data: survey, error: surveyErr } = await supabase
          .from('surveys')
          .select('*')
          .eq('id', id)
          .single();
        if (surveyErr) throw surveyErr;

        const { data: questions, error: qErr } = await supabase
          .from('survey_questions')
          .select('*')
          .eq('survey_id', id)
          .order('order_index', { ascending: true });
        if (qErr) throw qErr;

        const { count: responseCount } = await supabase
          .from('survey_responses')
          .select('id', { count: 'exact', head: true })
          .eq('survey_id', id);

        return res.status(200).json({ survey, questions: questions || [], responseCount: responseCount || 0 });
      }

      const { data: surveys, error } = await supabase
        .from('surveys')
        .select('*, survey_questions(count), survey_responses(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (surveys || []).map(s => ({
        ...s,
        question_count: s.survey_questions?.[0]?.count || 0,
        response_count: s.survey_responses?.[0]?.count || 0,
        survey_questions: undefined,
        survey_responses: undefined,
      }));

      return res.status(200).json({ success: true, surveys: formatted });
    } catch (err) {
      console.error('Surveys GET Error:', err);
      return res.status(500).json({ success: false, message: 'فشل جلب الاستبيانات' });
    }
  }

  // ==========================================================
  // 🟠 POST: إنشاء استبيان جديد بأسئلته
  // ==========================================================
  if (req.method === 'POST') {
    try {
      const { title, description, is_obligatory, starts_at, expires_at, notify_students, questions } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'عنوان الاستبيان مطلوب' });
      }
      const qError = validateQuestions(questions);
      if (qError) return res.status(400).json({ success: false, message: qError });

      const shouldNotify = notify_students !== false; // افتراضياً مفعّل لو مش متبعّت

      const { data: survey, error: surveyErr } = await supabase
        .from('surveys')
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          is_obligatory: !!is_obligatory,
          starts_at: starts_at || null,
          expires_at: expires_at || null,
          notify_students: shouldNotify,
          is_active: true,
          created_by: adminUser?.id || null,
        })
        .select('*')
        .single();

      if (surveyErr) throw surveyErr;

      const rows = questions.map((q, idx) => ({
        survey_id: survey.id,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        options: ['mcq_single', 'mcq_multiple'].includes(q.question_type)
          ? q.options.filter(o => o && o.toString().trim())
          : null,
        max_rating: q.question_type === 'rating' ? (q.max_rating || 5) : null,
        is_required: q.is_required !== false,
        order_index: idx,
      }));

      const { error: insertQErr } = await supabase.from('survey_questions').insert(rows);
      if (insertQErr) throw insertQErr;

      let notified = false;
      if (shouldNotify) {
        notified = await notifyStudentsAboutSurvey(survey);
      }

      return res.status(200).json({ success: true, message: 'تم إنشاء الاستبيان بنجاح', survey, notified });
    } catch (err) {
      console.error('Surveys POST Error:', err);
      return res.status(500).json({ success: false, message: 'فشل إنشاء الاستبيان' });
    }
  }

  // ==========================================================
  // 🟡 PUT: تعديل استبيان (بيانات عامة + تبديل الحالة + الأسئلة لو مفيش ردود بعد)
  // ==========================================================
  if (req.method === 'PUT') {
    try {
      const { id, title, description, is_obligatory, is_active, starts_at, expires_at, notify_students, notify_now, questions } = req.body;
      if (!id) return res.status(400).json({ success: false, message: 'معرّف الاستبيان مطلوب' });

      const updatePayload = {};
      if (title !== undefined) updatePayload.title = title.trim();
      if (description !== undefined) updatePayload.description = description?.trim() || null;
      if (is_obligatory !== undefined) updatePayload.is_obligatory = !!is_obligatory;
      if (is_active !== undefined) updatePayload.is_active = !!is_active;
      if (starts_at !== undefined) updatePayload.starts_at = starts_at || null;
      if (expires_at !== undefined) updatePayload.expires_at = expires_at || null;
      if (notify_students !== undefined) updatePayload.notify_students = !!notify_students;

      if (Object.keys(updatePayload).length > 0) {
        const { error: updErr } = await supabase.from('surveys').update(updatePayload).eq('id', id);
        if (updErr) throw updErr;
      }

      // إعادة إرسال الإشعار يدوياً بناءً على طلب صريح من الأدمن (زر "إرسال الآن")
      let notified = false;
      if (notify_now) {
        const { data: freshSurvey } = await supabase.from('surveys').select('*').eq('id', id).single();
        if (freshSurvey) notified = await notifyStudentsAboutSurvey(freshSurvey);
      }

      // تعديل الأسئلة مسموح فقط إذا لم يجب عليها أي طالب بعد (حفاظاً على سلامة الردود القديمة)
      if (Array.isArray(questions)) {
        const { count: responseCount } = await supabase
          .from('survey_responses')
          .select('id', { count: 'exact', head: true })
          .eq('survey_id', id);

        if ((responseCount || 0) > 0) {
          return res.status(400).json({
            success: false,
            message: 'لا يمكن تعديل الأسئلة بعد وجود ردود من الطلاب. يمكنك تعديل العنوان/الوصف/الحالة فقط، أو إنشاء استبيان جديد.',
          });
        }

        const qError = validateQuestions(questions);
        if (qError) return res.status(400).json({ success: false, message: qError });

        await supabase.from('survey_questions').delete().eq('survey_id', id);

        const rows = questions.map((q, idx) => ({
          survey_id: id,
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: ['mcq_single', 'mcq_multiple'].includes(q.question_type)
            ? q.options.filter(o => o && o.toString().trim())
            : null,
          max_rating: q.question_type === 'rating' ? (q.max_rating || 5) : null,
          is_required: q.is_required !== false,
          order_index: idx,
        }));
        const { error: insertQErr } = await supabase.from('survey_questions').insert(rows);
        if (insertQErr) throw insertQErr;
      }

      return res.status(200).json({ success: true, message: 'تم حفظ التعديلات بنجاح', notified });
    } catch (err) {
      console.error('Surveys PUT Error:', err);
      return res.status(500).json({ success: false, message: 'فشل حفظ التعديلات' });
    }
  }

  // ==========================================================
  // 🔴 DELETE: حذف استبيان بالكامل (سيحذف أسئلته وردوده تلقائياً)
  // ==========================================================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'معرّف الاستبيان مطلوب' });

      const { error } = await supabase.from('surveys').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ success: true, message: 'تم حذف الاستبيان' });
    } catch (err) {
      console.error('Surveys DELETE Error:', err);
      return res.status(500).json({ success: false, message: 'فشل حذف الاستبيان' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
