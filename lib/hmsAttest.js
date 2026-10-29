// lib/hmsAttest.js
// ------------------------------------------------------------------
// Huawei Safety Detect "SysIntegrity" server-side verification.
// Replaces Firebase App Check / Play Integrity on Huawei (HMS-only) phones.
//
// Flow
//   1. App  -> POST /api/attest/hms/nonce   { deviceId }
//      Server returns a nonce (HMAC-signed, bound to deviceId, expires in 5 min).
//   2. App calls SysIntegrity with the UTF-8 bytes of that nonce string.
//   3. App  -> POST /api/attest/hms/verify  { deviceId, nonce, jws }
//      Server verifies (following Huawei's documented steps):
//        a) certificate chain in the JWS header -> trusted Huawei root CA
//        b) leaf certificate domain = sysintegrity.platform.hicloud.com
//        c) JWS signature
//        d) payload: fresh timestamp, our nonce (single use), package name,
//           app signing-certificate digest on our allow-list, basicIntegrity = true
//      On success it returns our OWN signed token valid for 1 hour.
//   4. App sends that token as `X-App-Attestation` (checked in step 17 with
//      verifyAttestationToken below).
//
// Environment variables
//   HMS_ATTEST_ALLOWED_CERT_SHA256  REQUIRED. Comma-separated SHA-256 digests of the
//                                   signing certificates of builds you ship (release,
//                                   AppGallery, optionally debug). Hex (with or without
//                                   colons, as keytool prints it) or base64.
//   HMS_ATTEST_ROOT_CA_PEM          Huawei root CA certificate(s): PEM text or base64 DER.
//   HMS_ATTEST_ROOT_CA_PATH         ...or a path to a .pem/.cer/.crt file.
//                                   (Files placed in lib/certs/ are loaded too.)
//   HMS_ATTEST_PACKAGE_NAME         default 'medaad.app.com'
//   ATTEST_SECRET                   optional; secret used to derive the nonce + token keys.
//                                   Falls back to JWT_SECRET. Keys are derived per purpose,
//                                   so the attestation token can never be used as a user JWT.
//   HMS_APP_ID                      (already used for push) compared with payload.appId
//   HMS_ATTEST_STRICT_CA            'false' => don't require CA:TRUE on intermediate certs
//   HMS_ATTEST_DEBUG                'true'  => log the JWS header chain + payload (and let an
//                                   empty allow-list through to the digest log). Use ONLY
//                                   while testing on your phone, then turn it off.
//
// Nothing in this file throws to the caller: every function resolves to a result object.
// ------------------------------------------------------------------

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { LRUCache } from 'lru-cache';

const LEAF_HOSTNAME = 'sysintegrity.platform.hicloud.com';
const DEFAULT_PACKAGE_NAME = 'medaad.app.com';

const NONCE_TTL_MS = 5 * 60 * 1000;           // nonce lifetime
const JWS_MAX_SKEW_MS = 5 * 60 * 1000;        // Huawei timestampMs vs our clock
const ATTEST_TOKEN_TTL_SECONDS = 60 * 60;     // 1 hour
const TOKEN_ISSUER = 'medaad-attest';
const TOKEN_TYPE = 'hms-attest';
const MAX_JWS_LENGTH = 24 * 1024;
const MAX_CHAIN_LENGTH = 5;
const SUPPORTED_ALGS = new Set(['RS256', 'PS256', 'ES256']);

const isDebug = () => process.env.HMS_ATTEST_DEBUG === 'true';
const log = (...a) => console.log('🛡️ [HmsAttest]', ...a);
const warn = (...a) => console.error('❌ [HmsAttest]', ...a);

// ---------------------------------------------------------------
// Keys (derived per purpose from one base secret)
// ---------------------------------------------------------------
function baseSecret() {
  return process.env.ATTEST_SECRET || process.env.JWT_SECRET || '';
}

function deriveKey(label) {
  const secret = baseSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`medaad:${label}:v1`).digest();
}

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------
function b64urlDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function normalizeDeviceId(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!v || v.length > 128 || /[\u0000-\u001f]/.test(v)) return null;
  return v;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Accepts hex (with/without colons), or base64 / base64url of 32 bytes -> lowercase hex. */
