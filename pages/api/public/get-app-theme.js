// pages/api/public/get-app-theme.js
// 🎨 ألوان التطبيق المخصصة (عام — التطبيق بيطلبه عند الإقلاع قبل تسجيل الدخول).
// الرد: { success, version, colors } — colors = null معناها "استخدم الألوان الافتراضية".
// التطبيق عنده ألوان افتراضية مدمجة + كاش محلي، فأي فشل هنا مش بيأثر عليه.
import { getSettings } from '../../../lib/appSettingsCache';
import { APP_THEME_SETTING_KEY, parseStoredTheme } from '../../../lib/appThemeHelper';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const stored = await getSettings([APP_THEME_SETTING_KEY]);
    const theme = parseStoredTheme(stored[APP_THEME_SETTING_KEY]);

    // لازم التغيير (وإعادة الضبط) يوصل فوراً — لا كاش على مستوى HTTP
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      version: theme ? theme.version : 0,
      colors: theme ? theme.colors : null,
    });
  } catch (err) {
    console.error('[get-app-theme] error:', err.message);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
}
