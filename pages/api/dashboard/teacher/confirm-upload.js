import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { supabase } from '../../../../lib/supabaseClient';
import { createUploadLogger } from '../../../../lib/uploadLogger';

// ===================================================================
// ✅ تأكيد اكتمال الرفع المباشر وحفظ الفيديو في قاعدة البيانات
// ===================================================================
// يُستدعى من العميل بعد أن يكتمل الرفع TUS مباشرة على Bunny
// يتحقق من صحة الفيديو على Bunny ثم يحفظ بياناته في جدول videos
//
// ملاحظة حول encoding_status — دورة حياة فيديوهات Bunny:
//   'waiting'  → الرفع TUS اكتمل، الفيديو وصل Bunny لكن المعالجة لم تبدأ بعد
//   'encoding' → Bunny بدأ المعالجة فعلياً (Webhook Status=1)
//   'ready'    → اكتملت المعالجة وصار الفيديو متاحاً (Webhook Status=3/4)
//
//   يُحفظ الفيديو هنا بـ 'waiting'، ثم يُحدَّث تلقائياً عبر:
//     → /api/webhooks/bunny-encoding.js
//
// ملاحظة حول المدة (duration):
//   - المصدر الأول: durationSeconds القادمة من المتصفح (مستخرجة قبل الرفع)
//   - المصدر الاحتياطي: bunnyVideo.length (غالباً 0 مباشرة بعد الرفع)
//   - إذا بقيت 00:00، سيُحدّثها Bunny Webhook تلقائياً عند انتهاء التشفير
//     → راجع /api/webhooks/bunny-encoding.js
//
// 📋 تسجيل مفصّل (logging): كل خطوة مسجّلة بالتفصيل عبر uploadLogger —
// الطلب الوارد، التحقق من الصلاحية والملكية، التحقق من وجود الفيديو على
// Bunny، منطق تحديد المدة، كل محاولة تحديث/إدراج في قاعدة البيانات (مع
// الحالة قبل وبعد)، والرد النهائي.
// ===================================================================

// ============================================================
// 🔢 دالة مساعدة: جلب قيمة sort_order التالية للفيديو الجديد
// ============================================================
async function getNextVideoSortOrder(chapterId, log) {
  try {
    log.dbCall('sort-order-lookup', 'videos', 'select', { chapterId });
    const { data: rows, error } = await supabase
      .from('videos')
      .select('sort_order')
      .eq('chapter_id', chapterId);
    log.dbResult('sort-order-lookup', 'videos', 'select', { data: rows, error });

    if (!rows || rows.length === 0) return 0;
    const maxOrder = Math.max(...rows.map(r => r.sort_order ?? 0));
    return maxOrder + 1;
  } catch (err) {
    log.warn('sort-order-lookup', 'Failed to compute next sort order, defaulting to 0', { message: err.message });
    return 0;
  }
}

function getLibraryConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryId || !apiKey) {
    throw new Error('متغيرات البيئة الخاصة بـ Bunny Stream غير مكتملة');
  }
  return { libraryId, apiKey };
}