function toHexDigest(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  const hex = v.replace(/[:\s]/g, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return hex.toLowerCase();

  try {
    const buf = b64urlDecode(v);
    if (buf.length === 32) return buf.toString('hex');
  } catch (e) { /* not base64 */ }
  return null;
}

function allowedCertDigests() {
  const raw = process.env.HMS_ATTEST_ALLOWED_CERT_SHA256 || '';
  const set = new Set();
  for (const item of raw.split(/[,;\n]/)) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const hex = toHexDigest(trimmed);
    if (hex) set.add(hex);
    else warn(`Ignoring invalid value in HMS_ATTEST_ALLOWED_CERT_SHA256: "${trimmed.slice(0, 12)}…"`);
  }
  return set;
}

function expectedPackageName() {
  return process.env.HMS_ATTEST_PACKAGE_NAME || DEFAULT_PACKAGE_NAME;
}

// ---------------------------------------------------------------
// Simple in-memory rate limiter (per instance) for the attest endpoints
// ---------------------------------------------------------------
const rateBuckets = new LRUCache({ max: 5000, ttl: 60 * 1000 });

/** @returns {boolean} true when the caller has exceeded `max` requests per minute */
export function isRateLimited(bucket, key, max) {
  const id = `${bucket}:${key}`;
  const count = (rateBuckets.get(id) || 0) + 1;
  rateBuckets.set(id, count, { ttl: 60 * 1000, noUpdateTTL: count > 1 });
  return count > max;
}

// ---------------------------------------------------------------
// Trusted Huawei root CA(s)
// ---------------------------------------------------------------
let rootCache = null; // { certs: X509Certificate[] }

function parseCertificates(buffer) {
  const text = buffer.toString('latin1');
  const out = [];
  const pemBlocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);

  if (pemBlocks) {
    for (const block of pemBlocks) {
      try { out.push(new crypto.X509Certificate(block)); } catch (e) { /* skip */ }
    }
    return out;
  }
  try { out.push(new crypto.X509Certificate(buffer)); } catch (e) { /* not DER */ }
  return out;
}

function loadRootCertificates() {
  if (rootCache) return rootCache.certs;

  const certs = [];
  const add = (list) => {
    for (const c of list) {
      if (!certs.some((x) => x.fingerprint256 === c.fingerprint256)) certs.push(c);
    }
  };

  // 1) env: PEM text (literal "\n" tolerated) or base64 DER
  const pemEnv = process.env.HMS_ATTEST_ROOT_CA_PEM;
  if (pemEnv) {
    const text = pemEnv.replace(/\\n/g, '\n').trim();
    let parsed = parseCertificates(Buffer.from(text, 'latin1'));
    if (parsed.length === 0) {
      try { parsed = parseCertificates(Buffer.from(text.replace(/\s+/g, ''), 'base64')); } catch (e) { /* ignore */ }
    }
    add(parsed);
  }

  // 2) env: file path
  const pathEnv = process.env.HMS_ATTEST_ROOT_CA_PATH;
  if (pathEnv) {
    try { add(parseCertificates(fs.readFileSync(pathEnv))); }
    catch (e) { warn(`Cannot read HMS_ATTEST_ROOT_CA_PATH: ${e.message}`); }
  }

  // 3) lib/certs/*.pem|cer|crt
  try {
    const dir = path.join(process.cwd(), 'lib', 'certs');
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(pem|cer|crt)$/i.test(file)) continue;
        try { add(parseCertificates(fs.readFileSync(path.join(dir, file)))); }
        catch (e) { warn(`Cannot read lib/certs/${file}: ${e.message}`); }
      }
    }
  } catch (e) { /* directory not available */ }

  if (certs.length > 0) {
    rootCache = { certs };
    log(`Loaded ${certs.length} trusted Huawei root certificate(s)`);
  }
  return certs;
}

// ---------------------------------------------------------------
// Nonce (stateless HMAC + single-use memory)
// ---------------------------------------------------------------
// Layout (32 bytes -> 43 base64url chars, well inside Huawei's 16-66 byte limit):
//   [0..3]   unix seconds, big-endian
//   [4..15]  12 random bytes
//   [16..31] first 16 bytes of HMAC-SHA256(nonceKey, [0..15] || deviceId)
const usedNonces = new LRUCache({ max: 20000, ttl: NONCE_TTL_MS + 30 * 1000 });

