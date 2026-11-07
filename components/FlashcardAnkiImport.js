import { useState, useRef } from 'react';

// ============================================================
// 📦 استيراد ملف Anki / AnkiDroid (.apkg) — لوحة المعلم
// ------------------------------------------------------------
// - المعلم يختار ملف .apkg ⇒ يُرفع للسيرفر (/api/dashboard/teacher/flashcards-import-anki)
// - السيرفر يستخرج الأسئلة والإجابات والصور فقط (بدون أي إعدادات أخرى) ويحفظ الصور
// - تظهر نتيجة موجزة (كم بطاقة + ما تم تخطيه) ثم «إضافة للمحرر»
// - البطاقات تُضاف للمحرر فقط — ما زالت تحتاج «حفظ» لتثبيتها
// ============================================================

const MAX_APKG_MB = 300;
const ENDPOINT = '/api/dashboard/teacher/flashcards-import-anki';

const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} ميجا` : `${Math.max(1, Math.round(bytes / 1024))} كيلو`);

function uploadApkg(file, maxCards, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* ردّ غير JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(data.cards)) resolve(data);
      else reject(new Error(data.error || `فشل قراءة الملف (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('خطأ في الاتصال أثناء رفع الملف'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('maxCards', String(maxCards));
    xhr.send(fd);
  });
}

