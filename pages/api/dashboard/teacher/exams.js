import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { checkTeacherPermission } from '../../../../lib/teacherPermissions'; // ✅ التحقق من صلاحيات المعلم
import { sendToTopicOrThrow } from '../../../../lib/pushService'; // ✅ إرسال الإشعارات (FCM + HMS)

export default async (req, res) => {
  // 1. التحقق من الصلاحية
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const auth = {
    teacherId: user.teacherId,
    userId: user.id
  };

  // 🛠️ دالة تحويل التوقيت
  const toEgyptUTC = (dateString) => {
      if (!dateString) return null;
      try {
        const cleanDate = dateString.replace('Z', '');
        const dateAsUtc = new Date(cleanDate + 'Z');
        if (isNaN(dateAsUtc.getTime())) return null;
        
        const timeZone = 'Africa/Cairo';
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
        const parts = fmt.formatToParts(dateAsUtc);
        const offsetPart = parts.find(p => p.type === 'timeZoneName').value;
        const offsetHours = parseInt(offsetPart.replace(/[^\d+-]/g, ''));
        
        dateAsUtc.setHours(dateAsUtc.getHours() - offsetHours);
        return dateAsUtc.toISOString();
      } catch (e) {
        console.error("Time conversion error:", e);
        return null;
      }
  };

  // --- معالجة الطلبات (POST): إنشاء، تحديث، أو حذف ---
  if (req.method === 'POST') {
      
      let examData = req.body;
      let action = 'create'; 

      if (req.body.action && req.body.payload) {
          action = req.body.action;
          examData = req.body.payload;
      } else if (req.body.examId) {
          action = 'update';
      } else if (req.body.action === 'save_exam') {
          action = req.body.id ? 'update' : 'create';
          examData = req.body;
          if (examData.id) examData.examId = examData.id;
      }

      if (examData.randQ !== undefined) examData.randomizeQuestions = examData.randQ;
      if (examData.randO !== undefined) examData.randomizeOptions = examData.randO;

      const { 
        title, 
        subjectId, 
        duration, 
        questions, 
        start_time, 
        end_time, 
        examId,
        randomizeQuestions, 
        randomizeOptions,
        notifyStudents,
        allow_retake // ✅ استلام خيار السماح بإعادة الامتحان للتدريب
      } = examData;

      if (start_time && end_time) {
          const start = new Date(start_time);
          const end = new Date(end_time);
          if (end <= start) {
              return res.status(400).json({ error: 'تاريخ انتهاء الامتحان يجب أن يكون بعد تاريخ البدء.' });
          }
      }

      try {
        let targetExamId = examId;

        // 🛡️ التحقق من صلاحية "إنشاء/تعديل الامتحانات" (السوبر أدمن يتخطى هذا التحقق دائماً)
        // لا يشمل الحذف حتى يستطيع المعلم دائماً تنظيف امتحاناته القديمة.
        if ((action === 'create' || action === 'update') && user.role !== 'super_admin') {
          const perm = await checkTeacherPermission(auth.teacherId, 'can_create_exam');
          if (!perm.allowed) return res.status(403).json({ error: perm.error });
        }

        if (action === 'delete') {
            if (!examId) return res.status(400).json({ error: 'Exam ID required for delete' });
            await supabase.from('user_attempts').delete().eq('exam_id', examId);
            await supabase.from('questions').delete().eq('exam_id', examId);

            const { error: deleteErr } = await supabase
                .from('exams')
                .delete()
                .eq('id', examId)
                .eq('teacher_id', auth.teacherId); 

            if (deleteErr) throw deleteErr;
            return res.status(200).json({ success: true, message: 'Exam deleted' });
        }
        
        else if (action === 'create') {
            if (!title || !subjectId) return res.status(400).json({ error: 'بيانات الامتحان ناقصة' });

            // ✅ جلب بيانات المادة والكورس للتحقق وللإشعار
            const { data: subjectInfo, error: subErr } = await supabase
                .from('subjects')
                .select('id, courses!inner(teacher_id, title)')
                .eq('id', subjectId)
                .single();
            
            if (subErr || !subjectInfo || String(subjectInfo.courses.teacher_id) !== String(auth.teacherId)) {
                return res.status(403).json({ error: 'غير مسموح لك بإضافة امتحان لمادة في كورس لا تملكه.' });
            }

            const adjustedStartTime = toEgyptUTC(start_time);
            const adjustedEndTime = toEgyptUTC(end_time);

            // ✅ نحدد هل الامتحان يبدأ الآن (خلال دقيقة) أم في المستقبل
            //    إذا كان start_time في المستقبل: نخزّن notify_students=true كعلَم على الصف
            //    ويُرسل الإشعار تلقائياً عند موعد البدء الفعلي عبر:
            //    → /api/cron/exam-notifications.js (يُستدعى كل دقيقة من GitHub Actions)
            const wantsNotify = notifyStudents === true;
            const examStartTime = adjustedStartTime ? new Date(adjustedStartTime) : null;
            const startsNow = examStartTime && (examStartTime.getTime() - Date.now()) <= 60_000;

            const { data: newExam, error: examErr } = await supabase.from('exams').insert({
                title, 
                subject_id: subjectId,
                duration_minutes: duration,
                requires_student_name: true,
                sort_order: 999,
                teacher_id: auth.teacherId,
                start_time: adjustedStartTime,
                end_time: adjustedEndTime,
                is_active: true,
                randomize_questions: randomizeQuestions || false,
                randomize_options: randomizeOptions || false,
                allow_retake: allow_retake || false,
                // 🔔 تخزين علَم الإشعار — سيُرسله الكرون عند حلول موعد الامتحان
                notify_students: wantsNotify
            }).select().single();

            if (examErr) throw examErr;
            targetExamId = newExam.id;

            // إذا كان الامتحان يبدأ الآن (أو تجاوز) — نرسل الإشعار فوراً ونمسح العلَم
            if (wantsNotify && startsNow) {
                try {
                    const courseTitle = subjectInfo.courses?.title || 'تحديث جديد';
                    await sendToTopicOrThrow(`subject_${subjectId}`, {
                        title: courseTitle,
                        body: `🔔 بدأ الاختبار الآن: ${title}`,
                        type: 'exam',
                        data: { id: newExam.id.toString(), subject_id: subjectId.toString() }
                    });
                    await supabase.from('notifications').insert({
                        title: courseTitle,
                        body: `🔔 بدأ الاختبار الآن: ${title}`,
                        target_type: 'exam',
                        target_id: newExam.id.toString(),
                        sender_role: 'teacher'
                    });
                    // مسح العلَم بعد الإرسال الفوري حتى لا يُرسله الكرون مرة ثانية
                    await supabase.from('exams').update({ notify_students: false }).eq('id', newExam.id);
                } catch (notifyErr) {
                    console.error("Push Exam Notify Error:", notifyErr.message);
                }
            }
        } 

        else if (action === 'update') {
            if (!targetExamId) return res.status(400).json({ error: 'Exam ID required for update' });

            const adjustedStartTime = toEgyptUTC(start_time);
            const adjustedEndTime = toEgyptUTC(end_time);

            // ✅ عند التعديل: إذا أبقى المعلم خيار الإشعار مفعلاً، نُعيد ضبط العلَم
            //    حتى يُرسل الكرون الإشعار عند موعد البدء الجديد
            const wantsNotify = notifyStudents === true;

            const { error: updateErr } = await supabase.from('exams').update({
                title,
                duration_minutes: duration,
                start_time: adjustedStartTime,
                end_time: adjustedEndTime,
                randomize_questions: randomizeQuestions || false,
                randomize_options: randomizeOptions || false,
                allow_retake: allow_retake || false,
                notify_students: wantsNotify // ← نُعيد ضبط العلَم عند كل تعديل
            })
            .eq('id', targetExamId)
            .eq('teacher_id', auth.teacherId); 

            if (updateErr) throw updateErr;

            await supabase.from('user_attempts').delete().eq('exam_id', targetExamId);
            await supabase.from('questions').delete().eq('exam_id', targetExamId);
        }

        // إدخال الأسئلة
        if (action !== 'delete' && questions && questions.length > 0) {
            for (const [index, q] of questions.entries()) {
                // ✅ نوع السؤال: اختياري (mcq) أو مقالي (essay) - افتراضياً mcq للتوافق مع البيانات القديمة
                const questionType = q.questionType === 'essay' ? 'essay' : 'mcq';

                const { data: newQ, error: qErr } = await supabase.from('questions').insert({
                    exam_id: targetExamId, 
                    question_text: q.text,
                    image_file_id: q.image || null,
                    sort_order: index,
                    question_type: questionType,
                    // ✅ الدرجة العظمى: للأسئلة المقالية تُؤخذ من إدخال المعلم، وللاختيارية تبقى 1 دائماً
                    max_score: questionType === 'essay' ? (parseFloat(q.maxScore) || 1) : 1,
                    // ✅ الإجابة النموذجية: تُحفظ فقط للأسئلة المقالية، ليراها الطالب في النتيجة/المراجعة
                    model_answer: questionType === 'essay' ? (q.modelAnswer || null) : null,
                }).select().single();

                if (qErr) throw qErr;

                // ✅ الخيارات تُحفظ فقط للأسئلة الاختيارية - الأسئلة المقالية لا تحتاج جدول options
                if (newQ && questionType === 'mcq' && q.options) {
                    const optionsData = q.options.map((optText, i) => ({
                        question_id: newQ.id,
                        option_text: optText,
                        is_correct: i === parseInt(q.correctIndex),
                        sort_order: i
                    }));
                    await supabase.from('options').insert(optionsData);
                }
            }
        }

        return res.status(200).json({ 
            success: true, 
            examId: targetExamId, 
            message: action === 'update' ? 'Exam Updated' : 'Exam Created' 
        });

      } catch (err) {
          console.error("Exam Operation Error:", err);
          return res.status(500).json({ error: err.message });
      }
  }

  // --- GET: إحصائيات امتحان ---
  if (req.method === 'GET') {
      const { examId } = req.query;
      
      const { data: attempts } = await supabase
          .from('user_attempts') 
          .select('score, percentage, student_name_input, completed_at, users(first_name, phone)')
          .eq('exam_id', examId)
          .eq('status', 'completed')
          .order('percentage', { ascending: false });

      if (!attempts) return res.status(200).json({ 
          averageScore: 0, averagePercentage: 0, topStudents: [], totalAttempts: 0 
      });

      const totalAttempts = attempts.length;
      const averageScore = totalAttempts > 0 
          ? (attempts.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalAttempts).toFixed(1) 
          : 0;
      const averagePercentage = totalAttempts > 0 
          ? (attempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / totalAttempts).toFixed(1) 
          : 0;

      const topStudents = attempts.slice(0, 10).map(a => ({
          name: a.student_name_input || a.users?.first_name || 'طالب غير مسجل',
          phone: a.users?.phone || 'غير متوفر',
          score: a.score || 0,
          percentage: a.percentage || 0,
          date: a.completed_at
      }));

      return res.status(200).json({ 
          averageScore, averagePercentage, totalAttempts, topStudents 
      });
  }
};
