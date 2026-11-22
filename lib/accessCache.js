// ============================================================
// 🗄️ accessCache.js — كاش المصادقة وصلاحيات المحتوى (داخل ذاكرة الـ process)
// ============================================================
// الهدف: تقليل قراءات users / user_course_access / user_subject_access / subjects
// المتكررة، مع الحفاظ على الأمان. التحكم الكامل في cacheConfig.js (متغيرات البيئة).
//
// القواعد الأمنية (مهمة — لا تُكسر):
//  1) الكاش يتملي من قراءة جديدة من الداتابيز فقط (الداتابيز هي المصدر الوحيد للحقيقة).
//  2) الإيجابي فقط يُصدَّق من الكاش. أي رفض يُتأكد منه من الداتابيز قبل تنفيذه
//     (فالشراء/المنح الجديد يشتغل فوراً ولا يوجد false-deny بسبب الكاش).
//  3) صلاحية الاشتراك تُحسب لحظة الفحص من expires_at المحفوظ، فالاشتراك المنتهي
//     لا يُسمح به حتى لو الصف ما زال في الكاش.
//  4) مفاتيح كاش المستخدم/الاشتراكات = userId القادم من JWT موقّع فقط.
//  5) أي إبطال (invalidate...) أثناء تحميل جارٍ يمنع حفظ نتيجة التحميل القديمة.
//  6) فشل قراءة الصلاحيات = رفض (fail closed).
// ============================================================

import { supabase } from './supabaseClient';
import { isAccessRowActive } from './accessExpiryHelper';
import {
  getCacheConfig,
  getGlobalState,
  isCacheActive,
  bump,
  singleFlight,
  ensureStatsLogger,
  TtlLruCache,
} from './cacheConfig';

const USER_SELECT =
  'id, first_name, username, role, teacher_profile_id, created_at, is_admin, jwt_token, is_blocked, devices(fingerprint)';

// الحقول المسموح بتخزينها من صف المستخدم (لا نخزن phone/email/password.. أبداً)
const USER_ROW_FIELDS = [
  'id', 'first_name', 'username', 'role', 'teacher_profile_id',
  'created_at', 'is_admin', 'jwt_token', 'is_blocked', 'devices',
];

