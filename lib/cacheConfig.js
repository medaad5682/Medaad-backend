// ============================================================
// ⚙️ cacheConfig.js — التحكم المركزي في كاش المصادقة والصلاحيات
// ============================================================
// كل التحكم عن طريق متغيرات البيئة (.env). أي تغيير يحتاج إعادة تشغيل:
//     pm2 restart <app-name> --update-env
//
//  ┌─────────────────────────────────────┬──────────┬───────────────────────────────────────────────┐
//  │ المتغير                             │ الافتراضي│ المعنى                                        │
//  ├─────────────────────────────────────┼──────────┼───────────────────────────────────────────────┤
//  │ DISABLE_AUTH_CACHE                  │ (فارغ)   │ true => إيقاف كل الكاشات فوراً (رجوع للسلوك   │
//  │                                     │          │ القديم: كل طلب يقرأ من الداتابيز)             │
//  │ CACHE_USER_TTL_SEC                  │ 30       │ مدة كاش صف المستخدم (ثواني). 0 = إيقاف        │
//  │ CACHE_ACCESS_TTL_SEC                │ 60       │ مدة كاش صفوف اشتراك الطالب. 0 = إيقاف         │
//  │ CACHE_SUBJECT_COURSE_TTL_SEC        │ 120      │ مدة كاش (مادة ← كورس). 0 = إيقاف              │
//  │ CACHE_SETTINGS_TTL_SEC              │ 300      │ مدة كاش app_settings. 0 = إيقاف               │
//  │ CACHE_VERSION_TTL_SEC               │ 60       │ مدة كاش check-version (app_versions). 0 = إيقاف│
//  │ CACHE_USER_MAX                      │ 5000     │ أقصى عدد مستخدمين في الكاش                    │
//  │ CACHE_ACCESS_MAX                    │ 5000     │ أقصى عدد طلاب (صفوف اشتراك) في الكاش          │
//  │ CACHE_SUBJECT_COURSE_MAX            │ 20000    │ أقصى عدد مواد في الكاش                        │
//  │ CACHE_SETTINGS_KEYS                 │ (أدناه)  │ المفاتيح المسموح كاشها من app_settings        │
//  │ CACHE_STATS_LOG_SEC                 │ 0        │ N > 0 => طباعة إحصائيات hit/miss كل N ثانية   │
//  └─────────────────────────────────────┴──────────┴───────────────────────────────────────────────┘
//
//  🔒 مفاتيح app_settings غير الموجودة في CACHE_SETTINGS_KEYS (مثل free_mode)
//     لا تُكاش أبداً، وتُقرأ من الداتابيز في كل مرة كما كانت.
// ============================================================

const DEFAULT_SETTINGS_KEYS = ['support_whatsapp', 'support_telegram', 'offline_mode', 'player_settings'];

function readInt(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

/** الكاش بالكامل مُعطّل؟ (المفتاح الرئيسي) */
export function isAuthCacheDisabled() {
  const v = String(process.env.DISABLE_AUTH_CACHE || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** هل كاش معيّن شغال؟ (المفتاح الرئيسي + مدة > 0) */
export function isCacheActive(ttlSec) {
  return !isAuthCacheDisabled() && ttlSec > 0;
}

export function getCacheConfig() {
  const settingsKeysRaw = String(process.env.CACHE_SETTINGS_KEYS || '').trim();
  return {
    disabled: isAuthCacheDisabled(),
    userTtlSec: readInt('CACHE_USER_TTL_SEC', 90),
    accessTtlSec: readInt('CACHE_ACCESS_TTL_SEC', 90),
    subjectCourseTtlSec: readInt('CACHE_SUBJECT_COURSE_TTL_SEC', 300),
    settingsTtlSec: readInt('CACHE_SETTINGS_TTL_SEC', 300),
    versionTtlSec: readInt('CACHE_VERSION_TTL_SEC', 300),
    userMax: Math.max(1, readInt('CACHE_USER_MAX', 5000)),
    accessMax: Math.max(1, readInt('CACHE_ACCESS_MAX', 5000)),
    subjectCourseMax: Math.max(1, readInt('CACHE_SUBJECT_COURSE_MAX', 20000)),
    settingsKeys: settingsKeysRaw
      ? settingsKeysRaw.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_SETTINGS_KEYS,
    statsLogSec: readInt('CACHE_STATS_LOG_SEC', 300),
  };
}

// ------------------------------------------------------------
// 📊 حالة عامة مشتركة بين كل الـ routes (وتنجو من الـ hot reload)
// ------------------------------------------------------------
const GLOBAL_KEY = '__medaadAuthCacheState__';

export function getGlobalState() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      caches: {},            // name -> LRUCache
      inflight: new Map(),   // key -> Promise (single-flight)
      stats: {},             // counter -> number
      seq: 0,                // يزيد مع كل إبطال (لمنع كتابة نتيجة قديمة بعد الإبطال)
      lastInvalidation: new Map(), // userId -> seq
      globalClearSeq: 0,
      statsTimer: null,
    };
  }
  return globalThis[GLOBAL_KEY];
}

