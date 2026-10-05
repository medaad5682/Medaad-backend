// lib/ilovepdf.js
// ---------------------------------------------------------------------------
// iLoveAPI (iLovePDF) REST client — COMPRESS only.
// Workflow: start -> upload -> process -> download (+ delete task)
// Docs: https://www.iloveapi.com/docs/api-reference
//
// Rules this module follows:
//  • SERVER-SIDE ONLY. The secret key must never reach the browser or the Flutter app.
//  • FAIL-OPEN. Any iLovePDF problem leaves the original uploaded file untouched,
//    so a teacher's upload never fails because of this integration.
//  • Needs Node >= 18.17 (global fetch / FormData / Blob). No extra npm packages:
//    `jsonwebtoken` is already in package.json.
//
// Env vars (all optional except the two keys):
//   ILOVEPDF_PUBLIC_KEY / ILOVEPDF_SECRET_KEY   from https://www.iloveapi.com/user/projects
//   ILOVEPDF_REGION             eu | us | fr | de | pl | in | sg        (default: eu)
//   ILOVEPDF_COMPRESS           1 to compress every uploaded PDF         (default: off — master switch)
//   ILOVEPDF_COMPRESSION_LEVEL  low | recommended | extreme              (default: recommended)
//   ILOVEPDF_MAX_MB             skip files larger than this              (default: 100)
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const API_HOST = 'api.ilovepdf.com';
const API_BASE = `https://${API_HOST}/v1`;
const TOKEN_TTL_MS = 45 * 60 * 1000; // iLovePDF tokens expire after 1 hour
const LOG = '[iLovePDF]';

const SHORT_TIMEOUT = 30 * 1000;
const LONG_TIMEOUT = 10 * 60 * 1000; // upload / process / download

let tokenCache = { value: null, at: 0 };

const isOn = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

