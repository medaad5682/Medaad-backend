import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================
// 🖼️ تصغير الصور قبل الرفع + طابور رفع بالتقدم وإعادة المحاولة (Step 10 — الفلاش كاردس)
// ------------------------------------------------------------
// - نقطة الرفع الحالية (/api/dashboard/teacher/upload) لا تضغط الصور، لذا نصغّرها هنا في المتصفح:
//   أطول ضلع ≤ 1200px وتحويل إلى JPEG بجودة ~82% (يوفر مساحة القرص وباقة بيانات الطلاب).
// - لا نغيّر نقطة الرفع: نرسل type=flashcard_image فتُطبَّق صلاحية can_manage_flashcards.
// - يُرجع الاسم الذي حفظه السيرفر (fileName) فقط — هو الذي يُخزَّن في قاعدة البيانات.
// - الطابور: عدد رفعات متزامنة محدود، تقدم لكل ملف، وإعادة محاولة للفاشل.
// ============================================================

export const MAX_DIMENSION = 1200;            // أطول ضلع بعد التصغير
export const JPEG_QUALITY = 0.82;
export const MAX_INPUT_BYTES = 30 * 1024 * 1024; // الأصل قد يكون كبيراً (صور الهاتف) — الحد الحقيقي 10MB للسيرفر بعد التصغير
export const SERVER_MAX_BYTES = 10 * 1024 * 1024;
const SKIP_RESIZE_BELOW = 400 * 1024;         // JPEG صغير وأبعاده مقبولة ⇒ يُرفع كما هو
const UPLOAD_URL = '/api/dashboard/teacher/upload';

export const isAllowedImage = (file) => !!file && /\.(png|jpe?g)$/i.test(file.name || '');

// ---------- فك ترميز الصورة (مع احترام اتجاه EXIF) ----------
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) { /* نجرب الطريقة التقليدية */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة (ملف تالف؟)')); };
    img.src = url;
  });
}

/**
 * يصغّر الصورة ويحوّلها إلى JPEG. يُرجع File جاهزاً للرفع (امتداده .jpg دائماً لأن السيرفر يحدد المجلد بالامتداد).
 * الصور الشفافة (PNG) تُسطَّح على خلفية بيضاء.
 */
export async function resizeImage(file) {
  const bitmap = await decodeImage(file);
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));

  const isJpeg = /jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
  if (scale === 1 && isJpeg && file.size <= SKIP_RESIZE_BELOW) {
    if (bitmap.close) bitmap.close();
    return file;
  }

  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(bitmap, 0, 0, tw, th);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  canvas.width = canvas.height = 0; // تحرير الذاكرة
  if (!blob) throw new Error('فشل تصغير الصورة');

  // لو لم نصغّر الأبعاد وأصبح الناتج أكبر من الأصل (JPEG مضغوط أصلاً) نبقي الأصل
  if (scale === 1 && isJpeg && blob.size >= file.size) return file;

  const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

