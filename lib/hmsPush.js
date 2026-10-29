// lib/hmsPush.js
// ------------------------------------------------------------------
// Huawei Push Kit (HMS) server-side sender.
// - OAuth2 client_credentials token (cached, refreshed before expiry)
// - Sends notification messages to tokens (batched) or to a topic
// - Never throws to the caller: every function resolves to a result object
//
// Env vars:
//   HMS_APP_ID            (required)  App ID from AppGallery Connect
//   HMS_APP_SECRET        (required)  Client secret of the same app
//   HMS_ENABLE_CATEGORY   'true' => adds android.category from the map below.
//                         Turn on ONLY after self-classification is approved.
// ------------------------------------------------------------------

const OAUTH_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';
const PUSH_BASE = 'https://push-api.cloud.huawei.com/v1';

const REQUEST_TIMEOUT_MS = 8000;
const MAX_TOKENS_PER_REQUEST = 1000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const DEFAULT_CHANNEL_ID = 'fcm_channel';
const CLICK_ACTION = 'FLUTTER_NOTIFICATION_CLICK';

// Response codes (from Huawei docs; verify against a real response during testing)
const CODE_SUCCESS = '80000000';
const CODE_PARTIAL_INVALID_TOKENS = '80100000';
const CODE_INVALID_TOKEN = '80300007';
const AUTH_ERROR_CODES = new Set(['80200001', '80200003']);

// Fill AFTER Huawei approves self-classification, using the exact category
// names Huawei shows you. Key = the `type` we put in notification data.
// Example (placeholders, do not enable before approval):
//   subscription_decision: 'EXPRESS',
//   subscription_request:  'WORK',
const HMS_CATEGORY_BY_TYPE = {};

let cachedToken = null; // { value, expiresAt }
let inflightToken = null;

export function isHmsConfigured() {
  return Boolean(process.env.HMS_APP_ID && process.env.HMS_APP_SECRET);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.HMS_APP_ID,
    client_secret: process.env.HMS_APP_SECRET
  });

  const res = await fetchWithTimeout(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.access_token) {
    const reason = json?.error_description || json?.error || 'no access_token in response';
    throw new Error(`HMS OAuth failed (HTTP ${res.status}): ${reason}`);
  }

  const ttlSeconds = Number(json.expires_in) || 3600;
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000
  };
  return cachedToken.value;
}

export async function getAccessToken(forceRefresh = false) {
  if (!isHmsConfigured()) throw new Error('HMS_APP_ID / HMS_APP_SECRET are not set');

  if (!forceRefresh && cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }
  if (!inflightToken) {
    inflightToken = requestAccessToken().finally(() => { inflightToken = null; });
  }
  return inflightToken;
}

// ---------- message building ----------

function stringifyData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/**
 * payload (neutral): { title, body, type, data?, channelId? }
 * returns the `message` object for the HMS REST API (without token/topic).
 */
export function buildHmsMessage(payload) {
  const data = stringifyData({
    click_action: CLICK_ACTION,
    type: payload.type,
    ...payload.data
  });

  const android = {
    urgency: 'HIGH',
    notification: {
      channel_id: payload.channelId || DEFAULT_CHANNEL_ID,
      default_sound: true,
      click_action: { type: 1, action: CLICK_ACTION }
    }
  };

  if (process.env.HMS_ENABLE_CATEGORY === 'true') {
    const category = HMS_CATEGORY_BY_TYPE[payload.type];
    if (category) android.category = category;
  }

  return {
    notification: { title: payload.title, body: payload.body },
    android,
    // HMS expects `data` as ONE string
    data: JSON.stringify(data)
  };
}

// ---------- sending ----------

async function postMessage(message) {
  const send = async (accessToken) => {
    const res = await fetchWithTimeout(`${PUSH_BASE}/${process.env.HMS_APP_ID}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ validate_only: false, message })
    });
    const json = await res.json().catch(() => null);
    return { httpStatus: res.status, json };
  };

  let result = await send(await getAccessToken());

  // Expired / rejected OAuth token: refresh once and retry
  if (result.httpStatus === 401 || AUTH_ERROR_CODES.has(String(result.json?.code))) {
    result = await send(await getAccessToken(true));
  }
  return result;
}

function parseResult(result, tokenCount) {
  const code = String(result.json?.code ?? '');
  const msg = result.json?.msg;

  if (code === CODE_SUCCESS) {
    return { success: tokenCount, failure: 0, invalidTokens: [], code, msg };
  }

  if (code === CODE_PARTIAL_INVALID_TOKENS) {
    let detail = null;
    try { detail = typeof msg === 'string' ? JSON.parse(msg) : msg; } catch (_) { /* ignore */ }
    const invalidTokens = Array.isArray(detail?.illegal_tokens) ? detail.illegal_tokens : [];
    const failure = Number(detail?.failure) || invalidTokens.length;
    return { success: Math.max(tokenCount - failure, 0), failure, invalidTokens, code, msg };
  }

  if (code === CODE_INVALID_TOKEN) {
    return { success: 0, failure: tokenCount, invalidTokens: 'ALL', code, msg };
  }

  return { success: 0, failure: tokenCount, invalidTokens: [], code: code || `HTTP_${result.httpStatus}`, msg };
}

/**
 * Send to one or many device tokens. Resolves to:
 * { success, failure, invalidTokens: string[], errors: [{code,msg}] }
 */
export async function sendHmsToTokens(tokens, payload) {
  const summary = { success: 0, failure: 0, invalidTokens: [], errors: [] };
  const list = Array.from(new Set((tokens || []).filter(Boolean)));
  if (list.length === 0) return summary;

  if (!isHmsConfigured()) {
    summary.failure = list.length;
    summary.errors.push({ code: 'NOT_CONFIGURED', msg: 'HMS_APP_ID / HMS_APP_SECRET missing' });
    return summary;
  }

  const base = buildHmsMessage(payload);

  for (let i = 0; i < list.length; i += MAX_TOKENS_PER_REQUEST) {
    const chunk = list.slice(i, i + MAX_TOKENS_PER_REQUEST);
    try {
      const result = await postMessage({ ...base, token: chunk });
      const parsed = parseResult(result, chunk.length);
      summary.success += parsed.success;
      summary.failure += parsed.failure;
      summary.invalidTokens.push(...(parsed.invalidTokens === 'ALL' ? chunk : parsed.invalidTokens));
      if (parsed.code !== CODE_SUCCESS) summary.errors.push({ code: parsed.code, msg: parsed.msg });
    } catch (err) {
      summary.failure += chunk.length;
      summary.errors.push({ code: 'EXCEPTION', msg: err.message });
    }
  }
  return summary;
}

/** Send to a topic. Resolves to { success: boolean, code, msg } */
export async function sendHmsToTopic(topic, payload) {
  if (!topic) return { success: false, code: 'NO_TOPIC', msg: 'topic is empty' };
  if (!isHmsConfigured()) return { success: false, code: 'NOT_CONFIGURED', msg: 'HMS_APP_ID / HMS_APP_SECRET missing' };

  try {
    const result = await postMessage({ ...buildHmsMessage(payload), topic });
    const code = String(result.json?.code ?? `HTTP_${result.httpStatus}`);
    return { success: code === CODE_SUCCESS, code, msg: result.json?.msg };
  } catch (err) {
    return { success: false, code: 'EXCEPTION', msg: err.message };
  }
}
