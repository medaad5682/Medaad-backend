// lib/pricingCalculator.js
// ─────────────────────────────────────────────────────────────────────────────
// Madad pricing calculator — pure calculation logic (no React, no network, no DB).
// All coefficients, tiers and rates live in PRICING_CONFIG. Amounts are in EGP.
//
//   H = C × N × T                         (total video hours)
//   Competitive = CEIL5( (16.25 + 1.1166666667·H + 2·C) × tierMultiplier )
//   Storage     = H × 2 GB, billed MONTHLY → total = H × 1.16 × M
//   Bandwidth   = H × S GB, billed per GB viewed (NOT per month) → H × S × 0.29
//   Minimum     = CEIL5( total × (1 + safety) / (S × (1 − profit)) )
//   Recommended = MAX(Competitive, Minimum)
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING_CONFIG = Object.freeze({
  // Competitive formula (unchanged)
  PRICE: Object.freeze({
    BASE_EGP: 16.25,
    PER_HOUR_EGP: 1.1166666667,
    PER_COURSE_EGP: 2,
    ROUNDING_STEP_EGP: 5, // all prices are rounded UP to a multiple of this
  }),

  // First tier whose minStudents <= S wins (ascending order).
  STUDENT_MULTIPLIERS: Object.freeze([
    Object.freeze({ minStudents: 0,   multiplier: 1.25 }), // < 50
    Object.freeze({ minStudents: 50,  multiplier: 1.15 }), // 50–99
    Object.freeze({ minStudents: 100, multiplier: 1.0 }),  // 100–199
    Object.freeze({ minStudents: 200, multiplier: 0.95 }), // 200–349
    Object.freeze({ minStudents: 350, multiplier: 0.9 }),  // 350+
  ]),

  // Provider rates
  SERVER: Object.freeze({
    USD_TO_EGP: 58,
    STORAGE_USD_PER_GB_MONTH: 0.01,
    BANDWIDTH_USD_PER_GB: 0.005,
    STORAGE_GB_PER_VIDEO_HOUR: 2,
    VIEWING_GB_PER_VIDEO_HOUR: 1, // each student watches every hour once
  }),

  // Margins (editable in the UI)
  MARGINS: Object.freeze({
    SAFETY_PERCENT: 20,
    PROFIT_PERCENT: 35,
  }),

  // Sanity ceilings so absurd inputs can never overflow.
  INPUT_LIMITS: Object.freeze({
    students: 10_000_000,
    courses: 100_000,
    videosPerCourse: 100_000,
    hoursPerVideo: 1000,
    months: 1200,
    safetyPercent: 1000,
  }),
});

export const DEFAULT_INPUTS = Object.freeze({
  students: '',
  courses: '',
  videosPerCourse: '',
  hoursPerVideo: '',
  months: '',
  safetyMargin: String(PRICING_CONFIG.MARGINS.SAFETY_PERCENT),
  profitMargin: String(PRICING_CONFIG.MARGINS.PROFIT_PERCENT),
});

// ── Numeric helpers ──────────────────────────────────────────────────────────
// Rounds to 6 decimals to remove binary floating-point noise (739.5000000000001).
const PRECISION = 1e6;
export const clean = (x) => Math.round(x * PRECISION) / PRECISION;

// Round UP to the next multiple of `step`, on integer micro-units, so a value that
// is mathematically a multiple of 5 never jumps to the next step.
export function roundUpToStep(value, step = PRICING_CONFIG.PRICE.ROUNDING_STEP_EGP) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const micro = Math.round(value * PRECISION);
  const stepMicro = Math.round(step * PRECISION);
  return Math.max(1, Math.ceil(micro / stepMicro)) * step;
}

// ── Input parsing / validation ───────────────────────────────────────────────
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

// Accepts numbers or strings (incl. Arabic-Indic digits). Returns NaN if invalid/empty.
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== 'string') return NaN;
  const cleaned = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[,٬\s]/g, '');
  if (cleaned === '') return NaN;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// Validates raw form values → { valid, errors, values }. Messages are Arabic.
// An invalid value is never replaced by a default: it blocks the results.
export function validateInputs(raw = {}, config = PRICING_CONFIG) {
  const errors = {};
  const values = {};
  const L = config.INPUT_LIMITS;
  const fmt = (n) => n.toLocaleString('en-US');

  const check = (field, label, { integer = false, minExclusive = true, max }) => {
    const n = parseNumber(raw[field]);
    if (Number.isNaN(n)) errors[field] = `${label}: من فضلك أدخل رقماً صحيحاً`;
    else if (minExclusive ? n <= 0 : n < 0) errors[field] = minExclusive ? `${label}: يجب أن يكون أكبر من صفر` : `${label}: لا يمكن أن يكون سالباً`;
    else if (integer && !Number.isInteger(n)) errors[field] = `${label}: يجب أن يكون عدداً صحيحاً بدون كسور`;
    else if (n > max) errors[field] = `${label}: القيمة كبيرة جداً (الحد الأقصى ${fmt(max)})`;
    else values[field] = n;
  };

  check('students', 'عدد الطلاب', { integer: true, max: L.students });
  check('courses', 'عدد الكورسات', { integer: true, max: L.courses });
  check('videosPerCourse', 'عدد الفيديوهات لكل كورس', { integer: true, max: L.videosPerCourse });
  check('hoursPerVideo', 'مدة الفيديو بالساعات', { max: L.hoursPerVideo });
  check('months', 'مدة الكورس بالشهور', { max: L.months });
  check('safetyMargin', 'هامش الأمان', { minExclusive: false, max: L.safetyPercent });

  // 0 ≤ profit margin < 100
  const pm = parseNumber(raw.profitMargin);
  if (Number.isNaN(pm)) errors.profitMargin = 'هامش الربح: من فضلك أدخل رقماً صحيحاً';
  else if (pm < 0) errors.profitMargin = 'هامش الربح: لا يمكن أن يكون سالباً';
  else if (pm >= 100) errors.profitMargin = 'هامش الربح: يجب أن يكون أقل من 100%';
  else values.profitMargin = pm;

  return { valid: Object.keys(errors).length === 0, errors, values };
}

