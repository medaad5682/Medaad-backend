import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';
import { APP_THEME_KEYS, DEFAULT_APP_THEME, normalizeHex } from '../../../lib/appThemeHelper';

// ⚠️ كل الـ classes هنا بادئة بـ ac- عمداً: في styles/globals.css قواعد عامة (مثل .container)
// كانت بتكسر التخطيط. ولا نستخدم أي عنصر افتراضي من المتصفح (confirm / range / أزرار غير منسّقة).

const MODES = [
  { id: 'dark', label: 'الوضع الليلي', icon: '🌙' },
  { id: 'light', label: 'الوضع النهاري', icon: '☀️' },
];

// ─── Icons ──────────────────────────────────────────────
const PaletteIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5"></circle><circle cx="17.5" cy="10.5" r="1.5"></circle><circle cx="8.5" cy="7.5" r="1.5"></circle><circle cx="6.5" cy="12.5" r="1.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.4-.15-.76-.4-1.04-.23-.27-.38-.63-.38-1.04 0-.83.67-1.5 1.5-1.5H16c3.05 0 5.5-2.45 5.5-5.5C21.5 6.17 17.25 2 12 2z"></path></svg>);
const ResetIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>);
const SaveIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>);
const UndoIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>);

// ─── Color math ─────────────────────────────────────────
function hexToRgb(hex) {
  const h = normalizeHex(hex) || '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const hexToHsv = (hex) => { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b); };
const hsvToHex = ({ h, s, v }) => rgbToHex(...hsvToRgb(h, s, v));
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ─── دائرة الألوان (الزاوية = اللون، البعد عن المركز = التشبّع) ───
function Wheel({ hsv, color, onPick, size = 220 }) {
  const canvasRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    canvas.width = px; canvas.height = px;
    const img = ctx.createImageData(px, px);
    const c = px / 2, R = c - 1;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R + 1) continue;
        let hue = Math.atan2(dy, dx) * 180 / Math.PI;
        if (hue < 0) hue += 360;
        const [r, g, b] = hsvToRgb(hue, Math.min(1, dist / R), hsv.v);
        const i = (y * px + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
        img.data[i + 3] = dist <= R ? 255 : Math.round(255 * (R + 1 - dist));
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [size, hsv.v]);

  const pick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    let hue = Math.atan2(dy, dx) * 180 / Math.PI;
    if (hue < 0) hue += 360;
    onPick(hue, Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2)));
  };

  const angle = hsv.h * Math.PI / 180;
  const mx = size / 2 + Math.cos(angle) * hsv.s * (size / 2);
  const my = size / 2 + Math.sin(angle) * hsv.s * (size / 2);

  return (
    <div className="ac-wheel" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        onPointerDown={(e) => { draggingRef.current = true; if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (draggingRef.current) pick(e); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
      />
      <div className="ac-marker" style={{ left: mx, top: my, background: color }} />
    </div>
  );
}

// ─── شريط السطوع (مخصّص بالكامل، بدون input range) ─────────
const THUMB_INSET = 12;
function ValueSlider({ v, pureHex, onChange }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const fromEvent = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    onChange(clamp01((e.clientX - r.left - THUMB_INSET) / Math.max(1, r.width - THUMB_INSET * 2)));
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp01(v + step)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp01(v - step)); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0); }
    else if (e.key === 'End') { e.preventDefault(); onChange(1); }
  };

  return (
    <div
      ref={trackRef}
      className="ac-slider"
      dir="ltr"
      role="slider"
      tabIndex={0}
      aria-label="السطوع"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      style={{ background: `linear-gradient(to right, #000000, ${pureHex})` }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { draggingRef.current = true; if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e); }}
      onPointerMove={(e) => { if (draggingRef.current) fromEvent(e); }}
      onPointerUp={() => { draggingRef.current = false; }}
      onPointerCancel={() => { draggingRef.current = false; }}
    >
      <div className="ac-thumb" style={{ left: `calc(${THUMB_INSET}px + (100% - ${THUMB_INSET * 2}px) * ${v})` }} />
    </div>
  );
}