export function bump(counter, n = 1) {
  const st = getGlobalState().stats;
  st[counter] = (st[counter] || 0) + n;
}

export function getCacheStats() {
  return { ...getGlobalState().stats };
}

export function resetCacheStats() {
  const st = getGlobalState();
  st.stats = {};
  st.statsSnapshot = {};
}

/**
 * نسبة الـ hit لكل كاش: hit / (hit + miss)
 * (عدّاد *_fresh لا يدخل في النسبة لأنه قراءة إجبارية من الداتابيز بعد رفض الكاش، يُعرض ضمن الأعداد فقط)
 */
function formatHitRates(s) {
  const bases = new Set();
  for (const key of Object.keys(s)) {
    if (key.endsWith('_hit')) bases.add(key.slice(0, -4));
    else if (key.endsWith('_miss')) bases.add(key.slice(0, -5));
  }
  const parts = [];
  for (const base of bases) {
    const hit = s[`${base}_hit`] || 0;
    const miss = s[`${base}_miss`] || 0;
    const total = hit + miss;
    if (total === 0) continue;
    parts.push(`${base} ${Math.round((hit / total) * 100)}% (${hit}/${total})`);
  }
  return parts.length ? parts.join(' | ') : 'لا توجد قراءات';
}

/** يبدأ طباعة الإحصائيات الدورية (مرة واحدة فقط) لو CACHE_STATS_LOG_SEC > 0
 *  كل طباعة = سطرين: (1) آخر فترة فقط  (2) التراكمي منذ بدء الـ instance — ومع كل سطر نسب الـ hit */
export function ensureStatsLogger() {
  const cfg = getCacheConfig();
  const state = getGlobalState();
  if (cfg.statsLogSec <= 0 || state.statsTimer) return;
  state.statsTimer = setInterval(() => {
    const s = state.stats;
    if (Object.keys(s).length === 0) return;

    // الفرق منذ آخر طباعة (Math.max تحسباً لو اتنادى resetCacheStats)
    const snap = state.statsSnapshot || {};
    const delta = {};
    for (const key of Object.keys(s)) {
      const d = Math.max(0, (s[key] || 0) - (snap[key] || 0));
      if (d > 0) delta[key] = d;
    }
    state.statsSnapshot = { ...s };

    // لا نشاط في آخر فترة => لا داعي للطباعة
    if (Object.keys(delta).length === 0) return;

    const off = `disabled=${isAuthCacheDisabled()}`;
    console.log(`📊 [AuthCache] آخر ${cfg.statsLogSec}s ${JSON.stringify(delta)} || ${formatHitRates(delta)} | ${off}`);
    console.log(`📈 [AuthCache] تراكمي (منذ ${Math.round(process.uptime() / 60)}m) ${JSON.stringify(s)} || ${formatHitRates(s)} | ${off}`);
  }, cfg.statsLogSec * 1000);
  if (typeof state.statsTimer.unref === 'function') state.statsTimer.unref();
}

/**
 * single-flight: لو في طلب جاري لنفس المفتاح، ننتظر نتيجته بدل ما نبدأ طلب جديد.
 * الخطوتان (has + set) متتاليتان بدون await بينهما، فلا يمكن لطلبين بدء نفس المفتاح.
 */
export function singleFlight(key, loader) {
  const { inflight } = getGlobalState();
  const existing = inflight.get(key);
  if (existing) {
    bump('inflight_joined');
    return existing;
  }
  const p = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

// ------------------------------------------------------------
// 🧱 كاش بسيط (LRU + TTL) بدون أي مكتبة خارجية
// ------------------------------------------------------------
export class TtlLruCache {
  constructor({ max, ttlMs }) {
    this.max = Math.max(1, max);
    this.ttlMs = Math.max(1, ttlMs);
    this.map = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // تحديث الأحدثية (LRU): نعيد إدراج المفتاح في آخر الخريطة
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (value === undefined) {
      this.map.delete(key);
      return;
    }
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}
