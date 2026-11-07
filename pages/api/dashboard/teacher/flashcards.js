import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { checkTeacherPermission } from '../../../../lib/teacherPermissions'; // ✅ التحقق من صلاحيات المعلم
import { sendToTopicOrThrow } from '../../../../lib/pushService'; // ✅ إرسال الإشعارات (FCM + HMS)

// ============================================================
// 🗂️ [Teacher Dashboard] إدارة مجموعات الفلاش كاردس (Decks) وبطاقاتها
// ============================================================
// GET  ?mode=list&subjectId=ID  ⇐ مجموعات مادة (مع card_count)
// GET  ?mode=deck&id=ID         ⇐ مجموعة واحدة مع بطاقاتها مرتبة
// POST { action, payload }:
//   save_deck     ⇐ إنشاء (بدون id) أو تعديل (مع id) مجموعة مع بطاقاتها
//                   + notifyStudents (عند الإنشاء فقط): إشعار فوري لطلاب المادة بعد حفظ البطاقات
//   delete_deck   ⇐ حذف مجموعة (البطاقات تُحذف تلقائياً بالـ cascade)
//   toggle_active ⇐ إظهار/إخفاء مجموعة عن الطلاب
// ترتيب المجموعات (drag & drop) يتم عبر reorder.js (type = flashcard_decks).
// ============================================================

// حد أقصى لعدد البطاقات في المجموعة الواحدة (الحماية من الحمولات الضخمة)
const MAX_CARDS_PER_DECK = 500;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const MAX_CARD_TEXT = 5000;

// الحفظ يرسل كل بطاقات المجموعة في طلب واحد، فنرفع حد جسم الطلب الافتراضي (1MB)
export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

// 🛡️ اسم ملف الصورة يجب أن يكون اسم ملف عادياً فقط (لا مسارات ولا ..)
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

class ValidationError extends Error {}

const normText = (value, label) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`${label} يجب أن يكون نصاً.`);
  const t = value.trim();
  if (!t) return null;
  if (t.length > MAX_CARD_TEXT) throw new ValidationError(`${label} أطول من الحد المسموح (${MAX_CARD_TEXT} حرف).`);
  return t;
};

const normImage = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.includes('..') || !SAFE_FILENAME.test(value)) {
    throw new ValidationError(`${label} غير صالح (يجب أن يكون اسم ملف فقط).`);
  }
  return value;
};

// يتحقق من البطاقات المُرسلة ويُرجعها بصيغة موحّدة: { id|null, front_text, back_text, front_image_file_id, back_image_file_id }
function normalizeCards(cards) {
  if (cards === undefined) return null; // لم تُرسل بطاقات ⇐ لا تعديل عليها
  if (!Array.isArray(cards)) throw new ValidationError('قائمة البطاقات غير صالحة.');
  if (cards.length > MAX_CARDS_PER_DECK) {
    throw new ValidationError(`الحد الأقصى لعدد البطاقات في المجموعة هو ${MAX_CARDS_PER_DECK}.`);
  }

  const seenIds = new Set();
  return cards.map((c, i) => {
    const n = i + 1;
    if (!c || typeof c !== 'object') throw new ValidationError(`البطاقة رقم ${n} غير صالحة.`);

    let id = null;
    if (c.id !== undefined && c.id !== null && c.id !== '') {
      const idStr = String(c.id);
      if (!/^\d+$/.test(idStr)) throw new ValidationError(`معرّف البطاقة رقم ${n} غير صالح.`);
      if (seenIds.has(idStr)) throw new ValidationError(`البطاقة رقم ${n} مكررة في الطلب.`);
      seenIds.add(idStr);
      id = idStr;
    }

    const card = {
      id,
      front_text: normText(c.front_text, `نص وجه البطاقة رقم ${n}`),
      back_text: normText(c.back_text, `نص ظهر البطاقة رقم ${n}`),
      front_image_file_id: normImage(c.front_image_file_id, `صورة وجه البطاقة رقم ${n}`),
      back_image_file_id: normImage(c.back_image_file_id, `صورة ظهر البطاقة رقم ${n}`),
    };

    // ✅ كل وجه يحتاج نصاً أو صورة عند الحفظ
    if (!card.front_text && !card.front_image_file_id) {
      throw new ValidationError(`البطاقة رقم ${n}: وجه البطاقة فارغ (أضف نصاً أو صورة).`);
    }
    if (!card.back_text && !card.back_image_file_id) {
      throw new ValidationError(`البطاقة رقم ${n}: ظهر البطاقة فارغ (أضف نصاً أو صورة).`);
    }
    return card;
  });
}

