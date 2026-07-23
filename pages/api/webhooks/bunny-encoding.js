// pages/api/webhooks/bunny-encoding.js
// ===================================================================
// 🔔 Webhook من Bunny Stream — يُستدعى تلقائياً عند كل تغيير في حالة الفيديو
// ===================================================================
//
// الإعداد في لوحة Bunny (مرة واحدة فقط):
//   Stream → Library Settings → Webhook URL → الصق:
//   https://yourdomain.com/api/webhooks/bunny-encoding
//   ثم احفظ — لا يوجد خيار لتصفية الأحداث، Bunny يرسل كل الحالات
//
// الـ Payload الذي يرسله Bunny (3 حقول فقط — لا يوجد VideoLength):
//   {
//     "VideoLibraryId": 133,
//     "VideoGuid": "657bb740-...",  ← نفس bunny_video_id في DB
//     "Status": 1                    ← انظر جدول الحالات أدناه
//   }
//
// جدول حالات Bunny Status:
//   0 = Created          (تم إنشاء كائن الفيديو)
//   1 = Processing       (بدأت المعالجة / التشفير فعلياً)  ← نحدّث DB → 'encoding'
//   2 = Transcoding      (جزء من المعالجة)
//   3 = Finished         (اكتملت المعالجة بالكامل)         ← نحدّث DB → 'ready'
//   4 = ResolutionFinished (دقة واحدة اكتملت — قد يُرسل عدة مرات)  ← نحدّث DB → 'ready'
//   5 = Failed           (فشل)
//   6 = PresignedUploadStarted
//   7 = PresignedUploadFinished
//   8 = PresignedUploadFailed
//
// دورة حياة encoding_status في DB:
//   'waiting'  → بعد اكتمال رفع TUS (confirm-upload.js)
//   'encoding' → عند Status=1 Processing  (هنا)
//   'ready'    → عند Status=3 أو 4 Finished (هنا)
//
// 🔔 إشعار الطلاب (notify_students):
//   إذا فعّل المعلم "إشعار الطلاب" عند إضافة فيديو Bunny، لا يُرسل الإشعار فوراً
//   (لأن الفيديو غير قابل للمشاهدة بعد). بدلاً من ذلك يُخزَّن علَم notify_students=true
//   على صف الفيديو (من confirm-upload.js أو content.js)، ثم هذا الملف هو من يرسل
//   الإشعار الفعلي بمجرد وصول Status=3/4 (Finished) — أي بعد اكتمال التشفير حقاً.
//
// الأمان (اختياري):
//   Bunny يُرفق التوقيع في هذه الترويسات:
//     X-BunnyStream-Signature          ← HMAC-SHA256 hex
//     X-BunnyStream-Signature-Version ← "v1"
//     X-BunnyStream-Signature-Algorithm ← "hmac-sha256"
//   المفتاح هو Library's Read-Only API key
//   احفظه في .env كـ BUNNY_WEBHOOK_SECRET (اختياري — إذا غاب نقبل بدون تحقق)
//
// 📋 تسجيل مفصّل (logging): كل استدعاء Webhook مسجّل بالكامل — الـ payload
// الخام، نتيجة التحقق من التوقيع، البحث عن الفيديو في DB، كل تحديث DB (قبل
// وبعد)، استدعاء Bunny API لجلب المدة، ومحاولة إرسال الإشعار المؤجَّل
// للطلاب بكل تفاصيلها (claim، نجاح/فشل الإرسال، سبب التجاهل إن وُجد).
// ===================================================================

import { supabase } from '../../../lib/supabaseClient';
import admin from '../../../lib/firebaseAdmin'; // ✅ لإرسال إشعار الطلاب بمجرد اكتمال التشفير فعلياً
import crypto from 'crypto';
import { createUploadLogger } from '../../../lib/uploadLogger';

// ✅ تعطيل bodyParser حتى نقرأ الجسم الخام للتحقق من التوقيع
export const config = {
  api: { bodyParser: false },
};

