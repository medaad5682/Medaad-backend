// ============================================================
// ⚙️ appSettingsCache.js — كاش إعدادات app_settings (مفاتيح مسموحة فقط)
// ============================================================
// - يُكاش فقط المفاتيح الموجودة في CACHE_SETTINGS_KEYS
//   (الافتراضي: support_whatsapp, support_telegram, offline_mode, player_settings).
// - أي مفتاح آخر (مثل free_mode) يُقرأ من الداتابيز في كل مرة كما كان دائماً،
//   ولا يدخل الذاكرة أبداً.
// - المدة: CACHE_SETTINGS_TTL_SEC (الافتراضي 300 ثانية، 0 = إيقاف).
// - المفتاح الرئيسي DISABLE_AUTH_CACHE=true يوقف الكاش بالكامل.
// - عند حفظ الإعدادات من لوحة الأدمن يُستدعى invalidateAppSettings() فيتحدّث فوراً.
// ============================================================

import { supabase } from './supabaseClient';
import { getCacheConfig, getGlobalState, isCacheActive, bump, singleFlight } from './cacheConfig';

const STATE_KEY = 'settings';

function getEntry() {
  const st = getGlobalState();
  if (!st.caches[STATE_KEY]) st.caches[STATE_KEY] = { map: null, expiresAt: 0, epoch: 0 };
  return st.caches[STATE_KEY];
}

function isCacheableKey(key) {
  return getCacheConfig().settingsKeys.includes(key);
}

async function loadCachedKeys() {
  const cfg = getCacheConfig();
  const entry = getEntry();

  if (entry.map && entry.expiresAt > Date.now()) {
    bump('settings_hit');
    return entry.map;
  }

  bump('settings_miss');
  return singleFlight('settings:all', async () => {
    const epochBefore = entry.epoch;
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', cfg.settingsKeys);

    if (error) return null; // نفس سلوك الكود القديم: الخطأ = لا قيمة (لا نحدّث الكاش)

    const map = new Map((data || []).map(r => [r.key, r.value]));
    // لو حصل invalidate أثناء التحميل لا نحفظ النتيجة القديمة
    if (entry.epoch === epochBefore) {
      entry.map = map;
      entry.expiresAt = Date.now() + cfg.settingsTtlSec * 1000;
    }
    return map;
  });
}

async function readDirect(keys) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys);
  if (error || !data) return {};
  const out = {};
  data.forEach(r => { out[r.key] = r.value; });
  return out;
}

/**
 * يرجّع كائن { key: value } للمفاتيح الموجودة فقط.
 * @param {string[]} keys
 */
export async function getSettings(keys) {
  const cfg = getCacheConfig();
  const out = {};

  const cacheOn = isCacheActive(cfg.settingsTtlSec);
  const cacheable = cacheOn ? keys.filter(isCacheableKey) : [];
  const direct = keys.filter(key => !cacheable.includes(key));

  if (cacheable.length > 0) {
    const map = await loadCachedKeys();
    if (map) {
      cacheable.forEach(key => { if (map.has(key)) out[key] = map.get(key); });
    }
  }

  if (direct.length > 0) {
    Object.assign(out, await readDirect(direct));
  }
  return out;
}

/** قيمة مفتاح واحد (أو null لو غير موجود). */
export async function getSetting(key) {
  const all = await getSettings([key]);
  return all[key] !== undefined ? all[key] : null;
}

/** يمسح كاش الإعدادات فوراً (يُستدعى بعد حفظ الإعدادات). */
export function invalidateAppSettings() {
  const entry = getEntry();
  entry.map = null;
  entry.expiresAt = 0;
  // نرفع epoch حتى لا تُحفظ نتيجة تحميل بدأ قبل الحفظ
  entry.epoch += 1;
  bump('invalidate_settings');
}
