import { useState, useEffect, useRef, useCallback, memo } from 'react';
import FlashcardBulkImport, { FlashcardBulkImageImport } from './FlashcardBulkImport'; // 📋 استيراد من نص (Step 9) + 🖼️ صور بالجملة (Step 10)
import FlashcardAnkiImport from './FlashcardAnkiImport'; // 📦 استيراد ملف Anki / AnkiDroid (.apkg)
import useImageResizeUpload, { isAllowedImage, MAX_INPUT_BYTES } from '../hooks/useImageResizeUpload'; // 🖼️ تصغير + رفع (Step 10)

// ============================================================
// 🗂️ محرر مجموعة الفلاش كاردس (Deck Editor) — لوحة المعلم
// ------------------------------------------------------------
// - يحمّل المجموعة (إن وُجد deckId) ثم يحفظها كاملة عبر /api/dashboard/teacher/flashcards (save_deck)
// - الحفظ upsert بمعرّف البطاقة: نُبقي id كما رجع من السيرفر حتى يبقى تقدم الطلاب المحلي صالحاً
// - قواعد التحقق هنا مطابقة لقواعد الباك إند (الحد الأقصى 500 بطاقة، كل وجه نص أو صورة)
// - وضع التعديل لا يعرض معاينة للصور (لا تزاحم الصفحة): يظهر فقط شارة «صورة مرفقة»
// - وضع «معاينة البطاقات» يعرض البطاقات بنفس تجربة الطالب (قلب بالضغط) مع النص والصورة معاً
// - الألوان كلها من متغيرات ثيم الداشبورد (var(--gold) ...) فتتبع الوضع الفاتح/الداكن تلقائياً
// ============================================================

const MAX_CARDS = 500;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const MAX_CARD_TEXT = 5000;

let keySeq = 0;
const newKey = () => `c${Date.now()}_${keySeq++}`;

const emptyCard = () => ({ _key: newKey(), id: null, front_text: '', back_text: '', front_image_file_id: null, back_image_file_id: null });
const fromServer = (c) => ({
  _key: newKey(),
  id: c.id,
  front_text: c.front_text || '',
  back_text: c.back_text || '',
  front_image_file_id: c.front_image_file_id || null,
  back_image_file_id: c.back_image_file_id || null,
});

const isBlankCard = (c) => !c.id && !c.front_text.trim() && !c.back_text.trim() && !c.front_image_file_id && !c.back_image_file_id;

// معاينة الصور (في وضع «معاينة البطاقات» فقط) عبر البروكسي (يعمل بكوكي المعلم)
const imgUrl = (file) => `/api/admin/file-proxy?type=exam_images&filename=${encodeURIComponent(file)}`;

