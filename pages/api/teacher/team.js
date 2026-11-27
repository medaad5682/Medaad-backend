import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper'; // سنستخدم هذا فقط للتحقق من صحة التوكن والجهاز
import { invalidateUserCaches } from '../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

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

// إخفاء معظم رقم الهاتف في نتيجة البحث (التطبيق يعرضه تحت الاسم، فنبقي آخر 3 أرقام فقط)
const maskPhone = (p) => (p ? '*'.repeat(Math.max(0, String(p).length - 3)) + String(p).slice(-3) : '');

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

      // 2. البحث عن طالب لترقيته
      // 🔒 مطابقة تامة 100% على اسم المستخدم أو رقم الهاتف فقط:
      //    - لا بحث جزئي ولا بالاسم الأول (كان ممكن تخمين حروف وتسريب بيانات كل الطلاب)
      //    - فلاتر .eq منفصلة بدل .or(string) حتى لا يمكن حقن شروط في الفلتر
      //    - رقم الهاتف في الرد مُخفى (آخر 3 أرقام فقط)
      if (mode === 'search') {
        const q = typeof query === 'string' ? query.trim() : '';
        if (q.length < 3 || q.length > 64) return res.status(200).json([]);

        if (isSearchRateLimited(String(userId))) {
          return res.status(429).json({ error: 'محاولات بحث كثيرة، حاول بعد دقيقة' });
        }

        const base = () => supabase
          .from('users')
          .select('id, first_name, username, phone')
          .eq('role', 'student'); // نبحث في الطلاب فقط

        const [byUsername, byPhone] = await Promise.all([
          base().eq('username', q).limit(1),
          base().eq('phone', q).limit(5),
        ]);
        if (byUsername.error) throw byUsername.error;
        if (byPhone.error) throw byPhone.error;

        const seen = new Set();
        const results = [...(byUsername.data || []), ...(byPhone.data || [])]
          .filter(u => (seen.has(u.id) ? false : (seen.add(u.id), true)))
          .map(u => ({ id: u.id, first_name: u.first_name, username: u.username, phone: maskPhone(u.phone) }));
        return res.status(200).json(results);
      }
    }

    // =================================================================
    // POST: ترقية طالب أو حذف مشرف
    // =================================================================
    if (req.method === 'POST') {
      const { action, userId: targetUserId } = req.body; // تغيير الاسم لتجنب التعارض
      if (typeof targetUserId !== 'string' || !targetUserId) return res.status(400).json({ error: 'userId is required' });

      // 🅰️ ترقية طالب إلى مشرف + منح صلاحيات الكورسات
      if (action === 'promote') {
        // 1. تحديث دور المستخدم وربطه بالمعلم
        const { data: promoted, error: updateError } = await supabase
          .from('users')
          .update({ 
            role: 'moderator', 
            teacher_profile_id: teacherId 
          })
          .eq('id', targetUserId)
          .eq('role', 'student') // 🔒 لا يُرقّى إلا طالب (يمنع تحويل مدرس/أدمن لمشرف بمعرّفه)
          .select('id');

        if (updateError) throw updateError;
        if (!promoted || promoted.length === 0) {
          return res.status(400).json({ error: 'لا يمكن ترقية هذا المستخدم (غير موجود أو ليس طالباً)' });
        }
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
            .eq('role', 'moderator') // 🔒 لا يُخفَّض إلا مشرف (يمنع تخفيض حساب المدرس نفسه)
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
