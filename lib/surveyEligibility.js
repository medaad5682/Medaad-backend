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
 * @returns {Promise<{ eligible: boolean, reason?: 'staff' | 'new_account' }>}
 */
export async function checkSurveyEligibility(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('created_at, role, is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

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
