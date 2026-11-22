import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { invalidateUserCaches } from '../../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

export default async (req, res) => {
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const teacherId = user.teacherId;
  if (!teacherId) return res.status(403).json({ error: 'حساب غير مرتبط بملف مدرس' });

  try {
    // --- GET ---
    if (req.method === 'GET') {
      const { mode, query } = req.query;

      // قائمة المشرفين الخاصين بي
      if (mode === 'list') {
        const { data: team } = await supabase
          .from('users')
          .select('id, first_name, username, phone, created_at')
          .eq('role', 'moderator')
          .eq('teacher_profile_id', teacherId); 

        return res.status(200).json(team || []);
      }

      // البحث عن طلاب لإضافتهم
      if (mode === 'search') {
        if (!query || query.length < 3) return res.status(200).json([]);
        const { data: students } = await supabase
          .from('users')
          .select('id, first_name, username, phone')
          .eq('role', 'student') 
          .or(`username.ilike.%${query}%,first_name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(10);
        return res.status(200).json(students || []);
      }
    }

    // --- POST (Promote/Demote) ---
    if (req.method === 'POST') {
      const { action, userId: targetUserId } = req.body;

      // ترقية
      if (action === 'promote') {
        // تحديث الدور وربطه بي
        await supabase.from('users')
          .update({ role: 'moderator', teacher_profile_id: teacherId })
          .eq('id', targetUserId);
        invalidateUserCaches(targetUserId); // 🗄️ تغيّر الدور

        // منح صلاحيات لكل كورساتي
        const { data: myCourses } = await supabase.from('courses').select('id').eq('teacher_id', teacherId);
        if (myCourses?.length > 0) {
          const accessRows = myCourses.map(c => ({ user_id: targetUserId, course_id: c.id }));
          await supabase.from('user_course_access').upsert(accessRows, { onConflict: 'user_id, course_id' });
        }
        return res.status(200).json({ success: true });
      }

      // إلغاء الترقية
      if (action === 'demote') {
        // التأكد أنه مشرف تابع لي
        const { data: userCheck } = await supabase.from('users').select('id')
            .eq('id', targetUserId).eq('teacher_profile_id', teacherId).single();
        
        if (!userCheck) return res.status(403).json({ error: 'لا يمكنك تعديل هذا المستخدم' });

        // سحب الصلاحيات
        const { data: teacherCourses } = await supabase.from('courses').select('id').eq('teacher_id', teacherId);
        if (teacherCourses?.length > 0) {
          const courseIds = teacherCourses.map(c => c.id);
          await supabase.from('user_course_access').delete().eq('user_id', targetUserId).in('course_id', courseIds);
        }

        // إرجاعه طالب
        await supabase.from('users').update({ role: 'student', teacher_profile_id: null }).eq('id', targetUserId);
        invalidateUserCaches(targetUserId); // 🗄️ تغيّر الدور + سُحبت صلاحيات الكورسات
        return res.status(200).json({ success: true });
      }
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
