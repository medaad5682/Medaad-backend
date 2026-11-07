import zlib from 'zlib';

// ============================================================
// 📦 قارئ ملفات Anki (.apkg) — بدون أي مكتبات أصلية (Native)
// ------------------------------------------------------------
// ملف apkg = ZIP يحتوي على:
//   - collection.anki2 / collection.anki21  ⇐ قاعدة SQLite (الصيغة القديمة)
//   - collection.anki21b                    ⇐ نفس القاعدة لكن مضغوطة بـ zstd (الصيغة الحديثة)
//   - media                                 ⇐ JSON يربط رقم الملف باسمه (أو protobuf مضغوط في الحديثة)
//   - 0, 1, 2 ...                           ⇐ ملفات الوسائط (الصور) بأسماء رقمية
// نقرأ من القاعدة جدول notes فقط (الحقول flds مفصولة بـ \x1f) ونتجاهل كل الإعدادات الأخرى.
// القارئ مكتوب يدوياً (ZIP + SQLite b-tree) حتى لا نعتمد على sql.js/WASM أو مكتبات تحتاج بناء.
// ============================================================

export class AnkiImportError extends Error {}

// ------------------------------------------------------------
// 🗜️ ZIP
// ------------------------------------------------------------
function readZip(buf) {
  // نبحث عن End Of Central Directory من النهاية
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new AnkiImportError('الملف ليس ملف Anki صالحاً (ليس ZIP).');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.set(name, { method, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const get = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lo = e.localOffset;
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new AnkiImportError('ملف Anki تالف (ZIP).');
    const dataStart = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const raw = buf.slice(dataStart, dataStart + e.compSize);
    if (e.method === 0) return raw;
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new AnkiImportError('طريقة ضغط غير مدعومة داخل ملف Anki.');
  };

  return { has: (n) => entries.has(n), get, names: () => [...entries.keys()] };
}

// ------------------------------------------------------------
// 🗜️ zstd (الصيغة الحديثة): zlib المدمج في Node الحديث، وإلا مكتبة fzstd كاحتياط
// ------------------------------------------------------------
function zstdDecompress(data) {
  if (typeof zlib.zstdDecompressSync === 'function') return zlib.zstdDecompressSync(data);
  try {
    // eslint-disable-next-line global-require
    const { decompress } = require('fzstd');
    return Buffer.from(decompress(new Uint8Array(data)));
  } catch (e) {
    throw new AnkiImportError(
      'هذا الملف بصيغة Anki الحديثة (zstd) والسيرفر لا يدعمها. ثبّت المكتبة (npm i fzstd) أو حدّث Node إلى 22.15 فأعلى، أو صدّر الملف من Anki بخيار «Support older Anki versions».'
    );
  }
}

const isZstd = (b) => b && b.length > 4 && b.readUInt32LE(0) === 0xfd2fb528;

// ------------------------------------------------------------
// 🗃️ SQLite (قراءة جداول فقط)
// ------------------------------------------------------------
function readVarint(b, pos) {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const byte = b[pos + i];
    v = v * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [v, i + 1];
  }
  return [v * 256 + b[pos + 8], 9]; // البايت التاسع كامل 8 بت
}

function decodeRecord(p) {
  const [hdrLen, hl] = readVarint(p, 0);
  const types = [];
  let pos = hl;
  while (pos < hdrLen) {
    const [t, n] = readVarint(p, pos);
    types.push(t);
    pos += n;
  }
  const out = [];
  let d = hdrLen;
  for (const t of types) {
    if (t === 0) out.push(null);
    else if (t >= 1 && t <= 6) {
      const sz = [0, 1, 2, 3, 4, 6, 8][t];
      let v;
      if (sz === 8) v = Number(p.readBigInt64BE(d));
      else v = p.readIntBE(d, sz);
      out.push(v); d += sz;
    } else if (t === 7) { out.push(p.readDoubleBE(d)); d += 8; }
    else if (t === 8) out.push(0);
    else if (t === 9) out.push(1);
    else if (t >= 12 && t % 2 === 0) { const l = (t - 12) / 2; out.push(p.slice(d, d + l)); d += l; }
    else if (t >= 13) { const l = (t - 13) / 2; out.push(p.slice(d, d + l).toString('utf8')); d += l; }
    else out.push(null);
  }
  return out;
}

