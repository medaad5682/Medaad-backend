import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper'; // سنستخدم هذا فقط للتحقق من صحة التوكن والجهاز
import { invalidateUserCaches } from '../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

export default async (req, res) => {
  // =================================================================
  // 🔒 التحقق الأمني الصارم (Manual Strict Check)
  // =================================================================
  
  // 1. التحقق من صحة التوكن وبصمة الجهاز
  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized Device/Token' });
  }

  const userId = req.headers['x-user-id']; // يتم حقنه بواسطة checkUserAccess

  try {
    // 2. جلب بيانات المستخدم مباشرة من قاعدة البيانات
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, teacher_profile_id, is_blocked')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: 'Account Blocked' });
    }

    // 3. 🛑 الشرط الحاسم: السماح فقط للمعلم (role === 'teacher')
    // يتم رفض 'moderator' أو أي رتبة أخرى هنا
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access Denied: Only the main teacher can manage the team.' });
    }

    if (!user.teacher_profile_id) {
      return res.status(400).json({ error: 'No teacher profile linked to this account' });
    }

    const teacherId = user.teacher_profile_id;

    // =================================================================
    // GET: البحث عن طلاب أو عرض الفريق الحالي
    // =================================================================
    if (req.method === 'GET') {
      const { mode, query } = req.query;

      // 1. عرض المشرفين الحاليين التابعين لهذا المعلم
      if (mode === 'list') {
        const { data: team, error } = await supabase
          .from('users')
          .select('id, first_name, username, phone, created_at')
          .eq('role', 'moderator')
          .eq('teacher_profile_id', teacherId); // المشرفون التابعون لهذا المعلم فقط

        if (error) throw error;
        return res.status(200).json(team);
      }

      // 2. البحث عن طلاب لترقيتهم (بحث عام في كل الطلاب)
      if (mode === 'search') {
        if (!query || query.length < 3) return res.status(200).json([]);

        const { data: students, error } = await supabase
          .from('users')
          .select('id, first_name, username, phone')
          .eq('role', 'student') // نبحث في الطلاب فقط
          .or(`username.ilike.%${query}%,first_name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(10);

        if (error) throw error;
        return res.status(200).json(students);
      }
    }

    // =================================================================
    // POST: ترقية طالب أو حذف مشرف
    // =================================================================
    if (req.method === 'POST') {
      const { action, userId: targetUserId } = req.body; // تغيير الاسم لتجنب التعارض

      // 🅰️ ترقية طالب إلى مشرف + منح صلاحيات الكورسات
      if (action === 'promote') {
        // 1. تحديث دور المستخدم وربطه بالمعلم
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            role: 'moderator', 
            teacher_profile_id: teacherId 
          })
          .eq('id', targetUserId);

        if (updateError) throw updateError;
        invalidateUserCaches(targetUserId); // 🗄️ تغيّر الدور

        // 2. جلب جميع كورسات المعلم
        const { data: myCourses } = await supabase
          .from('courses')
          .select('id')
          .eq('teacher_id', teacherId);

        // 3. منح الصلاحيات تلقائياً لكل الكورسات
        if (myCourses && myCourses.length > 0) {
          const accessRows = myCourses.map(c => ({
            user_id: targetUserId,
            course_id: c.id
          }));

          // استخدام upsert لتجنب الأخطاء إذا كان لديه صلاحية مسبقة
          await supabase.from('user_course_access').upsert(accessRows, { onConflict: 'user_id, course_id' });
        }

        return res.status(200).json({ success: true, message: 'Student promoted and access granted' });
      }

      // 🅱️ سحب الإشراف (إعادته كطالب) وحذف الصلاحيات
      if (action === 'demote') {
        // التحقق أولاً أن هذا المشرف يتبع هذا المعلم (لمنع حذف مشرفي معلمين آخرين)
        const { data: userCheck } = await supabase
            .from('users')
            .select('id')
            .eq('id', targetUserId)
            .eq('teacher_profile_id', teacherId)
            .single();
        
        if (!userCheck) return res.status(403).json({ error: 'Unauthorized to modify this user' });

        // ✅ خطوة جديدة: حذف صلاحيات الكورسات الخاصة بهذا المعلم
        const { data: teacherCourses } = await supabase
          .from('courses')
          .select('id')
          .eq('teacher_id', teacherId);

        if (teacherCourses && teacherCourses.length > 0) {
          const courseIds = teacherCourses.map(c => c.id);
          
          // حذف الصفوف من جدول الصلاحيات لهذا المستخدم والكورسات المحددة
          await supabase
            .from('user_course_access')
            .delete()
            .eq('user_id', targetUserId)
            .in('course_id', courseIds);
        }

        // إعادة الدور لطالب وفك الارتباط
        await supabase
          .from('users')
          .update({ 
            role: 'student', 
            teacher_profile_id: null 
          })
          .eq('id', targetUserId);
        invalidateUserCaches(targetUserId); // 🗄️ تغيّر الدور + سُحبت صلاحيات الكورسات

        return res.status(200).json({ success: true, message: 'Moderator removed and access revoked' });
      }
    }

    return res.status(405).json({ message: 'Method Not Allowed' });

  } catch (err) {
    console.error("Team API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