// 🛡️ جلب مالك مجموعة (المعلم صاحب الكورس) عبر المادة ⇐ الكورس
async function getDeckWithOwner(deckId) {
  const { data } = await supabase
    .from('flashcard_decks')
    .select('*, subjects!inner(id, courses!inner(teacher_id))')
    .eq('id', deckId)
    .maybeSingle();
  if (!data) return null;
  const { subjects, ...deck } = data;
  return { deck, ownerTeacherId: subjects?.courses?.teacher_id ?? null };
}

// 🛡️ جلب مالك مادة (المعلم صاحب الكورس)
async function getSubjectOwner(subjectId) {
  const { data } = await supabase
    .from('subjects')
    .select('id, courses!inner(teacher_id, title)')
    .eq('id', subjectId)
    .maybeSingle();
  if (!data) return null;
  return {
    ownerTeacherId: data.courses?.teacher_id ?? null,
    courseTitle: data.courses?.title ?? null,
  };
}

// 🔔 إشعار فوري لطلاب المادة بمجموعة جديدة (نفس مسار إشعار الامتحان الفوري، بلا cron).
// نستخدم النوع 'subject' (كما في رفع الملفات) فيظهر الإشعار في قائمة إشعارات الطالب
// المفلترة بـ target_type = subject، ويصل لمن لديه وصول للمادة فقط.
// لا يرمي أبداً: فشل الإشعار لا يجب أن يُفشل حفظ المجموعة. يرجع true عند النجاح.
async function notifySubjectAboutDeck({ subjectId, courseTitle, deckId, deckTitle, senderRole }) {
  try {
    const title = courseTitle || 'تحديث جديد';
    const body = `🗂️ مجموعة فلاش كاردس جديدة: ${deckTitle}`;
    await sendToTopicOrThrow(`subject_${subjectId}`, {
      title,
      body,
      type: 'subject',
      data: { id: String(subjectId), kind: 'flashcards', deck_id: String(deckId) },
    });
    await supabase.from('notifications').insert({
      title,
      body,
      target_type: 'subject',
      target_id: String(subjectId),
      sender_role: senderRole,
    });
    return true;
  } catch (notifyErr) {
    console.error('⚠️ [Flashcards] Push notify error:', notifyErr.message);
    return false;
  }
}

// السوبر أدمن يتخطى فحص الملكية (كما يتخطى فحص الصلاحيات)
const isOwner = (user, ownerTeacherId) =>
  user.role === 'super_admin' ||
  (ownerTeacherId !== null && user.teacherId && String(ownerTeacherId) === String(user.teacherId));

