import { useMemo, useState } from 'react';
import SuperLayout from '../../../components/SuperLayout';
import {
  PRICING_CONFIG,
  DEFAULT_INPUTS,
  calculatePricing,
} from '../../../lib/pricingCalculator';

// ─── Formatting helpers (UI only) ───────────────────────────────────────
const nf = (n, d = 2) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n, d = 2) => `${nf(n, d)} ج.م`;

const CalcIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="11" x2="8.01" y2="11"></line><line x1="12" y1="11" x2="12.01" y2="11"></line><line x1="16" y1="11" x2="16.01" y2="11"></line><line x1="8" y1="15" x2="8.01" y2="15"></line><line x1="12" y1="15" x2="12.01" y2="15"></line><line x1="16" y1="15" x2="16.01" y2="15"></line><line x1="8" y1="19" x2="16" y2="19"></line></svg>);

// ─── Small presentational pieces ────────────────────────────────────────
function Field({ label, hint, error, children }) {
  return (
    <label className="pc-field">
      <span className="pc-label">{label}</span>
      {children}
      {hint && !error && <span className="pc-hint">{hint}</span>}
      {error && <span className="pc-error" role="alert">{error}</span>}
    </label>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`pc-row ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function PriceBox({ num, title, value, unit, lines, notes, main }) {
  return (
    <div className={`pc-box ${main ? 'main' : ''}`}>
      <span className="pc-box-title">{num}. {title}</span>
      <div className="pc-box-val">{value}<small>{unit}</small></div>
      {lines && lines.map(([k, v]) => <div key={k} className="pc-box-line"><span>{k}</span><b>{v}</b></div>)}
      {notes && notes.map((n) => <span key={n} className="pc-box-note">{n}</span>)}
    </div>
  );
}

export default function PricingCalculator() {
  const [inputs, setInputs] = useState({ ...DEFAULT_INPUTS });
  const [touched, setTouched] = useState(false); // hide validation noise until the admin starts typing
  const set = (key) => (e) => { setTouched(true); setInputs((p) => ({ ...p, [key]: e.target.value })); };
  const reset = () => { setTouched(false); setInputs({ ...DEFAULT_INPUTS }); };

  // Instant recalculation on every change.
  const calc = useMemo(() => calculatePricing(inputs), [inputs]);
  const r = calc.results;
  const errors = touched ? calc.errors : {};

  const input = (key, placeholder, mode = 'decimal') => (
    <input className={`pc-input ${errors[key] ? 'bad' : ''}`} inputMode={mode} value={inputs[key]} onChange={set(key)} placeholder={placeholder} aria-invalid={!!errors[key]} />
  );

  const decision = !r ? '' : r.recommendedBy === 'minimum'
    ? 'الحد الأدنى الآمن أعلى من السعر التجاري المرجعي، لذلك تم اعتماده.'
    : r.recommendedBy === 'competitive' ? 'السعر التجاري المرجعي أعلى من الحد الأدنى الآمن.' : 'السعر التجاري المرجعي يساوي الحد الأدنى الآمن.';
  const n0 = (x) => nf(x, 0);

  return (
    <SuperLayout title="حاسبة التسعير">
      <div className="pc-container">
        <div className="pc-header">
          <div className="pc-header-icon"><CalcIcon /></div>
          <h1>حاسبة التسعير</h1>
          <button type="button" className="pc-btn-reset" onClick={reset}>↺ إعادة التعيين</button>
        </div>

        {/* ── Inputs ── */}
        <section className="pc-panel">
          <div className="pc-grid">
            <Field label="عدد الطلاب" error={errors.students}>{input('students', 'مثال: 170', 'numeric')}</Field>
            <Field label="عدد الكورسات" error={errors.courses}>{input('courses', 'مثال: 13', 'numeric')}</Field>
            <Field label="عدد الفيديوهات لكل كورس" error={errors.videosPerCourse}>{input('videosPerCourse', 'مثال: 15', 'numeric')}</Field>
            <Field label="مدة الفيديو (ساعات)" hint="يمكن استخدام كسور، مثل 0.5" error={errors.hoursPerVideo}>{input('hoursPerVideo', 'مثال: 1')}</Field>
            <Field label="مدة الكورس (شهور)" error={errors.months}>{input('months', 'مثال: 6')}</Field>
          </div>
          <div className="pc-margins">
            <Field label="هامش الأمان %" error={errors.safetyMargin}>{input('safetyMargin', '20')}</Field>
            <Field label="هامش الربح المستهدف %" error={errors.profitMargin}>{input('profitMargin', '35')}</Field>
          </div>
        </section>

        {!calc.ok && (
          <div className={touched ? 'pc-alert' : 'pc-alert pc-alert-info'} role="status">
            {touched ? '⚠️ يرجى تصحيح الحقول المظللة لعرض النتائج.' : 'أدخل البيانات الخمسة لعرض الأسعار.'}
          </div>
        )}

        {r && (
          <>
            <div className="pc-boxes">
              <PriceBox
                num={1} title="تكلفة السيرفرات فقط"
                value={nf(r.serverCostPerStudent, 2)} unit="جنيه / طالب"
                lines={[
                  ['تكلفة التخزين طوال المدة', `${n0(r.totalStorageCost)} جنيه`],
                  ['استهلاك المشاهدة', `${n0(r.bandwidthCost)} جنيه`],
                  ['إجمالي تكلفة السيرفرات', `${n0(r.totalServerCost)} جنيه`],
                ]}
              />
              <PriceBox
                num={2} title="الحد الأدنى الآمن للبيع"
                value={n0(r.minimumPrice)} unit="جنيه / طالب"
                notes={[`التكلفة لكل طالب + احتياطي الأمان (${nf(r.inputs.safetyMargin, 0)}%)، ثم تسعير يحقق هامش الربح المستهدف (${nf(r.inputs.profitMargin, 0)}%).`]}
              />
              <PriceBox
                num={3} title="السعر التنافسي المقترح"
                value={n0(r.recommendedPrice)} unit="جنيه / طالب" main
                notes={[`السعر التجاري المرجعي قبل التقريب: ${nf(r.adjustedPrice, 2)} جنيه.`, decision]}
              />
            </div>
            <p className="pc-note">السعر لكل طالب عن الكورس بالكامل (وليس شهرياً). السعر المقترح هو الأعلى بين الحد الأدنى والسعر التجاري المرجعي.</p>

            <section className="pc-panel">
              <Row label="إجمالي الإيراد بالسعر المقترح" value={`${n0(r.totalRevenue)} جنيه`} />
              <Row label="المتبقي بعد تكلفة السيرفرات" value={`${n0(r.remaining)} جنيه`} strong />
              <p className="pc-note">المتبقي ليس صافي ربح؛ فهو قبل أي مصروفات أخرى.</p>
            </section>
          </>
        )}
      </div>

      <style jsx global>{`
        .pc-container { max-width: 1100px; margin: 0 auto; padding-bottom: 70px; direction: rtl; }
        .pc-header { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .pc-header-icon { width: 48px; height: 48px; flex-shrink: 0; border-radius: 12px; background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); display: flex; align-items: center; justify-content: center; }
        .pc-header h1 { margin: 0 0 6px; font-size: 1.6rem; font-weight: 800; color: var(--text-primary); }
        .pc-header p { margin: 0; color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; }

        .pc-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); margin-bottom: 22px; }
        .pc-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
        .pc-panel-head h3 { margin: 0; color: var(--gold); font-size: 1.1rem; }
        .pc-btn-reset { background: var(--gold-dimmer); color: var(--gold); border: 1px solid var(--border-accent); border-radius: 9px; padding: 8px 14px; font-weight: 700; cursor: pointer; font-size: 0.88rem; transition: all 0.2s; }
        .pc-btn-reset:hover { background: var(--gold); color: #111009; }

        .pc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
        .pc-field { display: flex; flex-direction: column; gap: 6px; }
        .pc-label { color: var(--text-secondary); font-size: 0.88rem; font-weight: 600; }
        .pc-input { width: 100%; background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); border-radius: 10px; padding: 11px 12px; font-size: 1rem; font-family: inherit; direction: rtl; outline: none; transition: border-color 0.2s; }
        .pc-input:focus { border-color: var(--gold); }
        .pc-input.bad { border-color: #e5484d; }
        .pc-hint { color: var(--text-muted); font-size: 0.78rem; line-height: 1.5; }
        .pc-error { color: #e5484d; font-size: 0.8rem; font-weight: 600; }

        .pc-sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; margin-top: 24px; padding-top: 20px; border-top: 1px dashed var(--border); }
        .pc-slider { display: flex; flex-direction: column; gap: 8px; }
        .pc-slider-top { display: flex; justify-content: space-between; color: var(--text-secondary); font-weight: 600; font-size: 0.9rem; }
        .pc-slider-top b { color: var(--gold); font-size: 1.05rem; }
        .pc-slider input[type=range] { width: 100%; accent-color: var(--gold); cursor: pointer; }


        .pc-scenarios { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
        .pc-btn-scn { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-accent); border-radius: 9px; padding: 9px 14px; font-weight: 700; cursor: pointer; font-size: 0.88rem; font-family: inherit; transition: all 0.2s; }
        .pc-btn-scn:hover, .pc-btn-scn.on { background: var(--gold); color: #111009; }
        .pc-settings { margin-top: 22px; padding-top: 16px; border-top: 1px dashed var(--border); }
        .pc-settings summary { cursor: pointer; color: var(--gold); font-weight: 800; font-size: 0.95rem; padding: 4px 0; }
        .pc-settings h4 { margin: 18px 0 12px; color: var(--text-primary); font-size: 0.95rem; }
        .pc-settings code { direction: ltr; unicode-bidi: isolate; color: var(--gold); }
        .pc-assump { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 0.88rem; direction: rtl; margin-bottom: 12px; }
        .pc-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
        .pc-tier { display: flex; justify-content: space-between; gap: 8px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; color: var(--text-secondary); font-size: 0.85rem; }
        .pc-tier b { color: var(--gold); direction: ltr; }
        .pc-sub { margin: 14px 0 2px; color: var(--gold); font-weight: 800; font-size: 0.88rem; }


        .pc-pct { display: flex; align-items: center; gap: 10px; direction: ltr; }
        .pc-pct input[type=range] { flex: 1; min-width: 0; accent-color: var(--gold); cursor: pointer; }
        .pc-pct-box { width: 78px !important; text-align: center; padding: 9px 6px; direction: ltr; }
        .pc-pct-sign { color: var(--text-muted); font-weight: 700; }
        .pc-group { margin: 30px 0 14px; font-size: 1.15rem; font-weight: 800; color: var(--gold); padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .pc-hero { display: flex; justify-content: space-between; align-items: center; gap: 18px; flex-wrap: wrap; background: var(--bg-surface); border: 1px solid var(--border-accent); border-radius: 16px; padding: 20px; box-shadow: 0 4px 22px var(--gold-dim); margin-bottom: 16px; }
        .pc-hero-label { color: var(--text-secondary); font-weight: 700; font-size: 0.9rem; }
        .pc-hero-val { font-size: 2.8rem; font-weight: 900; color: var(--gold); display: flex; align-items: baseline; gap: 8px; line-height: 1.2; }
        .pc-hero-val small { font-size: 0.9rem; color: var(--text-muted); font-weight: 600; }
        .pc-hero-side { color: var(--text-secondary); font-size: 0.85rem; display: flex; flex-direction: column; gap: 4px; }
        .pc-hero-side b { color: var(--text-primary); font-size: 1.3rem; font-variant-numeric: tabular-nums; direction: ltr; text-align: right; }
        .pc-prices { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .pc-price { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
        .pc-price.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
        .pc-price-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--text-secondary); font-weight: 700; font-size: 0.88rem; }
        .pc-price-top em { font-style: normal; background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); border-radius: 20px; padding: 1px 9px; font-size: 0.72rem; }
        .pc-price-val { font-size: 2rem; font-weight: 900; color: var(--text-primary); display: flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
        .pc-price-val small { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
        .pc-price-line { color: var(--text-muted); font-size: 0.8rem; line-height: 1.6; }
        .pc-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; margin-top: 4px; }
        .pc-table th, .pc-table td { padding: 9px 6px; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-secondary); vertical-align: top; }
        .pc-table th { color: var(--gold); font-weight: 800; font-size: 0.8rem; }
        .pc-table td:not(:first-child) { color: var(--text-primary); font-weight: 700; font-variant-numeric: tabular-nums; direction: ltr; text-align: left; white-space: nowrap; }
        .pc-alert ul { margin: 8px 0 0; padding-inline-start: 20px; font-weight: 500; }


        .pc-header { flex-wrap: wrap; }
        .pc-header h1 { flex: 1; margin: 0; }
        .pc-margins { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border); max-width: 420px; }
        .pc-boxes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .pc-box { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
        .pc-box.main { border: 2px solid var(--gold); box-shadow: 0 4px 22px var(--gold-dim); }
        .pc-box-title { color: var(--text-secondary); font-weight: 700; font-size: 0.9rem; }
        .pc-box-val { font-size: 1.9rem; font-weight: 900; color: var(--text-primary); display: flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
        .pc-box.main .pc-box-val { font-size: 2.6rem; color: var(--gold); }
        .pc-box-val small { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
        .pc-box-line { display: flex; justify-content: space-between; gap: 10px; font-size: 0.85rem; color: var(--text-secondary); padding: 4px 0; border-top: 1px solid var(--border); }
        .pc-box-line b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .pc-box-note { color: var(--text-muted); font-size: 0.78rem; line-height: 1.5; }
        .pc-container .pc-note { margin: 10px 0 18px; }
        .pc-panel .pc-note { margin: 12px 0 0; }
        @media (max-width: 760px) {
          .pc-boxes { grid-template-columns: 1fr; }
          .pc-box.main { order: -1; }
        }

        .pc-alert { background: rgba(229,72,77,0.1); border: 1px solid rgba(229,72,77,0.5); color: #e5484d; padding: 12px 16px; border-radius: 12px; font-weight: 600; margin-bottom: 22px; }

        .pc-alert-info { background: var(--gold-dimmer); border-color: var(--border-accent); color: var(--text-secondary); }

        .pc-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; margin-bottom: 22px; }
        .pc-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 4px; }
        .pc-card-main { border-color: var(--border-accent); box-shadow: 0 4px 22px var(--gold-dim); }
        .pc-card-title { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-weight: 800; font-size: 1.02rem; margin-bottom: 10px; }
        .pc-num { width: 26px; height: 26px; border-radius: 50%; background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; }
        .pc-big { font-size: 2.1rem; font-weight: 900; color: var(--text-primary); margin: 2px 0 10px; display: flex; align-items: baseline; gap: 8px; }
        .pc-big.gold { color: var(--gold); }
        .pc-big small { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }
        .pc-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-size: 0.9rem; }
        .pc-row b { color: var(--text-primary); font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: plaintext; text-align: left; }
        .pc-row.strong { color: var(--text-primary); font-weight: 700; }
        .pc-row.strong b { color: var(--gold); }
        .pc-note { margin: 10px 0 0; color: var(--text-muted); font-size: 0.8rem; line-height: 1.6; }
        .pc-note.full { grid-column: 1 / -1; margin: 0; }
        .pc-decision { margin: 12px 0 0; padding: 10px 12px; background: var(--gold-dimmer); border: 1px solid var(--border-accent); border-radius: 10px; color: var(--text-primary); font-size: 0.88rem; line-height: 1.7; }

        .pc-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: var(--shadow); }
        .pc-sum-item { display: flex; flex-direction: column; gap: 6px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
        .pc-sum-item span { color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; }
        .pc-sum-item b { color: var(--gold); font-size: 1.35rem; font-variant-numeric: tabular-nums; }

        @media (max-width: 600px) {
          .pc-header h1 { font-size: 1.3rem; }
          .pc-big { font-size: 1.8rem; }
          .pc-panel { padding: 16px; }
        }
      `}</style>
    </SuperLayout>
  );
}