class SqliteReader {
  constructor(buf) {
    if (buf.length < 100 || buf.slice(0, 15).toString('latin1') !== 'SQLite format 3') {
      throw new AnkiImportError('قاعدة بيانات Anki داخل الملف غير صالحة.');
    }
    this.buf = buf;
    const ps = buf.readUInt16BE(16);
    this.pageSize = ps === 1 ? 65536 : ps;
    this.usable = this.pageSize - buf[20];
  }

  page(n) { const s = (n - 1) * this.pageSize; return this.buf.slice(s, s + this.pageSize); }

  // يقرأ الحمولة الكاملة (مع صفحات الـ overflow)
  payload(pg, cellPos, P) {
    const U = this.usable;
    const X = U - 35;
    if (P <= X) return pg.slice(cellPos, cellPos + P);
    const M = Math.floor(((U - 12) * 32) / 255) - 23;
    const K = M + ((P - M) % (U - 4));
    const local = K <= X ? K : M;
    const parts = [pg.slice(cellPos, cellPos + local)];
    let next = pg.readUInt32BE(cellPos + local);
    let left = P - local;
    let guard = 0;
    while (next && left > 0 && guard++ < 1e6) {
      const op = this.page(next);
      const take = Math.min(left, U - 4);
      parts.push(op.slice(4, 4 + take));
      left -= take;
      next = op.readUInt32BE(0);
    }
    return Buffer.concat(parts);
  }

  // يمرّ على كل صفوف جدول (b-tree) ⇐ callback(rowid, values[])
  eachRow(rootPage, cb) {
    const walk = (n, depth) => {
      if (depth > 40) throw new AnkiImportError('قاعدة بيانات Anki تالفة.');
      const pg = this.page(n);
      const base = n === 1 ? 100 : 0;
      const type = pg[base];
      const cells = pg.readUInt16BE(base + 3);
      if (type === 0x0d) {
        for (let i = 0; i < cells; i++) {
          const cp = pg.readUInt16BE(base + 8 + i * 2);
          const [P, a] = readVarint(pg, cp);
          const [rowid, b] = readVarint(pg, cp + a);
          cb(rowid, decodeRecord(this.payload(pg, cp + a + b, P)));
        }
      } else if (type === 0x05) {
        for (let i = 0; i < cells; i++) {
          const cp = pg.readUInt16BE(base + 12 + i * 2);
          walk(pg.readUInt32BE(cp), depth + 1);
        }
        walk(pg.readUInt32BE(base + 8), depth + 1);
      }
    };
    walk(rootPage, 0);
  }

  tables() {
    const t = {};
    this.eachRow(1, (_id, v) => { if (v[0] === 'table') t[v[1]] = { root: v[3], sql: v[4] }; });
    return t;
  }
}

// ------------------------------------------------------------
// 🧩 protobuf مبسّط لقائمة الوسائط في الصيغة الحديثة
// MediaEntries { repeated MediaEntry entries = 1 }  —  MediaEntry { string name = 1; ... }
// ترتيب العنصر في القائمة = اسم الملف الرقمي داخل ZIP
// ------------------------------------------------------------
function pbVarint(b, pos) {
  let v = 0, shift = 0, i = pos;
  for (;;) {
    const byte = b[i++];
    v += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) break;
    shift += 7;
  }
  return [v, i];
}

