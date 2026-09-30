// Shared Cairo-date -> UTC boundary helpers (used by finance + teacher-report APIs)

// ✅ تحويل "منتصف ليل القاهرة" لتاريخ معين (YYYY-MM-DD) إلى لحظة UTC دقيقة.
// بنجرّب فرق التوقيت الصيفي (+03) والشتوي (+02) ونختار اللي بيرجّع فعلاً
// 00:00 بتوقيت القاهرة لنفس اليوم — كده بنتعامل صح حتى في يوم تغيير الساعة.
const cairoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const cairoMidnightUtc = (dateString) => {
  const [y, m, d] = dateString.split('-').map(Number);
  for (const offsetHours of [3, 2]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0));
    const p = Object.fromEntries(cairoFmt.formatToParts(candidate).map(x => [x.type, x.value]));
    if (Number(p.year) === y && Number(p.month) === m && Number(p.day) === d &&
        Number(p.hour) === 0 && Number(p.minute) === 0) {
      return candidate;
    }
  }
  return new Date(Date.UTC(y, m - 1, d, -2, 0, 0)); // fallback
};

// ✅ بداية اليوم = 00:00:00.000000 بتوقيت القاهرة
// ✅ نهاية اليوم = آخر ميكروثانية قبل منتصف ليل اليوم التالي (شاملة الكسور)
//    الداتابيز (Postgres) بتخزن الميكروثانية، فلازم الحد الأعلى يغطي .999999
//    وليس 23:59:59.000 — ده كان سبب اختفاء الطلبات اللي اتعملت في آخر ثانية.
export const getUtcBoundary = (dateString, isEnd = false) => {
    if (!dateString) return null;
    if (!isEnd) return cairoMidnightUtc(dateString).toISOString();

    const [y, m, d] = dateString.split('-').map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const lastMs = new Date(cairoMidnightUtc(nextDay).getTime() - 1).toISOString(); // ...59.999Z
    return lastMs.replace(/\.999Z$/, '.999999Z');
};
