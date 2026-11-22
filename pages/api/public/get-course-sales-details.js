import { supabase } from '../../../lib/supabaseClient';
import jwt from 'jsonwebtoken';
import admin from '../../../lib/firebaseAdmin'; // ✅ إضافة استيراد فايربيز آدمن للتحقق
import { verifyClientAttestation } from '../../../lib/clientAttestation'; // 🆕 App Check / هواوي / القائمة البيضاء
import { isAccessRowActive } from '../../../lib/accessExpiryHelper'; // ⏳ فحص انتهاء صلاحية الوصول (Feature B)
import { getAccessRows } from '../../../lib/accessCache'; // 🗄️ صفوف اشتراك الطالب (كاش قصير؛ التحكم: cacheConfig.js)

export default async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  // 🆕 فحص ناعم مبكر لاستخراج user_id فقط لغرض مطابقة القائمة البيضاء
  let softUserIdForWhitelist = null;
  const earlyAuthHeader = req.headers['authorization'];
  if (earlyAuthHeader && earlyAuthHeader.startsWith('Bearer ')) {
      try {
          const softDecoded = jwt.verify(earlyAuthHeader.split(' ')[1], process.env.JWT_SECRET);
          softUserIdForWhitelist = softDecoded?.userId || null;
      } catch (e) {
          // توكن غير صالح/منتهي - سيُعامل كزائر لاحقاً كما كان
      }
  }

  // 🚀 =========================================================
  // 🚀 التحقق من Firebase App Check أولاً قبل أي شيء
  // 🚀 🆕 + مراعاة القائمة البيضاء اليدوية (user_id)
  // 🚀 =========================================================
  const appCheckResult = await verifyClientAttestation(
    req,
    [softUserIdForWhitelist],
    'CourseSalesDetails API'
  );

  if (!appCheckResult.ok) {
    return res.status(appCheckResult.status).json({ error: appCheckResult.message });
  }
  // =========================================================

  const { courseCode } = req.query;
  
  if (!courseCode) return res.status(400).json({ error: 'Missing Course Code' });

  // 1. "فحص ناعم" (Soft Check) للتعرف على المستخدم إن وجد
  // لا نستخدم authHelper هنا لأننا نسمح للزوار (Guests) بالدخول
  let userId = null;
  const authHeader = req.headers['authorization'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          // تحقق إضافي: هل الجهاز مطابق؟
          if (decoded.deviceId === req.headers['x-device-id']) {
              userId = decoded.userId;
          }
      } catch (e) {
          // توكن غير صالح = زائر
      }
  }

  try {
    // 2. جلب تفاصيل الكورس والمدرس
    // ✅ تم التعديل: جلب payment_details بدلاً من الأعمدة القديمة المتفرقة
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select(`
        id, title, price, description, code,
        teacher:teachers (
            id, name, bio, specialty,
            payment_details
        ),
        subjects (id, title, price, sort_order)
      `)
      .eq('code', courseCode)
      .single();

    if (courseError || !course) return res.status(404).json({ error: 'Course not found' });

    // 3. تجهيز معلومات الدفع
    // ✅ نستخرج البيانات من JSONB ونضع القيم الافتراضية
    const rawDetails = course.teacher?.payment_details || {};

    // نأخذ أول عنصر من المصفوفات لملء الحقول التي تتوقع قيمة واحدة (للحفاظ على توافق الواجهة)
    const firstCash = (Array.isArray(rawDetails.cash_numbers) && rawDetails.cash_numbers.length > 0) 
        ? rawDetails.cash_numbers[0] 
        : '';
        
    const firstInstaNum = (Array.isArray(rawDetails.instapay_numbers) && rawDetails.instapay_numbers.length > 0) 
        ? rawDetails.instapay_numbers[0] 
        : '';

    const firstInstaLink = (Array.isArray(rawDetails.instapay_links) && rawDetails.instapay_links.length > 0) 
        ? rawDetails.instapay_links[0] 
        : '';

    const paymentInfo = {
        vodafone_cash_number: firstCash, // Mapping for legacy UI support
        instapay_number: firstInstaNum,
        instapay_link: firstInstaLink,
        ownerName: course.teacher?.name || 'Admin',
        all_details: rawDetails // نرسل التفاصيل كاملة أيضاً
    };

    // 4. التحقق من الملكية (فقط إذا تم التعرف على المستخدم)
    let ownedCourse = false;
    let ownedSubjects = new Set();

    if (userId) {
      // 🗄️ نقرأ صفوف اشتراك الطالب من الكاش بدل قراءة user_course_access و user_subject_access
      // في كل مرة. قاعدة الأمان/الحداثة: "مملوك" يُصدَّق من الكاش، لكن "غير مملوك" يُتأكد منه
      // من الداتابيز (حتى لا يرى الطالب زر الشراء لكورس اشتراه للتو).
      const computeOwnership = (rows) => {
        let oc = false;
        const os = new Set();

        // أ) هل اشترى الكورس بالكامل؟ (⏳ اشتراك منتهي = غير مملوك، يسمح له بإعادة الشراء/التجديد)
        const cAccess = rows.courseMap.get(String(course.id));
        if (cAccess && isAccessRowActive(cAccess)) oc = true;

        // ب) هل اشترى مواد منفصلة؟ (⏳ نفس المنطق لكل مادة على حدة)
        (course.subjects || []).forEach(sub => {
          const sAccess = rows.subjectMap.get(String(sub.id));
          if (sAccess && isAccessRowActive(sAccess)) os.add(sub.id);
        });
        return { oc, os };
      };

      const { rows, fromCache } = await getAccessRows(userId);

      if (rows) {
        let result = computeOwnership(rows);

        // لو الكورس غير مملوك بالكامل والنتيجة جاءت من الكاش: نعيد التأكد من الداتابيز
        if (!result.oc && fromCache) {
          const fresh = await getAccessRows(userId, { fresh: true });
          if (fresh.rows) result = computeOwnership(fresh.rows);
        }

        ownedCourse = result.oc;
        ownedSubjects = result.os;
      }
    }

    // 5. إرجاع البيانات
    return res.status(200).json({
      ...course,
      subjects: course.subjects.sort((a, b) => a.sort_order - b.sort_order).map(s => ({
        ...s,
        isOwned: ownedCourse || ownedSubjects.has(s.id)
      })),
      isOwned: ownedCourse,
      paymentInfo: paymentInfo
    });

  } catch (err) {
    console.error("Error in get-course-sales-details:", err);
    return res.status(500).json({ error: err.message });
  }
};
