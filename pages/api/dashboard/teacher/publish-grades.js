import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { sendToUser, hasPushToken, PUSH_USER_COLUMNS } from '../../../../lib/pushService';

// ============================================================
// POST /api/dashboard/teacher/publish-grades
// يستقبل درجات الأسئلة المقالية من المعلم، يحفظها، يحسب الدرجة
// النهائية (اختياري + مقالي)، وينشر النتيجة للطالب.
//
// Body: {
//   attemptId: number,
//   grades: [{ questionId: number, earnedScore: number, feedback?: string }]
// }
// ============================================================
export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. التحقق من الصلاحية (مدرس أو مدير)
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return res.status(401).json({ error: 'Unauthorized' });

  const { attemptId, grades } = req.body;

  if (!attemptId || !Array.isArray(grades)) {
    return res.status(400).json({ error: 'بيانات الطلب ناقصة (attemptId, grades مطلوبة)' });
  }

  try {
    // ========================================================
    // 2. جلب المحاولة والتأكد من ملكية المعلم لهذا الامتحان
    // ========================================================
    const { data: attempt, error: attemptErr } = await supabase
      .from('user_attempts')
      .select('id, user_id, exam_id, score, status, exams ( title, teacher_id )')
      .eq('id', attemptId)
      .single();

    if (attemptErr || !attempt) {
      return res.status(404).json({ error: 'لم يتم العثور على هذه المحاولة' });
    }

    if (user.role !== 'admin' && String(attempt.exams.teacher_id) !== String(user.teacherId)) {
      return res.status(403).json({ error: 'غير مصرح لك بتصحيح هذا الامتحان' });
    }

    // ========================================================
    // 3. جلب كل أسئلة الامتحان (لحساب الإجمالي الصحيح: اختياري + مقالي)
    // ========================================================
    const { data: allQuestions, error: qErr } = await supabase
      .from('questions')
      .select('id, question_type, max_score')
      .eq('exam_id', attempt.exam_id);

    if (qErr) throw qErr;

    const essayQuestionIds = new Set(
      allQuestions.filter(q => q.question_type === 'essay').map(q => q.id)
    );

    // ✅ التأكد من أن كل درجات الأسئلة المقالية المُرسلة فعلاً تخص أسئلة مقالية في هذا الامتحان
    const invalidGrade = grades.find(g => !essayQuestionIds.has(g.questionId));
    if (invalidGrade) {
      return res.status(400).json({ error: 'يوجد سؤال في بيانات التصحيح لا ينتمي لهذا الامتحان أو ليس مقالياً' });
    }

    // ✅ التحقق من أن الدرجة الموضوعة لا تتجاوز الدرجة العظمى لكل سؤال
    const maxScoreMap = new Map(allQuestions.map(q => [q.id, parseFloat(q.max_score) || 1]));
    for (const g of grades) {
      const max = maxScoreMap.get(g.questionId) ?? 1;
      const earned = parseFloat(g.earnedScore);
      if (isNaN(earned) || earned < 0 || earned > max) {
        return res.status(400).json({ error: `الدرجة المدخلة لسؤال (${g.questionId}) غير صالحة. الحد الأقصى المسموح: ${max}` });
      }
    }

    // ========================================================
    // 4. حفظ درجات الأسئلة المقالية في user_answers
    // ========================================================
    for (const g of grades) {
      const { error: upErr } = await supabase
        .from('user_answers')
        .update({
          earned_score: parseFloat(g.earnedScore),
          is_correct: parseFloat(g.earnedScore) >= (maxScoreMap.get(g.questionId) ?? 1),
          teacher_feedback: g.feedback || null
        })
        .eq('attempt_id', attemptId)
        .eq('question_id', g.questionId);

      if (upErr) throw upErr;
    }

    // ========================================================
    // 5. إعادة حساب الدرجة النهائية الكاملة (اختياري + مقالي)
    // ========================================================
    // 5.أ. درجة الأسئلة الاختيارية: نحسبها من user_answers (is_correct = true لكل سؤال mcq)
    const { data: mcqAnswers, error: mcqErr } = await supabase
      .from('user_answers')
      .select('question_id, is_correct')
      .eq('attempt_id', attemptId)
      .not('selected_option_id', 'is', null);

    if (mcqErr) throw mcqErr;

    const mcqScore = (mcqAnswers || []).filter(a => a.is_correct).length;

    // 5.ب. درجة الأسئلة المقالية: نجمع كل earned_score المحفوظة لهذه المحاولة
    const { data: essayAnswers, error: essayErr } = await supabase
      .from('user_answers')
      .select('question_id, earned_score')
      .eq('attempt_id', attemptId)
      .in('question_id', Array.from(essayQuestionIds));

    if (essayErr) throw essayErr;

    // ✅ التأكد من أن كل الأسئلة المقالية تم تصحيحها قبل النشر
    const ungraded = essayAnswers?.some(a => a.earned_score === null || a.earned_score === undefined);
    if (ungraded) {
      return res.status(400).json({ error: 'لا يمكن نشر النتيجة قبل تصحيح جميع الأسئلة المقالية' });
    }

    const essayScore = (essayAnswers || []).reduce((sum, a) => sum + (parseFloat(a.earned_score) || 0), 0);

    // 5.ج. الإجمالي: عدد الأسئلة الاختيارية (كل سؤال = درجة واحدة) + مجموع درجات المقالي
    const mcqTotal = allQuestions.filter(q => q.question_type !== 'essay').length;
    const essayTotal = allQuestions
      .filter(q => q.question_type === 'essay')
      .reduce((sum, q) => sum + (parseFloat(q.max_score) || 1), 0);

    const finalScore = mcqScore + essayScore;
    const finalMax = mcqTotal + essayTotal;
    const finalPercentage = finalMax > 0 ? Math.round((finalScore / finalMax) * 100) : 0;

    // ========================================================
    // 6. تحديث المحاولة: نشر النتيجة النهائية
    // ========================================================
    const { error: updateErr } = await supabase
      .from('user_attempts')
      .update({
        score: finalScore,
        percentage: finalPercentage,
        status: 'completed',
        is_published: true
      })
      .eq('id', attemptId);

    if (updateErr) throw updateErr;

    // ========================================================
    // 7. إشعار الطالب بأن نتيجته أصبحت متاحة
    // ========================================================
    try {
      const { data: studentUser } = await supabase
        .from('users')
        .select(`${PUSH_USER_COLUMNS}, first_name`)
        .eq('id', attempt.user_id)
        .single();

      if (hasPushToken(studentUser)) {
        const examTitle = attempt.exams?.title || 'امتحانك';
        const pushResult = await sendToUser(studentUser, {
          title: 'تم تصحيح نتيجتك ✅',
          body: `تم اعتماد نتيجة امتحان "${examTitle}"، اضغط لعرض الدرجة.`,
          type: 'exam_result',
          data: {
            id: String(attempt.exam_id),
            attempt_id: String(attemptId)
          }
        });

        // نفس السلوك السابق: لا نسجّل الإشعار في السجل إذا فشل الإرسال
        if (pushResult.sent) {
          await supabase.from('notifications').insert({
            title: 'تم تصحيح نتيجتك ✅',
            body: `تم اعتماد نتيجة امتحان "${examTitle}"، اضغط لعرض الدرجة.`,
            target_type: 'user',
            target_id: String(attempt.user_id),
            sender_role: 'teacher'
          });
        }
      }
    } catch (notifyErr) {
      // لا نفشل الطلب بالكامل إذا فشل الإشعار فقط
      console.error('⚠️ [PublishGrades] Notification Error:', notifyErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'تم حفظ التصحيح ونشر النتيجة للطالب بنجاح',
      score: finalScore,
      total: finalMax,
      percentage: finalPercentage
    });

  } catch (err) {
    console.error('❌ [PublishGrades] Error:', err);
    return res.status(500).json({ error: err.message || 'حدث خطأ أثناء حفظ التصحيح' });
  }
};
