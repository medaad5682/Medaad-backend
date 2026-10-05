import { supabase } from '../../../lib/supabaseClient';
import jwt from 'jsonwebtoken';
import { verifyAppCheckWithWhitelist } from '../../../lib/appCheckWhitelist'; // 🆕 القائمة البيضاء

// ============================================================
// 🔎 بحث عام في كل كورسات المتجر
// ============================================================
// get-app-init-data.js أصبح يرسل 5 كورسات عشوائية فقط ("مقترح لك") بدل
// كل الكورسات، لذا أصبحت الشاشة الرئيسية تحتاج نقطة نهاية منفصلة تُستدعى
// فقط عند كتابة المستخدم في خانة البحث. يستخدم نفس الـ view ونفس شكل
// الكائن الذي يعتمد عليه CourseModel.fromJson في التطبيق حتى لا يحتاج
// أي تعديل إضافي هناك.
//
// GET ?q=<term>  -> حتى 30 نتيجة تطابق العنوان أو الكود
// GET (بدون q)   -> فارغة (لا داعي لجلب كل شيء بدون كلمة بحث)
// ============================================================

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const authHeader = req.headers['authorization'];
  let softUserIdForWhitelist = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const softDecoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      softUserIdForWhitelist = softDecoded?.userId || null;
    } catch (e) {
      // توكن غير صالح/منتهي - يُتجاهل، الـ Endpoint عام أصلاً
    }
  }

  const appCheckResult = await verifyAppCheckWithWhitelist(req, [softUserIdForWhitelist], 'SearchCourses API');
  if (!appCheckResult.ok) {
    return res.status(appCheckResult.status).json({ message: appCheckResult.message });
  }

  const q = (req.query.q || '').toString().trim();

  if (!q) {
    return res.status(200).json({ success: true, courses: [] });
  }

  try {
    const escaped = q.replace(/[%_]/g, ''); // تبسيط: منع كسر نمط الـ ilike
    const isNumericCode = /^\d+$/.test(escaped);

    // 1) العنوان: مطابقة "يبدأ بـ" وليس "يحتوي على" — كتابة "m" تُظهر
    // فقط الكورسات التي يبدأ اسمها بـ m، وليس أي كورس فيه حرف m في أي
    // مكان. ilike غير حسّاس لحالة الأحرف أصلاً (m أو M سيّان).
    const { data: titleMatches, error: titleErr } = await supabase
      .from('view_course_details')
      .select('*')
      .ilike('course_title', `${escaped}%`)
      .order('course_title', { ascending: true })
      .limit(30);

    if (titleErr) throw titleErr;

    const merged = new Map();
    (titleMatches || []).forEach(course => merged.set(course.course_id, course));

    // 2) الكود: نفس فكرة "يبدأ بـ" (كتابة "10" تطابق 10، 100، 1023...).
    // 🐛 عمود code من نوع integer: ilike لا يعمل عليه إطلاقاً (خطأ
    // "operator does not exist: integer ~~* unknown")، ومحاولة الـ cast
    // داخل الفلتر (code::text.ilike...) مرفوضة من PostgREST نفسه (خطأ
    // parse مختلف) — لا يدعم casting داخل .or()/.filter(). الحل العملي:
    // نجلب كل الكورسات (عددها صغير في متجر واحد) ونطابق بادئة الكود
    // كنص يدوياً هنا بدل الاعتماد على SQL لهذا الجزء تحديداً.
    if (isNumericCode) {
      const { data: allCourses, error: allErr } = await supabase
        .from('view_course_details')
        .select('*');

      if (allErr) throw allErr;

      (allCourses || [])
        .filter(course => course.code != null && course.code.toString().startsWith(escaped))
        .forEach(course => merged.set(course.course_id, course));
    }

    // 🐛 تم حذف .order('sort_order', ...) سابقاً لأن هذا الحقل غير موجود
    // في view_course_details (كان يُسقط الطلب بالكامل).
    const courses = Array.from(merged.values()).slice(0, 30);

    return res.status(200).json({ success: true, courses });
  } catch (err) {
    console.error('[SearchCourses API Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};