// ─── حقل كود اللون (#RRGGBB) ────────────────────────────
function HexInput({ value, onCommit }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  const tryCommit = (raw, strict6) => {
    const t = raw.trim();
    if (strict6 && !/^#?[0-9a-fA-F]{6}$/.test(t)) return false;
    const n = normalizeHex(t);
    if (!n) return false;
    onCommit(n);
    return true;
  };

  return (
    <input
      className="ac-hex"
      dir="ltr"
      spellCheck={false}
      autoComplete="off"
      maxLength={7}
      value={text}
      placeholder="#RRGGBB"
      onChange={(e) => { setText(e.target.value); tryCommit(e.target.value, true); }}
      onBlur={() => { if (!tryCommit(text, false)) setText(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

// ─── المنتقي: دائرة + كود + سطوع + مقارنة بالافتراضي ───────
function ColorPicker({ value, defaultValue, label, hint, onChange }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const currentHex = hsvToHex(hsv);

  // مزامنة لو القيمة اتغيّرت من برّه (كتابة كود / اختيار لون آخر / الافتراضي)
  useEffect(() => {
    const n = normalizeHex(value);
    if (n && n !== currentHex) setHsv(hexToHsv(n));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next) => { setHsv(next); onChange(hsvToHex(next)); };
  const pureHex = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  const isDefault = value === defaultValue;

  return (
    <div className="ac-picker">
      <Wheel hsv={hsv} color={currentHex} onPick={(h, s) => apply({ ...hsv, h, s })} />
      <div className="ac-controls">
        <div className="ac-sel">
          <span className="ac-sel-name">{label}</span>
          <span className="ac-sel-hint">{hint}</span>
        </div>

        <div className="ac-field">
          <span className="ac-field-label">كود اللون</span>
          <HexInput value={value} onCommit={onChange} />
        </div>

        <div className="ac-field">
          <span className="ac-field-label">السطوع</span>
          <ValueSlider v={hsv.v} pureHex={pureHex} onChange={(v) => apply({ ...hsv, v })} />
        </div>

        <div className="ac-compare">
          <div className="ac-cmp">
            <span className="ac-cmp-box" style={{ background: value }} />
            <span className="ac-cmp-text"><b>الحالي</b><i>{value}</i></span>
          </div>
          <button type="button" className="ac-cmp ac-cmp-btn" disabled={isDefault} onClick={() => onChange(defaultValue)}>
            <span className="ac-cmp-box" style={{ background: defaultValue }} />
            <span className="ac-cmp-text"><b>{isDefault ? 'هو الافتراضي' : 'استرجاع الافتراضي'}</b><i>{defaultValue}</i></span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── معاينة مباشرة لشكل التطبيق ─────────────────────────
function PhonePreview({ c, prefix }) {
  const bg = c[`${prefix}_bg_primary`], card = c[`${prefix}_bg_secondary`];
  const tp = c[`${prefix}_text_primary`], ts = c[`${prefix}_text_secondary`], ac = c[`${prefix}_accent`];
  const t = 'background-color .25s ease, color .25s ease, border-color .25s ease';

  const warnings = [];
  if (contrast(tp, bg) < 3) warnings.push('النص الأساسي لا يظهر بوضوح فوق الخلفية');
  if (contrast(ts, bg) < 2) warnings.push('النص الفرعي باهت جداً فوق الخلفية');
  if (contrast(bg, ac) < 2.5) warnings.push('نص الأزرار لا يظهر بوضوح فوق لون الأزرار');
  if (contrast(ac, bg) < 1.6) warnings.push('لون الأزرار قريب جداً من لون الخلفية');

  return (
    <div>
      <div className="ac-phone" style={{ background: bg, transition: t }}>
        <div className="ac-phone-top">
          <div>
            <div style={{ color: tp, fontWeight: 800, fontSize: 15, transition: t }}>أهلاً بك 👋</div>
            <div style={{ color: ts, fontSize: 11, marginTop: 2, transition: t }}>كمّل من حيث توقفت</div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: ac, transition: t }} />
        </div>

        <div style={{ background: card, borderRadius: 14, padding: 12, transition: t }}>
          <div style={{ color: tp, fontWeight: 700, fontSize: 13, transition: t }}>كورس التشريح</div>
          <div style={{ color: ts, fontSize: 11, margin: '3px 0 10px', transition: t }}>24 فيديو • 6 امتحانات</div>
          <div style={{ height: 6, borderRadius: 3, background: `${ac}33`, transition: t }}>
            <div style={{ width: '60%', height: '100%', borderRadius: 3, background: ac, transition: t }} />
          </div>
        </div>

        <div style={{ background: ac, color: bg, borderRadius: 14, textAlign: 'center', padding: '11px 0', fontWeight: 800, fontSize: 13, margin: '12px 0', transition: t }}>
          ابدأ المذاكرة
        </div>

        <div style={{ background: card, borderRadius: 14, padding: '10px 6px', display: 'flex', justifyContent: 'space-around', transition: t }}>
          {['الرئيسية', 'كورساتي', 'حسابي'].map((n, i) => (
            <div key={n} style={{ textAlign: 'center', color: i === 0 ? ac : ts, fontSize: 10, fontWeight: i === 0 ? 800 : 500, transition: t }}>
              <div style={{ width: 18, height: 18, borderRadius: 6, background: i === 0 ? ac : ts, opacity: i === 0 ? 1 : 0.45, margin: '0 auto 4px', transition: t }} />
              {n}
            </div>
          ))}
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="ac-warn">{warnings.map(w => <div key={w}>⚠️ {w}</div>)}</div>
      )}
    </div>
  );
}

// ─── نافذة تأكيد مخصّصة (بدل window.confirm) ────────────
function ConfirmModal({ open, title, message, confirmLabel, busy, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="ac-overlay" onClick={onCancel}>
      <div className="ac-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ac-modal-title">{title}</div>
        <div className="ac-modal-msg">{message}</div>
        <div className="ac-modal-actions">
          <button type="button" className="ac-btn ac-btn-danger-solid" onClick={onConfirm} disabled={busy}>{busy ? 'جاري التنفيذ...' : confirmLabel}</button>
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onCancel} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ─── الصفحة ─────────────────────────────────────────────
export default function SuperAppColors() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colors, setColors] = useState({ ...DEFAULT_APP_THEME });
  const [saved, setSaved] = useState({ ...DEFAULT_APP_THEME });
  const [isCustom, setIsCustom] = useState(false);
  const [mode, setMode] = useState('dark');
  const [selected, setSelected] = useState({ dark: 'dark_bg_primary', light: 'light_bg_primary' });
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/super/app-theme');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        const merged = { ...DEFAULT_APP_THEME, ...(data.colors || {}) };
        setColors(merged);
        setSaved(merged);
        setIsCustom(!!data.is_custom);
      } catch (e) {
        showToast('فشل جلب ألوان التطبيق', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const changedKeys = useMemo(() => APP_THEME_KEYS.filter(({ key }) => colors[key] !== saved[key]).map(k => k.key), [colors, saved]);
  const dirty = changedKeys.length > 0;
  const modeDirty = (m) => changedKeys.some(k => k.startsWith(`${m}_`));

  const modeKeys = APP_THEME_KEYS.filter(k => k.group === mode);
  const selectedKey = selected[mode];
  const selectedMeta = APP_THEME_KEYS.find(k => k.key === selectedKey);

  const setColor = useCallback((key, hex) => setColors(prev => (prev[key] === hex ? prev : { ...prev, [key]: hex })), []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/super/app-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ');
      setSaved({ ...colors });
      setIsCustom(true);
      showToast('تم الحفظ ✅ الألوان هتظهر في التطبيق عند الفتح القادم');
    } catch (e) {
      showToast(e.message || 'فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/super/app-theme', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشلت إعادة الضبط');
      setColors({ ...DEFAULT_APP_THEME });
      setSaved({ ...DEFAULT_APP_THEME });
      setIsCustom(false);
      setConfirmReset(false);
      showToast('تمت إعادة الألوان للوضع الافتراضي ✅');
    } catch (e) {
      showToast(e.message || 'فشلت إعادة الضبط', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperLayout title="ألوان التطبيق">
      <Head><title>ألوان التطبيق | الإدارة العليا</title></Head>

      <div className={`ac-toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.message}</div>

      <div className="ac-page">
        {/* ── الرأس ── */}
        <div className="ac-header">
          <div className="ac-header-icon"><PaletteIcon /></div>
          <div className="ac-header-text">
            <h1>ألوان التطبيق</h1>
            <p>اختار اللون من الدائرة أو اكتب كوده، وشوف النتيجة فوراً قبل الحفظ.</p>
          </div>
          <div className="ac-pills">
            <span className={`ac-pill ${isCustom ? 'custom' : ''}`}>{isCustom ? 'مخصصة' : 'الافتراضية'}</span>
            {dirty && <span className="ac-pill unsaved">{changedKeys.length} تعديل غير محفوظ</span>}
          </div>
        </div>

        {loading ? (
          <div className="ac-loading"><div className="ac-spinner" /></div>
        ) : (
          <>
            {/* ── تبديل الوضع ── */}
            <div className="ac-seg" role="tablist">
              <div className={`ac-seg-ind ${mode}`} />
              {MODES.map(m => (
                <button key={m.id} type="button" role="tab" aria-selected={mode === m.id}
                  className={`ac-seg-btn ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>
                  <span>{m.icon} {m.label}</span>
                  {modeDirty(m.id) && <span className="ac-seg-dot" />}
                </button>
              ))}
            </div>

            <div className="ac-grid">
              {/* ── المحرر ── */}
              <section className="ac-card">
                <div className="ac-card-title">اختار اللون اللي عاوز تغيّره</div>
                <div className="ac-chips">
                  {modeKeys.map(({ key, label }) => (
                    <button key={key} type="button"
                      className={`ac-chip ${key === selectedKey ? 'on' : ''}`}
                      onClick={() => setSelected(s => ({ ...s, [mode]: key }))}>
                      <span className="ac-dot" style={{ background: colors[key] }} />
                      <span className="ac-chip-text">
                        <b>{label}</b>
                        <i>{colors[key]}</i>
                      </span>
                      {colors[key] !== saved[key] && <span className="ac-chip-mod" title="تعديل غير محفوظ" />}
                    </button>
                  ))}
                </div>

                <div className="ac-divider" />

                <ColorPicker
                  value={colors[selectedKey]}
                  defaultValue={DEFAULT_APP_THEME[selectedKey]}
                  label={selectedMeta.label}
                  hint={selectedMeta.hint}
                  onChange={(hex) => setColor(selectedKey, hex)}
                />
              </section>

              {/* ── المعاينة ── */}
              <aside className="ac-card ac-preview-card">
                <div className="ac-card-title">معاينة — {mode === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}</div>
                <PhonePreview c={colors} prefix={mode} />
              </aside>
            </div>

            {/* ── شريط الإجراءات ── */}
            <div className="ac-actions">
              <button type="button" className="ac-btn ac-btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                <SaveIcon /> {saving ? 'جاري الحفظ...' : 'حفظ الألوان'}
              </button>
              <button type="button" className="ac-btn ac-btn-ghost" onClick={() => setColors({ ...saved })} disabled={saving || !dirty}>
                <UndoIcon /> تراجع عن التعديلات
              </button>
              <button type="button" className="ac-btn ac-btn-danger" onClick={() => setConfirmReset(true)} disabled={saving || (!isCustom && !dirty)}>
                <ResetIcon /> إعادة للوضع الافتراضي
              </button>
            </div>

            <p className="ac-note">
              التطبيق بيجيب الألوان من السيرفر ويحفظها عنده، وبتظهر للمستخدم عند فتح التطبيق المرة الجاية (من غير وميض).
              لو السيرفر مردّش بيستخدم آخر ألوان محفوظة، ولو مفيش بيرجع لألوانه الافتراضية المدمجة.
              ألوان الحالة (نجاح / خطأ / أزرق / برتقالي) ثابتة ومش جزء من هذه الصفحة.
            </p>
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmReset}
        title="إعادة الألوان للوضع الافتراضي؟"
        message="هيتم حذف التخصيص المحفوظ بالكامل، والتطبيق هيرجع لألوانه الأصلية عند الفتح القادم."
        confirmLabel="نعم، أعد الضبط"
        busy={saving}
        onConfirm={handleResetAll}
        onCancel={() => { if (!saving) setConfirmReset(false); }}
      />

      <style jsx global>{`
        .ac-page { width: 100%; max-width: 1100px; margin: 0 auto; padding-bottom: 40px; }

        /* header */
        .ac-header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 22px; }
        .ac-header-icon { width: 46px; height: 46px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); }
        .ac-header-text { flex: 1 1 220px; min-width: 0; }
        .ac-header-text h1 { margin: 0 0 4px; font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
        .ac-header-text p { margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.7; }
        .ac-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .ac-pill { padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-elevated); }
        .ac-pill.custom { color: var(--gold); border-color: var(--border-accent); background: var(--gold-dim); }
        .ac-pill.unsaved { color: #f59e0b; border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.1); }

        /* segmented mode switch */
        .ac-seg { position: relative; display: flex; direction: rtl; width: 100%; max-width: 380px; margin-bottom: 20px; padding: 4px; border-radius: 14px; background: var(--bg-elevated); border: 1px solid var(--border); }
        .ac-seg-ind { position: absolute; top: 4px; bottom: 4px; width: calc(50% - 4px); border-radius: 10px; background: var(--gold); box-shadow: 0 2px 10px rgba(0,0,0,0.25); transition: right .28s cubic-bezier(.4,0,.2,1); }
        .ac-seg-ind.dark { right: 4px; }
        .ac-seg-ind.light { right: 50%; }
        .ac-seg-btn { position: relative; z-index: 1; flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 12px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font-family: inherit; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: color .2s; -webkit-appearance: none; appearance: none; outline: none; }
        .ac-seg-btn.on { color: #111; }
        .ac-seg-btn:focus-visible { box-shadow: 0 0 0 2px var(--gold-dim); }
        .ac-seg-dot { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; }

        /* grid + cards */
        .ac-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
        .ac-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 18px; padding: 20px; box-shadow: var(--shadow); min-width: 0; }
        .ac-card-title { margin-bottom: 14px; font-size: 0.95rem; font-weight: 700; color: var(--gold); }
        .ac-divider { height: 1px; background: var(--border); margin: 20px 0; }
        .ac-preview-card { position: sticky; top: 16px; }
        @media (max-width: 920px) { .ac-grid { grid-template-columns: minmax(0, 1fr); } .ac-preview-card { position: static; } }

        /* color chips */
        .ac-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; }
        .ac-chip { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-primary); font-family: inherit; text-align: start; cursor: pointer; transition: border-color .18s, box-shadow .18s, transform .1s, background-color .18s; -webkit-appearance: none; appearance: none; outline: none; }
        .ac-chip:hover { border-color: var(--border-accent); }
        .ac-chip:active { transform: scale(0.98); }
        .ac-chip.on { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-dim); }
        .ac-chip:focus-visible { box-shadow: 0 0 0 3px var(--gold-dim); }
        .ac-dot { width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; border: 2px solid rgba(128,128,128,0.45); transition: background-color .2s; }
        .ac-chip-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.5; }
        .ac-chip-text b { font-size: 0.86rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ac-chip-text i { font-style: normal; font-family: monospace; font-size: 0.74rem; color: var(--text-muted); direction: ltr; text-align: start; }
        .ac-chip-mod { position: absolute; top: 8px; inset-inline-end: 8px; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }

        /* picker */
        .ac-picker { display: flex; flex-wrap: wrap; gap: 26px; align-items: center; justify-content: center; }
        .ac-wheel { position: relative; flex-shrink: 0; touch-action: none; user-select: none; direction: ltr; }
        .ac-wheel canvas { display: block; border-radius: 50%; cursor: crosshair; box-shadow: 0 0 0 1px var(--border), 0 8px 24px rgba(0,0,0,0.25); }
        .ac-marker { position: absolute; width: 22px; height: 22px; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; border: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.5); }
        .ac-controls { flex: 1 1 250px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
        .ac-sel { display: flex; flex-direction: column; gap: 2px; }
        .ac-sel-name { font-size: 1.05rem; font-weight: 800; color: var(--text-primary); }
        .ac-sel-hint { font-size: 0.8rem; color: var(--text-muted); }
        .ac-field { display: flex; flex-direction: column; gap: 7px; }
        .ac-field-label { font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); }

        .ac-hex { width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: monospace; font-size: 1rem; letter-spacing: 1px; text-transform: uppercase; outline: none; transition: border-color .18s, box-shadow .18s; -webkit-appearance: none; appearance: none; }
        .ac-hex:focus { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-dim); }

        .ac-slider { position: relative; height: 26px; border-radius: 13px; border: 1px solid var(--border); cursor: pointer; touch-action: none; user-select: none; outline: none; }
        .ac-slider:focus-visible { box-shadow: 0 0 0 3px var(--gold-dim); }
        .ac-thumb { position: absolute; top: 50%; width: 24px; height: 24px; border-radius: 50%; transform: translate(-50%, -50%); background: #fff; border: 3px solid rgba(0,0,0,0.55); box-shadow: 0 2px 6px rgba(0,0,0,0.4); pointer-events: none; }

        .ac-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ac-cmp { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-primary); font-family: inherit; text-align: start; min-width: 0; -webkit-appearance: none; appearance: none; outline: none; }
        .ac-cmp-btn { cursor: pointer; transition: border-color .18s, opacity .18s; }
        .ac-cmp-btn:not(:disabled):hover { border-color: var(--gold); }
        .ac-cmp-btn:disabled { opacity: 0.55; cursor: default; }
        .ac-cmp-box { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; border: 1px solid rgba(128,128,128,0.45); }
        .ac-cmp-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.5; }
        .ac-cmp-text b { font-size: 0.76rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ac-cmp-text i { font-style: normal; font-family: monospace; font-size: 0.72rem; color: var(--text-muted); direction: ltr; text-align: start; }

        /* preview */
        .ac-phone { border-radius: 26px; padding: 16px; border: 1px solid rgba(128,128,128,0.35); box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
        .ac-phone-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .ac-warn { margin-top: 12px; color: #f59e0b; font-size: 0.78rem; line-height: 1.7; }

        /* actions */
        .ac-actions { position: sticky; bottom: 12px; z-index: 5; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; padding: 12px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--border); box-shadow: 0 -6px 24px rgba(0,0,0,0.25); }
        .ac-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 20px; border-radius: 12px; border: 1px solid transparent; font-family: inherit; font-size: 0.93rem; font-weight: 700; cursor: pointer; transition: opacity .15s, transform .1s, background-color .15s, border-color .15s; -webkit-appearance: none; appearance: none; outline: none; }
        .ac-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ac-btn:not(:disabled):active { transform: scale(0.97); }
        .ac-btn:focus-visible { box-shadow: 0 0 0 3px var(--gold-dim); }
        .ac-btn-primary { background: var(--gold); color: #111; }
        .ac-btn-primary:not(:disabled):hover { background: var(--gold-light); }
        .ac-btn-ghost { background: transparent; color: var(--text-primary); border-color: var(--border); }
        .ac-btn-ghost:not(:disabled):hover { border-color: var(--border-accent); }
        .ac-btn-danger { background: transparent; color: #ef4444; border-color: rgba(239,68,68,0.45); margin-inline-start: auto; }
        .ac-btn-danger:not(:disabled):hover { background: rgba(239,68,68,0.1); }
        .ac-btn-danger-solid { background: #dc2626; color: #fff; }
        @media (max-width: 560px) { .ac-actions .ac-btn { flex: 1 1 100%; } .ac-btn-danger { margin-inline-start: 0; } }

        .ac-note { margin: 16px 2px 0; font-size: 0.82rem; line-height: 1.9; color: var(--text-muted); }

        /* modal */
        .ac-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.6); animation: ac-fade .15s ease; }
        .ac-modal { width: 100%; max-width: 400px; padding: 22px; border-radius: 18px; background: var(--bg-surface); border: 1px solid var(--border); box-shadow: 0 20px 50px rgba(0,0,0,0.5); animation: ac-pop .18s ease; }
        .ac-modal-title { margin-bottom: 8px; font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }
        .ac-modal-msg { margin-bottom: 20px; font-size: 0.9rem; line-height: 1.8; color: var(--text-secondary); }
        .ac-modal-actions { display: flex; flex-direction: column; gap: 8px; }
        @keyframes ac-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ac-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }

        /* loading + toast */
        .ac-loading { display: flex; justify-content: center; padding: 80px 0; }
        .ac-spinner { width: 38px; height: 38px; border-radius: 50%; border: 4px solid var(--border); border-top-color: var(--gold); animation: ac-spin .8s linear infinite; }
        @keyframes ac-spin { to { transform: rotate(360deg); } }
        .ac-toast { position: fixed; top: 20px; left: 50%; transform: translate(-50%, -120px); z-index: 10001; max-width: 90vw; padding: 12px 22px; border-radius: 12px; background: #16a34a; color: #fff; font-weight: 700; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.35); transition: transform .3s; }
        .ac-toast.error { background: #dc2626; }
        .ac-toast.show { transform: translate(-50%, 0); }
      `}</style>
    </SuperLayout>
  );
}
