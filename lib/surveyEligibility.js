import { supabase } from './supabaseClient';

// ==========================================================
// 📋 أهلية عرض الاستبيانات
// الاستبيان يظهر فقط لحسابات الطلبة التي عمرها 3 أسابيع على الأقل.
// لا يظهر لـ: المدرسين، المشرفين (moderator)، الأدمن.
// ==========================================================

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;
const EXCLUDED_ROLES = ['teacher', 'moderator', 'super_admin'];

/**
 * @param {number|string} userId
 * @param {{ created_at?: any, role?: string, is_admin?: boolean }|null} [knownUser]
 *   لو الـ endpoint عنده بيانات المستخدم بالفعل (req.authUser من authHelper) نستخدمها
 *   بدل قراءة users مرة ثانية. لو غير متاحة (أو ناقصة) نقرأ من الداتابيز كما كان.
 * @returns {Promise<{ eligible: boolean, reason?: 'staff' | 'new_account' }>}
 */
export async function checkSurveyEligibility(userId, knownUser = null) {
  let user = null;

  if (knownUser && knownUser.created_at !== undefined && knownUser.role !== undefined && knownUser.is_admin !== undefined) {
    user = knownUser;
  } else {
    const { data, error } = await supabase
      .from('users')
      .select('created_at, role, is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    user = data;
  }

  // مدرس / مشرف / أدمن -> لا استبيانات
  if (user && (user.is_admin === true || EXCLUDED_ROLES.includes(user.role))) {
    return { eligible: false, reason: 'staff' };
  }

  // طالب عمر حسابه أقل من 3 أسابيع -> لا استبيانات
  if (user?.created_at) {
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    if (accountAgeMs < THREE_WEEKS_MS) {
      return { eligible: false, reason: 'new_account' };
    }
  }

  return { eligible: true };
}
