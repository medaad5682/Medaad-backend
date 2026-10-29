// pages/api/dashboard/super/app-versions.js
// ------------------------------------------------------------------
// التحكم في إصدارات التطبيق لكل منصة: android / ios / huawei (AppGallery).
//   GET  : كل الصفوف
//   PUT  : تعديل صف (نفس الحقول لكل المنصات)
//   POST : إنشاء صف منصة مفقودة (مثلاً huawei) من لوحة التحكم بدون SQL
// السوبر أدمن فقط (كان هذا المسار بلا حماية سابقاً).
// ------------------------------------------------------------------
import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

const PLATFORMS = ['android', 'ios', 'huawei'];
const VERSION_REGEX = /^\d+(\.\d+){0,3}$/;
const URL_REGEX = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i; // أي سكيم (https / market / appmarket ...)
const DEFAULT_MESSAGE = 'يوجد تحديث جديد يتضمن تحسينات.';

function validateFields({ min_version, latest_version, store_url }) {
  if (min_version !== undefined && !VERSION_REGEX.test(String(min_version).trim())) {
    return 'الحد الأدنى للإصدار غير صالح (مثال: 2.2.1)';
  }
  if (latest_version !== undefined && !VERSION_REGEX.test(String(latest_version).trim())) {
    return 'رقم الإصدار الحالي غير صالح (مثال: 2.2.1)';
  }
  if (store_url !== undefined && store_url !== null && String(store_url).trim() !== '' && !URL_REGEX.test(String(store_url).trim())) {
    return 'رابط المتجر غير صالح (يجب أن يبدأ بـ https:// أو ما يماثله)';
  }
  return null;
}

export default async function handler(req, res) {
  // 1. التحقق من الصلاحية (سوبر أدمن فقط)
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return;

  // 2. جلب البيانات (GET)
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .order('platform'); // ترتيب حسب المنصة (android ثم huawei ثم ios)

      if (error) throw error;
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // 3. تحديث البيانات (PUT)
  if (req.method === 'PUT') {
    const { id, min_version, latest_version, force_update, message, store_url } = req.body;

    if (!id) return res.status(400).json({ error: 'معرّف الصف مطلوب' });

    const validationError = validateFields({ min_version, latest_version, store_url });
    if (validationError) return res.status(400).json({ error: validationError });

    try {
      const { data, error } = await supabase
        .from('app_versions')
        .update({
          min_version: min_version !== undefined ? String(min_version).trim() : undefined,
          latest_version: latest_version !== undefined ? String(latest_version).trim() : undefined,
          force_update,
          message,
          store_url: typeof store_url === 'string' ? store_url.trim() : store_url,
          updated_at: new Date(),
        })
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ error: 'الصف غير موجود' });
      return res.status(200).json(data[0]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // 4. إنشاء صف منصة مفقودة (POST) - بديل تشغيل SQL يدوياً
  if (req.method === 'POST') {
    const { platform } = req.body || {};

    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'منصة غير صالحة' });
    }

    try {
      // لا ننشئ صفاً مكرراً (check-version يتوقع صفاً واحداً لكل منصة)
      const { data: existing, error: existingError } = await supabase
        .from('app_versions')
        .select('*')
        .eq('platform', platform)
        .limit(1);

      if (existingError) throw existingError;
      if (existing && existing.length > 0) return res.status(200).json(existing[0]);

      // latest_version = 0.0.0 => لا يظهر أي تحديث لأحد حتى يضبطها المدير
      const { data, error } = await supabase
        .from('app_versions')
        .insert({
          platform,
          min_version: '0.0.0',
          latest_version: '0.0.0',
          force_update: false,
          message: DEFAULT_MESSAGE,
          store_url: '',
          updated_at: new Date(),
        })
        .select();

      if (error) throw error;
      return res.status(200).json(data[0]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
