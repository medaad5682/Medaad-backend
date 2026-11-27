import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';
import { APP_THEME_KEYS, DEFAULT_APP_THEME, normalizeHex } from '../../../lib/appThemeHelper';

// ─── Icons ──────────────────────────────────────────────
const PaletteIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5"></circle><circle cx="17.5" cy="10.5" r="1.5"></circle><circle cx="8.5" cy="7.5" r="1.5"></circle><circle cx="6.5" cy="12.5" r="1.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.4-.15-.76-.4-1.04-.23-.27-.38-.63-.38-1.04 0-.83.67-1.5 1.5-1.5H16c3.05 0 5.5-2.45 5.5-5.5C21.5 6.17 17.25 2 12 2z"></path></svg>);
const ResetIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>);
const SaveIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>);

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

// ─── دائرة الألوان (Hue = الزاوية، Saturation = البعد عن المركز) ───
function ColorWheel({ value, onChange, size = 220 }) {
  const canvasRef = useRef(null);
  const draggingRef = useRef(false);
  const [hsv, setHsv] = useState(() => { const [r, g, b] = hexToRgb(value); return rgbToHsv(r, g, b); });

  const currentHex = rgbToHex(...hsvToRgb(hsv.h, hsv.s, hsv.v));

  // لو القيمة اتغيرت من برّه (كتابة كود لون / زر الافتراضي / اختيار صف آخر) نزامن الدائرة
  useEffect(() => {
    const n = normalizeHex(value);
    if (n && n !== currentHex) {
      const [r, g, b] = hexToRgb(n);
      setHsv(rgbToHsv(r, g, b));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // رسم الدائرة (تتعاد عند تغيّر السطوع فقط)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
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
    const sat = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2));
    const next = { ...hsv, h: hue, s: sat };
    setHsv(next);
    onChange(rgbToHex(...hsvToRgb(next.h, next.s, next.v)));
  };

  const onBrightness = (val) => {
    const next = { ...hsv, v: val / 100 };
    setHsv(next);
    onChange(rgbToHex(...hsvToRgb(next.h, next.s, next.v)));
  };

  const angle = hsv.h * Math.PI / 180;
  const mx = size / 2 + Math.cos(angle) * hsv.s * (size / 2);
  const my = size / 2 + Math.sin(angle) * hsv.s * (size / 2);
  const pureHex = rgbToHex(...hsvToRgb(hsv.h, hsv.s, 1));

  return (
    <div className="wheel-wrap">
      <div className="wheel" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
          onPointerMove={(e) => { if (draggingRef.current) pick(e); }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
        />
        <div className="marker" style={{ left: mx, top: my, background: currentHex }} />
      </div>
      <div className="bright">
        <span>السطوع</span>
        <input
          type="range" min="0" max="100" step="1"
          value={Math.round(hsv.v * 100)}
          onChange={(e) => onBrightness(Number(e.target.value))}
          style={{ background: `linear-gradient(to left, ${pureHex}, #000000)` }}
        />
      </div>
      <style jsx>{`
        .wheel-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; direction: ltr; }
        .wheel { position: relative; touch-action: none; user-select: none; }
        canvas { display: block; border-radius: 50%; cursor: crosshair; box-shadow: 0 0 0 1px var(--border); }
        .marker {
          position: absolute; width: 20px; height: 20px; border-radius: 50%;
          transform: translate(-50%, -50%); pointer-events: none;
          border: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5);
        }
        .bright { width: 100%; display: flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 0.82rem; direction: rtl; }
        .bright input[type=range] { flex: 1; height: 10px; border-radius: 6px; appearance: none; -webkit-appearance: none; outline: none; border: 1px solid var(--border); direction: ltr; }
        .bright input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid #555; cursor: pointer; }
        .bright input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid #555; cursor: pointer; }
      `}</style>
    </div>
  );
}

// ─── حقل كود اللون (#RRGGBB) ────────────────────────────
function HexInput({ value, onCommit, className = '' }) {
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
      className={`hex-input ${className}`}
      dir="ltr"
      spellCheck={false}
      maxLength={7}
      value={text}
      placeholder="#RRGGBB"
      onChange={(e) => { setText(e.target.value); tryCommit(e.target.value, true); }}
      onBlur={() => { if (!tryCommit(text, false)) setText(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{
        width: '100%', padding: '9px 10px', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.92rem',
        letterSpacing: '0.5px', textTransform: 'uppercase',
        background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)', outline: 'none',
      }}
    />
  );
}

// ─── معاينة شكل التطبيق بالألوان الحالية ────────────────
function PhonePreview({ title, c, prefix }) {
  const bg = c[`${prefix}_bg_primary`], card = c[`${prefix}_bg_secondary`];
  const tp = c[`${prefix}_text_primary`], ts = c[`${prefix}_text_secondary`], ac = c[`${prefix}_accent`];
  const warnings = [];
  if (contrast(tp, bg) < 3) warnings.push('النص الأساسي لا يظهر بوضوح فوق الخلفية');
  if (contrast(ts, bg) < 2) warnings.push('النص الفرعي باهت جداً فوق الخلفية');
  if (contrast(bg, ac) < 2.5) warnings.push('نص الأزرار لا يظهر بوضوح فوق لون الأزرار');
  return (
    <div>
      <div style={{ background: bg, border: '1px solid rgba(128,128,128,0.35)', borderRadius: 16, padding: 14 }}>
        <div style={{ color: tp, fontWeight: 800, fontSize: 15 }}>{title}</div>
        <div style={{ color: ts, fontSize: 12, marginTop: 2 }}>نص فرعي توضيحي</div>
        <div style={{ background: card, borderRadius: 12, padding: 10, margin: '12px 0' }}>
          <div style={{ color: tp, fontWeight: 700, fontSize: 13 }}>كورس التشريح</div>
          <div style={{ color: ts, fontSize: 11, margin: '2px 0 8px' }}>24 فيديو • 6 امتحانات</div>
          <div style={{ height: 6, borderRadius: 3, background: `${ac}33` }}>
            <div style={{ width: '60%', height: '100%', borderRadius: 3, background: ac }} />
          </div>
        </div>
        <div style={{ background: ac, color: bg, borderRadius: 12, textAlign: 'center', padding: '9px 0', fontWeight: 800, fontSize: 13 }}>
          ابدأ المذاكرة
        </div>
      </div>
      {warnings.length > 0 && (
        <div style={{ marginTop: 8, color: '#f59e0b', fontSize: '0.78rem', lineHeight: 1.6 }}>
          {warnings.map(w => <div key={w}>⚠️ {w}</div>)}
        </div>
      )}
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
  const [selectedKey, setSelectedKey] = useState(APP_THEME_KEYS[0].key);
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

  const dirty = useMemo(() => APP_THEME_KEYS.some(({ key }) => colors[key] !== saved[key]), [colors, saved]);
  const selectedMeta = APP_THEME_KEYS.find(k => k.key === selectedKey);

  const setColor = (key, hex) => setColors(prev => (prev[key] === hex ? prev : { ...prev, [key]: hex }));

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
      showToast('تم حفظ الألوان — هتظهر في التطبيق عند فتحه المرة الجاية ✅');
    } catch (e) {
      showToast(e.message || 'فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('هل تريد إعادة كل ألوان التطبيق للوضع الافتراضي؟ سيتم حذف التخصيص المحفوظ.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/super/app-theme', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشلت إعادة الضبط');
      setColors({ ...DEFAULT_APP_THEME });
      setSaved({ ...DEFAULT_APP_THEME });
      setIsCustom(false);
      showToast('تمت إعادة الألوان للوضع الافتراضي ✅');
    } catch (e) {
      showToast(e.message || 'فشلت إعادة الضبط', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderGroup = (group, title, icon) => (
    <div className="card">
      <div className="card-header"><h3>{icon} {title}</h3></div>
      <div className="card-body rows">
        {APP_THEME_KEYS.filter(k => k.group === group).map(({ key, label, hint }) => {
          const active = key === selectedKey;
          const changedFromDefault = colors[key] !== DEFAULT_APP_THEME[key];
          return (
            <div key={key} className={`color-row ${active ? 'active' : ''}`} onClick={() => setSelectedKey(key)}>
              <button
                type="button"
                className="swatch"
                style={{ background: colors[key] }}
                title="اختيار من دائرة الألوان"
                onClick={() => setSelectedKey(key)}
              />
              <div className="row-text">
                <div className="row-label">{label}</div>
                <div className="row-hint">{hint}</div>
              </div>
              <div className="row-hex" onClick={(e) => { e.stopPropagation(); setSelectedKey(key); }}>
                <HexInput value={colors[key]} onCommit={(hex) => setColor(key, hex)} />
              </div>
              <button
                type="button"
                className="mini-reset"
                disabled={!changedFromDefault}
                title="الرجوع للون الافتراضي"
                onClick={(e) => { e.stopPropagation(); setColor(key, DEFAULT_APP_THEME[key]); }}
              >
                <ResetIcon />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <SuperLayout title="ألوان التطبيق">
      <Head><title>ألوان التطبيق | الإدارة العليا</title></Head>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.message}</div>

      <div className="container">
        <div className="page-header">
          <div className="header-icon"><PaletteIcon /></div>
          <div>
            <h1>التحكم في ألوان التطبيق</h1>
            <p>
              اختار اللون من دائرة الألوان أو اكتب كوده مباشرة، وشوف المعاينة قبل الحفظ.
              <span className={`status-pill ${isCustom ? 'custom' : 'default'}`}>
                {isCustom ? 'الألوان الحالية: مخصصة' : 'الألوان الحالية: الافتراضية'}
              </span>
              {dirty && <span className="status-pill unsaved">تعديلات غير محفوظة</span>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : (
          <>
            <div className="layout">
              <div className="col-editor">
                {renderGroup('dark', 'الوضع الليلي', '🌙')}
                {renderGroup('light', 'الوضع النهاري', '☀️')}
              </div>

              <div className="col-side">
                <div className="card sticky">
                  <div className="card-header">
                    <h3>🎨 المنتقي — {selectedMeta.group === 'dark' ? 'الليلي' : 'النهاري'} / {selectedMeta.label}</h3>
                  </div>
                  <div className="card-body picker-body">
                    <ColorWheel value={colors[selectedKey]} onChange={(hex) => setColor(selectedKey, hex)} />
                    <div className="picker-hex">
                      <HexInput value={colors[selectedKey]} onCommit={(hex) => setColor(selectedKey, hex)} />
                      <button
                        type="button"
                        className="btn btn-ghost small"
                        disabled={colors[selectedKey] === DEFAULT_APP_THEME[selectedKey]}
                        onClick={() => setColor(selectedKey, DEFAULT_APP_THEME[selectedKey])}
                      >
                        <ResetIcon /> الافتراضي ({DEFAULT_APP_THEME[selectedKey]})
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3>👁️ معاينة مباشرة</h3></div>
                  <div className="card-body previews">
                    <PhonePreview title="الوضع الليلي" c={colors} prefix="dark" />
                    <PhonePreview title="الوضع النهاري" c={colors} prefix="light" />
                  </div>
                </div>
              </div>
            </div>

            <div className="action-bar">
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                <SaveIcon /> {saving ? 'جاري الحفظ...' : 'حفظ الألوان'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setColors({ ...saved })} disabled={saving || !dirty}>
                تراجع عن التعديلات
              </button>
              <button type="button" className="btn btn-danger" onClick={handleResetAll} disabled={saving || (!isCustom && !dirty)}>
                <ResetIcon /> إعادة الألوان للوضع الافتراضي
              </button>
            </div>

            <p className="note">
              التطبيق بيجيب الألوان من السيرفر عند فتحه. لو السيرفر مردّش أو مفيش نت، بيستخدم آخر ألوان
              اتحمّلت قبل كده، ولو مفيش بيرجع لألوانه الافتراضية المدمجة. ألوان الحالة (النجاح/الخطأ/الأزرق/البرتقالي) ثابتة ومش جزء من هذه الصفحة.
            </p>
          </>
        )}
      </div>

      <style jsx>{`
        .container { max-width: 1100px; margin: 0 auto; padding-bottom: 60px; }
        .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .header-icon { width: 48px; height: 48px; flex-shrink: 0; background: var(--gold-dim); color: var(--gold); border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-accent); }
        .page-header h1 { margin: 0 0 6px; color: var(--text-primary); font-size: 1.6rem; font-weight: 800; }
        .page-header p { margin: 0; color: var(--text-secondary); font-size: 0.95rem; line-height: 1.9; }
        .status-pill { display: inline-block; margin-inline-start: 10px; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border); }
        .status-pill.custom { color: var(--gold); border-color: var(--border-accent); background: var(--gold-dim); }
        .status-pill.default { color: var(--text-muted); }
        .status-pill.unsaved { color: #f59e0b; border-color: #f59e0b66; background: #f59e0b1a; }

        .layout { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
        .col-editor, .col-side { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
        .sticky { position: sticky; top: 16px; }
        @media (max-width: 920px) { .layout { grid-template-columns: 1fr; } .sticky { position: static; } }

        .card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); }
        .card-header { background: var(--bg-elevated); padding: 16px 22px; border-bottom: 1px solid var(--border); }
        .card-header h3 { margin: 0; color: var(--gold); font-size: 1.02rem; font-weight: 700; }
        .card-body { padding: 18px 22px; }
        .rows { display: flex; flex-direction: column; gap: 10px; padding: 14px; }
        .previews { display: flex; flex-direction: column; gap: 18px; }
        .picker-body { display: flex; flex-direction: column; gap: 16px; }
        .picker-hex { display: flex; flex-direction: column; gap: 10px; }

        .color-row { display: grid; grid-template-columns: 44px 1fr 120px 34px; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-elevated); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
        .color-row:hover { border-color: var(--border-accent); }
        .color-row.active { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-dim); }
        .swatch { width: 44px; height: 44px; border-radius: 12px; border: 2px solid rgba(128,128,128,0.45); cursor: pointer; padding: 0; }
        .row-label { color: var(--text-primary); font-weight: 700; font-size: 0.95rem; }
        .row-hint { color: var(--text-muted); font-size: 0.78rem; margin-top: 2px; }
        .mini-reset { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); cursor: pointer; }
        .mini-reset:disabled { opacity: 0.3; cursor: default; }
        .mini-reset:not(:disabled):hover { color: var(--gold); border-color: var(--gold); }
        @media (max-width: 560px) { .color-row { grid-template-columns: 44px 1fr 34px; } .row-hex { grid-column: 1 / -1; grid-row: 2; } }

        .action-bar { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 12px; padding: 16px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 14px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-weight: 700; font-size: 0.95rem; cursor: pointer; border: 1px solid transparent; transition: opacity .15s, transform .1s; font-family: inherit; }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn:not(:disabled):active { transform: scale(0.98); }
        .btn.small { padding: 8px 12px; font-size: 0.85rem; }
        .btn-primary { background: var(--gold); color: #111; }
        .btn-ghost { background: transparent; color: var(--text-primary); border-color: var(--border); }
        .btn-danger { background: transparent; color: #ef4444; border-color: #ef444466; margin-inline-start: auto; }
        .note { margin-top: 16px; color: var(--text-muted); font-size: 0.85rem; line-height: 1.9; }

        .loading-wrap { display: flex; justify-content: center; padding: 80px 0; }
        .spinner { width: 38px; height: 38px; border: 4px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .toast { position: fixed; top: 20px; left: 50%; transform: translate(-50%, -120px); padding: 12px 22px; border-radius: 10px; font-weight: 700; z-index: 9999; color: #fff; background: #16a34a; box-shadow: 0 8px 24px rgba(0,0,0,0.35); transition: transform .3s; max-width: 90vw; text-align: center; }
        .toast.error { background: #dc2626; }
        .toast.show { transform: translate(-50%, 0); }
      `}</style>
    </SuperLayout>
  );
}