// قراءة الجسم الخام كـ Buffer
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// تحويل الثواني → MM:SS أو HH:MM:SS
function formatDuration(totalSeconds) {
  const secs = Math.floor(Number(totalSeconds) || 0);
  if (secs <= 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

// التحقق من توقيع Bunny (v1 / HMAC-SHA256)
function verifySignature(rawBody, headers, secret) {
  const version   = headers['x-bunnystream-signature-version'];
  const algorithm = headers['x-bunnystream-signature-algorithm'];
  const signature = headers['x-bunnystream-signature'];

  if (!signature || version !== 'v1' || algorithm !== 'hmac-sha256') return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // Buffer مباشرة — لا toString
    .digest('hex');

  // مقارنة ثابتة الوقت لمنع timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

export default async function handler(req, res) {
  const log = createUploadLogger('bunny-webhook');
  const requestStartedAt = Date.now();

  log.incoming(req);

  // ── 1. POST فقط ────────────────────────────────────────────────
  if (req.method !== 'POST') {
    log.warn('method-check', `Rejected non-POST method: ${req.method}`);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── 2. قراءة الجسم الخام ──────────────────────────────────────
  let rawBody;
  try {
    rawBody = await readRawBody(req);
    log.step('read-body', `Raw body read (${rawBody.length} bytes)`);
  } catch (err) {
    log.error('read-body', 'Body read error', { message: err.message, stack: err.stack });
    return res.status(400).json({ error: 'Failed to read body' });
  }

  // ── 3. التحقق من التوقيع (إذا كان المفتاح موجوداً في .env) ───
  const webhookSecret = process.env.BUNNY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const valid = verifySignature(rawBody, req.headers, webhookSecret);
    log.step('signature-check', valid ? 'Signature valid' : 'Signature INVALID', {
      version: req.headers['x-bunnystream-signature-version'],
      algorithm: req.headers['x-bunnystream-signature-algorithm'],
      hasSignatureHeader: !!req.headers['x-bunnystream-signature'],
      valid,
    });
    if (!valid) {
      log.error('signature-check', 'Invalid signature — rejecting webhook call');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    log.warn('signature-check', 'BUNNY_WEBHOOK_SECRET not set — accepting request WITHOUT signature verification');
  }
  // إذا لم يكن BUNNY_WEBHOOK_SECRET محدداً نقبل الطلب بدون تحقق
  // (مناسب للبداية — أضف المفتاح لاحقاً لمزيد من الأمان)

  // ── 4. تحليل الـ payload ──────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    log.error('parse-payload', 'Invalid JSON payload', { message: err.message, raw: rawBody.toString('utf8').slice(0, 500) });
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { VideoGuid: bunnyVideoId, Status: statusCode, VideoLibraryId: payloadLibraryId } = payload;

  log.step('parse-payload', 'Payload parsed', { bunnyVideoId, statusCode, payloadLibraryId, fullPayload: payload });
  log.success('parse-payload', `Webhook event received: status=${statusCode}, bunny_id=${bunnyVideoId}`);

  // ── 5. تجاهل أحداث المكتبات الأخرى ──────────────────────────
  const ourLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  if (ourLibraryId && payloadLibraryId && String(payloadLibraryId) !== String(ourLibraryId)) {
    log.warn('library-check', `Ignoring event from a different library`, { payloadLibraryId, ourLibraryId });
    return res.status(200).json({ ignored: true, reason: 'wrong library' });
  }
  log.step('library-check', 'Library matches — proceeding', { ourLibraryId });

  // ── 6. تصنيف الحدث حسب Status ────────────────────────────────
  //
  // Status=1  Processing  → نُحدّث DB إلى 'encoding' (بدأت المعالجة فعلياً)
  // Status=3  Finished    → نُحدّث DB إلى 'ready'    (اكتملت المعالجة بالكامل)
  // Status=4  ResolutionFinished → نُحدّث DB إلى 'ready' (تُرسَل لكل دقة تنتهي)
  // بقية الحالات (0,2,5,6,7,8) → نتجاهلها ونُعيد 200

  const isProcessingEvent = statusCode === 1;
  const isFinishedEvent   = statusCode === 3 || statusCode === 4;

  const statusLabels = {
    0: 'Created', 1: 'Processing', 2: 'Transcoding', 3: 'Finished',
    4: 'ResolutionFinished', 5: 'Failed', 6: 'PresignedUploadStarted',
    7: 'PresignedUploadFinished', 8: 'PresignedUploadFailed',
  };
  log.step('classify-event', `Event classified as: ${statusLabels[statusCode] || 'Unknown'} (${statusCode})`, {
    isProcessingEvent, isFinishedEvent,
  });

  if (!isProcessingEvent && !isFinishedEvent) {
    log.step('classify-event', `Status ${statusCode} (${statusLabels[statusCode] || 'Unknown'}) not handled — acknowledging and ignoring`);
    return res.status(200).json({ ignored: true, reason: `status ${statusCode} not handled` });
  }

  if (!bunnyVideoId) {
    log.error('classify-event', 'Missing VideoGuid in payload — rejecting');
    return res.status(400).json({ error: 'Missing VideoGuid' });
  }

  // ── 7. جلب الفيديو من DB بواسطة bunny_video_id ───────────────
  // ✅ نجلب أيضاً title, chapter_id, notify_students حتى نتمكن من إرسال
  // إشعار "تم رفع فيديو" للطلاب بمجرد اكتمال التشفير فعلياً (وليس عند الإضافة)
  log.dbCall('fetch-video', 'videos', 'select', { bunnyVideoId });
  const { data: video, error: fetchErr } = await supabase
    .from('videos')
    .select('id, title, chapter_id, duration, encoding_status, notify_students')
    .eq('bunny_video_id', bunnyVideoId)
    .single();
  log.dbResult('fetch-video', 'videos', 'select', { data: video, error: fetchErr });

  if (fetchErr || !video) {
    // محذوف أو من مكتبة أخرى — نُعيد 200 لمنع Bunny من إعادة المحاولة
    log.warn('fetch-video', `Video not found in DB for bunny_id=${bunnyVideoId} — acknowledging with 200 to stop Bunny retries`, {
      fetchErrMessage: fetchErr?.message,
    });
    return res.status(200).json({ ignored: true, reason: 'not in DB' });
  }
  log.success('fetch-video', `Found DB row db_id=${video.id} for bunny_id=${bunnyVideoId}`, {
    dbVideoId: video.id, currentEncodingStatus: video.encoding_status, currentDuration: video.duration,
    title: video.title, chapterId: video.chapter_id, notifyStudentsFlag: video.notify_students,
  });

  // ── 8. حالة Processing (Status=1) → encoding ─────────────────
  if (isProcessingEvent) {
    // لا نتراجع إلى 'encoding' إذا وصل الـ ready مسبقاً (race condition نادر)
    if (video.encoding_status === 'ready') {
      log.warn('processing-event', `Video db_id=${video.id} already 'ready' — ignoring stale processing event (race condition)`, { bunnyVideoId });
      return res.status(200).json({ ignored: true, reason: 'already ready' });
    }

    log.dbCall('processing-event', 'videos', 'update', { dbVideoId: video.id, payload: { encoding_status: 'encoding' } });
    const { error: encErr } = await supabase
      .from('videos')
      .update({ encoding_status: 'encoding' })
      .eq('id', video.id);
    log.dbResult('processing-event', 'videos', 'update', { data: encErr ? null : { id: video.id, encoding_status: 'encoding' }, error: encErr });

    if (encErr) {
      log.error('processing-event', `DB encoding update failed for db_id=${video.id}`, { message: encErr.message, code: encErr.code });
      return res.status(500).json({ error: 'DB update failed' });
    }

    const totalMs = Date.now() - requestStartedAt;
    log.success('processing-event', `Encoding started: db_id=${video.id}, bunny_id=${bunnyVideoId}, status: ${video.encoding_status} → encoding (${totalMs}ms)`);
    const respBody = { success: true, videoId: video.id, bunnyVideoId, encoding_status: 'encoding' };
    log.outgoing(200, respBody);
    return res.status(200).json(respBody);
  }

  // ── 9. حالة Finished (Status=3 أو 4) → ready ─────────────────
  // نجلب الـ length من Bunny API (الـ payload لا يحتوي عليها)
  const apiKey    = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = ourLibraryId;
  let durationSeconds = 0;

  try {
    const bunnyUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`;
    log.bunnyCall('fetch-duration', 'GET', bunnyUrl);
    const bunnyStart = Date.now();
    const apiRes = await fetch(bunnyUrl, { headers: { AccessKey: apiKey, accept: 'application/json' } });
    const bunnyMs = Date.now() - bunnyStart;

    if (apiRes.ok) {
      const apiData = await apiRes.json();
      durationSeconds = Number(apiData.length) || 0;
      log.bunnyResult('fetch-duration', 'GET', bunnyUrl, { status: apiRes.status, ok: true, body: { length: apiData.length, status: apiData.status }, durationMs: bunnyMs });
      log.step('fetch-duration', `Bunny API length=${durationSeconds}s for bunny_id=${bunnyVideoId}`);
    } else {
      log.bunnyResult('fetch-duration', 'GET', bunnyUrl, { status: apiRes.status, ok: false, body: null, durationMs: bunnyMs });
      log.error('fetch-duration', `Bunny API returned non-OK status ${apiRes.status}`);
    }
  } catch (apiErr) {
    log.error('fetch-duration', 'Bunny API fetch failed', { message: apiErr.message, stack: apiErr.stack });
  }

  if (durationSeconds <= 0) {
    // Bunny أخبرنا بالاكتمال لكن length لا تزال 0 — نادر جداً
    // نُعيد 500 حتى يُعيد Bunny المحاولة بعد قليل
    log.warn('fetch-duration', `length=0 despite status=${statusCode} for bunny_id=${bunnyVideoId} — returning 500 so Bunny retries`);
    return res.status(500).json({ error: 'duration unavailable yet, will retry' });
  }

  // ── 10. تحديث DB: encoding_status → 'ready' + المدة إن كانت ناقصة ──
  const formatted = formatDuration(durationSeconds);
  const currentDuration = video.duration || '00:00';
  const currentEncodingStatus = video.encoding_status;

  const updatePayload = { encoding_status: 'ready' };
  if (currentDuration === '00:00') {
    updatePayload.duration = formatted;
  }

  log.dbCall('finished-event', 'videos', 'update', { dbVideoId: video.id, payload: updatePayload, previousDuration: currentDuration, previousStatus: currentEncodingStatus });
  const { error: updateErr } = await supabase
    .from('videos')
    .update(updatePayload)
    .eq('id', video.id);
  log.dbResult('finished-event', 'videos', 'update', { data: updateErr ? null : { id: video.id, ...updatePayload }, error: updateErr });

  if (updateErr) {
    log.error('finished-event', `DB update failed for db_id=${video.id}`, { message: updateErr.message, code: updateErr.code });
    // نُعيد 500 حتى يُعيد Bunny المحاولة
    return res.status(500).json({ error: 'DB update failed' });
  }

  log.success('finished-event', `Video ready: db_id=${video.id}, bunny_id=${bunnyVideoId}, encoding_status: ${currentEncodingStatus} → ready, duration=${updatePayload.duration || currentDuration}`);

  // ── 11. 🔔 إرسال الإشعار المؤجَّل للطلاب (إن كان المعلم قد فعّله عند الإضافة) ──
  // هذا هو المكان الصحيح لإرسال إشعار "تم رفع فيديو": الآن فقط أصبح الفيديو
  // جاهزاً فعلياً للمشاهدة، وليس لحظة ضغط المعلم على "إضافة".
  //
  // Status=3 و 4 قد يصلان للفيديو نفسه (أو عدة أحداث 4 لكل دقة عرض)، لذا نستخدم
  // تحديثاً شرطياً (eq('notify_students', true)) كـ"قفل" ذري: فقط أول طلب يصل
  // فعلياً يُحدّث notify_students إلى false وينجح بإرسال الإشعار، أي طلب لاحق
  // لن يجد notify_students=true فيتجاهل الإرسال — فلا يتكرر الإشعار.
  if (video.notify_students) {
    log.step('notify', `notify_students flag is TRUE for db_id=${video.id} — attempting to claim and send deferred notification`);
    try {
      log.dbCall('notify-claim', 'videos', 'update (atomic claim)', { dbVideoId: video.id, filter: "notify_students=true" });
      const { data: claimed, error: claimErr } = await supabase
        .from('videos')
        .update({ notify_students: false })
        .eq('id', video.id)
        .eq('notify_students', true)
        .select('id')
        .maybeSingle();
      log.dbResult('notify-claim', 'videos', 'update (atomic claim)', { data: claimed, error: claimErr });

      if (claimed) {
        log.success('notify-claim', `Notification claimed by this webhook call for db_id=${video.id} — proceeding to send`);

        log.dbCall('notify-chapter-lookup', 'chapters', 'select', { chapterId: video.chapter_id });
        const { data: chapterInfo, error: chapterErr } = await supabase
          .from('chapters')
          .select('subject_id, subjects!inner(courses!inner(title))')
          .eq('id', video.chapter_id)
          .single();
        log.dbResult('notify-chapter-lookup', 'chapters', 'select', { data: chapterInfo, error: chapterErr });

        const subjectId = chapterInfo?.subject_id;
        if (subjectId) {
          const courseTitle = chapterInfo.subjects?.courses?.title || 'تحديث جديد في الكورس';
          const videoTitle = video.title || 'فيديو جديد';

          const message = {
            notification: { title: courseTitle, body: `تم رفع فيديو: ${videoTitle}` },
            topic: `subject_${subjectId}`,
            android: { priority: 'high', notification: { sound: 'default' } },
            apns: { payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
            data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', type: 'subject', id: subjectId.toString() },
          };

          log.step('notify-send', 'Sending FCM push notification...', {
            topic: message.topic, title: courseTitle, body: message.notification.body,
          });
          const fcmStart = Date.now();
          try {
            const fcmResponse = await admin.messaging().send(message);
            log.success('notify-send', `FCM message sent successfully (${Date.now() - fcmStart}ms)`, { fcmMessageId: fcmResponse });
          } catch (fcmErr) {
            log.error('notify-send', 'FCM send failed', { message: fcmErr.message, code: fcmErr.code, stack: fcmErr.stack });
            throw fcmErr;
          }

          const notifRow = {
            title: courseTitle,
            body: `تم رفع فيديو: ${videoTitle}`,
            target_type: 'subject',
            target_id: subjectId.toString(),
            sender_role: 'teacher',
          };
          log.dbCall('notify-log-insert', 'notifications', 'insert', notifRow);
          const { data: notifInserted, error: notifInsertErr } = await supabase.from('notifications').insert(notifRow).select('id').maybeSingle();
          log.dbResult('notify-log-insert', 'notifications', 'insert', { data: notifInserted, error: notifInsertErr });

          log.success('notify', `Deferred notification fully sent: db_id=${video.id}, subject_id=${subjectId}`);
        } else {
          log.warn('notify-chapter-lookup', `Could not resolve subject_id for db_id=${video.id} — notification skipped`, { chapterId: video.chapter_id, chapterErr: chapterErr?.message });
        }
      } else {
        log.step('notify-claim', `Notification already claimed/sent by another concurrent event for db_id=${video.id} — skipping to avoid duplicate`, { claimErr: claimErr?.message });
      }
    } catch (notifyErr) {
      log.error('notify', `Deferred notification error for db_id=${video.id}`, { message: notifyErr.message, stack: notifyErr.stack });
      // فشل الإشعار لا يجب أن يفشّل الـ webhook — الفيديو أصبح 'ready' بنجاح فعلاً
    }
  } else {
    log.step('notify', `notify_students flag is false/unset for db_id=${video.id} — no notification to send`);
  }

  const totalMs = Date.now() - requestStartedAt;
  const responseBody = {
    success: true,
    videoId: video.id,
    bunnyVideoId,
    encoding_status: 'ready',
    duration: updatePayload.duration || currentDuration,
    updated: true,
  };
  log.success('done', `Webhook processed in ${totalMs}ms`, { ...responseBody, totalMs });
  log.outgoing(200, responseBody);
  return res.status(200).json(responseBody);
}
