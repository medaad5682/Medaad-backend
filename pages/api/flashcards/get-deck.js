import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper';
import { isCourseOwnerUser } from '../../../lib/flashcardAccess';

// ============================================================
// 🗂️ [Student] جلب بطاقات مجموعة فلاش كاردس
// GET ?deckId=ID
// - الوصول: نفس منطق الاشتراك/الانتهاء عبر checkUserAccess(..., 'flashcard_deck')
// - المجموعة المعطّلة (is_active=false) مخفية عن الجميع عدا المعلم مالك الكورس
// - 403 مع reason = expired | not_owned (مثل get-subject-content)
// ============================================================

export default async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  const { deckId } = req.query;
  if (!deckId || !/^\d+$/.test(String(deckId))) {
    return res.status(400).json({ error: 'Missing or invalid deckId' });
  }

  try {
    // 1. التحقق الأمني (هوية + جهاز + اشتراك فعّال غير منتهٍ)
    const hasAccess = await checkUserAccess(req, deckId, 'flashcard_deck');

    if (!hasAccess) {
      // ⏳ x-access-denial-reason يُحقن فقط عند رفض الاشتراك (expired / not_owned)
      const reason = req.headers['x-access-denial-reason'];
      if (reason === 'expired' || reason === 'not_owned') {
        return res.status(403).json({
          error: reason === 'expired' ? 'Your access to this content has expired' : 'You do not own this content',
          reason,
        });
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid Token or Device' });
    }

    const userId = req.headers['x-user-id'];

    // 2. جلب المجموعة مع مالك الكورس
    const { data: deck, error: deckErr } = await supabase
      .from('flashcard_decks')
      .select('id, subject_id, title, description, is_active, updated_at, subjects!inner(courses!inner(teacher_id))')
      .eq('id', deckId)
      .maybeSingle();

    if (deckErr) throw deckErr;
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    // 3. المجموعة المعطّلة: لا يراها إلا المعلم المالك (وإلا 404 كأنها غير موجودة)
    const isOwner = await isCourseOwnerUser(userId, deck.subjects?.courses?.teacher_id);
    if (deck.is_active === false && !isOwner) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    // 4. البطاقات مرتبة
    const { data: cards, error: cardsErr } = await supabase
      .from('flashcards')
      .select('id, front_text, back_text, front_image_file_id, back_image_file_id, sort_order')
      .eq('deck_id', deck.id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (cardsErr) throw cardsErr;

    return res.status(200).json({
      id: deck.id,
      subject_id: deck.subject_id,
      title: deck.title,
      description: deck.description,
      updated_at: deck.updated_at,
      ...(isOwner ? { is_active: deck.is_active } : {}),
      cards: cards || [],
    });
  } catch (err) {
    console.error('Flashcards get-deck API Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
