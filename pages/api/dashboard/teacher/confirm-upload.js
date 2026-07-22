import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { supabase } from '../../../../lib/supabaseClient';

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
// ===================================================================

// ============================================================
// 🔢 دالة مساعدة: جلب قيمة sort_order التالية للفيديو الجديد
// ============================================================
async function getNextVideoSortOrder(chapterId) {
  try {
    const { data: rows } = await supabase
      .from('videos')
      .select('sort_order')
      .eq('chapter_id', chapterId);

    if (!rows || rows.length === 0) return 0;
    const maxOrder = Math.max(...rows.map(r => r.sort_order ?? 0));
    return maxOrder + 1;
  } catch {
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

async function verifyChapterOwnership(chapterId, teacherId) {
  if (!chapterId) return false;
  const { data: chapter } = await supabase
    .from('chapters')
    .select('subjects ( courses ( teacher_id ) )')
    .eq('id', chapterId)
    .single();

  const courseTeacherId = chapter?.subjects?.courses?.teacher_id;
  return courseTeacherId && String(courseTeacherId) === String(teacherId);
}

async function verifyBunnyVideoExists(libraryId, apiKey, bunnyVideoId) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`,
    { headers: { AccessKey: apiKey, accept: 'application/json' } }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. التحقق من صلاحية المعلم
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const {
    bunnyVideoId,
    chapterId,
    title,
    notifyStudents = false, // نستقبل القيمة من واجهة الويب
    sortOrder = null, // إذا لم يُرسل، يُحسب تلقائياً من قاعدة البيانات
    durationSeconds = 0, // المدة المستخرجة من المتصفح محلياً (قد تكون 0 إذا فشل الاستخراج)
  } = req.body;

  if (!bunnyVideoId) {
    return res.status(400).json({ error: 'bunnyVideoId مطلوب' });
  }
  if (!chapterId) {
    return res.status(400).json({ error: 'chapterId مطلوب' });
  }

  // ✅ تنظيف وتحويل قيمة الإشعار إلى Boolean صريح للتأكد من حفظها كـ true/false
  const wantsNotify = notifyStudents === true || notifyStudents === 'true';

  // تنظيف: نضمن أن durationSeconds رقم حقيقي وموجب
  const clientDuration = Number(durationSeconds);
  const hasValidClientDuration = isFinite(clientDuration) && clientDuration > 0;

  // 2. التحقق من ملكية الفصل
  if (user.role !== 'super_admin') {
    const isOwner = await verifyChapterOwnership(chapterId, user.teacherId);
    if (!isOwner) {
      return res.status(403).json({ error: 'غير مصرح لك بالإضافة في هذا الفصل.' });
    }
  }

  // 3. التحقق من وجود الفيديو فعلاً على Bunny (منع التزوير)
  const { libraryId, apiKey } = getLibraryConfig();
  const bunnyVideo = await verifyBunnyVideoExists(libraryId, apiKey, bunnyVideoId);

  if (!bunnyVideo) {
    return res.status(400).json({ error: 'لم يتم العثور على الفيديو في السيرفر. تأكد من اكتمال الرفع.' });
  }

  // 4. التحقق من أن الفيديو ليس بحالة فشل
  // status: 5 = Failed, 8 = PresignedUploadFailed
  if (bunnyVideo.status === 5 || bunnyVideo.status === 8) {
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
  if (durationPending) {
    console.warn(`⚠️ [confirm-upload] No duration yet for bunny_id=${bunnyVideoId} — Bunny Webhook will update it after encoding`);
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
    : await getNextVideoSortOrder(chapterId);

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
  const { data: updatedAsWaiting, error: updateErr1 } = await supabase
    .from('videos')
    .update({ ...commonFields, encoding_status: 'waiting' })
    .eq('bunny_video_id', bunnyVideoId)
    .eq('encoding_status', 'uploading')
    .select('id, encoding_status')
    .maybeSingle();

  let finalRow = updatedAsWaiting;

  if (!finalRow) {
    // الصف تجاوز 'uploading' بالفعل (الـ webhook وصل أولاً وحدّثه إلى
    // 'encoding' أو 'ready') — نحدّث بقية الحقول فقط دون لمس encoding_status.
    const { data: updatedOther, error: updateErr2 } = await supabase
      .from('videos')
      .update(commonFields)
      .eq('bunny_video_id', bunnyVideoId)
      .select('id, encoding_status')
      .maybeSingle();

    if (updateErr2) {
      console.error('❌ [confirm-upload] DB Update Error:', updateErr2);
      return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
    }
    finalRow = updatedOther;
  } else if (updateErr1) {
    console.error('❌ [confirm-upload] DB Update Error:', updateErr1);
    return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
  }

  if (!finalRow) {
    // لم يُعثر على صف مبدئي إطلاقاً (مثلاً: جلسة قديمة من قبل هذا التحديث،
    // أو تم حذفه يدوياً) — نُدرجه الآن كحل احتياطي حتى لا يضيع الفيديو.
    const { data: insertedVideo, error: insertErr } = await supabase
      .from('videos')
      .insert({
        chapter_id: chapterId,
        bunny_video_id: bunnyVideoId,
        duration: formattedDuration,
        encoding_status: 'waiting',
        ...commonFields,
      })
      .select('id, encoding_status')
      .single();

    if (insertErr) {
      console.error('❌ [confirm-upload] DB Fallback Insert Error:', insertErr);
      return res.status(500).json({ error: 'فشل حفظ بيانات الفيديو في قاعدة البيانات' });
    }
    finalRow = insertedVideo;
  }

  console.log(`✅ [confirm-upload] Video confirmed. db_id=${finalRow.id}, bunny_id=${bunnyVideoId}, notify=${wantsNotify}, status=${finalRow.encoding_status}`);

  return res.status(200).json({
    success: true,
    videoId: finalRow.id,
    bunnyVideoId,
    title: videoTitle,
    duration: formattedDuration,
    encoding_status: finalRow.encoding_status,
    durationPending, // إشارة للواجهة أن المدة ستُحدَّث تلقائياً عبر Bunny Webhook
  });
}