function nonceMac(head, deviceId) {
  const key = deriveKey('nonce');
  return crypto.createHmac('sha256', key).update(head).update(deviceId, 'utf8').digest().subarray(0, 16);
}

export function createNonce(deviceIdInput) {
  const deviceId = normalizeDeviceId(deviceIdInput);
  if (!deviceId) return { ok: false, status: 400, code: 'invalid_device_id', message: 'Invalid deviceId' };
  if (!deriveKey('nonce')) {
    warn('No ATTEST_SECRET / JWT_SECRET configured');
    return { ok: false, status: 500, code: 'server_not_configured', message: 'Server not configured' };
  }

  const head = Buffer.alloc(16);
  head.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
  crypto.randomBytes(12).copy(head, 4);

  const nonce = Buffer.concat([head, nonceMac(head, deviceId)]).toString('base64url');
  return { ok: true, nonce, expiresInSeconds: NONCE_TTL_MS / 1000 };
}

/** Validates HMAC + age + device binding and CONSUMES the nonce (single use). */
function consumeNonce(nonce, deviceId) {
  if (typeof nonce !== 'string' || nonce.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(nonce)) return 'nonce_malformed';

  const raw = Buffer.from(nonce, 'base64url');
  if (raw.length !== 32) return 'nonce_malformed';

  const head = raw.subarray(0, 16);
  const mac = raw.subarray(16);
  const expected = nonceMac(head, deviceId);
  if (!crypto.timingSafeEqual(mac, expected)) return 'nonce_bad_signature'; // wrong device or forged

  const ageMs = Date.now() - head.readUInt32BE(0) * 1000;
  if (ageMs > NONCE_TTL_MS || ageMs < -30 * 1000) return 'nonce_expired';

  // Synchronous check-and-set: no await between them, so no double use.
  if (usedNonces.has(nonce)) return 'nonce_replayed';
  usedNonces.set(nonce, true);
  return null;
}

// ---------------------------------------------------------------
// JWS parsing + certificate chain + signature
// ---------------------------------------------------------------
function describeChain(certs) {
  return certs.map((c, i) => ({
    i,
    subject: c.subject.replace(/\n/g, ', '),
    issuer: c.issuer.replace(/\n/g, ', '),
    sha256: c.fingerprint256,
    validTo: c.validTo,
    ca: c.ca
  }));
}

function parseJws(jws) {
  if (typeof jws !== 'string' || jws.length === 0 || jws.length > MAX_JWS_LENGTH) return { error: 'jws_malformed' };
  const parts = jws.trim().split('.');
  if (parts.length !== 3) return { error: 'jws_malformed' };

  try {
    const header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
    const signature = b64urlDecode(parts[2]);
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return { error: 'jws_malformed' };
    return { header, payload, signature, signingInput: Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8') };
  } catch (e) {
    return { error: 'jws_malformed' };
  }
}

function verifyCertificateChain(x5c) {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > MAX_CHAIN_LENGTH) return { error: 'chain_invalid_length' };

  let certs;
  try {
    certs = x5c.map((b64) => new crypto.X509Certificate(Buffer.from(String(b64), 'base64')));
  } catch (e) {
    return { error: 'chain_unparsable' };
  }

  const roots = loadRootCertificates();
  if (roots.length === 0) {
    warn('No Huawei root CA configured (HMS_ATTEST_ROOT_CA_PEM / HMS_ATTEST_ROOT_CA_PATH / lib/certs/)');
    return { error: 'server_not_configured', certs };
  }

  const now = Date.now();
  const inValidity = (c) => now >= new Date(c.validFrom).getTime() && now <= new Date(c.validTo).getTime();
  const strictCa = process.env.HMS_ATTEST_STRICT_CA !== 'false';

  // Every cert is valid now
  if (!certs.every(inValidity)) return { error: 'chain_expired', certs };

  // Each cert is signed by the next one in the chain (same logic as Huawei's Java sample)
  for (let i = 0; i < certs.length - 1; i++) {
    let signedByNext = false;
    try { signedByNext = certs[i].verify(certs[i + 1].publicKey); } catch (e) { /* false */ }
    if (!signedByNext) return { error: 'chain_broken', certs };
    if (strictCa && !certs[i + 1].ca) return { error: 'chain_issuer_not_ca', certs };
  }

  // The top of the chain must be (or be signed by) a trusted Huawei root
  const top = certs[certs.length - 1];
  const trusted = roots.find((root) => {
    if (!inValidity(root)) return false;
    if (root.fingerprint256 === top.fingerprint256) return true;
    try { return top.verify(root.publicKey); } catch (e) { return false; }
  });
  if (!trusted) return { error: 'chain_untrusted_root', certs };

  // Leaf must be issued for Huawei's SysIntegrity signing service
  if (!certs[0].checkHost(LEAF_HOSTNAME)) return { error: 'leaf_hostname_mismatch', certs };

  return { certs, leaf: certs[0] };
}