export function isIlovepdfConfigured() {
  return Boolean(process.env.ILOVEPDF_PUBLIC_KEY && process.env.ILOVEPDF_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// Auth — self-signed JWT (recommended for server-side code).
// Payload mirrors the official iLovePDF Node library: jti = public key,
// iss = api.ilovepdf.com, iat backdated by 5s (their servers reject "future" tokens).
// ---------------------------------------------------------------------------
function getToken() {
  if (tokenCache.value && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
  const now = Math.floor(Date.now() / 1000);
  const value = jwt.sign(
    { jti: process.env.ILOVEPDF_PUBLIC_KEY, iss: API_HOST, iat: now - 5 },
    process.env.ILOVEPDF_SECRET_KEY
  );
  tokenCache = { value, at: Date.now() };
  return value;
}

async function call(url, { method = 'GET', json, form, timeoutMs = SHORT_TIMEOUT } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // fetch sets the multipart boundary itself
  }

  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });

  if (!res.ok) {
    if (res.status === 401) tokenCache = { value: null, at: 0 }; // force a fresh token next time
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${method} ${new URL(url).pathname} -> HTTP ${res.status} ${detail}`);
  }
  return res;
}

async function toBlob(filePath) {
  // openAsBlob streams from disk (no full read into RAM) — Node >= 18.17 / 19.8
  if (typeof fs.openAsBlob === 'function') {
    return fs.openAsBlob(filePath, { type: 'application/pdf' });
  }
  return new Blob([await fs.promises.readFile(filePath)], { type: 'application/pdf' });
}

async function assertLooksLikePdf(filePath) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    if (buf.toString('latin1') !== '%PDF-') throw new Error('output is not a PDF');
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------
// Core: run ONE tool on ONE local file. Writes the result next to the input as
// `<file>.ilp.tmp` and returns its path — the caller decides whether to keep it.
// ---------------------------------------------------------------------------
async function runTool(filePath, tool, params = {}) {
  const region = process.env.ILOVEPDF_REGION || 'eu';
  const filename = path.basename(filePath);
  const tmpOut = `${filePath}.ilp.tmp`;
  let server;
  let task;

  try {
    // 1) START — gives us the assigned server + task id
    const started = await (await call(`${API_BASE}/start/${tool}/${region}`)).json();
    server = started.server;
    task = started.task;
    if (!server || !task) throw new Error('start: response missing server/task');
    const base = `https://${server}/v1`;

    // 2) UPLOAD (multipart)
    const form = new FormData();
    form.append('task', task);
    form.append('file', await toBlob(filePath), filename);
    const uploaded = await (await call(`${base}/upload`, { method: 'POST', form, timeoutMs: LONG_TIMEOUT })).json();
    if (!uploaded.server_filename) throw new Error('upload: response missing server_filename');

    // 3) PROCESS (JSON) — blocks until the task finishes
    const processed = await (
      await call(`${base}/process`, {
        method: 'POST',
        json: { task, tool, files: [{ server_filename: uploaded.server_filename, filename }], ...params },
        timeoutMs: LONG_TIMEOUT,
      })
    ).json();
    if (!['TaskSuccess', 'TaskSuccessWithWarnings'].includes(processed.status)) {
      throw new Error(`process: unexpected status "${processed.status}"`);
    }

    // 4) DOWNLOAD — single output file is served directly (multiple would be a ZIP)
    const dl = await call(`${base}/download/${task}`, { timeoutMs: LONG_TIMEOUT });
    await pipeline(Readable.fromWeb(dl.body), fs.createWriteStream(tmpOut));
    await assertLooksLikePdf(tmpOut);

    return {
      tmpOut,
      inBytes: (await fs.promises.stat(filePath)).size,
      outBytes: (await fs.promises.stat(tmpOut)).size,
    };
  } catch (err) {
    await fs.promises.rm(tmpOut, { force: true }).catch(() => {});
    throw err;
  } finally {
    // Best-effort: free the task now instead of waiting for the 2-hour auto-delete
    // (open tasks count against a limit of 10% of the monthly file quota).
    if (server && task) {
      fetch(`https://${server}/v1/task/${task}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: AbortSignal.timeout(10 * 1000),
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Public helpers (each rewrites the file in place, atomically)
// ---------------------------------------------------------------------------

/** Compress; only swaps the file if the result is actually smaller. */
export async function compressPdfInPlace(filePath, level = 'recommended') {
  const { tmpOut, inBytes, outBytes } = await runTool(filePath, 'compress', { compression_level: level });
  if (outBytes < inBytes) {
    await fs.promises.rename(tmpOut, filePath);
    return { replaced: true, inBytes, outBytes };
  }
  await fs.promises.rm(tmpOut, { force: true });
  return { replaced: false, inBytes, outBytes };
}

/**
 * Called by the upload routes right after multer saves the PDF and BEFORE the
 * SHA-256 is computed, so `content_hash` / `X-File-Hash` always match the final file.
 * Never throws. Does nothing unless both keys and ILOVEPDF_COMPRESS are set.
 */
export async function postProcessUploadedPdf(filePath) {
  const summary = { ran: false, steps: [] };
  try {
    if (!isIlovepdfConfigured() || !isOn(process.env.ILOVEPDF_COMPRESS)) return summary;

    const maxBytes = (Number(process.env.ILOVEPDF_MAX_MB) || 100) * 1024 * 1024;
    const { size } = await fs.promises.stat(filePath);
    if (size > maxBytes) {
      console.warn(`${LOG} skipped: ${(size / 1048576).toFixed(1)} MB exceeds ILOVEPDF_MAX_MB`);
      return summary;
    }

    summary.ran = true;

    try {
      const r = await compressPdfInPlace(filePath, process.env.ILOVEPDF_COMPRESSION_LEVEL || 'recommended');
      summary.steps.push({ tool: 'compress', ...r });
    } catch (e) {
      console.error(`${LOG} compress failed, keeping file as-is:`, e.message);
    }

    for (const s of summary.steps) {
      console.log(`${LOG} ${s.tool}: ${s.inBytes} -> ${s.outBytes} bytes${s.replaced ? '' : ' (kept original)'}`);
    }
  } catch (e) {
    console.error(`${LOG} post-process aborted:`, e.message);
  }
  return summary;
}