function pickUserRow(row) {
  if (!row) return null;
  const out = {};
  for (const f of USER_ROW_FIELDS) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

// ------------------------------------------------------------
// 🧱 إنشاء الكاشات (مرة واحدة لكل process)
// ------------------------------------------------------------
function getCache(name, max, ttlSec) {
  const state = getGlobalState();
  if (!state.caches[name]) {
    state.caches[name] = new TtlLruCache({ max, ttlMs: ttlSec * 1000 });
  }
  return state.caches[name];
}

function userCache() {
  const c = getCacheConfig();
  return getCache('user', c.userMax, c.userTtlSec || 1);
}
function accessCache() {
  const c = getCacheConfig();
  return getCache('access', c.accessMax, c.accessTtlSec || 1);
}
function subjectCourseCache() {
  const c = getCacheConfig();
  return getCache('subjectCourse', c.subjectCourseMax, c.subjectCourseTtlSec || 1);
}

const userCacheOn = () => isCacheActive(getCacheConfig().userTtlSec);
const accessCacheOn = () => isCacheActive(getCacheConfig().accessTtlSec);
const subjectCourseCacheOn = () => isCacheActive(getCacheConfig().subjectCourseTtlSec);

const k = (v) => String(v);

// ------------------------------------------------------------
// 🔁 تتبّع الإبطال (يمنع حفظ نتيجة تحميل بدأت قبل الإبطال)
// ------------------------------------------------------------
export function getInvalidationSeq() {
  return getGlobalState().seq;
}

function wasInvalidatedSince(userId, seqBefore) {
  const st = getGlobalState();
  if (st.globalClearSeq > seqBefore) return true;
  const last = st.lastInvalidation.get(k(userId));
  return last !== undefined && last > seqBefore;
}

function markInvalidated(userId) {
  const st = getGlobalState();
  st.seq += 1;
  st.lastInvalidation.set(k(userId), st.seq);
  // تنظيف بسيط حتى لا تكبر الخريطة
  if (st.lastInvalidation.size > 20000) {
    const firstKey = st.lastInvalidation.keys().next().value;
    st.lastInvalidation.delete(firstKey);
  }
}

// ------------------------------------------------------------
// 👤 صف المستخدم
// ------------------------------------------------------------
/**
 * @returns {Promise<{ data: object|null, error: any, fromCache: boolean }>}
 */
export async function getUserRow(userId, { fresh = false } = {}) {
  ensureStatsLogger();
  const id = k(userId);

  if (!fresh && userCacheOn()) {
    const hit = userCache().get(id);
    if (hit) {
      bump('user_hit');
      return { data: hit, error: null, fromCache: true };
    }
  }

  bump(fresh ? 'user_fresh' : 'user_miss');
  const flightKey = `user:${fresh ? 'fresh:' : ''}${id}`;

  const result = await singleFlight(flightKey, async () => {
    const seqBefore = getInvalidationSeq();
    const { data, error } = await supabase
      .from('users')
      .select(USER_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (!error) {
      if (data && userCacheOn() && !wasInvalidatedSince(id, seqBefore)) {
        userCache().set(id, pickUserRow(data));
      } else if (!data) {
        userCache().delete(id);
      }
    }
    return { data: data || null, error: error || null };
  });

  return { ...result, fromCache: false };
}

// ------------------------------------------------------------
// 🎫 صفوف اشتراك الطالب (الخام، بما فيها المنتهية)
// ------------------------------------------------------------
function buildAccessEntry(courses, subjects) {
  const courseRows = courses || [];
  const subjectRows = subjects || [];
  return {
    courses: courseRows,
    subjects: subjectRows,
    courseMap: new Map(courseRows.map(r => [k(r.course_id), r])),
    subjectMap: new Map(subjectRows.map(r => [k(r.subject_id), r])),
  };
}

/**
 * @returns {Promise<{ rows: {courses, subjects, courseMap, subjectMap}|null, error: any, fromCache: boolean }>}
 */
export async function getAccessRows(userId, { fresh = false } = {}) {
  ensureStatsLogger();
  const id = k(userId);

  if (!fresh && accessCacheOn()) {
    const hit = accessCache().get(id);
    if (hit) {
      bump('access_hit');
      return { rows: hit, error: null, fromCache: true };
    }
  }

  bump(fresh ? 'access_fresh' : 'access_miss');
  const flightKey = `rows:${fresh ? 'fresh:' : ''}${id}`;

  const result = await singleFlight(flightKey, async () => {
    const seqBefore = getInvalidationSeq();
    const [c, s] = await Promise.all([
      supabase.from('user_course_access').select('course_id, granted_at, expires_at').eq('user_id', userId),
      supabase.from('user_subject_access').select('subject_id, granted_at, expires_at').eq('user_id', userId),
    ]);

    if (c.error || s.error) {
      return { rows: null, error: c.error || s.error };
    }

    const entry = buildAccessEntry(c.data, s.data);
    if (accessCacheOn() && !wasInvalidatedSince(id, seqBefore)) {
      accessCache().set(id, entry);
    }
    return { rows: entry, error: null };
  });

  return { ...result, fromCache: false };
}

// ------------------------------------------------------------
// 🔗 مادة ← كورس (بيانات هيكلية عامة، ليست خاصة بأي مستخدم)
// ------------------------------------------------------------
/**
 * @returns {Promise<{ courseId: any|null, error: any, fromCache: boolean }>}
 */
export async function getSubjectCourseId(subjectId, { fresh = false } = {}) {
  ensureStatsLogger();
  const id = k(subjectId);

  if (!fresh && subjectCourseCacheOn()) {
    const hit = subjectCourseCache().get(id);
    if (hit !== undefined) {
      bump('subject_course_hit');
      return { courseId: hit, error: null, fromCache: true };
    }
  }

  bump(fresh ? 'subject_course_fresh' : 'subject_course_miss');
  const flightKey = `sc:${fresh ? 'fresh:' : ''}${id}`;

  const result = await singleFlight(flightKey, async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('course_id')
      .eq('id', subjectId)
      .maybeSingle();

    const courseId = data?.course_id ?? null;
    // نخزّن الموجود فقط (لا نخزّن "غير موجود" حتى لا تلوّث الكاش معرفات عشوائية)
    if (!error && courseId !== null && subjectCourseCacheOn()) {
      subjectCourseCache().set(id, courseId);
    }
    return { courseId, error: error || null };
  });

  return { ...result, fromCache: false };
}

// ------------------------------------------------------------
// ✅ فحص صلاحية مادة (بنفس منطق authHelper القديم و get-subject-content)
// ------------------------------------------------------------
function evaluateAccess(rows, subjectId, courseId) {
  let expired = false;

  // 1) اشتراك الكورس
  if (courseId !== null && courseId !== undefined) {
    const row = rows.courseMap.get(k(courseId));
    if (row) {
      if (isAccessRowActive(row)) return { ok: true, expired: false, type: 'COURSE_ACCESS' };
      expired = true;
    }
  }

  // 2) اشتراك المادة المنفصل
  const subRow = rows.subjectMap.get(k(subjectId));
  if (subRow) {
    if (isAccessRowActive(subRow)) return { ok: true, expired: false, type: 'SUBJECT_ACCESS' };
    expired = true;
  }

  return { ok: false, expired, type: 'NONE' };
}

/**
 * @param {string|number} userId  (من JWT موقّع فقط)
 * @param {string|number} subjectId
 * @returns {Promise<{ ok: boolean, expired: boolean, type: string, courseId: any, error?: any }>}
 */
export async function checkSubjectAccess(userId, subjectId) {
  // 1) المادة ← الكورس
  const sc = await getSubjectCourseId(subjectId);
  let courseId = sc.error ? null : sc.courseId;

  // 2) صفوف الطالب
  const rr = await getAccessRows(userId);
  if (rr.error || !rr.rows) {
    // fail closed
    return { ok: false, expired: false, type: 'NONE', courseId, error: rr.error || new Error('access rows unavailable') };
  }

  let result = evaluateAccess(rr.rows, subjectId, courseId);
  if (result.ok) return { ...result, courseId };

  // 3) رفض: لا نثق في الكاش. نعيد التحقق من الداتابيز قبل الرفض النهائي.
  let rows = rr.rows;
  if (rr.fromCache) {
    const fresh = await getAccessRows(userId, { fresh: true });
    if (fresh.error || !fresh.rows) {
      return { ok: false, expired: false, type: 'NONE', courseId, error: fresh.error || new Error('access rows unavailable') };
    }
    rows = fresh.rows;
  }
  if (sc.fromCache) {
    const freshSc = await getSubjectCourseId(subjectId, { fresh: true });
    if (!freshSc.error) courseId = freshSc.courseId;
  }

  result = evaluateAccess(rows, subjectId, courseId);
  return { ...result, courseId };
}

// ------------------------------------------------------------
// 🔥 تسخين الكاش من get-app-init-data (القراءة هناك تأتي من الداتابيز دائماً)
// ------------------------------------------------------------
/**
 * @param {object} p
 * @param {number} p.seqBefore  قيمة getInvalidationSeq() قبل قراءة init من الداتابيز
 * @param {object} p.userRow    صف المستخدم (بعد التحقق من الحظر والتوكن)
 * @param {Array}  p.courseRows صفوف user_course_access الخام (course_id, granted_at, expires_at)
 * @param {Array}  p.subjectRows صفوف user_subject_access الخام (subject_id, granted_at, expires_at)
 * @param {Array}  p.subjectCourseEntries [[subjectId, courseId], ...]
 */
export function warmFromInit({ seqBefore, userRow, courseRows, subjectRows, subjectCourseEntries }) {
  try {
    const uid = userRow?.id;
    if (uid === undefined || uid === null) return;
    if (wasInvalidatedSince(uid, seqBefore)) return;

    if (userCacheOn() && userRow.devices !== undefined) {
      userCache().set(k(uid), pickUserRow(userRow));
    }

    if (accessCacheOn()) {
      const cleanCourses = (courseRows || []).map(r => ({
        course_id: r.course_id, granted_at: r.granted_at, expires_at: r.expires_at,
      }));
      const cleanSubjects = (subjectRows || []).map(r => ({
        subject_id: r.subject_id, granted_at: r.granted_at, expires_at: r.expires_at,
      }));
      accessCache().set(k(uid), buildAccessEntry(cleanCourses, cleanSubjects));
    }

    if (subjectCourseCacheOn()) {
      const sc = subjectCourseCache();
      for (const entry of subjectCourseEntries || []) {
        const [sid, cid] = entry;
        if (sid !== undefined && sid !== null && cid !== undefined && cid !== null) {
          sc.set(k(sid), cid);
        }
      }
    }
    bump('warm_from_init');
  } catch (e) {
    // التسخين تحسين فقط، ولا يجب أن يكسر init أبداً
    console.error('⚠️ [AuthCache] warmFromInit failed (ignored):', e.message);
  }
}

// ------------------------------------------------------------
// 🧹 الإبطال (Hooks) — تُستدعى بعد أي تعديل أمني (حظر، سحب اشتراك، تسجيل دخول/خروج...)
// ------------------------------------------------------------
/** يبطل صف المستخدم + صفوف اشتراكه. يقبل id أو مصفوفة ids. */
export function invalidateUserCaches(idOrIds) {
  try {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    for (const raw of ids) {
      if (raw === undefined || raw === null || raw === '') continue;
      const id = k(raw);
      markInvalidated(id);
      const st = getGlobalState();
      st.caches.user?.delete(id);
      st.caches.access?.delete(id);
    }
    bump('invalidate_user');
  } catch (e) {
    console.error('⚠️ [AuthCache] invalidateUserCaches failed (ignored):', e.message);
  }
}

/** يبطل صفوف الاشتراك لكل الطلاب (مثلاً بعد حذف كورس أو سحب اشتراك جماعي). */
export function invalidateAllAccessCaches() {
  try {
    const st = getGlobalState();
    st.seq += 1;
    st.globalClearSeq = st.seq;
    st.caches.access?.clear();
    bump('invalidate_all_access');
  } catch (e) {
    console.error('⚠️ [AuthCache] invalidateAllAccessCaches failed (ignored):', e.message);
  }
}

/** يبطل كل شيء (المستخدمين + الاشتراكات + مادة←كورس). */
export function invalidateAllAuthCaches() {
  try {
    const st = getGlobalState();
    st.seq += 1;
    st.globalClearSeq = st.seq;
    st.caches.user?.clear();
    st.caches.access?.clear();
    st.caches.subjectCourse?.clear();
    bump('invalidate_all');
  } catch (e) {
    console.error('⚠️ [AuthCache] invalidateAllAuthCaches failed (ignored):', e.message);
  }
}