export default function FlashcardAnkiImport({ existingCount = 0, maxCards = 500, canManage = true, deniedMessage = '', onImport, onClose }) {
  const [phase, setPhase] = useState('select'); // 'select' | 'working' | 'done'
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('append'); // 'append' | 'replace'
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const room = mode === 'append' ? Math.max(0, maxCards - existingCount) : maxCards;

  const pick = (f) => {
    setError('');
    if (!f) return;
    if (!/\.apkg$/i.test(f.name)) return setError('الملف يجب أن يكون بصيغة .apkg (تصدير من Anki أو AnkiDroid).');
    if (f.size > MAX_APKG_MB * 1024 * 1024) return setError(`حجم الملف أكبر من ${MAX_APKG_MB} ميجا.`);
    setFile(f);
  };

  const start = async () => {
    if (!canManage) return setError(deniedMessage || 'ليست لديك صلاحية');
    if (!file || room <= 0) return;
    setError(''); setProgress(0); setPhase('working');
    try {
      const data = await uploadApkg(file, room, setProgress);
      setResult(data);
      setPhase('done');
    } catch (e) {
      setError(e.message || 'فشل الاستيراد');
      setPhase('select');
    }
  };

  const confirm = () => {
    if (!result || result.cards.length === 0) return;
    onImport(result.cards, mode);
  };

  const requestClose = () => {
    if (phase === 'working' && !window.confirm('الملف قيد المعالجة. هل تريد الإغلاق؟')) return;
    if (phase === 'done' && !window.confirm('لم تُضف البطاقات للمحرر بعد. هل تريد الإغلاق دون إضافتها؟')) return;
    onClose();
  };

  const s = result?.stats;
  const notes = [];
  if (s) {
    if (s.cloze) notes.push(`${s.cloze} بطاقة «حذف كلمات» (Cloze) حُوّلت إلى سؤال بفراغ [...] وإجابة كاملة`);
    if (s.skippedEmpty) notes.push(`${s.skippedEmpty} بطاقة تخطيناها لأن الوجه أو الظهر فارغ`);
    if (s.skippedLimit) notes.push(`${s.skippedLimit} بطاقة لم تُستورد لتجاوز الحد الأقصى (${maxCards} بطاقة)`);
    if (s.imagesUnsupported) notes.push(`${s.imagesUnsupported} صورة تخطيناها (الصيغ المدعومة PNG/JPG وحتى 10 ميجا)`);
    if (s.imagesMissing) notes.push(`${s.imagesMissing} صورة غير موجودة داخل الملف أو رابطها خارجي`);
    if (s.extraImagesDropped) notes.push(`${s.extraImagesDropped} صورة زائدة تخطيناها (البطاقة تدعم صورة واحدة لكل وجه)`);
    if (s.truncated) notes.push(`${s.truncated} نص قُصّ لتجاوزه 5000 حرف`);
  }

  return (
    <div className="ai-overlay" onClick={requestClose}>
      <div className="ai-box" onClick={e => e.stopPropagation()}>
        <div className="ai-head">
          <h3>📦 استيراد من Anki</h3>
          <button type="button" className="ai-x" onClick={requestClose}>✕</button>
        </div>

        {!canManage && <div className="ai-warn">{deniedMessage}</div>}

        {phase === 'select' && (
          <>
            <p className="ai-hint">
              اختر ملف <b>.apkg</b> مُصدَّر من Anki أو AnkiDroid. نأخذ منه <b>الأسئلة والإجابات والصور</b> فقط، ونتجاهل باقي الإعدادات (الجدولة، القوالب، الإحصائيات...).
            </p>

            <label
              className={`ai-drop${dragOver ? ' over' : ''}${file ? ' has' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files[0]); }}
            >
              <input ref={inputRef} type="file" accept=".apkg" hidden onChange={e => { pick(e.target.files[0]); e.target.value = ''; }} />
              {file ? (
                <>
                  <div className="ai-file">📄 {file.name}</div>
                  <small>{fmtSize(file.size)} • اضغط لتغيير الملف</small>
                </>
              ) : (
                <>
                  <div className="ai-drop-icon">📦</div>
                  <div>اسحب ملف Anki هنا أو اضغط للاختيار</div>
                  <small>صيغة .apkg — حتى {MAX_APKG_MB} ميجا</small>
                </>
              )}
            </label>

            {error && <div className="ai-error">{error}</div>}

            <div className="ai-mode">
              <label>
                <input type="radio" name="ai-mode" checked={mode === 'append'} onChange={() => setMode('append')} />
                إضافة إلى البطاقات الحالية ({existingCount}) — المتاح {Math.max(0, maxCards - existingCount)} بطاقة
              </label>
              <label>
                <input type="radio" name="ai-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                استبدال كل البطاقات الحالية
              </label>
              {mode === 'replace' && existingCount > 0 && (
                <div className="ai-warn">⚠️ البطاقات الحالية ستُحذف عند الحفظ، وسيفقد الطلاب تقدّمهم المحلي فيها.</div>
              )}
              {room <= 0 && <div className="ai-warn">⚠️ وصلت للحد الأقصى ({maxCards} بطاقة). اختر «استبدال» أو احذف بعض البطاقات.</div>}
            </div>

            <div className="ai-actions">
              <button type="button" className="ai-btn" onClick={requestClose}>إلغاء</button>
              <button type="button" className="ai-btn primary" onClick={start} disabled={!file || room <= 0}>استيراد البطاقات ←</button>
            </div>
          </>
        )}

        {phase === 'working' && (
          <div className="ai-working">
            <div className="ai-spinner" />
            <div className="ai-working-title">{progress < 100 ? 'جاري رفع الملف...' : 'جاري استخراج البطاقات والصور...'}</div>
            <div className="ai-bar"><div className="ai-fill" style={{ width: `${progress}%` }} /></div>
            <small>{progress < 100 ? `${progress}%` : 'قد يستغرق ذلك لحظات حسب عدد الصور'}</small>
          </div>
        )}

        {phase === 'done' && s && (
          <>
            <div className="ai-result">
              <div className="ai-big">{result.cards.length}</div>
              <div>بطاقة جاهزة للإضافة{s.imagesSaved ? ` • ${s.imagesSaved} صورة` : ''}</div>
            </div>

            {notes.length > 0 && (
              <ul className="ai-notes">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}

            <div className="ai-actions">
              <button type="button" className="ai-btn" onClick={requestClose}>إلغاء</button>
              <button type="button" className="ai-btn primary" onClick={confirm}>إضافة {result.cards.length} بطاقة للمحرر</button>
            </div>
            <p className="ai-hint small">البطاقات تُضاف للمحرر فقط — اضغط «حفظ» في المحرر لتثبيتها. يمكنك مراجعتها من «معاينة البطاقات».</p>
          </>
        )}
      </div>

      <style jsx>{`
        .ai-overlay { position: fixed; inset: 0; z-index: 10001; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px); padding: 12px; }
        .ai-box { background: var(--bg-surface); width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; border-radius: 18px; border: 1px solid var(--border-accent); padding: 22px 24px; box-shadow: var(--shadow); }
        .ai-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--border); }
        .ai-head h3 { margin: 0; color: var(--gold); font-size: 1.1rem; }
        .ai-x { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; }
        .ai-x:hover { border-color: var(--gold); color: var(--gold); }
        .ai-hint { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.8; margin: 0 0 14px; }
        .ai-hint.small { font-size: 0.8rem; color: var(--text-muted); margin: 12px 0 0; }
        .ai-drop { display: block; text-align: center; padding: 28px 14px; border: 2px dashed var(--border-accent); border-radius: 14px; color: var(--text-secondary); cursor: pointer; transition: 0.2s; background: var(--bg-base); }
        .ai-drop small { display: block; margin-top: 4px; color: var(--text-muted); }
        .ai-drop:hover, .ai-drop.over { border-color: var(--gold); background: var(--gold-dimmer); color: var(--gold); }
        .ai-drop.has { border-style: solid; }
        .ai-drop-icon { font-size: 2rem; margin-bottom: 6px; }
        .ai-file { color: var(--text-primary); font-weight: bold; word-break: break-all; }
        .ai-error { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #ef4444; padding: 9px 12px; border-radius: 10px; font-size: 0.85rem; margin-top: 12px; }
        .ai-warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #f59e0b; padding: 8px 12px; border-radius: 10px; font-size: 0.85rem; margin: 6px 0; }
        .ai-mode { margin-top: 16px; display: flex; flex-direction: column; gap: 9px; color: var(--text-secondary); font-size: 0.9rem; }
        .ai-mode label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
        .ai-mode input { accent-color: var(--gold); }
        .ai-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 18px; }
        .ai-btn { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 10px 18px; border-radius: 10px; cursor: pointer; font-family: inherit; font-weight: bold; transition: 0.2s; }
        .ai-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
        .ai-btn.primary { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }
        .ai-btn.primary:hover:not(:disabled) { opacity: 0.9; color: #1a1a1a; }
        .ai-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ai-working { text-align: center; padding: 20px 0 8px; color: var(--text-secondary); }
        .ai-working-title { font-weight: bold; color: var(--text-primary); margin: 12px 0; }
        .ai-spinner { width: 34px; height: 34px; border: 3px solid var(--border); border-top-color: var(--gold); border-radius: 50%; margin: 0 auto; animation: ai-spin 0.8s linear infinite; }
        @keyframes ai-spin { to { transform: rotate(360deg); } }
        .ai-bar { height: 6px; background: var(--border); border-radius: 6px; overflow: hidden; margin: 0 auto 8px; max-width: 320px; }
        .ai-fill { height: 100%; background: var(--gold); transition: width 0.2s; }
        .ai-result { text-align: center; background: var(--gold-dimmer); border: 1px solid var(--border-accent); border-radius: 14px; padding: 18px; color: var(--text-secondary); }
        .ai-big { font-size: 2.4rem; font-weight: bold; color: var(--gold); line-height: 1.2; }
        .ai-notes { margin: 14px 0 0; padding: 0 18px 0 0; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.9; }
        .ai-notes li::marker { color: var(--gold); }
      `}</style>
    </div>
  );
}