function parseMediaProtobuf(b) {
  const names = [];
  let pos = 0;
  while (pos < b.length) {
    let tag; [tag, pos] = pbVarint(b, pos);
    const field = Math.floor(tag / 8), wire = tag & 7;
    if (wire === 2) {
      let len; [len, pos] = pbVarint(b, pos);
      if (field === 1) {
        // داخل MediaEntry: نبحث عن الحقل 1 (name)
        const sub = b.slice(pos, pos + len);
        let sp = 0, name = '';
        while (sp < sub.length) {
          let st; [st, sp] = pbVarint(sub, sp);
          const sf = Math.floor(st / 8), sw = st & 7;
          if (sw === 2) {
            let sl; [sl, sp] = pbVarint(sub, sp);
            if (sf === 1) name = sub.slice(sp, sp + sl).toString('utf8');
            sp += sl;
          } else if (sw === 0) { [, sp] = pbVarint(sub, sp); }
          else if (sw === 5) sp += 4;
          else if (sw === 1) sp += 8;
          else break;
        }
        names.push(name);
      }
      pos += len;
    } else if (wire === 0) { [, pos] = pbVarint(b, pos); }
    else if (wire === 5) pos += 4;
    else if (wire === 1) pos += 8;
    else break;
  }
  return names;
}

// ------------------------------------------------------------
// 🧹 تنظيف HTML الخاص بـ Anki ⇒ نص + صور
// ------------------------------------------------------------
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });

const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

/** يُرجع { text, images: [src...] } */
export function htmlToTextAndImages(html) {
  const images = [];
  let s = String(html || '');
  s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(IMG_RE, (_m, a, b, c) => { images.push(a ?? b ?? c ?? ''); return '\n'; });
  s = s.replace(/\[sound:[^\]]*\]/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/(div|p|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/\u00a0/g, ' ');
  s = s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return { text: s, images };
}

