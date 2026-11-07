import { supabase } from './supabaseClient';
import { buildGrantTimestamps, isExemptFromExpiry } from './accessExpiryHelper';

// ============================================================
// 🎁 Auto-enroll helper (التفعيل التلقائي للحسابات الجديدة)
// ============================================================
// السوبر أدمن يختار من صفحة "إعدادات المنصة" كورسات و/أو مواد، فيتم منحها
// تلقائياً لكل حساب طالب جديد لحظة إنشائه.
//
// ✅ بدون أي تعديل على قاعدة البيانات: الإعداد يُخزَّن كصف جديد (key/value)
//    في جدول app_settings الموجود بالفعل، تماماً مثل free_mode و player_settings.
//    والمنح نفسه يُكتب في الجدولين الموجودين user_course_access و
//    user_subject_access بنفس الأعمدة المستخدمة في باقي النظام.
//
// ⏳ مدة الصلاحية: نستخدم buildGrantTimestamps() — نفس الدالة المستخدمة في
//    الموافقة على الطلبات والتفعيل المجاني — فيُحسب expires_at من
//    access_duration_days الخاصة بالكورس (أو المادة إن كان لها override)
//    لحظة إنشاء الحساب. وإن لم تُحدَّد مدة => وصول مدى الحياة (السلوك الحالي).
//    الكرون expire-student-access يحذف الصف عند انتهائه، ولا يُعاد المنح
//    (لأن التفعيل التلقائي يحدث مرة واحدة فقط عند إنشاء الحساب).
// ============================================================

export const AUTO_ENROLL_KEY = 'auto_enroll_config';

export function defaultAutoEnrollConfig() {
  return { enabled: false, course_ids: [], subject_ids: [] };
}

function uniqueIds(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (raw === null || raw === undefined || raw === '') continue;
    const key = String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    // الأرقام تبقى أرقاماً (المعرفات في الجداول رقمية)، وأي شيء آخر يبقى كما هو
    out.push(/^\d+$/.test(key) ? Number(key) : raw);
  }
  return out;
}

/**
 * يحوّل القيمة المخزنة (نص JSON أو كائن) إلى الشكل القياسي الآمن.
 */
export function normalizeAutoEnrollConfig(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  if (!obj || typeof obj !== 'object') return defaultAutoEnrollConfig();

  return {
    enabled: obj.enabled === true || obj.enabled === 'true',
    course_ids: uniqueIds(obj.course_ids),
    subject_ids: uniqueIds(obj.subject_ids),
  };
}

/**
 * يقرأ الإعداد الحالي من app_settings (أو الافتراضي إن لم يوجد).
 */
export async function getAutoEnrollConfig() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', AUTO_ENROLL_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeAutoEnrollConfig(data?.value);
}

/**
 * يمنح المستخدم الجديد الكورسات/المواد المختارة من السوبر أدمن.
 *
 * - لا يرمي أخطاء أبداً: فشل التفعيل التلقائي يجب ألا يمنع إنشاء الحساب.
 * - يتجاهل أي كورس/مادة تم حذفها من المنصة بعد حفظ الإعداد.
 * - لو اختير كورس وإحدى مواده معاً، يُمنح الكورس فقط (يغطي كل مواده).
 * - لا يلمس أي صف وصول موجود مسبقاً (ignoreDuplicates).
 * - المدرسون/المشرفون لا يحصلون عليه (حساباتهم لها منطقها الخاص).
 *
 * @param {number|string} userId
 * @param {string} [role='student']
 * @returns {Promise<{ courses: number, subjects: number }>}
 */
export async function applyAutoEnrollToUser(userId, role = 'student') {
  const result = { courses: 0, subjects: 0 };

  try {
    if (!userId) return result;
    if (isExemptFromExpiry(role) || role === 'super_admin') return result;

    const config = await getAutoEnrollConfig();
    if (!config.enabled) return result;
    if (config.course_ids.length === 0 && config.subject_ids.length === 0) return result;

    // 1) نتأكد أن الكورسات/المواد ما زالت موجودة (تفادي أخطاء المفاتيح الأجنبية)
    const [{ data: courses }, { data: subjects }] = await Promise.all([
      config.course_ids.length
        ? supabase.from('courses').select('id').in('id', config.course_ids)
        : Promise.resolve({ data: [] }),
      config.subject_ids.length
        ? supabase.from('subjects').select('id, course_id').in('id', config.subject_ids)
        : Promise.resolve({ data: [] }),
    ]);

    const courseIds = (courses || []).map(c => c.id);
    const courseIdSet = new Set(courseIds.map(String));

    // المادة التابعة لكورس مختار لا داعي لمنحها منفصلة
    const subjectIds = (subjects || [])
      .filter(s => !courseIdSet.has(String(s.course_id)))
      .map(s => s.id);

    // 2) الكورسات (⏳ expires_at من access_duration_days الخاصة بكل كورس)
    if (courseIds.length > 0) {
      const rows = [];
      for (const courseId of courseIds) {
        const { granted_at, expires_at } = await buildGrantTimestamps(courseId, null);
        rows.push({ user_id: userId, course_id: courseId, granted_at, expires_at });
      }
      const { error } = await supabase
        .from('user_course_access')
        .upsert(rows, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
      if (error) {
        console.error('⚠️ [AutoEnroll] course grant failed:', error.message);
      } else {
        result.courses = rows.length;
      }
    }

    // 3) المواد (⏳ override المادة ثم افتراضي الكورس ثم مدى الحياة)
    if (subjectIds.length > 0) {
      const rows = [];
      for (const subjectId of subjectIds) {
        const { granted_at, expires_at } = await buildGrantTimestamps(null, subjectId);
        rows.push({ user_id: userId, subject_id: subjectId, granted_at, expires_at });
      }
      const { error } = await supabase
        .from('user_subject_access')
        .upsert(rows, { onConflict: 'user_id,subject_id', ignoreDuplicates: true });
      if (error) {
        console.error('⚠️ [AutoEnroll] subject grant failed:', error.message);
      } else {
        result.subjects = rows.length;
      }
    }

    console.log(`🎁 [AutoEnroll] user=${userId} courses=${result.courses} subjects=${result.subjects}`);
  } catch (e) {
    console.error('⚠️ [AutoEnroll] unexpected error (ignored):', e.message);
  }

  return result;
}
