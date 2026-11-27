// ============================================================
// 🎨 appThemeHelper.js — ألوان التطبيق (مصدر الحقيقة المشترك)
// ============================================================
// - ملف نقي (بدون supabase) فيُستورد من صفحة الداشبورد ومن الـ API.
// - القيم الافتراضية هنا = نفس ألوان التطبيق الحالية في app_colors.dart
//   (وأي تعديل للافتراضي لازم يتعمل في المكانين).
// - التخزين: صف واحد في app_settings: key = 'app_theme'
//   value = JSON { version: <timestamp>, colors: { <key>: '#RRGGBB', ... } }
//   غياب الصف = التطبيق يستخدم ألوانه الافتراضية المدمجة.
// ============================================================

export const APP_THEME_SETTING_KEY = 'app_theme';

export const APP_THEME_KEYS = [
  // ── الوضع الليلي ──
  { key: 'dark_bg_primary',     group: 'dark',  label: 'الخلفية الأساسية',   hint: 'خلفية الشاشات' },
  { key: 'dark_bg_secondary',   group: 'dark',  label: 'الخلفية الثانوية',   hint: 'الكروت والحقول' },
  { key: 'dark_text_primary',   group: 'dark',  label: 'النص الأساسي',       hint: 'العناوين والنصوص الرئيسية' },
  { key: 'dark_text_secondary', group: 'dark',  label: 'النص الفرعي',        hint: 'الوصف والنصوص الباهتة' },
  { key: 'dark_accent',         group: 'dark',  label: 'لون الأزرار والتمييز', hint: 'الأزرار والأيقونات المفعّلة' },
  // ── الوضع النهاري ──
  { key: 'light_bg_primary',     group: 'light', label: 'الخلفية الأساسية',   hint: 'خلفية الشاشات' },
  { key: 'light_bg_secondary',   group: 'light', label: 'الخلفية الثانوية',   hint: 'الكروت والحقول' },
  { key: 'light_text_primary',   group: 'light', label: 'النص الأساسي',       hint: 'العناوين والنصوص الرئيسية' },
  { key: 'light_text_secondary', group: 'light', label: 'النص الفرعي',        hint: 'الوصف والنصوص الباهتة' },
  { key: 'light_accent',         group: 'light', label: 'لون الأزرار والتمييز', hint: 'الأزرار والأيقونات المفعّلة' },
];

// ⚠️ لازم تطابق app_colors.dart (الإصدار الافتراضي المدمج في التطبيق)
export const DEFAULT_APP_THEME = {
  dark_bg_primary:     '#1A1B1E',
  dark_bg_secondary:   '#2A2B2F',
  dark_text_primary:   '#E2E8F0',
  dark_text_secondary: '#94A3B8',
  dark_accent:         '#DBA91D',
  light_bg_primary:     '#E0E5EC',
  light_bg_secondary:   '#F8F9FA',
  light_text_primary:   '#354F52',
  light_text_secondary: '#5F7D81',
  light_accent:         '#A85832',
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

/** يرجّع '#RRGGBB' بحروف كبيرة، أو null لو القيمة مش لون صالح. يقبل بدون # ونسخة الـ3 خانات. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let v = input.trim();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  if (HEX3.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  if (!HEX6.test(v)) return null;
  return v.toUpperCase();
}

/**
 * يتحقق من الألوان المرسلة ويرجّع { colors } كاملة (المفقود = الافتراضي)
 * أو { error } لو فيه لون غير صالح. المفاتيح الغريبة تُتجاهل.
 */
export function sanitizeTheme(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'صيغة الألوان غير صحيحة' };
  }
  const colors = {};
  for (const { key, label, group } of APP_THEME_KEYS) {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      colors[key] = DEFAULT_APP_THEME[key];
      continue;
    }
    const hex = normalizeHex(input[key]);
    if (!hex) {
      return { error: `لون غير صالح في "${label}" (${group === 'dark' ? 'الليلي' : 'النهاري'}): ${String(input[key]).slice(0, 20)}` };
    }
    colors[key] = hex;
  }
  return { colors };
}

/** يقرأ القيمة المخزنة (نص JSON) ويرجّع { version, colors } أو null لو غير موجودة/تالفة. */
export function parseStoredTheme(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { colors, error } = sanitizeTheme(obj?.colors);
    if (error) return null;
    return { version: Number(obj.version) || 0, colors };
  } catch (e) {
    return null;
  }
}
