// ============================================================
// 🗄️ كاش بسيط في الذاكرة (In-Memory) مع مدة صلاحية (TTL)
// ============================================================
// الهدف: تقليل عدد القراءات المرسلة لـ Firestore، خصوصاً في نقاط النهاية
// التي تُستدعى كثيراً (مثل إحصائيات المشاهدات في لوحة السوبر أدمن/المدرس)
// بحيث لا يُعاد الاستعلام الفعلي إلا مرة واحدة كل بضع دقائق، وأي طلب آخر
// خلال هذه المدة يأخذ نفس النتيجة المخزنة مباشرة دون أي قراءة إضافية.
//
// ⚠️ يعمل فقط طالما السيرفر يعمل بشكل مستمر (Node.js عادي عبر PM2 مثلاً)
// وليس Serverless (حيث تُعاد تهيئة الذاكرة مع كل طلب) — وهذا يطابق طريقة
// تشغيل هذا المشروع (/www/wwwroot/Medaad).
// ============================================================

const cacheStore = new Map();

export function getCached(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

export function setCached(key, value, ttlMs) {
  cacheStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}
