// lib/clientAttestation.js
// ------------------------------------------------------------------
// One function that answers: "is this request coming from our genuine app?"
// It replaces verifyAppCheckWithWhitelist (lib/appCheckWhitelist.js) and the
// inline App Check block that used to live in lib/authHelper.js.
//
// Accepted proofs, checked in this order (first one that passes wins):
//   1. Firebase App Check   header: X-Firebase-AppCheck   (Android with Google services / iOS)
//   2. Huawei attestation   header: X-App-Attestation     (token issued by /api/attest/hms/verify)
//   3. Manual whitelist     (user ids in app_check_whitelist) - emergency tool only
//
// A proof that is present but invalid does NOT stop the check: the next proof
// is still tried, so a whitelisted user is never locked out by a stale token.
// ------------------------------------------------------------------

import jwt from 'jsonwebtoken';
import admin from './firebaseAdmin';
import { isAppCheckWhitelisted } from './appCheckWhitelist';
import { verifyAttestationToken } from './hmsAttest';

// 🚀 كاش توكن Firebase App Check (كان سابقاً داخل authHelper فقط، وأصبح مشتركاً لكل نقاط الدخول)
const APP_CHECK_CACHE_TTL = 55 * 60 * 1000; // أقل من ساعة بقليل
const APP_CHECK_CACHE_MAX = 1000;
const appCheckCache = new Map(); // token -> expiry (ms)

function pruneAppCheckCache(now) {
  if (appCheckCache.size <= APP_CHECK_CACHE_MAX) return;
  for (const [key, expiry] of appCheckCache.entries()) {
    if (expiry <= now) appCheckCache.delete(key);
  }
}

async function verifyAppCheck(token) {
  const now = Date.now();
  const cachedExpiry = appCheckCache.get(token);
  if (cachedExpiry && cachedExpiry > now) return { ok: true };

  try {
    const result = await admin.appCheck().verifyToken(token);

    // لا نحتفظ بالتوكن في الكاش أكثر من عمره الفعلي (exp) ولا أكثر من 55 دقيقة
    const tokenExpMs = Number(result?.token?.exp) * 1000;
    const expiry = Number.isFinite(tokenExpMs) ? Math.min(tokenExpMs, now + APP_CHECK_CACHE_TTL) : now + APP_CHECK_CACHE_TTL;
    appCheckCache.set(token, expiry);
    pruneAppCheckCache(now);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * رسالة عربية تُعرض للمستخدم عند فشل الإثبات في نقاط الدخول التي تسبق تسجيل الدخول
 * (signup / send-otp / verify-otp)، لأن التطبيق يعرض message القادمة من السيرفر كما هي.
 */
export const ATTESTATION_FAILED_MESSAGE =
  'تعذّر التحقق من التطبيق. تأكد أنك تستخدم النسخة الأصلية والأحدث من التطبيق ثم حاول مرة أخرى.';

/**
 * فحص ناعم لاستخراج user_id من JWT إن وُجد (للمستخدم المسجّل فقط) بغرض مطابقة
 * القائمة البيضاء. توكن غير صالح أو غائب => null ولا يوقف الطلب.
 */
export function softUserIdFromRequest(req) {
  const header = req.headers?.['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)?.userId || null;
  } catch (e) {
    return null;
  }
}

function headerValue(req, name) {
  const v = req.headers?.[name];
  const value = Array.isArray(v) ? v[0] : v;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param {object} req                         Next.js request
 * @param {Array<string|null|undefined>} candidates  values matched against the whitelist (user ids...)
 * @param {string} logTag                      label shown in the logs
 * @param {object} [options]
 * @param {string} [options.deviceId]          device id to bind the Huawei token to
 *                                             (default: the `x-device-id` header; login passes the body value)
 * @param {boolean} [options.requireDeviceId]  true => a Huawei token is rejected when no device id is known
 *
 * @returns {Promise<
 *   { ok: true, method: 'appcheck'|'hms'|'whitelist', viaWhitelist: boolean } |
 *   { ok: false, status: number, message: string, reason: string, detail?: string }
 * >}
 */
export async function verifyClientAttestation(req, candidates = [], logTag = 'Attestation', options = {}) {
  const appCheckToken = headerValue(req, 'x-firebase-appcheck');
  const hmsToken = headerValue(req, 'x-app-attestation');

  let appCheckError = null;
  let hmsFailure = null;

  // 1) Firebase App Check
  if (appCheckToken) {
    const result = await verifyAppCheck(appCheckToken);
    if (result.ok) return { ok: true, method: 'appcheck', viaWhitelist: false };
    appCheckError = result.error;
  }

  // 2) Huawei SysIntegrity token (issued by our own /api/attest/hms/verify)
  if (hmsToken) {
    const deviceId = options.deviceId || headerValue(req, 'x-device-id');

    if (options.requireDeviceId && !deviceId) {
      hmsFailure = 'device_id_required';
    } else {
      const result = verifyAttestationToken(hmsToken, { deviceId: deviceId || undefined });
      if (result.ok) return { ok: true, method: 'hms', viaWhitelist: false };
      hmsFailure = result.reason;
    }
  }

  // 3) Manual whitelist (emergency tool)
  if (await isAppCheckWhitelisted(candidates)) {
    console.log(`✅ [${logTag}] Attestation Bypassed (Whitelisted)`);
    return { ok: true, method: 'whitelist', viaWhitelist: true };
  }

  // ❌ Nothing passed. Report the proof the client actually tried (Huawei first, then App Check).
  if (hmsToken) {
    console.error(`❌ [${logTag}] Huawei attestation token rejected: ${hmsFailure}`);
    return {
      ok: false,
      status: 401,
      message: hmsFailure === 'token_expired' ? 'Unauthorized: Attestation expired' : 'Unauthorized: Invalid attestation token',
      reason: 'Huawei Attestation Token Rejected',
      detail: hmsFailure
    };
  }

  if (appCheckToken) {
    console.error(`❌ [${logTag}] App Check Failed:`, appCheckError);
    return {
      ok: false,
      status: 401,
      message: 'Unauthorized: Invalid App Check token',
      reason: 'Firebase App Check Verification Failed',
      detail: appCheckError
    };
  }

  console.error(`❌ [${logTag}] Missing App Check / Attestation Token`);
  return {
    ok: false,
    status: 401,
    message: 'Unauthorized: Missing Token',
    reason: 'Missing Firebase App Check Token'
  };
}
