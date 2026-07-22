// hooks/useBunnyDirectUpload.js
// ===================================================================
// 🎯 Hook للرفع المباشر من جهاز المعلم إلى Bunny Stream (بدون المرور بالسيرفر)
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

// ✅ عدد محاولات إعادة الاتصال التلقائية بعد أن يستنفد tus-js-client قائمة
// retryDelays الداخلية الخاصة به (أي بعد أن "يموت" كائن الرفع فعلياً).
// أي تقدّم حقيقي في الرفع (onProgress) يُصفّر هذا العدّاد من جديد، لذا
// اتصال متذبذب لكنه يتقدّم تدريجياً لن يستنفد المحاولات أبداً — فقط انقطاع
// تام ومستمر (لا تقدّم إطلاقاً عبر كل المحاولات) يصل لحد MAX_AUTO_RETRIES
// ويطلب من المستخدم الضغط يدوياً على "استكمال".
const MAX_AUTO_RETRIES = 6;
const AUTO_RETRY_BASE_DELAY_MS = 5000; // 5s, 10s, 15s ... حتى 60s كحد أقصى

export function useBunnyDirectUpload() {
  const [progress, setProgress]   = useState(0);
  const [status, setStatus]       = useState('idle');
  const [error, setError]         = useState(null);
  const [currentVideoId, setCurrentVideoId] = useState(null);

  // uploadRef: الكائن الحالي لـ TUS — يُستخدم فقط لـ cancel() الصريح من المستخدم
  const uploadRef = useRef(null);
  // lastUploadOptionsRef: كل المعطيات اللازمة لإعادة بناء كائن TUS عند الاستئناف
  const lastUploadOptionsRef = useRef(null);
  // autoRetryCountRef: عدد محاولات إعادة الاتصال التلقائية المتتالية بدون أي تقدّم
  const autoRetryCountRef = useRef(0);

  async function _createFreshSession({ file, chapterId, title, notifyStudents, sortOrder, localDuration }) {
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
    // ✅ إنشاء كائن يحتوي على جميع البيانات بما فيها notifyStudents
    const fullSessionData = { 
      ...sessionData, 
      localDuration, 
      chapterId, 
      title: title || file.name, 
      notifyStudents, 
      sortOrder 
    };
    
    saveSession(file, fullSessionData);
    return fullSessionData; // ✅ إرجاع الكائن الكامل
  }
  const startUpload = useCallback(async (options) => {
    const { file, chapterId, title, notifyStudents = false, sortOrder = 999, onComplete, onError } = options;

    if (!file || !chapterId) {
      const msg = 'file و chapterId مطلوبان';
      setError(msg); setStatus('error'); onError?.(new Error(msg)); return;
    }

    setError(null); setProgress(0); setCurrentVideoId(null);
    autoRetryCountRef.current = 0; // رفع جديد بالكامل — نبدأ عدّاد إعادة الاتصال من الصفر

    let localDuration = 0;
    try { localDuration = await getVideoDurationLocal(file); } catch (_) {}

    let sessionData = loadSession(file);

    if (sessionData) {
      setStatus('uploading');
      if (localDuration <= 0 && sessionData.localDuration > 0) localDuration = sessionData.localDuration;
    } else {
      setStatus('requesting');
      try {
        sessionData = await _createFreshSession({ file, chapterId, title, notifyStudents, sortOrder, localDuration });
        setStatus('uploading');
      } catch (err) {
        setError(err.message); setStatus('error'); onError?.(err); return;
      }
    }

    setCurrentVideoId(sessionData.bunnyVideoId);
    lastUploadOptionsRef.current = { file, sessionData, localDuration, chapterId, title, notifyStudents, sortOrder, onComplete, onError };

    await _doTusUpload({ file, sessionData, localDuration, onComplete, onError });
  }, []);

  async function _doTusUpload({ file, sessionData, localDuration, onComplete, onError }) {
    const { bunnyVideoId, libraryId, signature, expiresAt, chapterId, title, notifyStudents, sortOrder } = sessionData;

    uploadRef.current = null;
    let tusSucceeded = false;

    try {
      const tus = await loadTus();

      await new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: 'https://video.bunnycdn.com/tusupload',

          // retryDelays مُعادة: ضرورية للمقاومة الطبيعية لاهتزاز الشبكة.
          // لكن هذه المرة resume() لن يستدعي abort() على كائن حي،
          // لأننا نبني كائناً جديداً فقط بعد أن يموت القديم (status=error).
          // ⏱️ مُمدَّدة من ~45 ثانية إلى أكثر من 4 دقائق إجمالاً — الفترة
          // القصيرة السابقة كانت تجعل أي اهتزاز شبكة عادي (بضع ثوانٍ) يقتل
          // كائن الرفع بالكامل ويظهر "انقطع الاتصال" رغم أن الإنترنت سليم.
          retryDelays: [0, 3000, 6000, 12000, 24000, 30000, 60000, 60000, 60000],

          // 📦 تقليل حجم القطعة من 50MB إلى 20MB يقلّل مدة طلب PATCH الواحد،
          // فيقلّ احتمال أن يتجاوز الطلب أي مهلة زمنية (timeout) وسيطة أثناء
          // نقل قطعة ضخمة على اتصال بطيء أو متعدد الرفعات المتزامنة.
          chunkSize: 20 * 1024 * 1024,
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
            // ✅ أي تقدّم فعلي = الاتصال يعمل فعلياً، نُصفّر عدّاد إعادة
            // الاتصال التلقائية حتى لا تُستنفد المحاولات بسبب اهتزاز مؤقت
            autoRetryCountRef.current = 0;
            setProgress(Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)));
          },

          onSuccess() {
            clearSession(file);
            tusSucceeded = true;
            resolve();
          },
        });

        // نسجّل في uploadRef مباشرة بعد البناء — قبل start() —
        // حتى يستطيع cancel() الإمساك به إذا طلب المستخدم إلغاءً فورياً.
        uploadRef.current = upload;

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
      // هذا الكائن مات — نزيل مرجعه حتى لا يتم abort() عليه لاحقاً بالخطأ
      uploadRef.current = null;

      // إلغاء صريح من cancel() — cancel() تتولى تحديث الحالة بنفسها
      if (err?.message === 'CANCELLED') return;

      const httpStatus = err?.originalResponse?.getStatus?.();

      if (httpStatus === 401 || httpStatus === 404) {
        // جلسة منتهية — إعادة إنشاء تلقائية
        setStatus('requesting'); setError(null);
        const opts = lastUploadOptionsRef.current;
        if (!opts) {
          setError('فشل استئناف الرفع — يرجى تحديد الملف مرة أخرى');
          setStatus('error'); onError?.(err); return;
        }
        try {
          const newSession = await _createFreshSession({
            file: opts.file,
            chapterId: opts.chapterId || sessionData.chapterId,
            title: opts.title || sessionData.title,
            notifyStudents: opts.notifyStudents ?? sessionData.notifyStudents,
            sortOrder: opts.sortOrder ?? sessionData.sortOrder,
            localDuration: localDuration || sessionData.localDuration || 0,
          });
          lastUploadOptionsRef.current = { ...opts, sessionData: newSession };
          setCurrentVideoId(newSession.bunnyVideoId);
          setStatus('uploading');
          await _doTusUpload({ file: opts.file, sessionData: newSession, localDuration: localDuration || sessionData.localDuration || 0, onComplete: opts.onComplete, onError: opts.onError });
          return;
        } catch (recreateErr) {
          setError(`فشل إنشاء جلسة جديدة: ${recreateErr.message}`);
          setStatus('error'); onError?.(recreateErr); return;
        }
      }

      // انقطاع شبكة عادي — الكائن مات بعد استنزاف retryDelays الداخلية لـ tus.
      // ✅ بدلاً من إيقاف الرفع فوراً وانتظار المستخدم، نحاول إعادة الاتصال
      // تلقائياً عدة مرات (نفس sessionData ما زالت صالحة لأنها ليست 401/404).
      if (autoRetryCountRef.current < MAX_AUTO_RETRIES) {
        autoRetryCountRef.current += 1;
        const attempt = autoRetryCountRef.current;
        const delayMs = Math.min(AUTO_RETRY_BASE_DELAY_MS * attempt, 60000);

        setStatus('reconnecting');
        setError(`انقطع الاتصال — جاري إعادة المحاولة تلقائياً (${attempt}/${MAX_AUTO_RETRIES})...`);

        await new Promise((r) => setTimeout(r, delayMs));
        await _doTusUpload({ file, sessionData, localDuration, onComplete, onError });
        return;
      }

      // استُنفدت كل محاولات إعادة الاتصال التلقائية بدون أي تقدّم — الآن
      // فقط نطلب من المستخدم تدخلاً يدوياً (قد يكون انقطاعاً فعلياً طويلاً)
      setError('انقطع الاتصال بعد عدة محاولات تلقائية — اضغط "استكمال" للمتابعة من نقطة التوقف');
      setStatus('error');
      onError?.(err);
    }

    // ── تأكيد الحفظ في قاعدة البيانات ──────────────────────────────
    if (!tusSucceeded) return; // وصلنا هنا عبر مسار الخطأ — لا نكمل
    setStatus('confirming'); setProgress(100);

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
      setStatus('done');
      onComplete?.(confirmData);
    } catch (err) {
      setError(`اكتمل الرفع لكن فشل الحفظ في قاعدة البيانات: ${err.message}`);
      setStatus('error');
      onError?.(err);
    }
  }

  const cancel = useCallback(() => {
    const current = uploadRef.current;
    uploadRef.current = null;
    if (current) {
      try { current.abort(); } catch (_) {}
    }
    setStatus('cancelled');
    setProgress(0);
  }, []);

  // resume: يُنشئ كائن TUS جديداً بالكامل — الكائن القديم مات بالفعل (onError استُدعي).
  // لا نستدعي abort() على الميت — فقط نبني جديداً يجد نقطة التوقف ويستأنف.
  const resume = useCallback(() => {
    const savedOptions = lastUploadOptionsRef.current;
    if (!savedOptions) return;

    // الكائن القديم ميت (uploadRef.current = null تم في catch أعلاه)
    // لكن نُصفّره هنا أيضاً دفاعياً
    uploadRef.current = null;
    autoRetryCountRef.current = 0; // استئناف يدوي — منح المستخدم دورة محاولات تلقائية جديدة

    setError(null);
    setStatus('uploading');

    _doTusUpload({ ...savedOptions });
  }, []);

  const reset = useCallback((file) => {
    const current = uploadRef.current;
    uploadRef.current = null;
    if (current) { try { current.abort(); } catch (_) {} }
    if (file) { clearSession(file); clearTusInternalStorage(file); }
    lastUploadOptionsRef.current = null;
    autoRetryCountRef.current = 0;
    setProgress(0); setStatus('idle'); setError(null); setCurrentVideoId(null);
  }, []);

  return { startUpload, cancel, reset, resume, progress, status, error, currentVideoId };
}
