import { useState } from 'react';
import useImageResizeUpload, { isAllowedImage, MAX_INPUT_BYTES } from '../hooks/useImageResizeUpload'; // 🖼️ Step 10

// ============================================================
// 📋 استيراد البطاقات من نص مُلصق (Step 9)
// ------------------------------------------------------------
// - كل سطر = بطاقة، الوجه والظهر مفصولان بـ | أو بـ Tab (Tab = لصق مباشر من عمودين في Excel/Sheets)
// - الأسطر الفارغة تُتجاهل، والمسافات تُقص، والأسطر الناقصة (بدون ظهر/وجه) تُعلَّم بالأحمر
// - جدول معاينة قابل للتعديل/الحذف قبل التأكيد، مع اختيار: إضافة للموجود أو استبداله
// - لا يحفظ شيئاً في السيرفر: البطاقات تُضاف للمحرر وما زالت تحتاج «حفظ»
// - Step 10: يحتوي أيضاً على FlashcardBulkImageImport (بطاقة لكل صورة، مع تصغير وطابور رفع)
// ============================================================

const MAX_CARD_TEXT = 5000;

/**
 * يحوّل النص الملصق إلى صفوف { front, back }.
 * الفاصل: Tab إن وُجد في السطر (الأولوية)، وإلا أول «|». نقسم عند أول فاصل فقط
 * حتى يبقى أي «|» لاحق جزءاً من نص الظهر.
 */
export function parseBulkText(text) {
  const rows = [];
  String(text || '').split(/\r?\n/).forEach((rawLine) => {
    if (!rawLine.trim()) return; // سطر فارغ
    let front = rawLine;
    let back = '';
    const tabAt = rawLine.indexOf('\t');
    const sepAt = tabAt !== -1 ? tabAt : rawLine.indexOf('|');
    if (sepAt !== -1) {
      front = rawLine.slice(0, sepAt);
      back = rawLine.slice(sepAt + 1);
    }
    rows.push({ front: front.trim(), back: back.trim() });
  });
  return rows;
}

// سبب عدم صلاحية الصف (أو null)
export function rowProblem(row) {
  if (!row.front) return 'الوجه فارغ';
  if (!row.back) return 'الظهر فارغ';
  if (row.front.length > MAX_CARD_TEXT || row.back.length > MAX_CARD_TEXT) return `النص أطول من ${MAX_CARD_TEXT} حرف`;
  return null;
}

let rowSeq = 0;