// يضبط ارتفاع مربع النص حسب محتواه (بحد أقصى) بدل شريط التمرير الصغير
const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight + 2, 280)}px`;
};

// ============================================================
// صورة داخل المعاينة (مع رسالة لو تعذر تحميلها)
// ============================================================
function PreviewImage({ file, big }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [file]);
  if (failed) return <p className="fce-muted">تعذر تحميل الصورة</p>;
  return <img className={big ? 'big' : ''} src={imgUrl(file)} alt="" onError={() => setFailed(true)} />;
}

// ============================================================
// وجه واحد من البطاقة في وضع التعديل (نص + زر صورة بدون معاينة)
// ============================================================
function Side({ cardKey, side, label, tone, text, image, busy, showError, onText, onUpload, onRemoveImage }) {
  const empty = !text.trim() && !image;
  return (
    <div className={`fce-side ${tone}${showError && empty ? ' invalid' : ''}`}>
      <div className="fce-side-label"><span className="dot" />{label}</div>
      <textarea
        className="fce-input"
        rows={2}
        ref={autoGrow}
        value={text}
        maxLength={MAX_CARD_TEXT}
        onChange={e => { onText(cardKey, `${side}_text`, e.target.value); autoGrow(e.target); }}
        placeholder={side === 'front' ? 'اكتب السؤال أو المصطلح...' : 'اكتب الإجابة أو الشرح...'}
      />
      <div className="fce-side-foot">
        {image ? (
          <span className="fce-chip">
            🖼️ صورة مرفقة
            <button type="button" title="إزالة الصورة" onClick={() => onRemoveImage(cardKey, `${side}_image_file_id`)}>✕</button>
          </span>
        ) : (
          <label className={`fce-img-btn${busy ? ' busy' : ''}`}>
            {busy ? 'جاري الرفع... ⏳' : '🖼️ إضافة صورة'}
            <input
              type="file"
              accept="image/png,image/jpeg"
              hidden
              disabled={busy}
              onChange={e => { onUpload(cardKey, side, e.target.files[0]); e.target.value = ''; }}
            />
          </label>
        )}
        {showError && empty && <span className="fce-err">أضف نصاً أو صورة</span>}
        {text.length > MAX_CARD_TEXT * 0.8 && <span className="fce-count">{text.length}/{MAX_CARD_TEXT}</span>}
      </div>
    </div>
  );
}

// ============================================================
// صف بطاقة (memo حتى لا تُعاد رسم مئات البطاقات مع كل حرف يُكتب)
// ============================================================
const CardRow = memo(function CardRow({
  card, index, isFirst, isLast, busyFront, busyBack, showError,
  onText, onUpload, onRemoveImage, onMove, onDuplicate, onDelete,
}) {
  return (
    <div className="fce-card" id={`fce-card-${card._key}`}>
      <div className="fce-card-head">
        <span className="fce-num">{index + 1}</span>
        <div className="fce-tools">
          <button type="button" title="تحريك لأعلى" onClick={() => onMove(index, -1)} disabled={isFirst}>↑</button>
          <button type="button" title="تحريك لأسفل" onClick={() => onMove(index, 1)} disabled={isLast}>↓</button>
          <button type="button" title="تكرار البطاقة" onClick={() => onDuplicate(index)}>⧉</button>
          <button type="button" title="حذف البطاقة" className="danger" onClick={() => onDelete(index)}>🗑</button>
        </div>
      </div>
      <div className="fce-sides">
        <Side
          cardKey={card._key} side="front" label="الوجه (السؤال)" tone="front"
          text={card.front_text} image={card.front_image_file_id} busy={busyFront} showError={showError}
          onText={onText} onUpload={onUpload} onRemoveImage={onRemoveImage}
        />
        <Side
          cardKey={card._key} side="back" label="الظهر (الإجابة)" tone="back"
          text={card.back_text} image={card.back_image_file_id} busy={busyBack} showError={showError}
          onText={onText} onUpload={onUpload} onRemoveImage={onRemoveImage}
        />
      </div>
    </div>
  );
});

export default function FlashcardDeckEditor({ deckId = null, subjectId, canManage = true, deniedMessage = '', onClose, onSaved, showAlert }) {
  const [id, setId] = useState(deckId);
  const [loading, setLoading] = useState(!!deckId);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [notifyStudents, setNotifyStudents] = useState(false); // 🔔 للإنشاء فقط (يختفي بعد أول حفظ)
  const [cards, setCards] = useState(() => (deckId ? [] : [emptyCard()]));
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
  const [showImport, setShowImport] = useState(false);
  const [showImageImport, setShowImageImport] = useState(false);
  const [showAnkiImport, setShowAnkiImport] = useState(false);
  const { uploadOne } = useImageResizeUpload(); // رفع صورة واحدة مع التصغير
  const [uploading, setUploading] = useState({}); // { 'cardKey:front': true }
  const [showErrors, setShowErrors] = useState(false); // يُفعَّل بعد أول فشل تحقق عند الحفظ
  const [pIndex, setPIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const alertMsg = (type, msg) => (showAlert ? showAlert(type, msg) : null);
  const alertRef = useRef(alertMsg);
  alertRef.current = alertMsg;

  // ---------- تحميل المجموعة ----------
  const applyDeck = (deck) => {
    setId(deck.id);
    setTitle(deck.title || '');
    setDescription(deck.description || '');
    setIsActive(deck.is_active !== false);
    setCards((deck.cards || []).map(fromServer));
    setDirty(false);
  };

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/teacher/flashcards?mode=deck&id=${deckId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.deck) applyDeck(data.deck);
        else { alertMsg('error', data.error || 'تعذر تحميل المجموعة'); onClose && onClose(); }
      } catch (e) {
        if (!cancelled) { alertMsg('error', 'خطأ في الاتصال'); onClose && onClose(); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // تحذير المتصفح عند إغلاق الصفحة مع تغييرات غير محفوظة
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ---------- تعديل الحالة (دوال ثابتة المرجع ⇒ تعمل مع memo) ----------
  const touch = useCallback(() => setDirty(true), []);

  const setCardField = useCallback((key, field, value) => {
    setCards(cs => cs.map(c => (c._key === key ? { ...c, [field]: value } : c)));
    setDirty(true);
  }, []);

  const addCard = useCallback(() => {
    if (cardsRef.current.length >= MAX_CARDS) return alertRef.current('error', `الحد الأقصى ${MAX_CARDS} بطاقة في المجموعة`);
    setCards(cs => [...cs, emptyCard()]); setDirty(true);
  }, []);

  const duplicateCard = useCallback((i) => {
    if (cardsRef.current.length >= MAX_CARDS) return alertRef.current('error', `الحد الأقصى ${MAX_CARDS} بطاقة في المجموعة`);
    setCards(cs => {
      const copy = { ...cs[i], _key: newKey(), id: null }; // نسخة جديدة (نفس الصور بنفس أسماء الملفات)
      return [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)];
    });
    setDirty(true);
  }, []);

  const deleteCard = useCallback((i) => { setCards(cs => cs.filter((_, idx) => idx !== i)); setDirty(true); }, []);

  const moveCard = useCallback((i, dir) => {
    setCards(cs => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const a = [...cs]; [a[i], a[j]] = [a[j], a[i]]; return a;
    });
    setDirty(true);
  }, []);

  // ---------- استيراد من نص ----------
  // الصفوف القادمة { front, back } تصبح بطاقات جديدة (بدون id) داخل المحرر فقط — تحتاج «حفظ».
  // عند الإضافة نُسقط البطاقات الفارغة تماماً (مثل البطاقة الافتراضية لمجموعة جديدة).
  const handleImport = (rows, importMode) => {
    const imported = rows.map(r => ({ ...emptyCard(), front_text: r.front, back_text: r.back }));
    setCards(cs => (importMode === 'replace' ? imported : [...cs.filter(c => !isBlankCard(c)), ...imported]));
    touch();
    setShowImport(false);
    alertMsg('success', `تمت إضافة ${imported.length} بطاقة — اضغط «حفظ» لتثبيتها`);
  };

  // ---------- استيراد ملف Anki (.apkg) ----------
  // البطاقات تأتي جاهزة من السيرفر (نصوص + صور مرفوعة بالفعل) ⇒ تُضاف للمحرر وتحتاج «حفظ».
  const handleAnkiImport = (rows, importMode) => {
    const imported = rows.map(r => ({
      ...emptyCard(),
      front_text: r.front_text || '',
      back_text: r.back_text || '',
      front_image_file_id: r.front_image_file_id || null,
      back_image_file_id: r.back_image_file_id || null,
    }));
    setCards(cs => (importMode === 'replace' ? imported : [...cs.filter(c => !isBlankCard(c)), ...imported]));
    touch();
    setShowAnkiImport(false);
    alertMsg('success', `تم استيراد ${imported.length} بطاقة من Anki — اضغط «حفظ» لتثبيتها`);
  };

  // ---------- استيراد صور بالجملة (Step 10) ----------
  // بطاقة لكل صورة (الوجه أو الظهر حسب الاختيار)، تُضاف في النهاية. الجهة الأخرى فارغة ليكتب المعلم نصها.
  const handleImageImport = (images, side) => {
    const imported = images.map(img => ({ ...emptyCard(), [`${side}_image_file_id`]: img.fileName }));
    setCards(cs => [...cs.filter(c => !isBlankCard(c)), ...imported]);
    touch();
    setShowImageImport(false);
    alertMsg('success', `تمت إضافة ${imported.length} بطاقة بصور — أضف نص الجهة الأخرى ثم اضغط «حفظ»`);
  };

  // ---------- رفع الصور ----------
  const uploadImage = useCallback(async (cardKey, side, file) => {
    if (!file) return;
    const say = alertRef.current;
    if (!isAllowedImage(file)) return say('error', 'الصيغ المسموحة: PNG أو JPG');
    if (file.size > MAX_INPUT_BYTES) return say('error', 'حجم الصورة أكبر من 30 ميجا.');
    if (!canManage) return say('error', deniedMessage);

    const k = `${cardKey}:${side}`;
    setUploading(u => ({ ...u, [k]: true }));
    try {
      // تصغير في المتصفح (≤1200px, JPEG) ثم رفع؛ يُرجع اسم الملف المحفوظ فقط
      const fileName = await uploadOne(file);
      setCardField(cardKey, `${side}_image_file_id`, fileName);
    } catch (e) {
      say('error', e.message || 'فشل رفع الصورة');
    }
    setUploading(u => { const n = { ...u }; delete n[k]; return n; });
  }, [canManage, deniedMessage, uploadOne, setCardField]);

  const removeImage = useCallback((cardKey, field) => setCardField(cardKey, field, null), [setCardField]);

  // ---------- التحقق (مطابق للباك إند) ----------
  // يُرجع { msg, key? } — key = البطاقة المسببة للخطأ (للتمرير إليها)
  const validate = () => {
    const t = title.trim();
    if (!t) return { msg: 'عنوان المجموعة مطلوب' };
    if (t.length > MAX_TITLE) return { msg: `عنوان المجموعة أطول من ${MAX_TITLE} حرف` };
    if (description.trim().length > MAX_DESCRIPTION) return { msg: `الوصف أطول من ${MAX_DESCRIPTION} حرف` };
    if (cards.length > MAX_CARDS) return { msg: `الحد الأقصى ${MAX_CARDS} بطاقة` };
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const n = i + 1;
      if (c.front_text.trim().length > MAX_CARD_TEXT) return { msg: `البطاقة ${n}: نص الوجه أطول من ${MAX_CARD_TEXT} حرف`, key: c._key };
      if (c.back_text.trim().length > MAX_CARD_TEXT) return { msg: `البطاقة ${n}: نص الظهر أطول من ${MAX_CARD_TEXT} حرف`, key: c._key };
      if (!c.front_text.trim() && !c.front_image_file_id) return { msg: `البطاقة ${n}: وجه البطاقة فارغ (أضف نصاً أو صورة)`, key: c._key };
      if (!c.back_text.trim() && !c.back_image_file_id) return { msg: `البطاقة ${n}: ظهر البطاقة فارغ (أضف نصاً أو صورة)`, key: c._key };
    }
    return null;
  };

  const isUploading = Object.keys(uploading).length > 0;

  // ---------- الحفظ ----------
  const save = async () => {
    if (!canManage) return alertMsg('error', deniedMessage);
    if (isUploading) return alertMsg('error', 'انتظر انتهاء رفع الصور أولاً');
    const err = validate();
    if (err) {
      setShowErrors(true);
      if (err.key) {
        const el = document.getElementById(`fce-card-${err.key}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return alertMsg('error', err.msg);
    }

    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/teacher/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_deck',
          payload: {
            id,
            subjectId,
            title: title.trim(),
            description: description.trim(),
            is_active: isActive,
            // 🔔 يُرسل فقط لمجموعة جديدة ظاهرة؛ السيرفر يتجاهله عند التعديل أو إن كانت المجموعة مخفية/فارغة
            notifyStudents: !id && isActive && notifyStudents,
            cards: cards.map(c => ({
              id: c.id,
              front_text: c.front_text,
              back_text: c.back_text,
              front_image_file_id: c.front_image_file_id,
              back_image_file_id: c.back_image_file_id,
            })),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.deck) {
        const askedToNotify = !id && isActive && notifyStudents;
        applyDeck(data.deck); // نعتمد ما رجع من السيرفر (معرّفات البطاقات الجديدة)
        setShowErrors(false);
        setNotifyStudents(false); // الإشعار مرة واحدة فقط عند الإنشاء
        if (askedToNotify && data.notified) alertMsg('success', 'تم حفظ المجموعة وإرسال الإشعار للطلاب');
        else if (askedToNotify) alertMsg('error', 'تم حفظ المجموعة لكن لم يُرسل الإشعار (تأكد أن المجموعة ظاهرة وفيها بطاقات)');
        else alertMsg('success', 'تم حفظ المجموعة');
        onSaved && onSaved(data.deck);
      } else {
        alertMsg('error', data.error || 'فشل الحفظ');
      }
    } catch (e) {
      alertMsg('error', 'خطأ في الاتصال');
    }
    setSaving(false);
  };

  const requestClose = () => {
    if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟')) return;
    onClose && onClose();
  };

  // ---------- المعاينة ----------
  const startPreview = () => { setPIndex(0); setFlipped(false); setMode('preview'); };
  const pCard = cards[pIndex];
  const goPreview = useCallback((d) => {
    setPIndex(i => Math.min(Math.max(i + d, 0), Math.max(cardsRef.current.length - 1, 0)));
    setFlipped(false);
  }, []);

  // اختصارات لوحة المفاتيح في وضع المعاينة (RTL: السهم الأيمن = السابقة)
  useEffect(() => {
    if (mode !== 'preview') return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goPreview(-1);
      else if (e.key === 'ArrowLeft') goPreview(1);
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, goPreview]);

  // وجه البطاقة في المعاينة: الصورة (إن وُجدت) ثم النص تحتها — الاثنان معاً
  const renderFace = (text, image) => (
    <div className="fce-face-scroll">
      <div className="fce-face-inner">
        {image && <PreviewImage file={image} big={!text} />}
        {text && <p>{text}</p>}
        {!text && !image && <p className="fce-muted">— فارغ —</p>}
      </div>
    </div>
  );

  const meaningfulCount = cards.filter(c => !isBlankCard(c)).length;

  return (
    <div className="fce fce-overlay" dir="rtl">
      {/* ───────── الهيدر ───────── */}
      <div className="fce-header">
        <div className="fce-header-title">
          <h3>{id ? 'تعديل مجموعة فلاش كاردس' : 'مجموعة فلاش كاردس جديدة'}</h3>
          {dirty && <span className="fce-dirty">● تغييرات غير محفوظة</span>}
        </div>
        <div className="fce-header-actions">
          {mode === 'edit' ? (
            <button type="button" className="fce-btn" onClick={startPreview} disabled={loading || cards.length === 0}>👁️ معاينة البطاقات</button>
          ) : (
            <button type="button" className="fce-btn" onClick={() => setMode('edit')}>✏️ رجوع للتعديل</button>
          )}
          <button type="button" className="fce-btn primary" onClick={save} disabled={loading || saving || isUploading}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ'}
          </button>
          <button type="button" className="fce-btn ghost" onClick={requestClose}>إغلاق ✕</button>
        </div>
      </div>

      {loading ? (
        <div className="fce-body"><p className="fce-muted fce-center">جاري التحميل...</p></div>
      ) : mode === 'preview' ? (
        /* ───────── معاينة البطاقات ───────── */
        <div className="fce-body preview">
          {!pCard ? (
            <p className="fce-muted fce-center">لا توجد بطاقات للمعاينة</p>
          ) : (
            <>
              <div className="fce-progress">
                <div className="fce-progress-text">{pIndex + 1} / {cards.length}</div>
                <div className="fce-progress-bar"><div style={{ width: `${((pIndex + 1) / cards.length) * 100}%` }} /></div>
              </div>

              <div className={`fce-flip${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
                <div className="fce-flip-inner">
                  <div className="fce-flip-face front">
                    <span className="fce-face-tag">السؤال</span>
                    {renderFace(pCard.front_text, pCard.front_image_file_id)}
                  </div>
                  <div className="fce-flip-face back">
                    <span className="fce-face-tag">الإجابة</span>
                    {renderFace(pCard.back_text, pCard.back_image_file_id)}
                  </div>
                </div>
              </div>

              <p className="fce-muted fce-center fce-small">اضغط على البطاقة لقلبها • يمكنك استخدام الأسهم والمسطرة</p>
              <div className="fce-preview-nav">
                <button type="button" className="fce-btn" onClick={() => goPreview(-1)} disabled={pIndex === 0}>→ السابقة</button>
                <button type="button" className="fce-btn primary" onClick={() => setFlipped(f => !f)}>قلب البطاقة</button>
                <button type="button" className="fce-btn" onClick={() => goPreview(1)} disabled={pIndex >= cards.length - 1}>التالية ←</button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ───────── التعديل ───────── */
        <div className="fce-body">
          {!canManage && <div className="fce-warn">{deniedMessage}</div>}

          {/* بيانات المجموعة */}
          <section className="fce-panel">
            <h4 className="fce-panel-title">بيانات المجموعة</h4>
            <div className="fce-field">
              <label>عنوان المجموعة</label>
              <input className="fce-input" value={title} maxLength={MAX_TITLE} onChange={e => { setTitle(e.target.value); touch(); }} placeholder="مثال: مصطلحات الفصل الأول" />
            </div>
            <div className="fce-field">
              <label>الوصف <span className="fce-opt">(اختياري)</span></label>
              <textarea className="fce-input" rows={2} ref={autoGrow} value={description} maxLength={MAX_DESCRIPTION} onChange={e => { setDescription(e.target.value); touch(); autoGrow(e.target); }} placeholder="نبذة قصيرة عن محتوى المجموعة..." />
            </div>

            <div className="fce-options">
              <label className="fce-option">
                <div className="fce-option-text">
                  <b>{isActive ? 'ظاهرة للطلاب' : 'مخفية عن الطلاب'}</b>
                  <small>{isActive ? 'يستطيع الطلاب المشتركون فتح المجموعة' : 'لا يراها إلا أنت حتى تُفعّل الظهور'}</small>
                </div>
                <span className="fce-switch">
                  <input type="checkbox" checked={isActive} onChange={e => { setIsActive(e.target.checked); touch(); }} />
                  <span className="track" />
                </span>
              </label>

              {!id && isActive && canManage && (
                <label className="fce-option">
                  <div className="fce-option-text">
                    <b>🔔 إشعار الطلاب</b>
                    <small>إرسال إشعار للطلاب المشتركين في المادة عند الحفظ</small>
                  </div>
                  <span className="fce-switch">
                    <input type="checkbox" checked={notifyStudents} onChange={e => setNotifyStudents(e.target.checked)} />
                    <span className="track" />
                  </span>
                </label>
              )}
            </div>
          </section>

          {/* شريط أدوات البطاقات */}
          <div className="fce-toolbar">
            <div className="fce-toolbar-title">
              <h4>البطاقات</h4>
              <span className="fce-count-pill">{cards.length} / {MAX_CARDS}</span>
            </div>
            <div className="fce-toolbar-actions">
              <button type="button" className="fce-btn accent" onClick={() => (canManage ? setShowAnkiImport(true) : alertMsg('error', deniedMessage))} title="استيراد ملف Anki / AnkiDroid">📦 استيراد من Anki</button>
              <button type="button" className="fce-btn" onClick={() => setShowImport(true)}>📋 من نص</button>
              <button type="button" className="fce-btn" onClick={() => (canManage ? setShowImageImport(true) : alertMsg('error', deniedMessage))}>🖼️ من صور</button>
              <button type="button" className="fce-btn primary" onClick={addCard}>+ بطاقة</button>
            </div>
          </div>

          {cards.length === 0 && (
            <div className="fce-empty">
              <div className="fce-empty-icon">🗂️</div>
              <p>لا توجد بطاقات بعد</p>
              <small>أضف بطاقة يدوياً أو استورد مجموعة جاهزة من Anki</small>
              <div className="fce-empty-actions">
                <button type="button" className="fce-btn primary" onClick={addCard}>+ إضافة بطاقة</button>
                <button type="button" className="fce-btn accent" onClick={() => (canManage ? setShowAnkiImport(true) : alertMsg('error', deniedMessage))}>📦 استيراد من Anki</button>
              </div>
            </div>
          )}

          {cards.map((card, i) => (
            <CardRow
              key={card._key}
              card={card}
              index={i}
              isFirst={i === 0}
              isLast={i === cards.length - 1}
              busyFront={!!uploading[`${card._key}:front`]}
              busyBack={!!uploading[`${card._key}:back`]}
              showError={showErrors}
              onText={setCardField}
              onUpload={uploadImage}
              onRemoveImage={removeImage}
              onMove={moveCard}
              onDuplicate={duplicateCard}
              onDelete={deleteCard}
            />
          ))}

          {cards.length > 0 && (
            <button type="button" className="fce-add-bottom" onClick={addCard}>+ إضافة بطاقة</button>
          )}
        </div>
      )}

      {showAnkiImport && (
        <FlashcardAnkiImport
          existingCount={meaningfulCount}
          maxCards={MAX_CARDS}
          canManage={canManage}
          deniedMessage={deniedMessage}
          onImport={handleAnkiImport}
          onClose={() => setShowAnkiImport(false)}
        />
      )}

      {showImageImport && (
        <FlashcardBulkImageImport
          existingCount={meaningfulCount}
          maxCards={MAX_CARDS}
          canManage={canManage}
          deniedMessage={deniedMessage}
          onImport={handleImageImport}
          onClose={() => setShowImageImport(false)}
        />
      )}

      {showImport && (
        <FlashcardBulkImport
          existingCount={meaningfulCount}
          maxCards={MAX_CARDS}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ستايل عام بمعرّفات .fce- حتى تعمل مع المكونات الفرعية (memo) بدون تعارض مع كلاسات الصفحة */}
      <style jsx global>{`
        .fce.fce-overlay { position: fixed; inset: 0; z-index: 10000; background: var(--bg-base); color: var(--text-primary); display: flex; flex-direction: column; font-family: inherit; }
        .fce *, .fce *::before, .fce *::after { box-sizing: border-box; }

        /* الهيدر */
        .fce .fce-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 22px; background: var(--header-bg, var(--bg-elevated)); border-bottom: 1px solid var(--border); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
        .fce .fce-header-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .fce .fce-header h3 { margin: 0; color: var(--gold); font-size: 1.1rem; }
        .fce .fce-dirty { font-size: 0.78rem; color: #f59e0b; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 10px; border-radius: 20px; }
        .fce .fce-header-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        /* الأزرار */
        .fce .fce-btn { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 15px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 0.88rem; font-weight: bold; transition: 0.2s; white-space: nowrap; }
        .fce .fce-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); background: var(--gold-dimmer); }
        .fce .fce-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .fce .fce-btn.primary { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }
        .fce .fce-btn.primary:hover:not(:disabled) { opacity: 0.9; background: var(--gold); color: #1a1a1a; }
        .fce .fce-btn.accent { border-color: var(--border-accent); color: var(--gold); background: var(--gold-dim); }
        .fce .fce-btn.accent:hover:not(:disabled) { background: var(--gold-dim); border-color: var(--gold); }
        .fce .fce-btn.ghost { background: transparent; }

        /* الجسم */
        .fce .fce-body { flex: 1; overflow-y: auto; padding: 22px 20px 40px; width: 100%; max-width: 980px; margin: 0 auto; }
        .fce .fce-warn { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #ef4444; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 0.9rem; }
        .fce .fce-muted { color: var(--text-muted); }
        .fce .fce-center { text-align: center; }
        .fce .fce-small { font-size: 0.82rem; }

        /* لوحة بيانات المجموعة */
        .fce .fce-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 22px; box-shadow: var(--shadow); }
        .fce .fce-panel-title { margin: 0 0 16px; font-size: 0.95rem; color: var(--text-primary); }
        .fce .fce-field { margin-bottom: 14px; }
        .fce .fce-field label { display: block; margin-bottom: 7px; color: var(--text-secondary); font-size: 0.84rem; font-weight: bold; }
        .fce .fce-opt { font-weight: normal; color: var(--text-muted); }

        /* مربعات الإدخال */
        .fce .fce-input { display: block; width: 100%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 11px 14px; border-radius: 12px; font-family: inherit; font-size: 0.95rem; line-height: 1.7; resize: none; transition: border-color 0.2s, box-shadow 0.2s, background 0.2s; }
        .fce .fce-input::placeholder { color: var(--text-muted); }
        .fce .fce-input:hover { border-color: var(--border-accent); }
        .fce .fce-input:focus { border-color: var(--gold); outline: none; box-shadow: 0 0 0 3px var(--gold-dim); }

        /* خيارات (مفاتيح التبديل) */
        .fce .fce-options { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
        .fce .fce-option { display: flex; justify-content: space-between; align-items: center; gap: 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: border-color 0.2s; }
        .fce .fce-option:hover { border-color: var(--border-accent); }
        .fce .fce-option-text { display: flex; flex-direction: column; gap: 3px; }
        .fce .fce-option-text b { font-size: 0.9rem; color: var(--text-primary); }
        .fce .fce-option-text small { color: var(--text-muted); font-size: 0.78rem; }
        .fce .fce-switch { position: relative; flex-shrink: 0; width: 44px; height: 24px; }
        .fce .fce-switch input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; z-index: 1; }
        .fce .fce-switch .track { position: absolute; inset: 0; border-radius: 24px; background: var(--border); transition: 0.25s; }
        .fce .fce-switch .track::before { content: ""; position: absolute; width: 18px; height: 18px; top: 3px; right: 3px; background: #fff; border-radius: 50%; transition: 0.25s; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
        .fce .fce-switch input:checked + .track { background: var(--gold); }
        .fce .fce-switch input:checked + .track::before { transform: translateX(-20px); }
        .fce .fce-switch input:focus-visible + .track { box-shadow: 0 0 0 3px var(--gold-dim); }

        /* شريط أدوات البطاقات */
        .fce .fce-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
        .fce .fce-toolbar-title { display: flex; align-items: center; gap: 10px; }
        .fce .fce-toolbar-title h4 { margin: 0; font-size: 1.05rem; color: var(--text-primary); }
        .fce .fce-count-pill { background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); font-size: 0.78rem; font-weight: bold; padding: 3px 11px; border-radius: 20px; }
        .fce .fce-toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        /* حالة فارغة */
        .fce .fce-empty { text-align: center; background: var(--bg-surface); border: 2px dashed var(--border-accent); border-radius: 16px; padding: 36px 16px; color: var(--text-secondary); }
        .fce .fce-empty-icon { font-size: 2.4rem; }
        .fce .fce-empty p { margin: 8px 0 4px; font-weight: bold; color: var(--text-primary); }
        .fce .fce-empty small { color: var(--text-muted); }
        .fce .fce-empty-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; }

        /* البطاقة في وضع التعديل */
        .fce .fce-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px 16px; margin-bottom: 14px; transition: border-color 0.2s; }
        .fce .fce-card:hover { border-color: var(--border-accent); }
        .fce .fce-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .fce .fce-num { background: var(--gold-dim); color: var(--gold); font-weight: bold; min-width: 30px; height: 30px; padding: 0 8px; border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 0.82rem; }
        .fce .fce-tools { display: flex; gap: 4px; }
        .fce .fce-tools button { background: transparent; border: 1px solid transparent; color: var(--text-muted); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 0.95rem; transition: 0.15s; }
        .fce .fce-tools button:hover:not(:disabled) { border-color: var(--border-accent); color: var(--gold); background: var(--gold-dimmer); }
        .fce .fce-tools button.danger:hover:not(:disabled) { border-color: rgba(239, 68, 68, 0.4); color: #ef4444; background: rgba(239, 68, 68, 0.1); }
        .fce .fce-tools button:disabled { opacity: 0.3; cursor: not-allowed; }
        .fce .fce-sides { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .fce .fce-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .fce .fce-side-label { display: flex; align-items: center; gap: 7px; font-size: 0.8rem; font-weight: bold; color: var(--text-secondary); }
        .fce .fce-side .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); }
        .fce .fce-side.back .dot { background: #60a5fa; }
        .fce .fce-side.front .fce-input:focus { border-color: var(--gold); }
        .fce .fce-side.back .fce-input:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2); }
        .fce .fce-side.invalid .fce-input { border-color: #ef4444; }
        .fce .fce-side-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 32px; }
        .fce .fce-img-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px dashed var(--border-accent); color: var(--text-secondary); background: transparent; border-radius: 9px; cursor: pointer; font-size: 0.8rem; transition: 0.2s; }
        .fce .fce-img-btn:hover { border-color: var(--gold); color: var(--gold); background: var(--gold-dimmer); }
        .fce .fce-img-btn.busy { opacity: 0.6; cursor: wait; }
        .fce .fce-chip { display: inline-flex; align-items: center; gap: 8px; padding: 5px 6px 5px 12px; background: var(--gold-dim); border: 1px solid var(--border-accent); color: var(--gold); border-radius: 9px; font-size: 0.8rem; font-weight: bold; }
        .fce .fce-chip button { background: rgba(0, 0, 0, 0.15); border: none; color: inherit; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 0.7rem; line-height: 1; }
        .fce .fce-chip button:hover { background: rgba(239, 68, 68, 0.25); color: #ef4444; }
        .fce .fce-err { color: #ef4444; font-size: 0.78rem; }
        .fce .fce-count { margin-inline-start: auto; color: var(--text-muted); font-size: 0.75rem; }
        .fce .fce-add-bottom { width: 100%; background: transparent; border: 2px dashed var(--border-accent); color: var(--text-secondary); border-radius: 14px; padding: 14px; cursor: pointer; font-family: inherit; font-weight: bold; margin-top: 4px; transition: 0.2s; }
        .fce .fce-add-bottom:hover { border-color: var(--gold); color: var(--gold); background: var(--gold-dimmer); }

        /* المعاينة */
        .fce .fce-body.preview { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
        .fce .fce-progress { width: 100%; max-width: 620px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .fce .fce-progress-text { color: var(--text-secondary); font-weight: bold; font-size: 0.9rem; }
        .fce .fce-progress-bar { width: 100%; height: 5px; background: var(--border); border-radius: 5px; overflow: hidden; }
        .fce .fce-progress-bar div { height: 100%; background: var(--gold); transition: width 0.25s; }
        .fce .fce-flip { width: 100%; max-width: 620px; height: min(440px, 60vh); perspective: 1400px; cursor: pointer; }
        .fce .fce-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.5s; transform-style: preserve-3d; }
        .fce .fce-flip.flipped .fce-flip-inner { transform: rotateY(180deg); }
        .fce .fce-flip-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 20px; padding: 18px 18px 16px; display: flex; flex-direction: column; min-height: 0; box-shadow: var(--shadow); }
        .fce .fce-flip-face.front { background: var(--bg-surface); border: 2px solid var(--border-accent); }
        .fce .fce-flip-face.back { background: var(--bg-elevated); border: 2px solid var(--gold); transform: rotateY(180deg); }
        .fce .fce-face-tag { align-self: flex-start; font-size: 0.72rem; font-weight: bold; color: var(--gold); background: var(--gold-dim); padding: 3px 10px; border-radius: 20px; margin-bottom: 8px; flex-shrink: 0; }
        /* ⚠️ الحاوية الداخلية بعرض 100% (وليس shrink-to-fit) كي لا توسّعها الصورة فيخرج النص خارج الشاشة */
        .fce .fce-face-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; }
        .fce .fce-face-inner { margin: auto; width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 4px 0; }
        .fce .fce-face-inner img { display: block; max-width: 100%; width: auto; height: auto; max-height: min(230px, 34vh); object-fit: contain; border-radius: 12px; flex-shrink: 0; }
        .fce .fce-face-inner img.big { max-height: min(340px, 52vh); }
        .fce .fce-face-inner p { width: 100%; margin: 0; text-align: center; color: var(--text-primary); font-size: 1.2rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
        .fce .fce-face-inner p.fce-muted { color: var(--text-muted); font-size: 1rem; }
        .fce .fce-preview-nav { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

        @media (max-width: 700px) {
          .fce .fce-header { padding: 10px 14px; }
          .fce .fce-body { padding: 14px 12px 32px; }
          .fce .fce-sides { grid-template-columns: 1fr; }
          .fce .fce-toolbar-actions { width: 100%; }
          .fce .fce-toolbar-actions .fce-btn { flex: 1 1 auto; }
          .fce .fce-flip { height: min(400px, 58vh); }
        }
      `}</style>
    </div>
  );
}