function verifyJwsSignature(alg, leaf, signingInput, signature) {
  const key = leaf.publicKey;
  const type = key.asymmetricKeyType;

  try {
    if (alg === 'RS256' || alg === 'PS256') {
      if (type !== 'rsa' && type !== 'rsa-pss') return false;
      const bits = key.asymmetricKeyDetails?.modulusLength || 0;
      if (bits < 2048) return false;
      if (alg === 'RS256') return crypto.verify('sha256', signingInput, key, signature);
      return crypto.verify('sha256', signingInput, {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_AUTO
      }, signature);
    }
    if (alg === 'ES256') {
      if (type !== 'ec') return false;
      return crypto.verify('sha256', signingInput, { key, dsaEncoding: 'ieee-p1363' }, signature);
    }
  } catch (e) { /* fall through */ }
  return false;
}

// ---------------------------------------------------------------
// Public: verify a SysIntegrity JWS
// ---------------------------------------------------------------
function fail(code, message, status = 401, extra = {}) {
  return { ok: false, status, code, message, ...extra };
}

/**
 * @param {{ jws: string, nonce: string, deviceId: string }} input
 * @returns {{ ok: true, payload: object } | { ok: false, status: number, code: string, message: string }}
 */
export function verifyHmsSysIntegrity({ jws, nonce, deviceId: deviceIdInput } = {}) {
  try {
    const deviceId = normalizeDeviceId(deviceIdInput);
    if (!deviceId) return fail('invalid_device_id', 'Invalid deviceId', 400);
    if (!deriveKey('nonce')) {
      warn('No ATTEST_SECRET / JWT_SECRET configured');
      return fail('server_not_configured', 'Server not configured', 500);
    }

    const allowedDigests = allowedCertDigests();
    if (allowedDigests.size === 0 && !isDebug()) {
      warn('HMS_ATTEST_ALLOWED_CERT_SHA256 is empty - refusing every attestation (fail closed)');
      return fail('server_not_configured', 'Server not configured', 500);
    }

    // 1) parse
    const parsed = parseJws(jws);
    if (parsed.error) return fail(parsed.error, 'Malformed attestation', 400);
    const { header, payload, signature, signingInput } = parsed;

    if (!SUPPORTED_ALGS.has(header.alg)) return fail('jws_alg_unsupported', 'Unsupported algorithm', 400);

    // Debug only: lets you see a real phone's response before any trust decision is made.
    if (isDebug()) log('DEBUG UNVERIFIED payload =', JSON.stringify(payload, null, 2));

    // 2) certificate chain + domain
    const chain = verifyCertificateChain(header.x5c);
    if (isDebug() && chain.certs) {
      log('DEBUG JWS header alg =', header.alg, '| chain =', JSON.stringify(describeChain(chain.certs), null, 2));
    }
    if (chain.error) {
      if (chain.error === 'server_not_configured') return fail(chain.error, 'Server not configured', 500);
      warn(`Chain check failed: ${chain.error}`);
      return fail(chain.error, 'Attestation rejected');
    }

    // 3) signature
    if (!verifyJwsSignature(header.alg, chain.leaf, signingInput, signature)) {
      warn('JWS signature invalid');
      return fail('signature_invalid', 'Attestation rejected');
    }

    // 4) payload freshness (Huawei server clock)
    const ts = Number(payload.timestampMs ?? payload.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > JWS_MAX_SKEW_MS) {
      warn(`timestamp out of range (payload=${ts}, now=${Date.now()})`);
      return fail('timestamp_out_of_range', 'Attestation rejected');
    }

    // 5) our nonce: HMAC valid, bound to this device, not expired, never used before.
    //    Huawei echoes the nonce as base64 of the bytes we passed to the API.
    let echoedNonce = null;
    if (typeof payload.nonce === 'string') {
      const decoded = Buffer.from(payload.nonce, 'base64').toString('utf8');
      if (decoded === nonce) echoedNonce = nonce;
      else if (payload.nonce === nonce) echoedNonce = nonce; // tolerate a raw echo
    }
    if (!echoedNonce) {
      warn('payload.nonce does not match the nonce sent by the app');
      return fail('nonce_mismatch', 'Attestation rejected');
    }
    const nonceError = consumeNonce(echoedNonce, deviceId);
    if (nonceError) {
      warn(`Nonce rejected: ${nonceError}`);
      return fail(nonceError, 'Attestation rejected');
    }

    // 6) our app, our signing key
    if (payload.apkPackageName !== expectedPackageName()) {
      warn(`Package mismatch: ${payload.apkPackageName}`);
      return fail('package_mismatch', 'Attestation rejected');
    }

    const reportedDigests = (Array.isArray(payload.apkCertificateDigestSha256)
      ? payload.apkCertificateDigestSha256
      : [payload.apkCertificateDigestSha256]
    ).map(toHexDigest).filter(Boolean);

    if (isDebug()) {
      log('DEBUG apkCertificateDigestSha256 (hex) =', reportedDigests.join(', ') || '(none)');
      log('DEBUG allow-list size =', allowedDigests.size);
    }
    // Every digest must be ours (an app can be signed by several keys; none may be foreign).
    const certOk = reportedDigests.length > 0 && reportedDigests.every((d) => allowedDigests.has(d));
    if (!certOk) {
      warn(`Signing certificate not on allow-list: ${reportedDigests.join(', ') || '(none reported)'}`);
      return fail('cert_not_allowed', 'Attestation rejected');
    }

    if (process.env.HMS_APP_ID && payload.appId && String(payload.appId) !== String(process.env.HMS_APP_ID)) {
      warn(`appId mismatch: ${payload.appId}`);
      return fail('app_id_mismatch', 'Attestation rejected');
    }

    // 7) the device itself
    if (payload.basicIntegrity !== true) {
      warn(`basicIntegrity=${payload.basicIntegrity} detail=${JSON.stringify(payload.detail)} advice=${payload.advice}`);
      return fail('integrity_failed', 'Device integrity check failed', 403);
    }

    return { ok: true, payload };
  } catch (err) {
    warn('Unexpected error:', err.message);
    return fail('internal_error', 'Attestation failed', 500);
  }
}

