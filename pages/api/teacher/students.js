import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';
import { notifyStudentSubscriptionDecision } from '../../../lib/notifyHelper';
import { buildGrantTimestamps, isExemptFromExpiry } from '../../../lib/accessExpiryHelper';

export default async (req, res) => {
  // 1. التحقق من صلاحية المعلم
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const teacherId = auth.teacherId;

  // =================================================================
  // GET: جلب البيانات
  // =================================================================
  if (req.method === 'GET') {
    // ✅ إضافة status و page و limit من الاستعلام (لدعم التبويبات والصفحات)
    const { mode, query, status = 'pending', page = 1, limit = 10 } = req.query;

    try {
      // ✅ 1. وضع جديد: جلب محتوى المعلم فقط (للقوائم المنسدلة عند الإضافة)
      if (mode === 'my_content') {
        const { data: content, error } = await supabase
          .from('courses')
          .select(`
            id, 
            title, 
            subjects (id, title)
          `)
          .eq('teacher_id', teacherId);

        if (error) throw error;
        return res.status(200).json(content);
      }

      // 🅰️ الوضع الثاني: جلب الطلبات (Requests) مع الفلترة والصفحات
      // ⛔ تم حذف المنطق القديم: كان يجلب *كل* صفوف subscription_requests على
      // مستوى المنصة بأكملها لهذه الحالة (status)، ثم يفلترها في JS لتخص هذا
      // المعلم فقط (بمطابقة teacher_id أو مسح requested_data)، ثم يقتطع صفحة
      // من النتيجة بـ slice(). الآن الفلترة + الترقيم + العدّ كلها داخل
      // Postgres عبر get_teacher_requests_page (انظر sql/teacher_requests_page.sql).
      if (mode === 'requests') {
        // أ) نجلب أرقام الكورسات والمواد المملوكة للمعلم (لازمة فقط كحل احتياطي
        // للطلبات القديمة التي لا تحمل teacher_id — انظر التعليق داخل الدالة)
        const { data: myCourses } = await supabase
          .from('courses')
          .select('id')
          .eq('teacher_id', teacherId);

        const myCourseIds = myCourses?.map(c => c.id) || [];

        const { data: mySubjects } = await supabase
          .from('subjects')
          .select('id')
          .in('course_id', myCourseIds);

        const mySubjectIds = mySubjects?.map(s => s.id) || [];

        // ب) استعلام واحد داخل Postgres: يحدد طلبات هذا المعلم + يطبّق الحالة
        // + يرتب + يقتطع الصفحة + يحسب الإجمالي — بدل تحميل طلبات المنصة كاملة.
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const startIndex = (pageNum - 1) * limitNum;

        const { data: rpcData, error: rpcError } = await supabase.rpc('get_teacher_requests_page', {
          p_teacher_id: teacherId,
          p_course_ids: myCourseIds,
          p_subject_ids: mySubjectIds,
          p_status: status || null,
          p_limit: limitNum,
          p_offset: startIndex
        });
        if (rpcError) throw rpcError;

        // ✅ إرجاع البيانات في نفس الشكل القديم {data, count} لدعم عرض الصفحات
        return res.status(200).json({
           data: rpcData?.data || [],
           count: Number(rpcData?.total) || 0
        });
      }

      // 🅱️ الوضع الثالث: البحث عن طالب (Search Student)
      if (mode === 'search') {
        if (!query || query.trim().length < 3) {
            return res.status(400).json({ error: 'Search query too short' });
        }

        // أ) البحث عن المستخدم
        const { data: student, error: userError } = await supabase
          .from('users')
          .select('id, first_name, username, phone, created_at, is_blocked')
          .eq('role', 'student')
          .or(`username.eq.${query},phone.eq.${query}`)
          .maybeSingle();
        
        if (userError) throw userError;
        
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // ب) جلب صلاحيات الكورسات
        const { data: coursesAccess } = await supabase
          .from('user_course_access')
          .select('course_id, courses!inner(id, title, teacher_id)')
          .eq('user_id', student.id)
          .eq('courses.teacher_id', teacherId);

        // ج) جلب صلاحيات المواد
        const { data: subjectsAccess } = await supabase
          .from('user_subject_access')
          .select('subject_id, subjects!inner(id, title, courses!inner(id, title, teacher_id))')
          .eq('user_id', student.id)
          .eq('subjects.courses.teacher_id', teacherId);

        // تنسيق البيانات
        const formattedAccess = [
            ...(coursesAccess || []).map(c => ({
                id: c.course_id,
                title: c.courses.title,
                type: 'course',
                subtitle: 'كورس كامل'
            })),
            ...(subjectsAccess || []).map(s => ({
                id: s.subject_id,
                title: s.subjects.title,
                type: 'subject',
                subtitle: `مادة في: ${s.subjects.courses.title}`
            }))
        ];

        return res.status(200).json({ 
          student, 
          access: formattedAccess 
        });
      }

      return res.status(400).json({ error: 'Invalid mode' });

    } catch (err) {
      console.error("Teacher Students API Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // =================================================================
  // POST: تنفيذ الإجراءات
  // =================================================================
  if (req.method === 'POST') {
    const { action, payload } = req.body; 

    try {
      // 1️⃣ معالجة طلبات الاشتراك (Handle Request)
      if (action === 'handle_request') {
         const { requestId, decision, rejectionReason } = payload;
         
         const { data: reqData, error: fetchErr } = await supabase
            .from('subscription_requests')
            .select('*')
            .eq('id', requestId)
            .single();
         
         if (fetchErr || !reqData) return res.status(404).json({ error: 'Request not found' });

         const { data: myCourses } = await supabase.from('courses').select('id').eq('teacher_id', teacherId);
         const myCourseIds = myCourses?.map(c => c.id) || [];
         const { data: mySubjects } = await supabase.from('subjects').select('id').in('course_id', myCourseIds);
         const mySubjectIds = mySubjects?.map(s => s.id) || [];

         const items = reqData.requested_data || [];
         const isMyRequest = (reqData.teacher_id === teacherId) || items.some(item => {
             if (item.type === 'course') return myCourseIds.includes(item.id);
             if (item.type === 'subject') return mySubjectIds.includes(item.id);
             return false;
         });

         if (!isMyRequest) {
             return res.status(403).json({ error: '⛔ Access Denied: Not your content.' });
         }

         if (decision === 'reject') {
             await supabase.from('subscription_requests')
                 .update({ status: 'rejected', rejection_reason: rejectionReason || 'تم الرفض' })
                 .eq('id', requestId);
                 
             // ♻️ التعديل الجديد: إعادة تفعيل كود الخصم (إن وُجد) لكي يتمكن الطالب من استخدامه مجدداً
             if (reqData.discount_code_id) {
                 await supabase.from('discount_codes')
                   .update({ is_used: false })
                   .eq('id', reqData.discount_code_id);
             }

             // 🔔 إشعار الطالب بالرفض
             await notifyStudentSubscriptionDecision({
                 userId: reqData.user_id,
                 decision: 'reject',
                 courseTitle: reqData.course_title,
                 rejectionReason: rejectionReason || 'تم الرفض',
                 requestId: reqData.id,
                 senderRole: 'teacher'
             });

             return res.status(200).json({ success: true, message: 'Rejected' });
         }

         if (decision === 'approve') {
             let targetUserId = reqData.user_id;
             if (!targetUserId) {
                 const { data: existingUser } = await supabase.from('users').select('id').eq('username', reqData.user_username).maybeSingle();
                 if (existingUser) targetUserId = existingUser.id;
                 else {
                     const { data: newUser } = await supabase.from('users').insert({
                         username: reqData.user_username, password: reqData.password_hash,
                         first_name: reqData.user_name, phone: reqData.phone, role: 'student'
                     }).select('id').single();
                     targetUserId = newUser.id;
                 }
             }

             // 🎓 المدرسون/المشرفون يحصلون دائماً على وصول مدى الحياة
             const { data: targetUserRoleRow } = await supabase.from('users').select('role').eq('id', targetUserId).maybeSingle();
             const exemptFromExpiry = isExemptFromExpiry(targetUserRoleRow?.role);

             for (const item of items) {
                 if (item.type === 'course') {
                     // ⏳ حساب تاريخ انتهاء الصلاحية بناءً على مدة الكورس عند لحظة المنح
                     const { granted_at, expires_at } = await buildGrantTimestamps(item.id, null);
                     await supabase.from('user_course_access').upsert({ user_id: targetUserId, course_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at }, { onConflict: 'user_id, course_id' });
                 } else if (item.type === 'subject') {
                     const { granted_at, expires_at } = await buildGrantTimestamps(null, item.id);
                     await supabase.from('user_subject_access').upsert({ user_id: targetUserId, subject_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at }, { onConflict: 'user_id, subject_id' });
                 }
             }

             await supabase.from('subscription_requests').update({ status: 'approved', user_id: targetUserId }).eq('id', requestId);

             // 🔔 إشعار الطالب بالقبول
             await notifyStudentSubscriptionDecision({
                 userId: targetUserId,
                 decision: 'approve',
                 courseTitle: reqData.course_title,
                 requestId: reqData.id,
                 senderRole: 'teacher'
             });

             return res.status(200).json({ success: true, message: 'Approved' });
         }
      }

      // 2️⃣ التحكم المباشر (Manage Access)
      if (action === 'manage_access') {
         const { studentId, type, itemId, allow } = payload;
         
         // أ) التحقق من الملكية وجلب تفاصيل السعر والعنوان
         let isOwner = false;
         let contentTitle = '';
         let contentPrice = 0;

         if (type === 'course') {
             const { data } = await supabase
                .from('courses')
                .select('teacher_id, title, price') // ✅ جلب السعر والعنوان
                .eq('id', itemId)
                .single();
             
             if (data && data.teacher_id === teacherId) {
                isOwner = true;
                contentTitle = data.title;
                contentPrice = data.price || 0;
             }

         } else if (type === 'subject') {
             const { data } = await supabase
                .from('subjects')
                .select('title, price, courses(teacher_id, title)') // ✅ جلب السعر والعنوان
                .eq('id', itemId)
                .single();
             
             if (data && data.courses && data.courses.teacher_id === teacherId) {
                isOwner = true;
                contentTitle = `${data.title} (${data.courses.title})`;
                contentPrice = data.price || 0;
             }
         }

         if (!isOwner) return res.status(403).json({ error: '⛔ لا تملك هذا المحتوى' });

         // ب) التنفيذ
         if (allow) {
            // ✅ خطوة 1: جلب بيانات الطالب لإنشاء السجل
            const { data: studentUser } = await supabase
                .from('users')
                .select('username, first_name, phone, role')
                .eq('id', studentId)
                .single();

            if (studentUser) {
                // ✅ خطوة 2: تسجيل العملية مالياً في subscription_requests
                await supabase.from('subscription_requests').insert({
                    user_id: studentId,
                    teacher_id: teacherId,
                    status: 'approved', // مقبول فوراً
                    total_price: contentPrice, // السعر لحساب الأرباح
                    actual_paid_price: contentPrice, // يتم تسجيله أيضاً هنا
                    user_name: studentUser.first_name,
                    user_username: studentUser.username,
                    phone: studentUser.phone,
                    course_title: contentTitle, // اسم المحتوى
                    requested_data: [{ // تخزين تفاصيل المحتوى
                        id: itemId,
                        type: type,
                        title: contentTitle,
                        price: contentPrice
                    }],
                    user_note: 'تم التفعيل يدوياً بواسطة المعلم من لوحة التحكم'
                });
            }

            // ✅ خطوة 3: منح الصلاحية فعلياً
            // ⏳ حساب تاريخ انتهاء الصلاحية بناءً على مدة الكورس/المادة عند لحظة المنح
            // 🎓 المدرسون/المشرفون يحصلون دائماً على وصول مدى الحياة
            const { granted_at, expires_at } = type === 'course'
                ? await buildGrantTimestamps(itemId, null)
                : await buildGrantTimestamps(null, itemId);
            const exemptFromExpiry = isExemptFromExpiry(studentUser?.role);

            await supabase.from(type === 'course' ? 'user_course_access' : 'user_subject_access')
               .upsert({ user_id: studentId, [`${type}_id`]: itemId, granted_at, expires_at: exemptFromExpiry ? null : expires_at }, { onConflict: `user_id, ${type}_id` });

         } else {
            // حالة الحذف (إلغاء الصلاحية)
            await supabase.from(type === 'course' ? 'user_course_access' : 'user_subject_access')
               .delete()
               .eq('user_id', studentId)
               .eq(`${type}_id`, itemId);
         }
         return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown Action' });

    } catch (err) {
      console.error("Teacher Action Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};
