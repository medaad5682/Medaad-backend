import { supabase } from './supabaseClient';

// ============================================================
// 🛡️ صلاحيات المعلم القابلة للتحكم بها من قبل المدير العام (Super Admin)
// ============================================================
// يتم تخزينها في عمود JSONB باسم `permissions` داخل جدول `teachers`.
// أي مفتاح غير موجود في القيمة المخزنة يُعتبر مفعّلاً افتراضياً (true)
// حتى لا تتأثر الحسابات القديمة قبل إضافة هذه الميزة.
// ============================================================

export const DEFAULT_TEACHER_PERMISSIONS = Object.freeze({
  can_upload_pdf: true,
  can_upload_video: true,
  can_create_exam: true,
  can_manage_flashcards: true,
});

// مفاتيح الصلاحيات المعروفة (تُستخدم للتحقق من صحة القيم المُرسلة من لوحة السوبر أدمن)
export const PERMISSION_KEYS = Object.freeze([
  'can_upload_pdf',
  'can_upload_video',
  'can_create_exam',
  'can_manage_flashcards',
]);

// رسائل خطأ موحّدة تُعرض للمعلم عند محاولة استخدام ميزة مُعطّلة
export const PERMISSION_DENIED_MESSAGES = Object.freeze({
  can_upload_pdf: 'تم إيقاف صلاحية رفع ملفات PDF لحسابك من قبل الإدارة.',
  can_upload_video: 'تم إيقاف صلاحية رفع الفيديوهات لحسابك من قبل الإدارة.',
  can_create_exam: 'تم إيقاف صلاحية إنشاء/تعديل الامتحانات لحسابك من قبل الإدارة.',
  can_manage_flashcards: 'تم إيقاف صلاحية إنشاء/تعديل الفلاش كاردس لحسابك من قبل الإدارة.',
});

/**
 * جلب صلاحيات معلم معيّن من قاعدة البيانات، مع دمجها مع القيم الافتراضية
 * (بحيث تبقى أي صلاحية غير محفوظة = مفعّلة).
 */
export async function getTeacherPermissions(teacherId) {
  if (!teacherId) return { ...DEFAULT_TEACHER_PERMISSIONS };

  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('permissions')
      .eq('id', teacherId)
      .single();

    if (error || !data) return { ...DEFAULT_TEACHER_PERMISSIONS };

    return { ...DEFAULT_TEACHER_PERMISSIONS, ...(data.permissions || {}) };
  } catch (err) {
    console.error('⚠️ [teacherPermissions] Failed to fetch permissions:', err.message);
    return { ...DEFAULT_TEACHER_PERMISSIONS };
  }
}

/**
 * التحقق من امتلاك معلم لصلاحية معينة. يُرجع { allowed, error } جاهزة للاستخدام المباشر
 * داخل الـ API routes:
 *   const perm = await checkTeacherPermission(auth.teacherId, 'can_upload_video');
 *   if (!perm.allowed) return res.status(403).json({ error: perm.error });
 */
export async function checkTeacherPermission(teacherId, permissionKey) {
  const permissions = await getTeacherPermissions(teacherId);
  const allowed = permissions[permissionKey] !== false; // أي شيء عدا false صراحةً = مسموح

  return {
    allowed,
    permissions,
    error: allowed ? null : (PERMISSION_DENIED_MESSAGES[permissionKey] || 'ليس لديك صلاحية للقيام بهذا الإجراء.'),
  };
}

/**
 * تنظيف/تحقق من كائن صلاحيات مُرسل من لوحة السوبر أدمن قبل حفظه في قاعدة البيانات.
 * يتجاهل أي مفاتيح غير معروفة، ويجبر القيم على أن تكون Boolean صريحة.
 */
export function sanitizePermissionsInput(input) {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;

  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      clean[key] = input[key] === true || input[key] === 'true';
    }
  }
  return clean;
}
