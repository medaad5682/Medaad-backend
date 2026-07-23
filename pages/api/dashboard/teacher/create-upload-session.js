import crypto from 'crypto';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { supabase } from '../../../../lib/supabaseClient';
import { createUploadLogger } from '../../../../lib/uploadLogger';

// ===================================================================
// 🔑 إنشاء جلسة رفع مباشرة (TUS) من جهاز المعلم إلى Bunny Stream
// ===================================================================
// ✅ ما يفعله هذا الـ API:
//   1) التحقق من صلاحية المعلم وملكيته للفصل (chapter)
//   2) إنشاء كائن فيديو فارغ في Bunny Stream
//   3) إنشاء توقيع أمني (Signature) للرفع المباشر
//   4) الرد بـ (signature + بيانات التوثيق) فقط — بدون لمس أي بايت من الفيديو
//
// ❌ لا يمر الفيديو بالسيرفر إطلاقاً — يرفعه العميل مباشرة إلى Bunny
//
// 📋 تسجيل مفصّل (logging): كل خطوة من هذا المسار تُسجَّل بالكامل عبر
// uploadLogger — الطلب الوارد، التحقق من الصلاحية والملكية، استدعاء Bunny
// لإنشاء الفيديو (بالطلب والرد وزمن الاستجابة)، إدراج الصف المبدئي في DB،
// إنشاء التوقيع، والرد النهائي. كل سطر يحمل نفس requestId لتتبّع العملية
// بالكامل في السجلات.
// ===================================================================

function getLibraryConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryId || !apiKey) {
    throw new Error('متغيرات البيئة الخاصة بـ Bunny Stream غير مكتملة');
  }
  return { libraryId, apiKey };
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
  log.step('ownership-check', `Ownership result for chapterId=${chapterId}`, {
    courseTeacherId, teacherId, isOwner: !!isOwner,
  });
  return isOwner;
}