// دالة لتحويل الثواني إلى صيغة MM:SS أو HH:MM:SS لتتوافق مع قاعدة البيانات
function formatDuration(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  if (h > 0) {
    const hStr = String(h).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

async function verifyChapterOwnership(chapterId, teacherId, log) {
  if (!chapterId) return false;
  log.dbCall('ownership-check', 'chapters', 'select', { chapterId });
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('subjects ( courses ( teacher_id ) )')
    .eq('id', chapterId)
    .single();
  log.dbResult('ownership-check', 'chapters', 'select', { data: chapter, error });

  const courseTeacherId = chapter?.subjects?.courses?.teacher_id;
  const isOwner = courseTeacherId && String(courseTeacherId) === String(teacherId);
  log.step('ownership-check', `Ownership result for chapterId=${chapterId}`, { courseTeacherId, teacherId, isOwner: !!isOwner });
  return isOwner;
}

async function verifyBunnyVideoExists(libraryId, apiKey, bunnyVideoId, log) {
  const url = `https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`;
  log.bunnyCall('bunny-verify', 'GET', url);
  const start = Date.now();
  const res = await fetch(url, { headers: { AccessKey: apiKey, accept: 'application/json' } });
  const durationMs = Date.now() - start;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.bunnyResult('bunny-verify', 'GET', url, { status: res.status, ok: false, body, durationMs });
    return null;
  }
  const json = await res.json();
  log.bunnyResult('bunny-verify', 'GET', url, { status: res.status, ok: true, body: json, durationMs });
  return json;
}

export default async function handler(req, res) {
  const log = createUploadLogger('confirm-upload');
  const requestStartedAt = Date.now();

  log.incoming(req);

  if (req.method !== 'POST') {
    log.warn('method-check', `Rejected non-POST method: ${req.method}`);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. التحقق من صلاحية المعلم
  log.step('auth', 'Verifying teacher/admin session via requireTeacherOrAdmin...');
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) {
    log.error('auth', 'Auth failed — response already sent by requireTeacherOrAdmin', { error });
    return;
  }
  log.success('auth', 'Auth OK', { userId: user?.id, role: user?.role, teacherId: user?.teacherId, name: user?.name });

  const {
    bunnyVideoId,
    chapterId,
    title,
    notifyStudents = false, // نستقبل القيمة من واجهة الويب
    sortOrder = null, // إذا لم يُرسل، يُحسب تلقائياً من قاعدة البيانات
    durationSeconds = 0, // المدة المستخرجة من المتصفح محلياً (قد تكون 0 إذا فشل الاستخراج)
  } = req.body;

  log.step('request-body', 'Parsed request body', {
    bunnyVideoId, chapterId, title, notifyStudents, sortOrder, durationSeconds,
  });

  if (!bunnyVideoId) {
    log.warn('validation', 'Missing bunnyVideoId — rejecting request');
    return res.status(400).json({ error: 'bunnyVideoId مطلوب' });
  }
  if (!chapterId) {
    log.warn('validation', 'Missing chapterId — rejecting request');
    return res.status(400).json({ error: 'chapterId مطلوب' });
  }
  log.success('validation', 'Request body validated');

  // ✅ تنظيف وتحويل قيمة الإشعار إلى Boolean صريح للتأكد من حفظها كـ true/false
  const wantsNotify = notifyStudents === true || notifyStudents === 'true';

  // تنظيف: نضمن أن durationSeconds رقم حقيقي وموجب
  const clientDuration = Number(durationSeconds);
  const hasValidClientDuration = isFinite(clientDuration) && clientDuration > 0;
  log.step('duration-parse', 'Parsed client-side duration', { clientDuration, hasValidClientDuration, wantsNotify });

  // 2. التحقق من ملكية الفصل
  if (user.role !== 'super_admin') {
    const isOwner = await verifyChapterOwnership(chapterId, user.teacherId, log);
    if (!isOwner) {
      log.error('ownership-check', 'Teacher does NOT own this chapter — rejecting', { chapterId, teacherId: user.teacherId });
      return res.status(403).json({ error: 'غير مصرح لك بالإضافة في هذا الفصل.' });
    }
  } else {
    log.step('ownership-check', 'Skipped — user is super_admin', { userId: user.id });
  }

  // 3. التحقق من وجود الفيديو فعلاً على Bunny (منع التزوير)
  const { libraryId, apiKey } = getLibraryConfig();
  const bunnyVideo = await verifyBunnyVideoExists(libraryId, apiKey, bunnyVideoId, log);

  if (!bunnyVideo) {
    log.error('bunny-verify', 'Video not found on Bunny — cannot confirm upload', { bunnyVideoId });
    return res.status(400).json({ error: 'لم يتم العثور على الفيديو في السيرفر. تأكد من اكتمال الرفع.' });
  }
  log.success('bunny-verify', 'Video exists on Bunny', {
    bunnyVideoId, bunnyStatus: bunnyVideo.status, bunnyLength: bunnyVideo.length, bunnyTitle: bunnyVideo.title,
  });

  // 4. التحقق من أن الفيديو ليس بحالة فشل
  // status: 5 = Failed, 8 = PresignedUploadFailed
  if (bunnyVideo.status === 5 || bunnyVideo.status === 8) {
    log.error('bunny-verify', `Bunny reports upload failure (status=${bunnyVideo.status})`, { bunnyVideoId, bunnyStatus: bunnyVideo.status });
    return res.status(400).json({ error: 'فشل رفع الفيديو على السيرفر. يرجى المحاولة مرة أخرى.' });
  }

  const videoTitle = title || bunnyVideo.title || 'Untitled Video';

  // ✅ ترتيب الأولوية لتحديد المدة:
  //   1. المدة القادمة من المتصفح (أدق مصدر — مستخرجة قبل الرفع)
  //   2. المدة القادمة من Bunny (قد تكون 0 مباشرة بعد الرفع لأن المعالجة لم تبدأ بعد)
  //   3. '00:00' مؤقتاً — سيُحدّثها Bunny Webhook عند انتهاء التشفير تلقائياً
  const bunnyLength = Number(bunnyVideo.length) || 0;
  const finalDurationSecs = hasValidClientDuration ? clientDuration : bunnyLength;
  const formattedDuration = formatDuration(finalDurationSecs);

  const durationPending = finalDurationSecs <= 0;
  log.step('duration-decision', 'Final duration decided', {
    source: hasValidClientDuration ? 'client-browser' : (bunnyLength > 0 ? 'bunny-api' : 'none-pending-webhook'),
    clientDuration, bunnyLength, finalDurationSecs, formattedDuration, durationPending,
  });
  if (durationPending) {
    log.warn('duration-decision', `No duration yet for bunny_id=${bunnyVideoId} — Bunny Webhook will update it after encoding`);
  }

  // 5. ✅ تحديث الصف الذي أُنشئ مسبقاً في create-upload-session.js (بحالة 'uploading')
  //   بدلاً من إدراج صف جديد. هذا يمنع تكرار الصفوف ويحترم أي تحديث حالة
  //   وصل بالفعل من Bunny Webhook أثناء الرفع الطويل (مثال: قد يكون الفيديو
  //   بدأ التشفير فعلياً وأصبح 'encoding' أو حتى 'ready' قبل أن يصل العميل هنا).
  //
  //   دورة الحياة الكاملة:
  //     'uploading' → أُنشئ في create-upload-session (الرفع TUS لا يزال جارياً)
  //     'waiting'    → هنا (الرفع اكتمل، في انتظار بدء المعالجة من Bunny)
  //     'encoding'   → Webhook Status=1  (Bunny بدأ المعالجة)
  //     'ready'      → Webhook Status=3/4 (اكتملت المعالجة)

  // ✅ تحديد ترتيب الفيديو: إذا أُرسل من الواجهة نستخدمه، وإلا نحسبه تلقائياً
  const finalSortOrder = (sortOrder !== null && sortOrder !== undefined)
    ? sortOrder
    : await getNextVideoSortOrder(chapterId, log);
  log.step('sort-order', `Final sort order decided: ${finalSortOrder}`, { providedSortOrder: sortOrder, finalSortOrder });

  const commonFields = {
    title: videoTitle,
    sort_order: finalSortOrder,
    notify_students: wantsNotify,
  };
  // المدة: لا نستبدل مدة صالحة قد يكون الـ webhook قد كتبها بالفعل بـ '00:00'
  if (!durationPending) {
    commonFields.duration = formattedDuration;
  }

  // أولاً: نحاول الانتقال 'uploading' → 'waiting' (الحالة الطبيعية إذا لم
  // يصل أي Webhook بعد). eq('encoding_status', 'uploading') يضمن أننا لا
  // نتراجع عن حالة أحدث وصلت فعلاً من Bunny.
  log.dbCall('update-attempt-1', 'videos', "update (uploading → waiting)", {
    bunnyVideoId, filter: "encoding_status='uploading'", payload: { ...commonFields, encoding_status: 'waiting' },
  });
  const { data: updatedAsWaiting, error: updateErr1 } = await supabase
    .from('videos')
    .update({ ...commonFields, encoding_status: 'waiting' })
    .eq('bunny_video_id', bunnyVideoId)
    .eq('encoding_status', 'uploading')
    .select('id, encoding_status')
    .maybeSingle();
  log.dbResult('update-attempt-1', 'videos', "update (uploading → waiting)", { data: updatedAsWaiting, error: updateErr1 });

  let finalRow = updatedAsWaiting;

  if (!finalRow) {
    log.warn('update-attempt-2', `No row matched encoding_status='uploading' for bunny_id=${bunnyVideoId} — a webhook likely already advanced its status. Updating remaining fields only.`);
    // الصف تجاوز 'uploading' بالفعل (الـ webhook وصل أولاً وحدّثه إلى
    // 'encoding' أو 'ready') — نحدّث بقية الحقول فقط دون لمس encoding_status.
    log.dbCall('update-attempt-2', 'videos', 'update (fields only, status untouched)', { bunnyVideoId, payload: commonFields });
    const { data: updatedOther, error: updateErr2 } = await supabase
      .from('videos')
      .update(commonFields)
      .eq('bunny_video_id', bunnyVideoId)
      .select('id, encoding_status')
      .maybeSingle();
    log.dbResult('update-attempt-2', 'videos', 'update (fields only, status untouched)', { data: updatedOther, error: updateErr2 });

    if (updateErr2) {
      log.error('update-attempt-2', 'DB Update Error (fatal)', { message: updateErr2.message, code: updateErr2.code });
      return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
    }
    finalRow = updatedOther;
  } else if (updateErr1) {
    log.error('update-attempt-1', 'DB Update Error (fatal)', { message: updateErr1.message, code: updateErr1.code });
    return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
  } else {
    log.success('update-attempt-1', `Row transitioned uploading → waiting`, { dbVideoId: finalRow.id });
  }

  if (!finalRow) {
    log.warn('fallback-insert', `No existing row found at all for bunny_id=${bunnyVideoId} (stale/pre-migration session, or row manually deleted) — inserting fallback row now.`);
    // لم يُعثر على صف مبدئي إطلاقاً (مثلاً: جلسة قديمة من قبل هذا التحديث،
    // أو تم حذفه يدوياً) — نُدرجه الآن كحل احتياطي حتى لا يضيع الفيديو.
    const fallbackPayload = {
      chapter_id: chapterId,
      bunny_video_id: bunnyVideoId,
      duration: formattedDuration,
      encoding_status: 'waiting',
      ...commonFields,
    };
    log.dbCall('fallback-insert', 'videos', 'insert', fallbackPayload);
    const { data: insertedVideo, error: insertErr } = await supabase
      .from('videos')
      .insert(fallbackPayload)
      .select('id, encoding_status')
      .single();
    log.dbResult('fallback-insert', 'videos', 'insert', { data: insertedVideo, error: insertErr });

    if (insertErr) {
      log.error('fallback-insert', 'DB Fallback Insert Error (fatal)', { message: insertErr.message, code: insertErr.code });
      return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
    }
    finalRow = insertedVideo;
    log.success('fallback-insert', 'Fallback row inserted successfully', { dbVideoId: finalRow.id });
  }

  const totalMs = Date.now() - requestStartedAt;
  log.success('done', `Video confirmed in ${totalMs}ms`, {
    dbVideoId: finalRow.id, bunnyVideoId, notify: wantsNotify, status: finalRow.encoding_status,
    duration: formattedDuration, durationPending, totalMs,
  });

  const responseBody = {
    success: true,
    videoId: finalRow.id,
    bunnyVideoId,
    title: videoTitle,
    duration: formattedDuration,
    encoding_status: finalRow.encoding_status,
    durationPending, // إشارة للواجهة أن المدة ستُحدَّث تلقائياً عبر Bunny Webhook
  };
  log.outgoing(200, responseBody);
  return res.status(200).json(responseBody);
}
