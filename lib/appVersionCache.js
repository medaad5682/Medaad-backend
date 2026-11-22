// ============================================================
// 📱 appVersionCache.js — كاش قصير لـ check-version (جدول app_versions)
// ============================================================
// - بيانات عامة (نفس الصف لكل مستخدمي المنصة)، لا تخص أي مستخدم.
// - يُكاش الرد الناجح فقط (صف موجود). "غير موجود" والأخطاء لا تُكاش أبداً،
//   فصف منصة جديد (مثل huawei) يظهر فوراً.
// - المفتاح = المنصة (android / ios / huawei فقط؛ check-version يرفض أي قيمة أخرى
//   قبل الوصول هنا، فلا يمكن تلويث الكاش بمفاتيح عشوائية).
// - المدة: CACHE_VERSION_TTL_SEC (الافتراضي 60 ثانية، 0 = إيقاف).
// - المفتاح الرئيسي DISABLE_AUTH_CACHE=true يوقفه تماماً.
// - عند التعديل من لوحة الأدمن (app-versions.js) يُستدعى invalidateAppVersions()
//   فيظهر التحديث الإجباري/الإصدار الجديد فوراً.
// ============================================================

import { supabase } from './supabaseClient';
import { TtlLruCache, getCacheConfig, getGlobalState, isCacheActive, bump, singleFlight } from './cacheConfig';

function state() {
  const st = getGlobalState();
  if (!st.caches.versions) {
    st.caches.versions = {
      map: new TtlLruCache({ max: 10, ttlMs: Math.max(1, getCacheConfig().versionTtlSec) * 1000 }),
      epoch: 0,
    };
  }
  return st.caches.versions;
}

/**
 * نفس شكل نتيجة supabase `.single()`: { data, error }.
 * يرجّع الصف من الكاش لو موجود، وإلا يقرأ من الداتابيز (ويحفظ لو نجح).
 * @param {'android'|'ios'|'huawei'} platform
 */
export async function getAppVersionRow(platform) {
  const cfg = getCacheConfig();
  const on = isCacheActive(cfg.versionTtlSec);
  const st = state();

  if (on) {
    const hit = st.map.get(platform);
    if (hit) {
      bump('version_hit');
      return { data: { ...hit }, error: null };
    }
  }

  bump('version_miss');
  return singleFlight(`version:${platform}`, async () => {
    const epochBefore = st.epoch;
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('platform', platform)
      .single();

    if (!error && data && on && st.epoch === epochBefore) {
      st.map.set(platform, data);
    }
    return { data, error };
  });
}

/** يمسح كاش النسخ فوراً (يُستدعى بعد تعديل أو إنشاء صف في app_versions). */
export function invalidateAppVersions() {
  const st = state();
  st.map.clear();
  st.epoch += 1;
  bump('invalidate_versions');
}
