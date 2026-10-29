import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';
import { checkTeacherPermission } from '../../../lib/teacherPermissions'; // ✅ التحقق من صلاحيات المعلم
import { sendToTopicOrThrow } from '../../../lib/pushService'; // ✅ إرسال الإشعارات (FCM + HMS)

export default async (req, res) => {
  // التحقق من صلاحية المعلم
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // 🛠️ دالة تحويل التوقيت
  //   ⚠️ ملاحظة هامة: بعض العملاء (تطبيق الموبايل) يرسلون start_time كـ ISO
  //   UTC صحيح بالفعل (مثال: "2026-07-05T12:30:00.000Z")، بينما الداشبورد
  //   الويب يرسل وقتاً محلياً "ساذجاً" بدون منطقة زمنية (مثال: "2026-07-05T14:30"
  //   من input[type=datetime-local]).
  //   إذا كان النص يحمل معلومة منطقة زمنية بالفعل (Z أو +HH:MM / -HH:MM)
  //   فهو يمثّل لحظة UTC صحيحة ولا يجب إزاحته مرة أخرى بفارق توقيت القاهرة،
  //   وإلا سيُزاح مرتين وينتج عنه وقت بدء أبكر بساعتين/ثلاث من المقصود —
  //   وهو ما كان يجعل الامتحان يبدو أنه "بدأ بالفعل" فيُرسل الإشعار فوراً عند الإنشاء.
  const hasExplicitTimezone = (dateString) => /Z$|[+-]\d{2}:?\d{2}$/.test(dateString.trim());

  const toEgyptUTC = (dateString) => {
      if (!dateString) return null;
      try {
        // ✅ إذا كان التوقيت يحمل بالفعل منطقة زمنية صريحة (من تطبيق الموبايل)،
        //    فهو UTC صحيح جاهز — لا نزيحه، فقط نُطبّعه بصيغة ISO
        if (hasExplicitTimezone(dateString)) {
          const parsedUtc = new Date(dateString);
          if (isNaN(parsedUtc.getTime())) return null;
          return parsedUtc.toISOString();
        }

        // 🕒 وإلا فهو وقت محلي "ساذج" (من الداشبورد الويب) — نفترض أنه بتوقيت القاهرة
        //    ونحوله إلى UTC عبر إزاحة فارق التوقيت
        const cleanDate = dateString.replace('Z', '');
        const dateAsUtc = new Date(cleanDate + 'Z');
        if (isNaN(dateAsUtc.getTime())) return null;
        
        // حساب الإزاحة الزمنية للقاهرة
        const timeZone = 'Africa/Cairo';
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
        const parts = fmt.formatToParts(dateAsUtc);
        const offsetPart = parts.find(p => p.type === 'timeZoneName').value;
        const offsetHours = parseInt(offsetPart.replace(/[^\d+-]/g, ''));
        
        // تعديل الوقت
        dateAsUtc.setHours(dateAsUtc.getHours() - offsetHours);
        return dateAsUtc.toISOString();
      } catch (e) {
        console.error("Time conversion error:", e);
        return null;
      }
  };

  // --- معالجة الطلبات (POST): إنشاء، تحديث، أو حذف ---
  if (req.method === 'POST') {
      
      // استقبال البيانات
      let examData = req.body;
      let action = 'create'; // الافتراضي

      // دعم هيكلية action/payload أو البيانات المباشرة
      if (req.body.action && req.body.payload) {
          action = req.body.action;
          examData = req.body.payload;
      } else if (req.body.examId) {
          // إذا تم إرسال examId بدون تحديد action، نعتبره تحديث
          action = 'update';
      }

      // ✅ استقبال إعدادات العشوائية، الإعادة، والإشعارات
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
        allow_retake,   // ✅ خيار السماح بالتدريب
        notifyStudents  // ✅ خيار التنبيه بالإشعارات
      } = examData;

      try {
        let targetExamId = examId;

        // 🛡️ التحقق من صلاحية "إنشاء/تعديل الامتحانات" (يتحكم بها السوبر أدمن)
        // لا يشمل الحذف حتى يستطيع المعلم دائماً تنظيف امتحاناته القديمة.
        if (action === 'create' || action === 'update') {
          const perm = await checkTeacherPermission(auth.teacherId, 'can_create_exam');
          if (!perm.allowed) return res.status(403).json({ error: perm.error });
        }

        // =================================================
        // الحالة 3: حذف امتحان (Delete)
        // =================================================
        if (action === 'delete') {
            if (!examId) return res.status(400).json({ error: 'Exam ID required for delete' });

            // 1. حذف محاولات الطلاب
            await supabase.from('user_attempts').delete().eq('exam_id', examId);
            
            // 2. حذف الأسئلة
            await supabase.from('questions').delete().eq('exam_id', examId);

            // 3. حذف الامتحان (مع التحقق من الملكية عبر teacher_id)
            const { error: deleteErr } = await supabase
                .from('exams')
                .delete()
                .eq('id', examId)
                .eq('teacher_id', auth.teacherId); 

            if (deleteErr) throw deleteErr;

            return res.status(200).json({ success: true, message: 'Exam and all related data deleted' });
        }
        
        // =================================================
        // الحالة 1: إنشاء امتحان جديد (Create)
        // =================================================
        else if (action === 'create') {
            if (!title || !subjectId) return res.status(400).json({ error: 'بيانات الامتحان ناقصة' });

            // 🛡️ [جديد وهام جداً] التحقق الأمني: هل يملك المعلم هذه المادة؟
            // نقوم بجلب بيانات المادة والكورس المرتبط بها للتحقق من teacher_id + جلب الاسم للإشعار
            const { data: subjectInfo, error: subErr } = await supabase
                .from('subjects')
                .select('id, courses!inner(teacher_id, title)') 
                .eq('id', subjectId)
                .single();
            
            // إذا لم يتم العثور على المادة أو كان المعلم المالك مختلفاً عن المعلم الحالي
            if (subErr || !subjectInfo || String(subjectInfo.courses.teacher_id) !== String(auth.teacherId)) {
                return res.status(403).json({ error: 'غير مسموح لك بإضافة امتحان لمادة في كورس لا تملكه.' });
            }

            const adjustedStartTime = toEgyptUTC(start_time);
            const adjustedEndTime = toEgyptUTC(end_time);

            // ✅ نخزّن علَم notify_students على الصف بدلاً من الإرسال الفوري
            //    الكرون (/api/cron/exam-notifications) يُرسل الإشعار عند حلول start_time
            const wantsNotify = notifyStudents === true || notifyStudents === 'true' || notifyStudents === 1 || notifyStudents === '1';
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
                // 🔔 العلَم الذي يقرأه الكرون لمعرفة من يحتاج إرسال إشعار
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
                    await supabase.from('exams').update({ notify_students: false }).eq('id', newExam.id);
                    console.log(`✅ Exam notification sent immediately for: ${title}`);
                } catch (notifyErr) {
                    console.error("⚠️ Push Exam Notify Error:", notifyErr.message);
                }
            }
        } 
        // =================================================
        // الحالة 2: تحديث امتحان موجود (Update)
        // =================================================
        else if (action === 'update') {
            if (!targetExamId) return res.status(400).json({ error: 'Exam ID required for update' });

            const adjustedStartTime = toEgyptUTC(start_time);
            const adjustedEndTime = toEgyptUTC(end_time);

            // ✅ عند التعديل: إذا أبقى المعلم خيار الإشعار مفعلاً، نُعيد ضبط العلَم
            //    حتى يُرسل الكرون الإشعار عند موعد البدء الجديد
            const wantsNotify = notifyStudents === true;

            // 1. تحديث بيانات الامتحان (مع شرط teacher_id للحماية)
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

            // ✅ حذف المحاولات والأسئلة القديمة لضمان التوافق وإعادة بنائها
            await supabase.from('user_attempts').delete().eq('exam_id', targetExamId);
            await supabase.from('questions').delete().eq('exam_id', targetExamId);
        }

        // =================================================
        // إدخال الأسئلة (مشترك للإنشاء والتحديث)
        // =================================================
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

                if (qErr) console.error("Error creating question:", qErr);

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
          averageScore: 0, 
          averagePercentage: 0,
          topStudents: [], 
          totalAttempts: 0 
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
          averageScore, 
          averagePercentage, 
          totalAttempts, 
          topStudents 
      });
  }
};
