// pages/api/dashboard/super/app-theme.js
// 🎨 التحكم في ألوان التطبيق (سوبر أدمن فقط)
//   GET    → الألوان الحالية (المخصصة أو الافتراضية) + الافتراضي
//   POST   → حفظ الألوان { colors: { dark_bg_primary: '#RRGGBB', ... } }
//   DELETE → إعادة الألوان للوضع الافتراضي (يحذف الصف، فالتطبيق يرجع لألوانه المدمجة)
// ملاحظة: مستقل عن /settings عمداً — ذاك الـ POST يعمل upsert لمفاتيحه كلها
// بقيمة فارغة لو غابت، فمش هنخلط مفتاحنا معاه.
import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { invalidateAppSettings } from '../../../../lib/appSettingsCache';
import {
  APP_THEME_SETTING_KEY,
  DEFAULT_APP_THEME,
  APP_THEME_KEYS,
  parseStoredTheme,
  sanitizeTheme,
} from '../../../../lib/appThemeHelper';

export default async function handler(req, res) {
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return;

  // ── GET ──────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', APP_THEME_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;

      const theme = parseStoredTheme(data?.value);
      return res.status(200).json({
        is_custom: !!theme,
        version: theme ? theme.version : 0,
        colors: theme ? theme.colors : { ...DEFAULT_APP_THEME },
        defaults: DEFAULT_APP_THEME,
        keys: APP_THEME_KEYS,
      });
    } catch (err) {
      console.error('Get app theme error:', err);
      return res.status(500).json({ error: 'فشل جلب ألوان التطبيق' });
    }
  }

  // ── POST (حفظ) ───────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { colors, error: validationError } = sanitizeTheme(req.body?.colors);
      if (validationError) return res.status(400).json({ error: validationError });

      const version = Date.now();
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          [{ key: APP_THEME_SETTING_KEY, value: JSON.stringify({ version, colors }) }],
          { onConflict: 'key' }
        );
      if (error) throw error;

      invalidateAppSettings();
      return res.status(200).json({ success: true, message: 'تم حفظ ألوان التطبيق', version, colors });
    } catch (err) {
      console.error('Save app theme error:', err);
      return res.status(500).json({ error: 'فشل حفظ ألوان التطبيق' });
    }
  }

  // ── DELETE (إعادة للافتراضي) ─────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('app_settings')
        .delete()
        .eq('key', APP_THEME_SETTING_KEY);
      if (error) throw error;

      invalidateAppSettings();
      return res.status(200).json({
        success: true,
        message: 'تمت إعادة الألوان للوضع الافتراضي',
        colors: { ...DEFAULT_APP_THEME },
      });
    } catch (err) {
      console.error('Reset app theme error:', err);
      return res.status(500).json({ error: 'فشل إعادة الألوان للافتراضي' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
