// pages/api/attest/hms/nonce.js
// ------------------------------------------------------------------
// Step 1 of Huawei SysIntegrity attestation.
// POST { deviceId }  ->  { success, nonce, expiresInSeconds }
//
// The app must pass the UTF-8 bytes of `nonce` to SafetyDetect.sysIntegrity().
// The nonce is HMAC-bound to deviceId, expires in 5 minutes and works once.
// ------------------------------------------------------------------
import crypto from 'crypto';
import { getClientIp } from '../../../../lib/clientIp';
import { createNonce, isRateLimited } from '../../../../lib/hmsAttest';

const MAX_REQUESTS_PER_MINUTE_PER_IP = 30;

function hasValidAppSecret(req) {
  const incoming = req.headers['x-app-secret'];
  const valid = process.env.APP_SECRET;
  if (!valid || typeof incoming !== 'string') return false;
  const a = Buffer.from(incoming);
  const b = Buffer.from(valid);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  if (!hasValidAppSecret(req)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (isRateLimited('hms-nonce', getClientIp(req), MAX_REQUESTS_PER_MINUTE_PER_IP)) {
    return res.status(429).json({ success: false, message: 'Too many requests' });
  }

  const result = createNonce(req.body?.deviceId);
  if (!result.ok) {
    return res.status(result.status).json({ success: false, code: result.code, message: result.message });
  }

  return res.status(200).json({
    success: true,
    nonce: result.nonce,
    expiresInSeconds: result.expiresInSeconds
  });
}
