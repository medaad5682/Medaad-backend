// pages/api/public/check-version.js
import { getAppVersionRow } from '../../../lib/appVersionCache'; // 📱 كاش قصير (التحكم: cacheConfig.js → CACHE_VERSION_TTL_SEC)

export default async function handler(req, res) {
  // السماح فقط بطلبات GET
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { platform } = req.query;

  // التحقق من صحة المنصة
  // 🆕 خطوة 20: 'huawei' = أجهزة هواوي بدون خدمات جوجل (التحديث من AppGallery).
  //    النسخ القديمة من التطبيق ترسل android/ios فقط فلا تتأثر.
  if (!platform || !['android', 'ios', 'huawei'].includes(platform)) {
    return res.status(400).json({ message: 'Invalid platform. Must be "android", "ios" or "huawei"' });
  }

  try {
    // جلب البيانات من جدول app_versions (🗄️ عبر كاش قصير؛ يُبطَل فوراً عند التعديل من لوحة الأدمن)
    const { data, error } = await getAppVersionRow(platform);

    if (error) {
      // إذا لم يتم العثور على سجل للمنصة
      if (error.code === 'PGRST116') {
         return res.status(404).json({ message: 'Version info not found for this platform' });
      }
      throw error;
    }

    // إرجاع البيانات بنجاح
    return res.status(200).json(data);

  } catch (error) {
    console.error('Check version error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