// ── Competitive price (existing formula, unchanged) ──────────────────────────
// H = C × N × T
export function calcTotalHours({ courses, videosPerCourse, hoursPerVideo }) {
  return clean(courses * videosPerCourse * hoursPerVideo);
}

export function getStudentMultiplier(students, config = PRICING_CONFIG) {
  let chosen = config.STUDENT_MULTIPLIERS[0];
  for (const tier of config.STUDENT_MULTIPLIERS) if (students >= tier.minStudents) chosen = tier;
  return chosen;
}

export function calcCompetitivePrice({ students, courses, hours }, config = PRICING_CONFIG) {
  const P = config.PRICE;
  const basePrice = clean(P.BASE_EGP + P.PER_HOUR_EGP * hours + P.PER_COURSE_EGP * courses);
  const tier = getStudentMultiplier(students, config);
  const adjustedPrice = clean(basePrice * tier.multiplier);
  return { basePrice, studentMultiplier: tier.multiplier, adjustedPrice, competitivePrice: roundUpToStep(adjustedPrice, P.ROUNDING_STEP_EGP) };
}

// ── Server costs ─────────────────────────────────────────────────────────────
// Storage: monthly bill for the whole content (independent of S) × M months.
// Bandwidth: per GB actually viewed (H × S GB), never multiplied by M.
export function calcServerCosts({ hours, students, months }, config = PRICING_CONFIG) {
  const R = config.SERVER;
  const storageGB = clean(hours * R.STORAGE_GB_PER_VIDEO_HOUR);
  const monthlyStorageCost = clean(storageGB * R.STORAGE_USD_PER_GB_MONTH * R.USD_TO_EGP);
  const totalStorageCost = clean(monthlyStorageCost * months);
  const bandwidthGB = clean(hours * students * R.VIEWING_GB_PER_VIDEO_HOUR);
  const bandwidthCost = clean(bandwidthGB * R.BANDWIDTH_USD_PER_GB * R.USD_TO_EGP);
  const totalServerCost = clean(totalStorageCost + bandwidthCost);
  return {
    storageGB, monthlyStorageCost, totalStorageCost, bandwidthGB, bandwidthCost, totalServerCost,
    serverCostPerStudent: clean(totalServerCost / students), // students > 0 guaranteed by validation
  };
}

// ── Minimum viable price ─────────────────────────────────────────────────────
// CEIL5( total × (1 + safety%) / (S × (1 − profit%)) )  — profit is a margin on revenue.
export function calcMinimumPrice({ totalServerCost, students, safetyMargin, profitMargin }, config = PRICING_CONFIG) {
  const minimumPriceRaw = clean((totalServerCost * (1 + safetyMargin / 100)) / (students * (1 - profitMargin / 100)));
  return { minimumPriceRaw, minimumPrice: roundUpToStep(minimumPriceRaw, config.PRICE.ROUNDING_STEP_EGP) };
}

// ── One-call entry point used by the UI ──────────────────────────────────────
export function calculatePricing(rawInputs, config = PRICING_CONFIG) {
  const { valid, errors, values } = validateInputs(rawInputs, config);
  if (!valid) return { ok: false, errors, results: null };

  const hours = calcTotalHours(values);
  const comp = calcCompetitivePrice({ students: values.students, courses: values.courses, hours }, config);
  const server = calcServerCosts({ hours, students: values.students, months: values.months }, config);
  const min = calcMinimumPrice({ totalServerCost: server.totalServerCost, students: values.students, safetyMargin: values.safetyMargin, profitMargin: values.profitMargin }, config);

  const recommendedPrice = Math.max(comp.competitivePrice, min.minimumPrice);
  const totalRevenue = clean(recommendedPrice * values.students);
  const remaining = clean(totalRevenue - server.totalServerCost);

  return {
    ok: true,
    errors: {},
    results: {
      inputs: values, hours, ...comp, ...server, ...min,
      recommendedPrice,
      recommendedBy: min.minimumPrice > comp.competitivePrice ? 'minimum' : comp.competitivePrice > min.minimumPrice ? 'competitive' : 'equal',
      totalRevenue,
      remaining,
    },
  };
}
