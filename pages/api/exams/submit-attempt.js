import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper'; // 1. استيراد الحارس

export default async (req, res) => {
  const apiName = '[API: submit-attempt]';
  
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  // 2. التحقق الأمني (هوية المستخدم وجهازه)
  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) {
      return res.status(401).json({ error: 'Unauthorized Access' });
  }

  // 3. استخدام المعرف الآمن المحقون
  const userId = req.headers['x-user-id'];
  
  // ✅ استقبال examId ضروري في حالة التدريب لمعرفة أي امتحان نصحح
  const { attemptId, answers, examId } = req.body; // answers format: { "questionId": optionId }

  if (!attemptId || !answers) {
      return res.status(400).json({ error: 'Missing Data' });
  }

  try {
    // =========================================================
    // ✅✅ سيناريو 1: وضع التدريب (التصحيح التفصيلي الفوري)
    // =========================================================
    if (attemptId === 'temp_retake_mode') {
        if (!examId) {
            return res.status(400).json({ error: 'Missing Exam ID for practice mode' });
        }

        console.log(`${apiName} 🔄 Detailed Grading for practice mode: ${examId}`);

        // جلب الأسئلة مع كافة تفاصيلها (الخيارات، الصور، النص) للإرسال للفرونت إند
        const { data: questions, error: qErr } = await supabase
          .from('questions')
          .select(`id, question_text, image_file_id, question_type, max_score, model_answer, options (id, option_text, is_correct)`)
          .eq('exam_id', examId);

        if (qErr) throw qErr;

        let score = 0; // درجة الأسئلة الاختيارية المصححة تلقائياً فقط (لا يوجد معلم ليصحح المقالي هنا)
        const mcqQuestions = (questions || []).filter(q => q.question_type !== 'essay');
        const essayQuestions = (questions || []).filter(q => q.question_type === 'essay');
        const mcqTotal = mcqQuestions.length;

        // ✅ نطابق هيكل نتيجة "المحاولة الأولى الحقيقية" (get-results.js):
        // total = كل الأسئلة (اختياري + مقالي)، total_points = عدد الاختياري + مجموع الدرجة العظمى للمقالي
        // لكن هذه الأرقام هنا للعرض فقط، فدرجة المقالي لا تُحتسب أبداً لأنه لا يوجد معلم يراجعها في وضع التدريب
        const total = mcqQuestions.length + essayQuestions.length;
        const totalPoints = mcqQuestions.length + essayQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 1), 0);

        let correctedQuestions = [];

        // تصحيح الإجابات في الذاكرة وبناء مصفوفة النتائج التفصيلية
        (questions || []).forEach(q => {
          if (q.question_type === 'essay') {
            // ✅ الأسئلة المقالية في وضع التدريب: تُعرض كإجابة نصية مع الإجابة النموذجية للمراجعة الذاتية فقط
            // لا تُمنح أي درجة (earned_score = null) ولن تتم مراجعتها لاحقاً من معلم (بخلاف المحاولة الحقيقية)
            correctedQuestions.push({
              id: q.id,
              question_text: q.question_text,
              image_file_id: q.image_file_id,
              question_type: 'essay',
              max_score: q.max_score,
              model_answer: q.model_answer || null,
              user_answer: { text_answer: answers[q.id] || '' },
              earned_score: null,
              needs_manual_grading: false,
              is_self_review: true,
              self_review_note: 'هذا سؤال مقالي، قارن إجابتك بالإجابة النموذجية أدناه لتقييم نفسك ذاتياً. لن يتم احتساب درجة له ولن يقوم معلم بمراجعته في وضع التدريب.'
            });
            return;
          }

          const userSelectedOptionId = answers[q.id];
          const correctOption = q.options.find(o => o.is_correct);
          const isCorrect = !!(correctOption && userSelectedOptionId && String(userSelectedOptionId) === String(correctOption.id));

          if (isCorrect) {
            score++;
          }

          // بناء هيكل السؤال المصحح ليعرض في شاشة "DETAILED ANALYSIS"
          correctedQuestions.push({
            id: q.id,
            question_text: q.question_text,
            image_file_id: q.image_file_id,
            question_type: 'mcq',
            options: q.options,
            correct_option_id: correctOption?.id,
            user_answer: { selected_option_id: userSelectedOptionId, is_correct: isCorrect }
          });
        });

        // ✅ النسبة المئوية تعتمد فقط على الأسئلة الاختيارية المصححة تلقائياً (المقالي غير محتسب)
        const percentage = mcqTotal > 0 ? Math.round((score / mcqTotal) * 100) : 0;

        console.log(`${apiName} ✅ Practice Exam graded. MCQ Score: ${score}/${mcqTotal} (Essay questions: ${essayQuestions.length}, self-review only)`);

        // إرجاع النتيجة مع التفاصيل الدقيقة مباشرة للفرونت إند دون حفظ في قاعدة البيانات
        return res.status(200).json({
          success: true,
          score_details: {
            score,                 // درجة الاختيارى المصححة فقط (لا تشمل المقالي)
            correct: score,
            total,                 // إجمالي عدد كل الأسئلة (اختياري + مقالي)، كما في نتيجة المحاولة الحقيقية
            total_points: totalPoints, // إجمالي النقاط القصوى شاملاً الدرجة العظمى للمقالي (لغرض العرض فقط)
            mcq_total: mcqTotal,   // عدد الأسئلة الاختيارية التي بُنيت عليها النسبة المئوية فعلياً
            percentage,
            has_essay: essayQuestions.length > 0,
            essay_graded: false    // ✅ توضيح صريح: المقالي غير مُصحح ولن يُصحح في وضع التدريب
          },
          corrected_questions: correctedQuestions, // مصفوفة الأسئلة كاملة للتحليل، شاملة الإجابة النموذجية للمقالي
          is_practice: true,
          message: essayQuestions.length > 0
            ? 'تم تصحيح الأسئلة الاختيارية تلقائياً. الأسئلة المقالية لن يتم تصحيحها من قِبل معلم في وضع التدريب، قارن إجابتك بالإجابة النموذجية المتاحة لكل سؤال لتقييم نفسك ذاتياً.'
            : undefined
        });
    }

    // =========================================================
    // ✅✅ سيناريو 2: المحاولة الحقيقية الأساسية
    // =========================================================
    
    // 4. جلب بيانات المحاولة للتحقق من الملكية
    const { data: attemptData, error: fetchError } = await supabase
        .from('user_attempts')
        .select('exam_id, user_id, status')
        .eq('id', attemptId)
        .single();

    if (fetchError || !attemptData) throw new Error("Attempt not found");

    // 5. التحقق من أن الطالب هو صاحب المحاولة
    if (String(attemptData.user_id) !== String(userId)) {
        console.warn(`${apiName} ⛔ Fraud attempt: User ${userId} tried to submit for ${attemptData.user_id}`);
        return res.status(403).json({ error: "Access Denied: Not your attempt" });
    }

    // التحقق من أن الامتحان لم يتم تسليمه مسبقاً
    if (attemptData.status === 'completed') {
        return res.status(409).json({ error: "Exam already submitted" });
    }

    const realExamId = attemptData.exam_id;

    // 6. جلب أسئلة الامتحان (شاملة نوع السؤال والدرجة العظمى)
    const { data: questions } = await supabase
      .from('questions')
      .select(`id, question_type, max_score, options (id, is_correct)`)
      .eq('exam_id', realExamId);

    let score = 0; // درجة الأسئلة الاختيارية المصححة تلقائياً فقط
    const mcqQuestions = (questions || []).filter(q => q.question_type !== 'essay');
    const essayQuestions = (questions || []).filter(q => q.question_type === 'essay');
    const total = mcqQuestions.length; // الإجمالي المعروض فوراً يعتمد على الأسئلة الاختيارية فقط
    const hasEssayQuestions = essayQuestions.length > 0;
    let answersToInsert = [];

    // 7. تصحيح الأسئلة الاختيارية تلقائياً
    mcqQuestions.forEach(q => {
      const userSelectedOptionId = answers[q.id]; 
      const correctOption = q.options.find(o => o.is_correct);
      
      let isCorrect = false;
      if (correctOption && userSelectedOptionId && String(userSelectedOptionId) === String(correctOption.id)) {
        score++;
        isCorrect = true;
      }

      if (userSelectedOptionId) {
          answersToInsert.push({
              attempt_id: attemptId,
              question_id: q.id,
              selected_option_id: userSelectedOptionId,
              is_correct: isCorrect
          });
      }
    });

    // ✅ 7.ب. حفظ إجابات الأسئلة المقالية كنص خام بانتظار تصحيح المعلم اليدوي
    essayQuestions.forEach(q => {
      const textAnswer = answers[q.id];
      if (textAnswer !== undefined && textAnswer !== null && String(textAnswer).trim() !== '') {
          answersToInsert.push({
              attempt_id: attemptId,
              question_id: q.id,
              text_answer: String(textAnswer),
              earned_score: null, // لم يتم تصحيحه يدوياً بعد
              is_correct: null
          });
      }
    });

    // 8. حفظ الإجابات التفصيلية في جدول user_answers
    if (answersToInsert.length > 0) {
        const { error: ansError } = await supabase
            .from('user_answers')
            .insert(answersToInsert);
        
        if (ansError) throw ansError;
    }

    // ✅ حساب النسبة المئوية المبدئية (تعتمد فقط على الأسئلة الاختيارية المصححة تلقائياً)
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    if (hasEssayQuestions) {
        // ✅ في حال وجود أسئلة مقالية: الامتحان ينتظر تصحيح المعلم اليدوي قبل نشر النتيجة النهائية
        const { error: updateError } = await supabase
          .from('user_attempts')
          .update({
            score: score,           // درجة مبدئية للأسئلة الاختيارية فقط
            percentage: percentage,  // نسبة مبدئية، ستُعاد حسابها بعد التصحيح اليدوي
            status: 'pending_grading',
            is_published: false,
            completed_at: new Date().toISOString()
          })
          .eq('id', attemptId);

        if (updateError) throw updateError;

        console.log(`${apiName} ✅ Exam submitted, pending manual grading. Auto score: ${score}/${total}`);

        return res.status(200).json({
          success: true,
          pending_grading: true,
          message: 'تم تسليم إجابتك بنجاح، وهي الآن قيد المراجعة من المعلم.',
          is_practice: false
        });
    }

    // 9. لا توجد أسئلة مقالية: تحديث حالة المحاولة بالدرجة النهائية مباشرة كالمعتاد
    const { error: updateError } = await supabase
      .from('user_attempts')
      .update({
        score: score,
        percentage: percentage,
        status: 'completed',
        is_published: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', attemptId);

    if (updateError) throw updateError;

    console.log(`${apiName} ✅ Real Exam submitted. Score: ${score}/${total}`);

    return res.status(200).json({
      success: true,
      score: score,
      total: total,
      percentage: percentage,
      is_practice: false
    });

  } catch (err) {
    console.error(`${apiName} 🔥 ERROR:`, err.message);
    return res.status(500).json({ error: err.message });
  }
};
