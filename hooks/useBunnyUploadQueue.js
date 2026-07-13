
// hooks/useBunnyUploadQueue.js
// ===================================================================
// 🎯 Hook لإدارة قائمة انتظار رفع فيديوهات متعددة إلى Bunny Stream
// في نفس الوقت (رفع متزامن Concurrent)، بحيث يستطيع المعلم:
//   - إغلاق/تصغير نافذة الرفع دون إلغاء الرفع الجاري
//   - فتح فيديو آخر (فصل/مادة/كورس مختلف، أو نفس الفصل) وبدء رفع جديد
//     بينما الرفع الأول ما زال جارياً في الخلفية
//
// كل عملية رفع لها معرّف (id) خاص بها وحالة (status/progress/error)
// مستقلة تماماً عن العمليات الأخرى — بعكس useBunnyDirectUpload القديم
// الذي كان يدعم عملية رفع واحدة فقط في نفس الوقت.
// ===================================================================

import { useState, useRef, useCallback } from 'react';

async function loadTus() {
  const tus = await import('tus-js-client');
  return tus;
}

function getFileFingerprint(file) {
  return `bunny-session:${file.name}:${file.size}:${file.lastModified}`;
}

function saveSession(file, data) {
  try {
    localStorage.setItem(getFileFingerprint(file), JSON.stringify(data));
  } catch (_) {}
}

function loadSession(file) {
  try {
    const raw = localStorage.getItem(getFileFingerprint(file));
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() / 1000 > session.expiresAt) {
      localStorage.removeItem(getFileFingerprint(file));
      return null;
    }
    return session;
  } catch (_) {
    return null;
  }
}

function clearSession(file) {
  try {
    localStorage.removeItem(getFileFingerprint(file));
  } catch (_) {}
}

async function clearTusInternalStorage(file) {
  try {
    const tus = await loadTus();
    if (!tus.WebStorageUrlStorage) return;
    const storage = new tus.WebStorageUrlStorage();
    const fingerprint = await tus.defaultOptions.fingerprint(file, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
    });
    const previousUploads = await storage.findUploadsByFingerprint(fingerprint);
    await Promise.all(previousUploads.map((u) => storage.removeUpload(u.urlStorageKey)));
  } catch (_) {}
}

function getVideoDurationLocal(file) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    let objectUrl = null;

    const finish = (duration) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (objectUrl) {
        try { window.URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
      resolve(duration && !isNaN(duration) && isFinite(duration) && duration > 0 ? duration : 0);
    };

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      timeoutId = setTimeout(() => finish(0), 5000);
      objectUrl = window.URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        if (!isFinite(video.duration) || isNaN(video.duration)) {
          video.addEventListener('seeked', function onSeeked() {
            video.removeEventListener('seeked', onSeeked);
            finish(video.duration);
          });
          video.currentTime = 1e101;
        } else {
          finish(video.duration);
        }
      };
      video.onerror = () => finish(0);
      video.src = objectUrl;
    } catch (err) {
      finish(0);
    }
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`انتهت مهلة الطلب بعد ${timeoutMs / 1000} ثانية`);
    }
    throw err;
  }
}

let _idCounter = 0;
function makeId() {
  _idCounter += 1;
  return `up_${Date.now()}_${_idCounter}`;
}