// ---------------------------------------------------------------
// Our own 1-hour token (what the app sends as X-App-Attestation)
// ---------------------------------------------------------------
export function issueAttestationToken(deviceIdInput) {
  const deviceId = normalizeDeviceId(deviceIdInput);
  const key = deriveKey('token');
  if (!deviceId || !key) return null;

  const token = jwt.sign(
    { typ: TOKEN_TYPE, prov: 'hms', pkg: expectedPackageName(), did: deviceId },
    key,
    { algorithm: 'HS256', expiresIn: ATTEST_TOKEN_TTL_SECONDS, issuer: TOKEN_ISSUER }
  );
  return { token, expiresInSeconds: ATTEST_TOKEN_TTL_SECONDS };
}

/**
 * Used by step 17 (verifyClientAttestation) on every protected request.
 * @param {string} token       value of the X-App-Attestation header
 * @param {{ deviceId?: string }} [opts]  when given, the token must have been issued for this device
 * @returns {{ ok: true, claims: object } | { ok: false, reason: string }}
 */
export function verifyAttestationToken(token, { deviceId } = {}) {
  try {
    const key = deriveKey('token');
    if (!key) return { ok: false, reason: 'server_not_configured' };
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return { ok: false, reason: 'token_missing' };

    const claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer: TOKEN_ISSUER });
    if (claims.typ !== TOKEN_TYPE || claims.prov !== 'hms') return { ok: false, reason: 'token_wrong_type' };
    if (claims.pkg !== expectedPackageName()) return { ok: false, reason: 'token_wrong_package' };

    if (deviceId !== undefined && deviceId !== null) {
      if (typeof deviceId !== 'string' || !safeEqual(claims.did, deviceId)) return { ok: false, reason: 'token_wrong_device' };
    }
    return { ok: true, claims };
  } catch (e) {
    return { ok: false, reason: e.name === 'TokenExpiredError' ? 'token_expired' : 'token_invalid' };
  }
}