// ---------- الرفع عبر XHR (لنسبة التقدم) ----------
export function uploadFlashcardImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* ردّ غير JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.fileName) resolve(data.fileName);
      else reject(new Error(data.error || data.message || `فشل رفع الصورة (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('خطأ في الاتصال أثناء رفع الصورة'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'flashcard_image');
    xhr.send(fd);
  });
}

/** تصغير ثم رفع ملف واحد ⇒ اسم الملف على السيرفر */
export async function resizeAndUpload(file, onProgress) {
  if (!isAllowedImage(file)) throw new Error('الصيغ المسموحة: PNG أو JPG');
  if (file.size > MAX_INPUT_BYTES) throw new Error('حجم الصورة أكبر من 30 ميجا');
  const ready = await resizeImage(file);
  if (ready.size > SERVER_MAX_BYTES) throw new Error('الصورة ما زالت أكبر من 10 ميجا بعد التصغير');
  return uploadFlashcardImage(ready, onProgress);
}

// ============================================================
// الـ Hook
// ============================================================
let itemSeq = 0;

/**
 * items: [{ id, name, preview, status: 'queued'|'resizing'|'uploading'|'done'|'error', progress, fileName, error }]
 * - enqueue(files)      يضيف ملفات للطابور (يرجع عدد المقبول)
 * - retry(id) / retryFailed()
 * - remove(id) / clear()
 * - uploadOne(file)     رفع مباشر لملف واحد (يرجع Promise باسم الملف) بدون المرور بالطابور
 */
export default function useImageResizeUpload({ concurrency = 3 } = {}) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);       // المصدر الحقيقي للحالة (يتجنب سباقات setState)
  const filesRef = useRef(new Map()); // id -> File الأصلي (لإعادة المحاولة)
  const activeRef = useRef(0);
  const mountedRef = useRef(true);

  const sync = useCallback(() => {
    if (mountedRef.current) setItems(itemsRef.current.slice());
  }, []);

  const patch = useCallback((id, p) => {
    itemsRef.current = itemsRef.current.map((it) => (it.id === id ? { ...it, ...p } : it));
    sync();
  }, [sync]);

  const pump = useCallback(() => {
    while (activeRef.current < concurrency) {
      const next = itemsRef.current.find((it) => it.status === 'queued');
      if (!next) return;
      activeRef.current += 1;
      patch(next.id, { status: 'resizing', progress: 0, error: null });

      (async () => {
        try {
          const original = filesRef.current.get(next.id);
          if (!original) throw new Error('الملف لم يعد متاحاً');
          const ready = await resizeImage(original);
          if (ready.size > SERVER_MAX_BYTES) throw new Error('الصورة ما زالت أكبر من 10 ميجا بعد التصغير');
          patch(next.id, { status: 'uploading', progress: 0 });
          const fileName = await uploadFlashcardImage(ready, (pct) => patch(next.id, { progress: pct }));
          patch(next.id, { status: 'done', progress: 100, fileName });
        } catch (e) {
          patch(next.id, { status: 'error', error: e.message || 'فشل الرفع' });
        } finally {
          activeRef.current -= 1;
          pump();
        }
      })();
    }
  }, [concurrency, patch]);

  const enqueue = useCallback((files) => {
    const added = [];
    Array.from(files || []).forEach((file) => {
      if (!isAllowedImage(file) || file.size > MAX_INPUT_BYTES) return;
      const id = `u${Date.now()}_${itemSeq++}`;
      filesRef.current.set(id, file);
      added.push({
        id, name: file.name, preview: URL.createObjectURL(file),
        status: 'queued', progress: 0, fileName: null, error: null,
      });
    });
    if (added.length) {
      itemsRef.current = [...itemsRef.current, ...added];
      sync();
      pump();
    }
    return added.length;
  }, [pump, sync]);

  const retry = useCallback((id) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it || it.status !== 'error') return;
    patch(id, { status: 'queued', progress: 0, error: null });
    pump();
  }, [patch, pump]);

  const retryFailed = useCallback(() => {
    itemsRef.current = itemsRef.current.map((it) => (it.status === 'error' ? { ...it, status: 'queued', progress: 0, error: null } : it));
    sync();
    pump();
  }, [pump, sync]);

  const revoke = (it) => { try { URL.revokeObjectURL(it.preview); } catch (e) { /* ignore */ } };

  const remove = useCallback((id) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it || it.status === 'resizing' || it.status === 'uploading') return; // لا نحذف أثناء الرفع
    revoke(it);
    filesRef.current.delete(id);
    itemsRef.current = itemsRef.current.filter((x) => x.id !== id);
    sync();
  }, [sync]);

  const clear = useCallback(() => {
    itemsRef.current.forEach(revoke);
    filesRef.current.clear();
    itemsRef.current = [];
    sync();
  }, [sync]);

  const uploadOne = useCallback((file, onProgress) => resizeAndUpload(file, onProgress), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      itemsRef.current.forEach(revoke);
    };
  }, []);

  const count = (s) => items.filter((it) => it.status === s).length;
  const stats = {
    total: items.length,
    done: count('done'),
    failed: count('error'),
    active: items.filter((it) => ['queued', 'resizing', 'uploading'].includes(it.status)).length,
  };

  return { items, stats, enqueue, retry, retryFailed, remove, clear, uploadOne };
}