export function useBunnyUploadQueue() {
  // uploads: مصفوفة عناصر الرفع الظاهرة للمستخدم (أحدثها أولاً)
  // كل عنصر: { id, fileName, chapterId, chapterTitle, subjectTitle, courseTitle, title, status, progress, error, videoId, createdAt }
  const [uploads, setUploads] = useState([]);

  // uploadRefs: id -> كائن TUS الحالي (لاستخدام cancel() الصريح فقط)
  const uploadRefs = useRef({});
  // lastOptions: id -> كل المعطيات اللازمة لإعادة بناء كائن TUS عند الاستئناف
  const lastOptions = useRef({});

  const patchUpload = useCallback((id, patch) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  async function _createFreshSession(id, { file, chapterId, title, notifyStudents, sortOrder, localDuration }) {
    clearSession(file);
    await clearTusInternalStorage(file);

    const sessionRes = await fetchWithTimeout('/api/dashboard/teacher/create-upload-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId,
        title: title || file.name,
        fileSize: file.size,
      }),
    }, 15000);

    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => ({}));
      throw new Error(errData.error || `فشل إنشاء جلسة الرفع (${sessionRes.status})`);
    }

    const sessionData = await sessionRes.json();
    const fullSessionData = {
      ...sessionData,
      localDuration,
      chapterId,
      title: title || file.name,
      notifyStudents,
      sortOrder,
    };

    saveSession(file, fullSessionData);
    return fullSessionData;
  }

  const startUpload = useCallback((options) => {
    const { file, chapterId, chapterTitle = '', subjectTitle = '', courseTitle = '', title, notifyStudents = false, sortOrder = 999, onComplete, onError } = options;

    if (!file || !chapterId) {
      const msg = 'file و chapterId مطلوبان';
      onError?.(new Error(msg));
      return null;
    }

    const id = makeId();

    setUploads((prev) => [
      {
        id,
        fileName: file.name,
        chapterId,
        chapterTitle,
        subjectTitle,
        courseTitle,
        title: title || file.name,
        status: 'requesting',
        progress: 0,
        error: null,
        videoId: null,
        createdAt: Date.now(),
      },
      ...prev,
    ]);

    (async () => {
      let localDuration = 0;
      try { localDuration = await getVideoDurationLocal(file); } catch (_) {}

      let sessionData = loadSession(file);

      try {
        if (sessionData) {
          patchUpload(id, { status: 'uploading' });
          if (localDuration <= 0 && sessionData.localDuration > 0) localDuration = sessionData.localDuration;
        } else {
          patchUpload(id, { status: 'requesting' });
          sessionData = await _createFreshSession(id, { file, chapterId, title, notifyStudents, sortOrder, localDuration });
          patchUpload(id, { status: 'uploading' });
        }
      } catch (err) {
        patchUpload(id, { status: 'error', error: err.message });
        onError?.(err);
        return;
      }

      patchUpload(id, { videoId: sessionData.bunnyVideoId });
      lastOptions.current[id] = { file, sessionData, localDuration, chapterId, title, notifyStudents, sortOrder, onComplete, onError };

      await _doTusUpload(id, { file, sessionData, localDuration, onComplete, onError });
    })();

    return id;
  }, [patchUpload]);

  async function _doTusUpload(id, { file, sessionData, localDuration, onComplete, onError }) {
    const { bunnyVideoId, libraryId, signature, expiresAt, chapterId, title, notifyStudents, sortOrder } = sessionData;

    uploadRefs.current[id] = null;
    let tusSucceeded = false;

    try {
      const tus = await loadTus();

      await new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: 'https://video.bunnycdn.com/tusupload',

          retryDelays: [0, 3000, 6000, 12000, 24000],

          chunkSize: 50 * 1024 * 1024,
          removeFingerprintOnSuccess: true,

          headers: {
            AuthorizationSignature: signature,
            AuthorizationExpire: String(expiresAt),
            VideoId: bunnyVideoId,
            LibraryId: String(libraryId),
          },

          metadata: {
            filename: file.name,
            filetype: file.type || 'video/mp4',
            title: title || file.name,
          },

          onError(err) { reject(err); },

          onProgress(bytesUploaded, bytesTotal) {
            patchUpload(id, { progress: Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)) });
          },

          onSuccess() {
            clearSession(file);
            tusSucceeded = true;
            resolve();
          },
        });

        uploadRefs.current[id] = upload;

        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0) {
            const mostRecent = previousUploads.reduce((a, b) =>
              new Date(b.creationTime || 0) > new Date(a.creationTime || 0) ? b : a
            );
            upload.resumeFromPreviousUpload(mostRecent);
          }
          upload.start();
        }).catch(() => {
          upload.start();
        });
      });

    } catch (err) {
      uploadRefs.current[id] = null;

      if (err?.message === 'CANCELLED') return;

      const httpStatus = err?.originalResponse?.getStatus?.();

      if (httpStatus === 401 || httpStatus === 404) {
        patchUpload(id, { status: 'requesting', error: null });
        const opts = lastOptions.current[id];
        if (!opts) {
          patchUpload(id, { status: 'error', error: 'فشل استئناف الرفع — يرجى تحديد الملف مرة أخرى' });
          onError?.(err);
          return;
        }
        try {
          const newSession = await _createFreshSession(id, {
            file: opts.file,
            chapterId: opts.chapterId || sessionData.chapterId,
            title: opts.title || sessionData.title,
            notifyStudents: opts.notifyStudents ?? sessionData.notifyStudents,
            sortOrder: opts.sortOrder ?? sessionData.sortOrder,
            localDuration: localDuration || sessionData.localDuration || 0,
          });
          lastOptions.current[id] = { ...opts, sessionData: newSession };
          patchUpload(id, { videoId: newSession.bunnyVideoId, status: 'uploading' });
          await _doTusUpload(id, { file: opts.file, sessionData: newSession, localDuration: localDuration || sessionData.localDuration || 0, onComplete: opts.onComplete, onError: opts.onError });
          return;
        } catch (recreateErr) {
          patchUpload(id, { status: 'error', error: `فشل إنشاء جلسة جديدة: ${recreateErr.message}` });
          onError?.(recreateErr);
          return;
        }
      }

      patchUpload(id, { status: 'error', error: 'انقطع الاتصال — اضغط "استكمال" للمتابعة من نقطة التوقف' });
      onError?.(err);
    }

    if (!tusSucceeded) return;
    patchUpload(id, { status: 'confirming', progress: 100 });

    const finalChapterId  = sessionData.chapterId     || chapterId;
    const finalTitle      = sessionData.title         || title || file.name;
    const finalNotify     = sessionData.notifyStudents ?? notifyStudents;
    const finalSortOrder  = sessionData.sortOrder     ?? sortOrder;
    const finalDuration   = localDuration > 0 ? localDuration : (sessionData.localDuration || 0);

    try {
      const confirmRes = await fetchWithTimeout('/api/dashboard/teacher/confirm-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bunnyVideoId, chapterId: finalChapterId, title: finalTitle, notifyStudents: finalNotify, sortOrder: finalSortOrder, durationSeconds: finalDuration }),
      }, 30000);

      if (!confirmRes.ok) {
        const errData = await confirmRes.json().catch(() => ({}));
        throw new Error(errData.error || `فشل تأكيد الرفع (${confirmRes.status})`);
      }

      const confirmData = await confirmRes.json();
      patchUpload(id, { status: 'done', progress: 100 });
      onComplete?.(confirmData);
    } catch (err) {
      patchUpload(id, { status: 'error', error: `اكتمل الرفع لكن فشل الحفظ في قاعدة البيانات: ${err.message}` });
      onError?.(err);
    }
  }

  const cancelUpload = useCallback((id) => {
    const current = uploadRefs.current[id];
    uploadRefs.current[id] = null;
    if (current) {
      try { current.abort(); } catch (_) {}
    }
    patchUpload(id, { status: 'cancelled', progress: 0 });
  }, [patchUpload]);

  const resumeUpload = useCallback((id) => {
    const savedOptions = lastOptions.current[id];
    if (!savedOptions) return;

    uploadRefs.current[id] = null;
    patchUpload(id, { status: 'uploading', error: null });

    _doTusUpload(id, { ...savedOptions });
  }, [patchUpload]);

  // dismissUpload: يزيل العنصر من القائمة الظاهرة فقط (لعناصر منتهية: done/error/cancelled)
  // لا يجوز استخدامه لإلغاء رفع نشط — استخدم cancelUpload لذلك أولاً.
  const dismissUpload = useCallback((id) => {
    const current = uploadRefs.current[id];
    if (current) {
      try { current.abort(); } catch (_) {}
    }
    delete uploadRefs.current[id];
    delete lastOptions.current[id];
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const activeCount = uploads.filter((u) => ['requesting', 'uploading', 'confirming'].includes(u.status)).length;

  return { uploads, activeCount, startUpload, cancelUpload, resumeUpload, dismissUpload };
}
