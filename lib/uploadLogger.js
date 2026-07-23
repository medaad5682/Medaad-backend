// lib/uploadLogger.js
// ===================================================================
// 📋 Logger موحّد ومفصّل لمسار رفع الفيديو بالكامل (لوحة تحكم المعلم):
//   create-upload-session → TUS upload (frontend) → confirm-upload → webhook
//
// الهدف: أن يستطيع أي شخص يقرأ سجلات السيرفر (Vercel logs / stdout) تتبّع
// دورة حياة عملية رفع فيديو واحدة بالكامل، خطوة بخطوة، بما في ذلك:
//   - كل استدعاء لقاعدة البيانات (قبل/بعد، والنتيجة أو الخطأ)
//   - كل استدعاء لـ Bunny API (الطلب والرد وزمن الاستجابة)
//   - كل تحقق (مصادقة/ملكية) ونتيجته
//   - كل استدعاء Webhook وتفاصيله الكاملة
//
// كل عملية تحصل على requestId فريد يظهر في كل سطر متعلق بها، حتى يسهل
// تجميع كل الأسطر الخاصة بنفس الطلب عند البحث في السجلات.
// ===================================================================

import crypto from 'crypto';

function nowIso() {
  return new Date().toISOString();
}

function safeStringify(data) {
  if (data === undefined) return '';
  try {
    return JSON.stringify(data, (key, value) => {
      // إخفاء أي حقول حساسة قد تُمرَّر عن طريق الخطأ (مفاتيح API، توقيعات كاملة)
      if (typeof key === 'string' && /apikey|api_key|accesskey|secret|password/i.test(key)) {
        return '[REDACTED]';
      }
      // تقصير التوقيعات الطويلة حتى لا تُغرق السجل
      if (typeof key === 'string' && key.toLowerCase() === 'signature' && typeof value === 'string' && value.length > 16) {
        return `${value.slice(0, 8)}...${value.slice(-4)} (len=${value.length})`;
      }
      return value;
    });
  } catch (_) {
    return '[Unserializable data]';
  }
}

/**
 * ينشئ logger مرتبط بعملية رفع واحدة (طلب واحد) ضمن نطاق (scope) معيّن.
 * scope مثال: 'create-upload-session' | 'confirm-upload' | 'bunny-webhook'
 */
export function createUploadLogger(scope, meta = {}) {
  const requestId = meta.requestId || crypto.randomBytes(4).toString('hex');
  const startedAt = Date.now();

  function elapsed() {
    return `+${Date.now() - startedAt}ms`;
  }

  function line(level, icon, step, message, data) {
    const base = `${icon} [${scope}] [req=${requestId}] [${elapsed()}] ${nowIso()} — ${step ? `(${step}) ` : ''}${message}`;
    const dataStr = data !== undefined ? ` :: ${safeStringify(data)}` : '';
    const full = base + dataStr;
    if (level === 'error') console.error(full);
    else if (level === 'warn') console.warn(full);
    else console.log(full);
  }

  return {
    requestId,
    /** خطوة عادية في تدفق العملية (نجاح/معلومة) */
    step(step, message, data) {
      line('info', '🔹', step, message, data);
    },
    /** نجاح واضح (نقطة تحقق مهمة اكتملت) */
    success(step, message, data) {
      line('info', '✅', step, message, data);
    },
    /** تحذير — ليس خطأ فادحاً لكن يستحق الانتباه */
    warn(step, message, data) {
      line('warn', '⚠️', step, message, data);
    },
    /** خطأ فادح أوقف العملية أو جزء منها */
    error(step, message, data) {
      line('error', '❌', step, message, data);
    },
    /** استدعاء قاعدة بيانات صادر (قبل التنفيذ) */
    dbCall(step, table, action, filters) {
      line('info', '🗄️', step, `DB ${action} on "${table}"`, filters);
    },
    /** نتيجة استدعاء قاعدة بيانات */
    dbResult(step, table, action, { data, error }) {
      if (error) {
        line('error', '🗄️❌', step, `DB ${action} on "${table}" FAILED`, {
          message: error.message, code: error.code, details: error.details, hint: error.hint,
        });
      } else {
        line('info', '🗄️✅', step, `DB ${action} on "${table}" OK`, data);
      }
    },
    /** استدعاء صادر لـ Bunny API (قبل التنفيذ) */
    bunnyCall(step, method, url, body) {
      line('info', '🐰→', step, `Bunny API ${method} ${url}`, body);
    },
    /** نتيجة استدعاء Bunny API */
    bunnyResult(step, method, url, { status, ok, body, durationMs }) {
      const icon = ok ? '🐰✅' : '🐰❌';
      line(ok ? 'info' : 'error', icon, step, `Bunny API ${method} ${url} → HTTP ${status} (${durationMs}ms)`, body);
    },
    /** طلب HTTP وارد (بداية العملية) */
    incoming(req, extra) {
      line('info', '📥', 'incoming', `${req.method} request received`, {
        url: req.url,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        contentLength: req.headers['content-length'],
        ...extra,
      });
    },
    /** رد HTTP صادر (نهاية العملية) */
    outgoing(statusCode, body) {
      line('info', '📤', 'outgoing', `Responding HTTP ${statusCode}`, body);
    },
  };
}
