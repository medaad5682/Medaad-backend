// ============================================================
// 📝 شرح اختياري لأسئلة MCQ (عمود questions.explanation)
// ============================================================
export const MAX_EXPLANATION_LENGTH = 2000;

/**
 * يقص المسافات من الأطراف، والفاضي يبقى null، وحد أقصى 2000 حرف.
 * يحافظ على الأسطر الداخلية (الشرح قد يكون من عدة أسطر).
 */
export function normalizeExplanation(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().slice(0, MAX_EXPLANATION_LENGTH).trim();
  return text ? text : null;
}
