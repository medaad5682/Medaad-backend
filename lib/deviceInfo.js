// ============================================================
// 📱 تفاصيل جهاز الطالب (devices.device_info - jsonb)
// ============================================================
// التطبيق يرسل deviceInfo مع طلب تسجيل الدخول (الشركة المصنعة، الموديل، رقم البناء ...).
// هذه البيانات "غير موثوقة" (جاية من العميل)، فبننضّفها قبل الحفظ:
//   - كائن فقط (مش نص/مصفوفة)، قيم بسيطة (نص/رقم/منطقي) أو كائنات/مصفوفات صغيرة
//   - حد أقصى للعمق والعدد وطول النصوص وحجم الـ JSON الكلي
//   - مفاتيح آمنة فقط (حروف إنجليزية/أرقام/شرطة سفلية)

const MAX_DEPTH = 3;
const MAX_KEYS_PER_OBJECT = 60;
const MAX_ARRAY_ITEMS = 12;
const MAX_STRING_LENGTH = 300;
const MAX_JSON_BYTES = 8 * 1024;
const SAFE_KEY = /^[A-Za-z0-9_]{1,50}$/;

function cleanValue(value, depth) {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'string') return value.trim().slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;

  if (depth >= MAX_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(v => cleanValue(v, depth + 1))
      .filter(v => v !== undefined);
  }

  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count >= MAX_KEYS_PER_OBJECT) break;
      if (!SAFE_KEY.test(k)) continue;
      const cleaned = cleanValue(v, depth + 1);
      if (cleaned === undefined) continue;
      out[k] = cleaned;
      count++;
    }
    return out;
  }

  return undefined;
}

/**
 * منصة الجهاز من بصمته: بصمة الآيفون دايماً تبدأ بـ ios،
 * أما الأندرويد فبصمته مالهاش بادئة ثابتة => أي بصمة مش بتبدأ بـ ios تعتبر أندرويد.
 */
export function detectPlatformFromFingerprint(fingerprint) {
  return String(fingerprint || '').toLowerCase().startsWith('ios') ? 'ios' : 'android';
}

/**
 * ينظّف deviceInfo القادم من التطبيق ويضيف بيانات من السيرفر.
 * يرجّع null لو مفيش بيانات صالحة (نسخة تطبيق قديمة مثلاً) فلا نكتب فوق المحفوظ.
 */
export function sanitizeDeviceInfo(raw, { fingerprint, userAgent } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const cleaned = cleanValue(raw, 0);
  if (!cleaned || Object.keys(cleaned).length === 0) return null;

  // المنصة: بصمة تبدأ بـ ios => iOS. غير كده نعتمد على اللي أرسله التطبيق (ios/android)
  // وإلا فأندرويد (حالة البصمة الاحتياطية fallback_ على آيفون يصححها ما يرسله التطبيق).
  const clientPlatform = String(cleaned.platform || '').toLowerCase();
  cleaned.platform = detectPlatformFromFingerprint(fingerprint) === 'ios'
    ? 'ios'
    : (clientPlatform === 'ios' ? 'ios' : 'android');

  // بيانات يضيفها السيرفر
  cleaned.server = {
    user_agent: String(userAgent || '').slice(0, MAX_STRING_LENGTH) || null,
    collected_at: new Date().toISOString(),
  };

  // حد أقصى لحجم الـ JSON الكلي (حماية من تضخم الجدول)
  if (Buffer.byteLength(JSON.stringify(cleaned), 'utf8') > MAX_JSON_BYTES) return null;

  return cleaned;
}
