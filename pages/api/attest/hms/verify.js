// pages/api/attest/hms/verify.js
// ------------------------------------------------------------------
// Step 2 of Huawei SysIntegrity attestation.
// POST { deviceId, nonce, jws }  ->  { success, token, expiresInSeconds }
//
// `jws` is the string returned by SafetyDetect.sysIntegrity().
// On success `token` is our own 1-hour token; the app sends it as the
// `X-App-Attestation` header (checked in step 17).
// ------------------------------------------------------------------
import crypto from 'crypto';
import { getClientIp } from '../../../../lib/clientIp';
import { verifyHmsSysIntegrity, issueAttestationToken, isRateLimited } from '../../../../lib/hmsAttest';

const MAX_REQUESTS_PER_MINUTE_PER_IP = 20;

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

  if (isRateLimited('hms-verify', getClientIp(req), MAX_REQUESTS_PER_MINUTE_PER_IP)) {
    return res.status(429).json({ success: false, message: 'Too many requests' });
  }

  const { deviceId, nonce, jws } = req.body || {};

  const result = verifyHmsSysIntegrity({ jws, nonce, deviceId });
  if (!result.ok) {
    return res.status(result.status).json({ success: false, code: result.code, message: result.message });
  }

  const issued = issueAttestationToken(deviceId);
  if (!issued) {
    return res.status(500).json({ success: false, code: 'server_not_configured', message: 'Server not configured' });
  }

  return res.status(200).json({
    success: true,
    token: issued.token,
    expiresInSeconds: issued.expiresInSeconds
  });
}