// Cloze: {{c1::الإجابة::تلميح}}
const CLOZE_RE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
const hasCloze = (s) => /\{\{c\d+::/.test(s || '');
const clozeFront = (s) => s.replace(CLOZE_RE, (_m, _a, hint) => (hint ? `[${hint}]` : '[...]'));
const clozeBack = (s) => s.replace(CLOZE_RE, (_m, ans) => ans);

// ------------------------------------------------------------
// 🖼️ فحص أنواع الصور (PNG / JPG فقط — نفس ما تقبله نقطة رفع الفلاش كاردس)
// ------------------------------------------------------------
export function imageKind(name, data) {
  const ext = (String(name).match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(ext)) return null;
  if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return ext === 'png' ? 'png' : null;
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return ext === 'png' ? null : ext;
  return null; // الامتداد لا يطابق المحتوى
}

// ------------------------------------------------------------
// 🚀 الدالة الرئيسية
// ------------------------------------------------------------
/**
 * @param {Buffer} apkgBuffer
 * @param {object} opts
 *   - maxCards: أقصى عدد بطاقات تُستخرج (يتبقى من حد المجموعة)
 *   - maxCardText: أقصى طول نص للوجه
 *   - maxImageBytes: أقصى حجم للصورة
 *   - saveImage(buffer, ext) ⇒ اسم الملف المحفوظ (يُستدعى مرة واحدة لكل صورة)
 * @returns {{ cards, stats }}
 */
export function parseApkg(apkgBuffer, opts = {}) {
  const { maxCards = 500, maxCardText = 5000, maxImageBytes = 10 * 1024 * 1024, saveImage } = opts;
  const zip = readZip(apkgBuffer);

  // 1) اختيار قاعدة البيانات الأحدث المتاحة
  let dbBuf = null;
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    if (zip.has(name)) { dbBuf = zip.get(name); break; }
  }
  if (!dbBuf) throw new AnkiImportError('لم نجد مجموعة بطاقات داخل الملف. تأكد أنه ملف .apkg مُصدَّر من Anki/AnkiDroid.');
  if (isZstd(dbBuf)) dbBuf = zstdDecompress(dbBuf);

  // 2) خريطة الوسائط: اسم الصورة الأصلي ⇒ اسم الملف الرقمي داخل ZIP
  const mediaByName = new Map();
  if (zip.has('media')) {
    let mraw = zip.get('media');
    if (isZstd(mraw)) mraw = zstdDecompress(mraw);
    let parsed = null;
    try { parsed = JSON.parse(mraw.toString('utf8')); } catch { /* protobuf */ }
    if (parsed && typeof parsed === 'object') {
      for (const [num, name] of Object.entries(parsed)) mediaByName.set(String(name), num);
    } else {
      parseMediaProtobuf(mraw).forEach((name, i) => { if (name) mediaByName.set(name, String(i)); });
    }
  }

  // 3) قراءة الملاحظات (notes) فقط: id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data
  const db = new SqliteReader(dbBuf);
  const tables = db.tables();
  if (!tables.notes) throw new AnkiImportError('لا يحتوي الملف على جدول البطاقات (notes).');
  const notes = [];
  db.eachRow(tables.notes.root, (rowid, v) => {
    const flds = typeof v[6] === 'string' ? v[6] : '';
    notes.push({ id: v[0] ?? rowid, flds: flds.split('\x1f') });
  });
  notes.sort((a, b) => a.id - b.id); // ترتيب الإنشاء

  // 4) التحويل إلى بطاقات
  const stats = {
    notesFound: notes.length, imported: 0, skippedEmpty: 0, skippedLimit: 0,
    imagesSaved: 0, imagesUnsupported: 0, imagesMissing: 0, extraImagesDropped: 0, truncated: 0, cloze: 0,
  };
  const imageCache = new Map(); // اسم الصورة ⇒ اسم الملف المحفوظ | null
  const cards = [];

  const resolveImage = (src) => {
    let name = String(src || '').trim();
    if (!name || /^(https?:|data:|\/\/)/i.test(name)) { stats.imagesMissing++; return null; }
    let decoded = name;
    try { decoded = decodeURIComponent(name); } catch { /* اسم غير مُرمّز */ }
    const key = mediaByName.has(decoded) ? decoded : name;
    if (imageCache.has(key)) return imageCache.get(key);

    let saved = null;
    const entry = mediaByName.get(key);
    if (entry === undefined || !zip.has(entry)) stats.imagesMissing++;
    else {
      let data = zip.get(entry);
      if (isZstd(data)) data = zstdDecompress(data);
      const ext = imageKind(key, data);
      if (!ext) stats.imagesUnsupported++;
      else if (data.length > maxImageBytes) stats.imagesUnsupported++;
      else if (saveImage) { saved = saveImage(data, ext); stats.imagesSaved++; }
    }
    imageCache.set(key, saved);
    return saved;
  };

  const face = (html) => {
    const { text, images } = htmlToTextAndImages(html);
    let fileName = null;
    // الصور تُعالج بالترتيب؛ نأخذ أول صورة صالحة ونُسقط الباقي (البطاقة تدعم صورة واحدة لكل وجه)
    for (let i = 0; i < images.length; i++) {
      if (fileName) { stats.extraImagesDropped += images.length - i; break; }
      fileName = resolveImage(images[i]);
    }
    let t = text;
    if (t.length > maxCardText) { t = t.slice(0, maxCardText); stats.truncated++; }
    return { text: t, image: fileName };
  };

  for (const note of notes) {
    if (cards.length >= maxCards) { stats.skippedLimit++; continue; }
    const f0 = note.flds[0] || '';
    const f1 = note.flds[1] || '';
    if (!f0 && !f1) { stats.skippedEmpty++; continue; }

    let frontHtml = f0;
    let backHtml = f1;
    if (hasCloze(f0)) {
      stats.cloze++;
      frontHtml = clozeFront(f0);
      backHtml = clozeBack(f0) + (f1 ? `<br>${f1}` : '');
    }

    const front = face(frontHtml);
    const back = face(backHtml);
    if ((!front.text && !front.image) || (!back.text && !back.image)) { stats.skippedEmpty++; continue; }

    cards.push({
      front_text: front.text, back_text: back.text,
      front_image_file_id: front.image, back_image_file_id: back.image,
    });
  }
  stats.imported = cards.length;
  return { cards, stats };
}
