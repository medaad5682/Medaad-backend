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

// ✅ عدد محاولات إعادة الاتصال التلقائية بعد استنفاد retryDelays الداخلية لـ
// tus لكل رفعة على حدة. أي تقدّم حقيقي (onProgress) يُصفّر عدّاد تلك الرفعة،
// فاتصال متذبذب لكن متقدّم لن يستنفد المحاولات — فقط انقطاع تام مستمر يفعل.
const MAX_AUTO_RETRIES = 6;
const AUTO_RETRY_BASE_DELAY_MS = 5000;

// ✅ إعادة محاولة تلقائية لطلب "تأكيد الحفظ" (confirm-upload) فقط — منفصلة
// تماماً عن إعادة محاولة رفع البيانات (tus). ملف الفيديو يكون قد وصل بالفعل
// 100% إلى Bunny في هذه المرحلة؛ فشل هذا الطلب لا يعني أبداً أن البيانات
// ضاعت، بل غالباً ازدحام مؤقت (شبكة العميل مشغولة برفع فيديو آخر متزامن، أو
// تأخر السيرفر). لذلك نعيد المحاولة بنفس بيانات الجلسة دون لمس التحميل.
const MAX_CONFIRM_RETRIES = 6;
const CONFIRM_RETRY_BASE_DELAY_MS = 4000;