async function loadDeckWithCards(deckId) {
  const { data: deck, error } = await supabase.from('flashcard_decks').select('*').eq('id', deckId).single();
  if (error) throw error;
  const { data: cards, error: cardsErr } = await supabase
    .from('flashcards')
    .select('id, deck_id, front_text, back_text, front_image_file_id, back_image_file_id, sort_order')
    .eq('deck_id', deckId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (cardsErr) throw cardsErr;
  return { ...deck, cards: cards || [] };
}

async function getNextDeckSortOrder(subjectId) {
  try {
    const { data: rows } = await supabase.from('flashcard_decks').select('sort_order').eq('subject_id', subjectId);
    if (!rows || rows.length === 0) return 0;
    return Math.max(...rows.map(r => r.sort_order ?? 0)) + 1;
  } catch {
    return 0;
  }
}

// تنفيذ مجموعة وعود على دفعات لتجنب فتح عدد كبير من الاتصالات دفعة واحدة
async function runInChunks(tasks, size = 20) {
  for (let i = 0; i < tasks.length; i += size) {
    const results = await Promise.all(tasks.slice(i, i + size).map(t => t()));
    const failed = results.find(r => r?.error);
    if (failed) throw failed.error;
  }
}

export default async function handler(req, res) {
  // 1. التحقق من الجلسة (معلم أو سوبر أدمن)
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return res.status(401).json({ error: 'Unauthorized' });

  // ============================================================
  // GET
  // ============================================================
  if (req.method === 'GET') {
    const { mode, id, subjectId } = req.query;

    try {
      if (mode === 'list') {
        if (!subjectId) return res.status(400).json({ error: 'Subject ID required' });

        const subject = await getSubjectOwner(subjectId);
        if (!subject) return res.status(404).json({ error: 'المادة غير موجودة.' });
        if (!isOwner(user, subject.ownerTeacherId)) {
          return res.status(403).json({ error: 'غير مسموح لك بعرض مجموعات هذه المادة.' });
        }

        const { data: decks, error: listErr } = await supabase
          .from('flashcard_decks')
          .select('id, subject_id, title, description, sort_order, is_active, created_at, updated_at, flashcards ( count )')
          .eq('subject_id', subjectId)
          .order('sort_order', { ascending: true });
        if (listErr) throw listErr;

        const result = (decks || []).map(({ flashcards, ...d }) => ({
          ...d,
          card_count: flashcards?.[0]?.count ?? 0,
        }));
        return res.status(200).json({ success: true, decks: result });
      }

      if (mode === 'deck') {
        if (!id) return res.status(400).json({ error: 'Deck ID required' });

        const found = await getDeckWithOwner(id);
        if (!found) return res.status(404).json({ error: 'المجموعة غير موجودة.' });
        if (!isOwner(user, found.ownerTeacherId)) {
          return res.status(403).json({ error: 'غير مسموح لك بعرض هذه المجموعة.' });
        }

        const deck = await loadDeckWithCards(id);
        return res.status(200).json({ success: true, deck });
      }

      return res.status(400).json({ error: 'mode غير صالح.' });
    } catch (err) {
      console.error('⚠️ [Flashcards GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // POST
  // ============================================================
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, payload } = req.body || {};
  if (!action || !payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'بيانات الطلب مفقودة.' });
  }

  try {
    // 🛡️ صلاحية "إدارة الفلاش كاردس" (السوبر أدمن يتخطى). لا تشمل الحذف
    // حتى يستطيع المعلم دائماً تنظيف مجموعاته القديمة (مثل الامتحانات).
    if ((action === 'save_deck' || action === 'toggle_active') && user.role !== 'super_admin') {
      const perm = await checkTeacherPermission(user.teacherId, 'can_manage_flashcards');
      if (!perm.allowed) return res.status(403).json({ error: perm.error });
    }

    // ------------------------------------------------------------
    // 💾 save_deck
    // ------------------------------------------------------------
    if (action === 'save_deck') {
      const { id, subjectId } = payload;
      const isUpdate = id !== undefined && id !== null && id !== '';

      // --- تحقق من حقول المجموعة ---
      let title;
      if (payload.title !== undefined || !isUpdate) {
        title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) return res.status(400).json({ error: 'عنوان المجموعة مطلوب.' });
        if (title.length > MAX_TITLE) return res.status(400).json({ error: `عنوان المجموعة أطول من ${MAX_TITLE} حرف.` });
      }

      let description;
      if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
          return res.status(400).json({ error: 'وصف المجموعة غير صالح.' });
        }
        description = (payload.description || '').trim() || null;
        if (description && description.length > MAX_DESCRIPTION) {
          return res.status(400).json({ error: `وصف المجموعة أطول من ${MAX_DESCRIPTION} حرف.` });
        }
      }

      let isActive;
      if (payload.is_active !== undefined) {
        isActive = payload.is_active === true || payload.is_active === 'true';
      }

      const cards = normalizeCards(payload.cards); // قد تُرمى ValidationError

      // 🔔 الإشعار للإنشاء فقط (لا يُعاد إرساله عند التعديل)
      const wantsNotify = payload.notifyStudents === true || payload.notifyStudents === 'true';
      let createdSubject = null;
      let createdTitle = null;

      const nowIso = new Date().toISOString();
      let deckId;
      let existingRows = []; // بطاقات المجموعة الحالية (تُجلب وتُفحص قبل أي كتابة)

      // 🛡️ مجموعة جديدة لا يمكن أن تحتوي بطاقات لها معرّفات سابقة
      if (!isUpdate && cards && cards.some(c => c.id)) {
        return res.status(400).json({ error: 'البطاقات الجديدة يجب ألا تحمل معرّفات.' });
      }

      if (!isUpdate) {
        // ✅ إنشاء: يتطلب المادة والتأكد من ملكيتها
        if (!subjectId) return res.status(400).json({ error: 'المادة مطلوبة لإنشاء المجموعة.' });

        const subject = await getSubjectOwner(subjectId);
        if (!subject) return res.status(404).json({ error: 'المادة غير موجودة.' });
        if (!isOwner(user, subject.ownerTeacherId) || !subject.ownerTeacherId) {
          return res.status(403).json({ error: 'غير مسموح لك بإضافة مجموعة لمادة في كورس لا تملكه.' });
        }

        const { data: created, error: createErr } = await supabase
          .from('flashcard_decks')
          .insert({
            subject_id: subjectId,
            teacher_id: subject.ownerTeacherId, // مالك الكورس (حتى لو أنشأها السوبر أدمن)
            title,
            description: description ?? null,
            is_active: isActive ?? true,
            sort_order: await getNextDeckSortOrder(subjectId),
            updated_at: nowIso,
          })
          .select('id')
          .single();
        if (createErr) throw createErr;
        deckId = created.id;
        createdSubject = subject;
        createdTitle = title;
      } else {
        // ✅ تعديل: تحقق من الملكية
        const found = await getDeckWithOwner(id);
        if (!found) return res.status(404).json({ error: 'المجموعة غير موجودة.' });
        if (!isOwner(user, found.ownerTeacherId)) {
          return res.status(403).json({ error: 'غير مسموح لك بتعديل هذه المجموعة.' });
        }
        deckId = found.deck.id;

        if (cards) {
          const { data: rows, error: exErr } = await supabase
            .from('flashcards')
            .select('id, front_text, back_text, front_image_file_id, back_image_file_id, sort_order')
            .eq('deck_id', deckId);
          if (exErr) throw exErr;
          existingRows = rows || [];

          // 🛡️ أي معرّف مُرسل يجب أن يكون تابعاً لهذه المجموعة (منع العبث ببطاقات مجموعات أخرى)
          const ownIds = new Set(existingRows.map(r => String(r.id)));
          if (cards.some(c => c.id && !ownIds.has(c.id))) {
            return res.status(400).json({ error: 'إحدى البطاقات لا تنتمي لهذه المجموعة. أعد تحميل المجموعة وحاول مجدداً.' });
          }
        }

        const updates = { updated_at: nowIso };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (isActive !== undefined) updates.is_active = isActive;

        const { error: updErr } = await supabase.from('flashcard_decks').update(updates).eq('id', deckId);
        if (updErr) throw updErr;
      }

      // --- مزامنة البطاقات (upsert بالمعرّف: تعديل الموجود، إدراج الجديد، حذف المُزال فقط) ---
      if (cards) {
        const existingMap = new Map(existingRows.map(r => [String(r.id), r]));

        const keptIds = new Set(cards.filter(c => c.id).map(c => c.id));
        const removedIds = [...existingMap.keys()].filter(k => !keptIds.has(k));

        // 1) حذف البطاقات المُزالة فقط (ملفات الصور لا تُحذف أبداً لأنها قد تكون مشتركة)
        if (removedIds.length > 0) {
          const { error: delErr } = await supabase.from('flashcards').delete().eq('deck_id', deckId).in('id', removedIds);
          if (delErr) throw delErr;
        }

        // 2) تعديل الموجود (فقط ما تغيّر فعلاً) + 3) تجهيز الجديد؛ الترتيب = ترتيب المصفوفة المُرسلة
        const updateTasks = [];
        const newRows = [];
        cards.forEach((c, index) => {
          const fields = {
            front_text: c.front_text,
            back_text: c.back_text,
            front_image_file_id: c.front_image_file_id,
            back_image_file_id: c.back_image_file_id,
            sort_order: index,
          };
          if (c.id) {
            const old = existingMap.get(c.id);
            const changed = Object.keys(fields).some(k => (old[k] ?? null) !== fields[k]);
            if (changed) {
              updateTasks.push(() => supabase.from('flashcards').update(fields).eq('id', c.id).eq('deck_id', deckId));
            }
          } else {
            newRows.push({ deck_id: deckId, ...fields });
          }
        });

        await runInChunks(updateTasks);

        if (newRows.length > 0) {
          for (let i = 0; i < newRows.length; i += 200) {
            const { error: insErr } = await supabase.from('flashcards').insert(newRows.slice(i, i + 200));
            if (insErr) throw insErr;
          }
        }
      }

      const deck = await loadDeckWithCards(deckId);

      // 🔔 بعد حفظ البطاقات (ليفتح الطالب مجموعة مكتملة): فقط لمجموعة جديدة ظاهرة وفيها بطاقات
      let notified = false;
      if (wantsNotify && createdSubject && deck.is_active && deck.cards.length > 0) {
        notified = await notifySubjectAboutDeck({
          subjectId,
          courseTitle: createdSubject.courseTitle,
          deckId,
          deckTitle: createdTitle,
          senderRole: user.role === 'super_admin' ? 'super_admin' : 'teacher',
        });
      }

      return res.status(200).json({ success: true, deck, notified });
    }

    // ------------------------------------------------------------
    // 🗑️ delete_deck
    // ------------------------------------------------------------
    if (action === 'delete_deck') {
      const { id } = payload;
      if (!id) return res.status(400).json({ error: 'Deck ID required' });

      const found = await getDeckWithOwner(id);
      if (!found) return res.status(404).json({ error: 'المجموعة غير موجودة.' });
      if (!isOwner(user, found.ownerTeacherId)) {
        return res.status(403).json({ error: 'غير مسموح لك بحذف هذه المجموعة.' });
      }

      // البطاقات تُحذف تلقائياً (on delete cascade) — ولا نحذف ملفات الصور لأنها قد تكون مشتركة
      const { error: delErr } = await supabase.from('flashcard_decks').delete().eq('id', id);
      if (delErr) throw delErr;
      return res.status(200).json({ success: true, message: 'Deck deleted' });
    }

    // ------------------------------------------------------------
    // 👁️ toggle_active
    // ------------------------------------------------------------
    if (action === 'toggle_active') {
      const { id } = payload;
      if (!id) return res.status(400).json({ error: 'Deck ID required' });

      const found = await getDeckWithOwner(id);
      if (!found) return res.status(404).json({ error: 'المجموعة غير موجودة.' });
      if (!isOwner(user, found.ownerTeacherId)) {
        return res.status(403).json({ error: 'غير مسموح لك بتعديل هذه المجموعة.' });
      }

      // إن أُرسلت is_active نستخدمها، وإلا نعكس القيمة الحالية
      const next = payload.is_active !== undefined
        ? (payload.is_active === true || payload.is_active === 'true')
        : !found.deck.is_active;

      const { error: updErr } = await supabase
        .from('flashcard_decks')
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updErr) throw updErr;
      return res.status(200).json({ success: true, is_active: next });
    }

    return res.status(400).json({ error: `action غير معروف: ${action}` });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('⚠️ [Flashcards POST]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