export default function FlashcardBulkImport({ existingCount = 0, maxCards = 500, onImport, onClose }) {
  const [step, setStep] = useState('paste'); // 'paste' | 'preview'
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('append'); // 'append' | 'replace'

  const analyze = () => {
    const parsed = parseBulkText(text).map(r => ({ ...r, key: `r${rowSeq++}` }));
    setRows(parsed);
    setStep('preview');
  };

  const updateRow = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setRows(rs => rs.filter(r => r.key !== key));
  const removeInvalid = () => setRows(rs => rs.filter(r => !rowProblem(r)));

  const validRows = rows.filter(r => !rowProblem(r));
  const invalidCount = rows.length - validRows.length;
  const total = (mode === 'append' ? existingCount : 0) + validRows.length;
  const overLimit = total > maxCards;

  const confirm = () => {
    if (validRows.length === 0 || overLimit) return;
    onImport(validRows.map(r => ({ front: r.front, back: r.back })), mode);
  };

  return (
    <div className="bi-overlay" onClick={onClose}>
      <div className="bi-box" onClick={e => e.stopPropagation()}>
        <div className="bi-head">
          <h3>📋 استيراد بطاقات من نص</h3>
          <button type="button" className="bi-x" onClick={onClose}>✕</button>
        </div>

        {step === 'paste' ? (
          <>
            <p className="hint">
              ضع كل بطاقة في سطر، وافصل بين الوجه والظهر بعلامة <b>|</b> أو بـ <b>Tab</b>
              {' '}(يمكنك لصق عمودين مباشرة من Excel أو Google Sheets).
            </p>
            <pre className="example">{'القلب | يضخ الدم في الجسم\nالرئتان | تبادل الغازات'}</pre>
            <textarea
              className="bi-text"
              rows={12}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="الصق النص هنا..."
              autoFocus
            />
            <div className="bi-actions">
              <button type="button" className="bi-btn" onClick={onClose}>إلغاء</button>
              <button type="button" className="bi-btn primary" onClick={analyze} disabled={!text.trim()}>معاينة ←</button>
            </div>
          </>
        ) : (
          <>
            <div className="summary">
              <span className="ok">✔ {validRows.length} صالحة</span>
              {invalidCount > 0 && (
                <span className="bad">
                  ✖ {invalidCount} ناقصة
                  <button type="button" className="link" onClick={removeInvalid}>حذف الناقصة</button>
                </span>
              )}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>الوجه</th><th>الظهر</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="empty">لا توجد أسطر.</td></tr>
                  )}
                  {rows.map((r, i) => {
                    const problem = rowProblem(r);
                    return (
                      <tr key={r.key} className={problem ? 'invalid' : ''}>
                        <td className="num">{i + 1}</td>
                        <td><input value={r.front} onChange={e => updateRow(r.key, { front: e.target.value })} /></td>
                        <td><input value={r.back} onChange={e => updateRow(r.key, { back: e.target.value })} />
                          {problem && <div className="problem">{problem}</div>}
                        </td>
                        <td><button type="button" className="del" title="حذف الصف" onClick={() => removeRow(r.key)}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mode">
              <label>
                <input type="radio" name="bi-mode" checked={mode === 'append'} onChange={() => setMode('append')} />
                إضافة إلى البطاقات الحالية ({existingCount})
              </label>
              <label>
                <input type="radio" name="bi-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                استبدال كل البطاقات الحالية
              </label>
              {mode === 'replace' && existingCount > 0 && (
                <div className="warn">
                  ⚠️ البطاقات الحالية ستُحذف عند الحفظ، وسيفقد الطلاب تقدّمهم المحلي فيها.
                </div>
              )}
              {overLimit && <div className="warn">⚠️ الإجمالي ({total}) يتجاوز الحد الأقصى ({maxCards} بطاقة).</div>}
            </div>

            <div className="bi-actions">
              <button type="button" className="bi-btn" onClick={() => setStep('paste')}>→ رجوع</button>
              <button type="button" className="bi-btn primary" onClick={confirm} disabled={validRows.length === 0 || overLimit}>
                إضافة {validRows.length} بطاقة للمحرر
              </button>
            </div>
            <p className="hint small">البطاقات تُضاف للمحرر فقط — اضغط «حفظ» في المحرر لتثبيتها.</p>
          </>
        )}
      </div>

      <style jsx>{`
        .bi-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10001; background: rgba(0, 0, 0, 0.75); display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
        .bi-box { background: var(--bg-surface); width: 95%; max-width: 760px; max-height: 92vh; overflow-y: auto; border-radius: 16px; border: 1px solid var(--border-accent); padding: 20px 24px; box-sizing: border-box; }
        .bi-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px; }
        .bi-head h3 { margin: 0; color: var(--gold); font-size: 1.1rem; }
        .bi-x { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; }
        .hint { color: var(--text-secondary); font-size: 0.9rem; margin: 0 0 10px; line-height: 1.7; }
        .hint.small { font-size: 0.8rem; margin: 10px 0 0; color: var(--text-muted); }
        .example { background: var(--bg-base); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; color: var(--text-secondary); font-family: inherit; font-size: 0.85rem; white-space: pre-wrap; }
        .bi-text { width: 100%; box-sizing: border-box; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 12px; border-radius: 10px; font-family: inherit; resize: vertical; }
        .bi-text:focus { border-color: var(--gold); outline: none; }
        .bi-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; }
        .bi-btn { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 16px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: bold; }
        .bi-btn.primary { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }
        .bi-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .summary { display: flex; gap: 16px; align-items: center; margin-bottom: 10px; font-weight: bold; }
        .summary .ok { color: #22c55e; }
        .summary .bad { color: #ef4444; display: flex; gap: 10px; align-items: center; }
        .link { background: none; border: none; color: #ef4444; text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 0.85rem; }
        .table-wrap { max-height: 46vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { position: sticky; top: 0; background: var(--bg-elevated); color: var(--text-secondary); font-size: 0.8rem; padding: 8px; text-align: start; z-index: 1; }
        td { padding: 5px 6px; border-top: 1px solid var(--border); vertical-align: top; }
        td.num { color: var(--text-muted); font-size: 0.8rem; width: 34px; text-align: center; }
        td.empty { text-align: center; color: var(--text-muted); padding: 20px; }
        td input { width: 100%; box-sizing: border-box; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 7px 9px; border-radius: 6px; font-family: inherit; }
        td input:focus { border-color: var(--gold); outline: none; }
        tr.invalid td { background: rgba(239, 68, 68, 0.08); }
        tr.invalid td input { border-color: rgba(239, 68, 68, 0.5); }
        .problem { color: #ef4444; font-size: 0.75rem; margin-top: 3px; }
        .del { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 6px; border-radius: 6px; }
        .del:hover { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
        .mode { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; color: var(--text-secondary); }
        .mode label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
        .warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #f59e0b; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; }
      `}</style>
    </div>
  );
}

// ============================================================
// 🖼️ استيراد صور بالجملة (Step 10)
// ------------------------------------------------------------
// - المعلم يختار صوراً كثيرة دفعة واحدة ⇒ تُصغَّر وتُرفع (3 في آن واحد) ⇒ بطاقة واحدة لكل صورة.
// - الصورة تذهب للوجه أو الظهر حسب اختيار المعلم، والجهة الأخرى تبقى فارغة ليكتب نصها بعد ذلك.
// - الملفات تُرتَّب بالاسم (ترتيب طبيعي: 2 قبل 10) ليكون ترتيب البطاقات متوقعاً.
// - فشل الرفع لا يُلغي الباقي: تظهر «إعادة المحاولة» لكل ملف فاشل أو للكل.
// - البطاقات تُضاف للمحرر فقط — ما زالت تحتاج «حفظ» (ويجب ملء الجهة الأخرى قبل الحفظ).
// ============================================================
const STATUS_LABEL = { queued: 'في الانتظار', resizing: 'جاري التصغير...', uploading: 'جاري الرفع...', done: 'تم ✔', error: 'فشل' };

export function FlashcardBulkImageImport({ existingCount = 0, maxCards = 500, canManage = true, deniedMessage = '', onImport, onClose }) {
  const [side, setSide] = useState('front'); // 'front' | 'back'
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState('');
  const { items, stats, enqueue, retry, retryFailed, remove, clear } = useImageResizeUpload({ concurrency: 3 });

  const room = Math.max(0, maxCards - existingCount - items.length);
  const busy = stats.active > 0;

  const addFiles = (fileList) => {
    if (!canManage) { setNotice(deniedMessage || 'ليست لديك صلاحية'); return; }
    const all = Array.from(fileList || []);
    const valid = all.filter(f => isAllowedImage(f) && f.size <= MAX_INPUT_BYTES);
    const skippedType = all.length - valid.length;
    valid.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const accepted = valid.slice(0, room);
    const skippedLimit = valid.length - accepted.length;
    enqueue(accepted);
    const msgs = [];
    if (skippedType) msgs.push(`${skippedType} ملف تجاهلناه (الصيغ المسموحة PNG/JPG وحتى 30 ميجا)`);
    if (skippedLimit) msgs.push(`${skippedLimit} صورة تجاوزت الحد الأقصى (${maxCards} بطاقة)`);
    setNotice(msgs.join(' — '));
  };

  const doneItems = items.filter(it => it.status === 'done');

  const confirm = () => {
    if (busy || doneItems.length === 0) return;
    onImport(doneItems.map(it => ({ fileName: it.fileName })), side);
    clear();
  };

  const requestClose = () => {
    if (busy && !window.confirm('هناك صور قيد الرفع. هل تريد الإغلاق وإلغاء المتابعة؟')) return;
    if (!busy && doneItems.length > 0 && !window.confirm(`رُفعت ${doneItems.length} صورة ولم تُضف كبطاقات بعد. هل تريد الإغلاق دون إضافتها؟`)) return;
    onClose();
  };

  return (
    <div className="bi-overlay" onClick={requestClose}>
      <div className="bi-box" onClick={e => e.stopPropagation()}>
        <div className="bi-head">
          <h3>🖼️ استيراد صور (بطاقة لكل صورة)</h3>
          <button type="button" className="bi-x" onClick={requestClose}>✕</button>
        </div>

        {!canManage && <div className="warn">{deniedMessage}</div>}

        <div className="mode">
          <span className="lbl">مكان الصورة في البطاقة:</span>
          <label><input type="radio" name="bimg-side" checked={side === 'front'} onChange={() => setSide('front')} disabled={items.length > 0} /> الوجه (السؤال)</label>
          <label><input type="radio" name="bimg-side" checked={side === 'back'} onChange={() => setSide('back')} disabled={items.length > 0} /> الظهر (الإجابة)</label>
        </div>

        <label
          className={`drop${dragOver ? ' over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        >
          <input type="file" accept="image/png,image/jpeg" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          <div>اسحب الصور هنا أو اضغط للاختيار</div>
          <small>PNG / JPG — تُصغَّر تلقائياً (حتى 1200px) قبل الرفع • المتبقي {room} بطاقة</small>
        </label>

        {notice && <div className="warn">{notice}</div>}

        {items.length > 0 && (
          <>
            <div className="summary">
              <span className="ok">✔ {stats.done} / {stats.total}</span>
              {busy && <span className="info">⏳ {stats.active} قيد المعالجة</span>}
              {stats.failed > 0 && (
                <span className="bad">
                  ✖ {stats.failed} فشلت
                  <button type="button" className="link" onClick={retryFailed}>إعادة محاولة الكل</button>
                </span>
              )}
            </div>
            <div className="list">
              {items.map(it => (
                <div key={it.id} className={`row ${it.status}`}>
                  <img src={it.preview} alt="" />
                  <div className="meta">
                    <div className="name" title={it.name}>{it.name}</div>
                    <div className="bar"><div className="fill" style={{ width: `${it.status === 'done' ? 100 : it.progress}%` }} /></div>
                    <div className="st">{STATUS_LABEL[it.status]}{it.status === 'uploading' ? ` ${it.progress}%` : ''}{it.error ? ` — ${it.error}` : ''}</div>
                  </div>
                  {it.status === 'error' && <button type="button" className="mini" onClick={() => retry(it.id)}>↻ إعادة</button>}
                  {(it.status === 'done' || it.status === 'error' || it.status === 'queued') && (
                    <button type="button" className="del" title="إزالة" onClick={() => remove(it.id)}>🗑</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="bi-actions">
          <button type="button" className="bi-btn" onClick={requestClose}>إلغاء</button>
          <button type="button" className="bi-btn primary" onClick={confirm} disabled={busy || doneItems.length === 0}>
            إضافة {doneItems.length} بطاقة للمحرر
          </button>
        </div>
        {stats.failed > 0 && !busy && doneItems.length > 0 && (
          <p className="hint small">ستُضاف الصور الناجحة فقط. يمكنك إعادة محاولة الفاشلة أولاً.</p>
        )}
        <p className="hint small">البطاقات تُضاف للمحرر فقط — أضف النص للجهة الأخرى ثم اضغط «حفظ».</p>
      </div>

      <style jsx>{`
        .bi-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10001; background: rgba(0, 0, 0, 0.75); display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
        .bi-box { background: var(--bg-surface); width: 95%; max-width: 760px; max-height: 92vh; overflow-y: auto; border-radius: 16px; border: 1px solid var(--border-accent); padding: 20px 24px; box-sizing: border-box; }
        .bi-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px; }
        .bi-head h3 { margin: 0; color: var(--gold); font-size: 1.1rem; }
        .bi-x { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; }
        .mode { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; color: var(--text-secondary); margin-bottom: 12px; }
        .mode label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
        .lbl { font-weight: bold; }
        .drop { display: block; text-align: center; padding: 26px 14px; border: 2px dashed var(--border-accent); border-radius: 12px; color: var(--text-secondary); cursor: pointer; transition: 0.2s; }
        .drop small { color: var(--text-muted); }
        .drop:hover, .drop.over { border-color: var(--gold); color: var(--gold); background: var(--gold-dimmer); }
        .warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #f59e0b; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; margin: 10px 0; }
        .summary { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 14px 0 8px; font-weight: bold; }
        .summary .ok { color: #22c55e; }
        .summary .info { color: var(--gold); }
        .summary .bad { color: #ef4444; display: flex; gap: 10px; align-items: center; }
        .link { background: none; border: none; color: #ef4444; text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 0.85rem; }
        .list { max-height: 40vh; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; }
        .row { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--border); }
        .row:first-child { border-top: none; }
        .row.error { background: rgba(239, 68, 68, 0.08); }
        .row img { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0; }
        .meta { flex: 1; min-width: 0; }
        .name { color: var(--text-primary); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bar { height: 5px; background: var(--border); border-radius: 4px; margin: 5px 0; overflow: hidden; }
        .fill { height: 100%; background: var(--gold); transition: width 0.2s; }
        .row.done .fill { background: #22c55e; }
        .row.error .fill { background: #ef4444; }
        .st { color: var(--text-muted); font-size: 0.75rem; }
        .row.error .st { color: #ef4444; }
        .mini { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); border-radius: 6px; padding: 5px 9px; cursor: pointer; font-family: inherit; font-size: 0.8rem; }
        .mini:hover { border-color: var(--gold); color: var(--gold); }
        .del { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 6px; border-radius: 6px; }
        .del:hover { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
        .bi-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; }
        .bi-btn { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 16px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: bold; }
        .bi-btn.primary { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }
        .bi-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hint.small { font-size: 0.8rem; margin: 10px 0 0; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
