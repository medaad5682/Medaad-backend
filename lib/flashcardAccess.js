import { supabase } from './supabaseClient';
import { checkUserAccess } from './authHelper';

// ============================================================
// 🗂️ مساعدات وصول الطلاب للفلاش كاردس
// ============================================================

// أسماء الملفات التي ترفعها نقطة الرفع بسيطة (أرقام/حروف/نقطة/شرطة) — أي اسم آخر لا يمكن أن يكون صورة فلاش كارد
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

// حد أقصى لعدد المجموعات المفحوصة لنفس الصورة (الصور المنسوخة تتكرر عبر مجموعات قليلة عادةً)
const MAX_DECKS_CHECKED = 20;

/**
 * هل المستخدم هو المعلم صاحب الكورس؟ (يرى المجموعات المخفية)
 */
export async function isCourseOwnerUser(userId, courseTeacherId) {
  if (!userId || courseTeacherId === null || courseTeacherId === undefined) return false;
  const { data } = await supabase.from('users').select('teacher_profile_id').eq('id', userId).maybeSingle();
  return !!data?.teacher_profile_id && String(data.teacher_profile_id) === String(courseTeacherId);
}

/**
 * فحص صلاحية الطالب لرؤية صورة بطاقة فلاش كارد باسم ملفها.
 *
 * ⚠️ لا نستخدم maybeSingle(): المجموعات المنسوخة تتشارك نفس أسماء الملفات، فقد تطابق الصورة
 * عدة بطاقات في مواد مختلفة. نسمح بالصورة إذا كان للطالب وصول لأي مجموعة تحتويها
 * (باستخدام checkUserAccess(..., 'flashcard_deck')). المجموعة المخفية لا تُحتسب إلا لمالك الكورس.
 *
 * @returns {Promise<{ referenced: boolean, allowed: boolean }>}
 *   referenced=false ⇒ الملف غير مستخدم في أي بطاقة (يُترك للمنطق القديم).
 */
export async function checkFlashcardImageAccess(req, filename) {
  if (typeof filename !== 'string' || !SAFE_FILENAME.test(filename)) {
    return { referenced: false, allowed: false };
  }

  const { data: rows, error } = await supabase
    .from('flashcards')
    .select('deck_id, flashcard_decks!inner(id, is_active, subjects!inner(courses!inner(teacher_id)))')
    .or(`front_image_file_id.eq.${filename},back_image_file_id.eq.${filename}`)
    .limit(200);

  if (error) {
    console.error('⚠️ [flashcardAccess] image lookup failed:', error.message);
    // فشل الاستعلام ⇒ نعتبرها مرتبطة ومرفوضة (الأمان أولاً) بدل الرجوع للمنطق المفتوح
    return { referenced: true, allowed: false };
  }
  if (!rows || rows.length === 0) return { referenced: false, allowed: false };

  // إزالة التكرار (بطاقات كثيرة في نفس المجموعة)
  const decks = new Map();
  for (const r of rows) {
    const d = r.flashcard_decks;
    if (d && !decks.has(d.id)) {
      decks.set(d.id, { id: d.id, is_active: d.is_active !== false, teacherId: d.subjects?.courses?.teacher_id ?? null });
    }
  }
  const list = [...decks.values()].slice(0, MAX_DECKS_CHECKED);

  // المجموعات المخفية تحتاج معرفة هوية المستخدم أولاً (للتحقق من كونه المالك)
  let identityChecked = false;
  for (const deck of list) {
    if (!deck.is_active) {
      if (!identityChecked) {
        identityChecked = true;
        if (!(await checkUserAccess(req))) return { referenced: true, allowed: false };
      }
      const owner = await isCourseOwnerUser(req.headers['x-user-id'], deck.teacherId);
      if (!owner) continue;
    }
    if (await checkUserAccess(req, deck.id, 'flashcard_deck')) {
      return { referenced: true, allowed: true };
    }
  }
  return { referenced: true, allowed: false };
}