export function useBunnyUploadQueue() {
  // uploads: مصفوفة عناصر الرفع الظاهرة للمستخدم (أحدثها أولاً)
  // كل عنصر: { id, fileName, chapterId, chapterTitle, subjectTitle, courseTitle, title, status, progress, error, videoId, createdAt }
  const [uploads, setUploads] = useState([]);

  // uploadRefs: id -> كائن TUS الحالي (لاستخدام cancel() الصريح فقط)
  const uploadRefs = useRef({});
  // lastOptions: id -> كل المعطيات اللازمة لإعادة بناء كائن TUS عند الاستئناف.
  // ✅ تحمل أيضاً tusCompleted: true بمجرد وصول البيانات فعلياً لـ Bunny،
  // حتى تعرف resumeUpload أنها يجب أن تُعيد محاولة "الحفظ" فقط بلا رفع جديد.
  const lastOptions = useRef({});
  // autoRetryCounts: id -> عدد محاولات إعادة الاتصال التلقائية المتتالية بدون تقدّم (أثناء رفع البيانات)
  const autoRetryCounts = useRef({});
  // confirmRetryCounts: id -> عدد محاولات إعادة الاتصال التلقائية لطلب confirm-upload وحده
  const confirmRetryCounts = useRef({});

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
    autoRetryCounts.current[id] = 0;
    confirmRetryCounts.current[id] = 0;

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

  // skipTusTransfer=true يُستخدم فقط عند استئناف رفع بعد أن نجحت مرحلة رفع
  // البيانات فعلاً (وصلت 100% لـ Bunny) لكن فشلت مرحلة "تأكيد الحفظ" لاحقاً.
  // في هذه الحالة لا نلمس التحميل إطلاقاً — فقط نعيد محاولة الحفظ.
  async function _doTusUpload(id, { file, sessionData, localDuration, onComplete, onError, skipTusTransfer = false }) {
    const { bunnyVideoId, libraryId, signature, expiresAt, chapterId, title, notifyStudents, sortOrder } = sessionData;

    let tusSucceeded = skipTusTransfer;

    if (!skipTusTransfer) {
      uploadRefs.current[id] = null;

      try {
        const tus = await loadTus();

        await new Promise((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: 'https://video.bunnycdn.com/tusupload',

            // ⏱️ مُمدَّدة من ~45 ثانية إلى أكثر من 4 دقائق إجمالاً — راجع نفس
            // الملاحظة في useBunnyDirectUpload.js
            retryDelays: [0, 3000, 6000, 12000, 24000, 30000, 60000, 60000, 60000],

            // 📦 10MB بدلاً من 20MB — يقلّل مدة كل طلب PATCH أكثر، فيقلّ احتمال
            // أن يتجاوز أي طلب مهلة زمنية وسيطة، ويعطي تحديثات onProgress
            // أكثر تكراراً (شريط تقدّم أدق) خصوصاً عند رفع عدة فيديوهات في
            // نفس الوقت وتنافسها على نفس النطاق الترددي المتاح.
            chunkSize: 10 * 1024 * 1024,
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
              // ✅ أي تقدّم فعلي = الاتصال رجع يعمل. نُصفّر عدّاد إعادة
              // الاتصال ونُرجع الحالة إلى 'uploading' فوراً — بدون هذا كانت
              // الحالة تفضل 'reconnecting' (وتُظهر رسالة "جاري إعادة
              // المحاولة (٣/٦)") حتى لو الرفع استمر واستمر تقدّمه فعلياً.
              autoRetryCounts.current[id] = 0;
              patchUpload(id, {
                status: 'uploading',
                error: null,
                progress: Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)),
              });
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

        // ✅ إعادة اتصال تلقائية عدة مرات قبل مطالبة المستخدم بالتدخل اليدوي
        const currentAttempts = autoRetryCounts.current[id] || 0;
        if (currentAttempts < MAX_AUTO_RETRIES) {
          autoRetryCounts.current[id] = currentAttempts + 1;
          const attempt = autoRetryCounts.current[id];
          const delayMs = Math.min(AUTO_RETRY_BASE_DELAY_MS * attempt, 60000);

          patchUpload(id, {
            status: 'reconnecting',
            error: `انقطع الاتصال — جاري إعادة المحاولة تلقائياً (${attempt}/${MAX_AUTO_RETRIES})...`,
          });

          await new Promise((r) => setTimeout(r, delayMs));
          await _doTusUpload(id, { file, sessionData, localDuration, onComplete, onError });
          return;
        }

        patchUpload(id, { status: 'error', error: 'انقطع الاتصال بعد عدة محاولات تلقائية — اضغط "استكمال" للمتابعة من نقطة التوقف' });
        onError?.(err);
        return;
      }
    }

    if (!tusSucceeded) return;

    // ✅ بمجرد وصول البيانات فعلياً لـ Bunny، نُسجّل ذلك في lastOptions حتى
    // لو فشلت مرحلة الحفظ التالية لاحقاً، فإن resumeUpload تعرف أنها يجب أن
    // تُعيد محاولة الحفظ فقط دون أي إعادة رفع للفيديو من جديد.
    lastOptions.current[id] = {
      ...(lastOptions.current[id] || {}),
      file, sessionData, localDuration, chapterId, title, notifyStudents, sortOrder,
      onComplete, onError,
      tusCompleted: true,
    };
    confirmRetryCounts.current[id] = 0;

    await _runConfirm(id, { sessionData, localDuration, chapterId, title, notifyStudents, sortOrder, onComplete, onError });
  }

  // مرحلة "تأكيد الحفظ" — منفصلة تماماً عن رفع البيانات. الفيديو يكون قد
  // وصل 100% إلى Bunny قبل استدعاء هذه الدالة، لذا فشلها لا يعني أبداً فقدان
  // البيانات المرفوعة، ونعيد محاولتها تلقائياً عدة مرات دون لمس التحميل.
  async function _runConfirm(id, { sessionData, localDuration, chapterId, title, notifyStudents, sortOrder, onComplete, onError }) {
    const { bunnyVideoId } = sessionData;

    patchUpload(id, { status: 'confirming', progress: 100, error: null });

    const finalChapterId  = sessionData.chapterId     || chapterId;
    const finalTitle      = sessionData.title         || title;
    const finalNotify     = sessionData.notifyStudents ?? notifyStudents;
    const finalSortOrder  = sessionData.sortOrder     ?? sortOrder;
    const finalDuration   = localDuration > 0 ? localDuration : (sessionData.localDuration || 0);

    try {
      // ⏱️ مُمدَّدة من 30 إلى 45 ثانية — عند اكتمال عدة رفعات متزامنة تقريباً
      // في نفس الوقت قد يتأخر هذا الطلب الصغير بسبب ازدحام الاتصال العام
      // (رفع فيديو آخر لا يزال يشغل معظم سرعة الرفع لدى المستخدم).
      const confirmRes = await fetchWithTimeout('/api/dashboard/teacher/confirm-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bunnyVideoId, chapterId: finalChapterId, title: finalTitle, notifyStudents: finalNotify, sortOrder: finalSortOrder, durationSeconds: finalDuration }),
      }, 45000);

      if (!confirmRes.ok) {
        const errData = await confirmRes.json().catch(() => ({}));
        throw new Error(errData.error || `فشل تأكيد الرفع (${confirmRes.status})`);
      }

      const confirmData = await confirmRes.json();
      confirmRetryCounts.current[id] = 0;
      patchUpload(id, { status: 'done', progress: 100 });
      onComplete?.(confirmData);
    } catch (err) {
      // ✅ إعادة محاولة تلقائية لطلب الحفظ فقط — الفيديو موجود بالفعل على
      // Bunny، فلا داعي أبداً لإعادة رفعه من جديد بسبب هذا الفشل.
      const attempts = confirmRetryCounts.current[id] || 0;
      if (attempts < MAX_CONFIRM_RETRIES) {
        confirmRetryCounts.current[id] = attempts + 1;
        const attempt = confirmRetryCounts.current[id];
        const delayMs = Math.min(CONFIRM_RETRY_BASE_DELAY_MS * attempt, 30000);

        patchUpload(id, {
          status: 'confirming',
          progress: 100,
          error: `اكتمل رفع الفيديو، جاري إعادة محاولة الحفظ تلقائياً (${attempt}/${MAX_CONFIRM_RETRIES})...`,
        });

        await new Promise((r) => setTimeout(r, delayMs));
        await _runConfirm(id, { sessionData, localDuration, chapterId, title, notifyStudents, sortOrder, onComplete, onError });
        return;
      }

      patchUpload(id, {
        status: 'error',
        progress: 100,
        error: `الفيديو مرفوع بالكامل على السيرفر لكن فشل حفظ بياناته: ${err.message} — اضغط "استكمال" لإعادة محاولة الحفظ فقط (لن يُعاد رفع الفيديو).`,
      });
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

    // ✅ إذا كانت بيانات الفيديو قد وصلت بالفعل 100% إلى Bunny سابقاً وفشلت
    // فقط مرحلة "تأكيد الحفظ" في قاعدة البيانات، لا نعيد رفع الفيديو من
    // جديد إطلاقاً — فقط نعيد محاولة الحفظ (هذا هو إصلاح مشكلة إعادة الرفع
    // من الصفر بعد الوصول لـ 100%).
    if (savedOptions.tusCompleted) {
      confirmRetryCounts.current[id] = 0;
      patchUpload(id, { status: 'confirming', error: null, progress: 100 });
      _runConfirm(id, { ...savedOptions });
      return;
    }

    autoRetryCounts.current[id] = 0; // استئناف يدوي — منح دورة محاولات تلقائية جديدة
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
    delete autoRetryCounts.current[id];
    delete confirmRetryCounts.current[id];
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const activeCount = uploads.filter((u) => ['requesting', 'uploading', 'confirming', 'reconnecting'].includes(u.status)).length;

  return { uploads, activeCount, startUpload, cancelUpload, resumeUpload, dismissUpload };
}
