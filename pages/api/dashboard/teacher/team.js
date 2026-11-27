import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { invalidateUserCaches } from '../../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

// 🔒 حد معدّل لبحث الطلاب (في الذاكرة، لكل حساب): حتى مع المطابقة التامة،
// نمنع التخمين الآلي (تجربة آلاف اليوزرات/الأرقام) لتجميع بيانات الطلاب.
const SEARCH_WINDOW_MS = 60 * 1000;
const SEARCH_MAX_PER_WINDOW = 20;
const searchHits = new Map(); // accountKey -> timestamps[]
function isSearchRateLimited(key) {
  const now = Date.now();
  const hits = (searchHits.get(key) || []).filter(t => now - t < SEARCH_WINDOW_MS);
  if (hits.length >= SEARCH_MAX_PER_WINDOW) {
    searchHits.set(key, hits);
    return true;
  }
  hits.push(now);
  searchHits.set(key, hits);
  if (searchHits.size > 5000) { // تنظيف دوري حتى لا تكبر الذاكرة
    for (const [k, v] of searchHits) {
      if (!v.some(t => now - t < SEARCH_WINDOW_MS)) searchHits.delete(k);
    }
  }
  return false;
}

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

      // البحث عن طالب لإضافته كمشرف
      // 🔒 مطابقة تامة 100% على اسم المستخدم أو رقم الهاتف فقط:
      //    - لا بحث جزئي ولا بالاسم الأول (كان ممكن تخمين حروف وتسريب بيانات كل الطلاب)
      //    - فلاتر .eq منفصلة بدل .or(string) حتى لا يمكن حقن شروط في الفلتر
      //    - الرد: id, first_name, username فقط (بدون الهاتف)
      if (mode === 'search') {
        const q = typeof query === 'string' ? query.trim() : '';
        if (q.length < 3 || q.length > 64) return res.status(200).json([]);

        if (isSearchRateLimited(String(user.id ?? teacherId))) {
          return res.status(429).json({ error: 'محاولات بحث كثيرة، حاول بعد دقيقة' });
        }

        const base = () => supabase
          .from('users')
          .select('id, first_name, username')
          .eq('role', 'student');

        const [byUsername, byPhone] = await Promise.all([
          base().eq('username', q).limit(1),
          base().eq('phone', q).limit(5),
        ]);
        if (byUsername.error) throw byUsername.error;
        if (byPhone.error) throw byPhone.error;

        const seen = new Set();
        const results = [...(byUsername.data || []), ...(byPhone.data || [])]
          .filter(u => (seen.has(u.id) ? false : (seen.add(u.id), true)));
        return res.status(200).json(results);
      }
    }

    // --- POST (Promote/Demote) ---
    if (req.method === 'POST') {
      const { action, userId: targetUserId } = req.body;
      if (typeof targetUserId !== 'string' || !targetUserId) return res.status(400).json({ error: 'userId is required' });

      // ترقية
      if (action === 'promote') {
        // تحديث الدور وربطه بي
        const { data: promoted, error: promoteError } = await supabase.from('users')
          .update({ role: 'moderator', teacher_profile_id: teacherId })
          .eq('id', targetUserId)
          .eq('role', 'student') // 🔒 لا يُرقّى إلا طالب (يمنع تحويل مدرس/أدمن لمشرف بمعرّفه)
          .select('id');
        if (promoteError) throw promoteError;
        if (!promoted || promoted.length === 0) {
          return res.status(400).json({ error: 'لا يمكن ترقية هذا المستخدم (غير موجود أو ليس طالباً)' });
        }
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
            .eq('id', targetUserId).eq('teacher_profile_id', teacherId)
            .eq('role', 'moderator') // 🔒 لا يُخفَّض إلا مشرف (يمنع تخفيض حساب المدرس نفسه)
            .single();
        
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
