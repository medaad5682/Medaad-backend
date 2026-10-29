import { supabase } from '../../../lib/supabaseClient';
import jwt from 'jsonwebtoken';
import { BASE_URL } from '../../../lib/config'; // ✅ 1. استيراد ملف الإعدادات الموحد
import admin from '../../../lib/firebaseAdmin'; // ✅ إضافة استيراد فايربيز آدمن للتحقق
import { verifyClientAttestation } from '../../../lib/clientAttestation'; // 🆕 App Check / هواوي / القائمة البيضاء

export default async (req, res) => {
  // السماح فقط بطلبات GET
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 🆕 فحص ناعم لاستخراج user_id (إن وُجد توكن) فقط لغرض مطابقة القائمة البيضاء
  let softUserIdForWhitelist = null;
  const earlyAuthHeader = req.headers['authorization'];
  if (earlyAuthHeader && earlyAuthHeader.startsWith('Bearer ')) {
      try {
          const softDecoded = jwt.verify(earlyAuthHeader.split(' ')[1], process.env.JWT_SECRET);
          softUserIdForWhitelist = softDecoded?.userId || null;
      } catch (e) {
          // توكن غير صالح/منتهي - يُتجاهل، الـ Endpoint عام أصلاً
      }
  }

  // 🚀 =========================================================
  // 🚀 التحقق من Firebase App Check أولاً قبل أي شيء
  // 🚀 🆕 + مراعاة القائمة البيضاء اليدوية (user_id)
  // 🚀 =========================================================
  const appCheckResult = await verifyClientAttestation(
    req,
    [softUserIdForWhitelist],
    'TeacherDetails API'
  );

  if (!appCheckResult.ok) {
    return res.status(appCheckResult.status).json({ error: appCheckResult.message });
  }
  // =========================================================

  const { teacherId } = req.query;
  if (!teacherId) return res.status(400).json({ error: 'Missing Id' });

  try {
    // جلب بيانات المدرس (بما فيها profile_image)
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, name, bio, specialty, whatsapp_number, profile_image')
      .eq('id', teacherId)
      .single();

    if (!teacher) return res.status(404).json({ error: 'Not found' });

    // ✅ 2. معالجة رابط الصورة باستخدام BASE_URL بدلاً من الرابط الثابت
    if (teacher.profile_image && !teacher.profile_image.startsWith('http')) {
        teacher.profile_image = `${BASE_URL}/api/public/get-avatar?file=${teacher.profile_image}`;
    }

    // جلب الكورسات الخاصة بالمدرس
    const { data: courses } = await supabase
      .from('courses')
      .select('id, title, price, code') 
      .eq('teacher_id', teacherId);

    return res.status(200).json({
      ...teacher,
      courses: courses || []
    });
  } catch (err) {
    console.error("Error in get-teacher-details:", err);
    return res.status(500).json({ error: err.message });
  }
};