export default async function handler(req, res) {
  const log = createUploadLogger('create-upload-session');
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
  log.success('auth', 'Auth OK', {
    userId: user?.id, role: user?.role, teacherId: user?.teacherId, name: user?.name,
  });

  // ⏱️ expirationHours مرفوع افتراضياً إلى 24 ساعة (كان 6) لتقليل احتمال
  // انتهاء صلاحية التوقيع أثناء رفع فيديو كبير على اتصال بطيء.
  const {
    chapterId,
    title,
    fileSize,
    expirationHours = 24,
    notifyStudents = false, // ✅ نستقبلها الآن هنا لحفظها في الصف المبدئي
    sortOrder = null,
  } = req.body;

  log.step('request-body', 'Parsed request body', {
    chapterId, title, fileSize, expirationHours, notifyStudents, sortOrder,
  });

  if (!chapterId) {
    log.warn('validation', 'Missing chapterId — rejecting request');
    return res.status(400).json({ error: 'chapterId مطلوب' });
  }
  if (!fileSize || fileSize <= 0) {
    log.warn('validation', 'Missing/invalid fileSize — rejecting request', { fileSize });
    return res.status(400).json({ error: 'fileSize مطلوب (بالبايت)' });
  }
  log.success('validation', 'Request body validated', { chapterId, fileSizeBytes: fileSize, fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2) });

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

  const { libraryId, apiKey } = getLibraryConfig();
  const videoTitle = title || 'Untitled Video';
  log.step('config', 'Bunny library config loaded', { libraryId, videoTitle });

  // 3. إنشاء كائن الفيديو في Bunny
  let bunnyVideoId;
  try {
    const bunnyReqBody = { title: videoTitle };
    const bunnyUrl = `https://video.bunnycdn.com/library/${libraryId}/videos`;
    log.bunnyCall('bunny-create-video', 'POST', bunnyUrl, bunnyReqBody);
    const bunnyCallStart = Date.now();

    const createRes = await fetch(bunnyUrl, {
      method: 'POST',
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(bunnyReqBody),
    });

    const bunnyCallMs = Date.now() - bunnyCallStart;

    if (!createRes.ok) {
      const errBody = await createRes.text();
      log.bunnyResult('bunny-create-video', 'POST', bunnyUrl, { status: createRes.status, ok: false, body: errBody, durationMs: bunnyCallMs });
      throw new Error(`Bunny create video failed: ${createRes.status} — ${errBody}`);
    }
    const createData = await createRes.json();
    log.bunnyResult('bunny-create-video', 'POST', bunnyUrl, { status: createRes.status, ok: true, body: createData, durationMs: bunnyCallMs });

    bunnyVideoId = createData?.guid;
    if (!bunnyVideoId) throw new Error('لم يتم استلام Video GUID من Bunny');
    log.success('bunny-create-video', `Bunny video object created: ${bunnyVideoId}`, { bunnyVideoId });
  } catch (err) {
    log.error('bunny-create-video', 'Create video error', { message: err.message, stack: err.stack });
    log.outgoing(502, { error: 'فشل إنشاء الفيديو على السيرفر' });
    return res.status(502).json({ error: 'فشل إنشاء الفيديو على السيرفر' });
  }

  // 3.5 ✅ حفظ صف مبدئي في قاعدة البيانات فوراً — بحالة 'uploading'
  //   لماذا؟ الفيديوهات الطويلة قد تستغرق دقائق/ساعات على اتصال بطيء لإتمام
  //   رفعها TUS بالكامل. Bunny قد يبدأ بإرسال Webhook (Processing) قبل أن
  //   يصل الملف بالكامل. سابقاً كنا نحفظ الصف فقط بعد اكتمال الرفع
  //   (confirm-upload.js) فكان الـ webhook لا يجد الفيديو في DB ويتجاهله
  //   نهائياً (بدون إعادة محاولة) — وهذا كان يُفقد تحديثات encoding_status
  //   الحقيقية القادمة من Bunny. الآن الصف موجود من اللحظة الأولى.
  let placeholderVideoId = null;
  try {
    log.dbCall('placeholder-insert', 'videos', 'select (sort_order lookup)', { chapterId });
    const { data: rows, error: rowsErr } = await supabase
      .from('videos')
      .select('sort_order')
      .eq('chapter_id', chapterId);
    log.dbResult('placeholder-insert', 'videos', 'select (sort_order lookup)', { data: rows, error: rowsErr });

    const nextSortOrder = (sortOrder !== null && sortOrder !== undefined)
      ? sortOrder
      : (rows && rows.length > 0 ? Math.max(...rows.map(r => r.sort_order ?? 0)) + 1 : 0);
    log.step('placeholder-insert', `Computed nextSortOrder=${nextSortOrder}`, { providedSortOrder: sortOrder, existingRowsCount: rows?.length ?? 0 });

    const insertPayload = {
      chapter_id: chapterId,
      title: videoTitle,
      bunny_video_id: bunnyVideoId,
      sort_order: nextSortOrder,
      duration: '00:00',
      encoding_status: 'uploading', // ← رفع TUS لا يزال جارياً على العميل
      notify_students: notifyStudents === true || notifyStudents === 'true',
    };
    log.dbCall('placeholder-insert', 'videos', 'insert', insertPayload);

    const { data: inserted, error: insertErr } = await supabase
      .from('videos')
      .insert(insertPayload)
      .select('id')
      .single();

    log.dbResult('placeholder-insert', 'videos', 'insert', { data: inserted, error: insertErr });

    if (insertErr) throw insertErr;
    placeholderVideoId = inserted.id;
    log.success('placeholder-insert', `Placeholder video row created with encoding_status='uploading'`, { dbVideoId: placeholderVideoId, bunnyVideoId });
  } catch (err) {
    log.error('placeholder-insert', 'Placeholder insert error', { message: err.message, code: err.code, details: err.details });
    // تنظيف الفيديو الفارغ من Bunny — بدون صف DB لا فائدة من إبقائه
    log.step('cleanup', `Cleaning up orphaned Bunny video ${bunnyVideoId} after DB insert failure`);
    await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    }).then((r) => log.step('cleanup', `Bunny DELETE cleanup response: ${r.status}`))
      .catch((cleanupErr) => log.warn('cleanup', 'Bunny DELETE cleanup failed', { message: cleanupErr.message }));
    log.outgoing(500, { error: 'فشل تجهيز صف الفيديو في قاعدة البيانات' });
    return res.status(500).json({ error: 'فشل تجهيز صف الفيديو في قاعدة البيانات' });
  }

  // 4. إنشاء توقيع (Signature) للرفع المباشر الموثق من Bunny
  let signature;
  let expiresAt;
  try {
    // تحديد وقت انتهاء الصلاحية
    expiresAt = Math.floor(Date.now() / 1000) + expirationHours * 3600;

    // إنشاء التوقيع بالترتيب المطلوب: library_id + api_key + expiration_time + video_id
    const signatureString = `${libraryId}${apiKey}${expiresAt}${bunnyVideoId}`;
    signature = crypto.createHash('sha256').update(signatureString).digest('hex');
    log.success('signature', 'TUS signature generated', {
      expiresAt, expiresAtIso: new Date(expiresAt * 1000).toISOString(), signature,
    });
  } catch (err) {
    log.error('signature', 'Signature generation error', { message: err.message, stack: err.stack });
    // تنظيف الفيديو الفاشل من Bunny والصف المبدئي في DB لتجنب بقاء بيانات يتيمة
    log.step('cleanup', `Cleaning up Bunny video ${bunnyVideoId} and DB placeholder ${placeholderVideoId} after signature failure`);
    await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    }).catch(() => {});
    if (placeholderVideoId) {
      const { error: delErr } = await supabase.from('videos').delete().eq('id', placeholderVideoId);
      log.dbResult('cleanup', 'videos', 'delete', { data: null, error: delErr });
    }
    log.outgoing(502, { error: `فشل إنشاء توقيع الرفع: ${err.message}` });
    return res.status(502).json({ error: `فشل إنشاء توقيع الرفع: ${err.message}` });
  }

  const totalMs = Date.now() - requestStartedAt;
  log.success('done', `TUS session created successfully in ${totalMs}ms`, {
    bunnyVideoId, dbVideoId: placeholderVideoId, chapterId, videoTitle, totalMs,
  });

  // 5. الرد بالبيانات المطلوبة للعميل لبدء الرفع المباشر
  const responseBody = {
    success: true,
    bunnyVideoId,      // سيُستخدم لاحقاً لربط الفيديو بالـ chapter في DB
    videoId: placeholderVideoId, // ✅ صف DB تم إنشاؤه بالفعل بحالة 'uploading'
    libraryId,         // سيحتاجه العميل في headers
    signature,         // التوقيع الذي سيتم إرساله في الـ headers
    expiresAt,         // وقت الانتهاء
    chapterId,
    title: videoTitle,
  };
  log.outgoing(200, responseBody);
  return res.status(200).json(responseBody);
}

