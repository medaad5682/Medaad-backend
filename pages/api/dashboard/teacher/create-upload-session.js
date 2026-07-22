import crypto from 'crypto';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { supabase } from '../../../../lib/supabaseClient';

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
// ===================================================================

function getLibraryConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryId || !apiKey) {
    throw new Error('متغيرات البيئة الخاصة بـ Bunny Stream غير مكتملة');
  }
  return { libraryId, apiKey };
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. التحقق من صلاحية المعلم
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

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

  if (!chapterId) {
    return res.status(400).json({ error: 'chapterId مطلوب' });
  }
  if (!fileSize || fileSize <= 0) {
    return res.status(400).json({ error: 'fileSize مطلوب (بالبايت)' });
  }

  // 2. التحقق من ملكية الفصل
  if (user.role !== 'super_admin') {
    const isOwner = await verifyChapterOwnership(chapterId, user.teacherId);
    if (!isOwner) {
      return res.status(403).json({ error: 'غير مصرح لك بالإضافة في هذا الفصل.' });
    }
  }

  const { libraryId, apiKey } = getLibraryConfig();
  const videoTitle = title || 'Untitled Video';

  // 3. إنشاء كائن الفيديو في Bunny
  let bunnyVideoId;
  try {
    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos`,
      {
        method: 'POST',
        headers: {
          AccessKey: apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ title: videoTitle }),
      }
    );
    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`Bunny create video failed: ${createRes.status} — ${errBody}`);
    }
    const createData = await createRes.json();
    bunnyVideoId = createData?.guid;
    if (!bunnyVideoId) throw new Error('لم يتم استلام Video GUID من Bunny');
  } catch (err) {
    console.error('❌ [create-upload-session] Create video error:', err.message);
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
    const { data: rows } = await supabase
      .from('videos')
      .select('sort_order')
      .eq('chapter_id', chapterId);
    const nextSortOrder = (sortOrder !== null && sortOrder !== undefined)
      ? sortOrder
      : (rows && rows.length > 0 ? Math.max(...rows.map(r => r.sort_order ?? 0)) + 1 : 0);

    const { data: inserted, error: insertErr } = await supabase
      .from('videos')
      .insert({
        chapter_id: chapterId,
        title: videoTitle,
        bunny_video_id: bunnyVideoId,
        sort_order: nextSortOrder,
        duration: '00:00',
        encoding_status: 'uploading', // ← رفع TUS لا يزال جارياً على العميل
        notify_students: notifyStudents === true || notifyStudents === 'true',
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;
    placeholderVideoId = inserted.id;
  } catch (err) {
    console.error('❌ [create-upload-session] Placeholder insert error:', err.message);
    // تنظيف الفيديو الفارغ من Bunny — بدون صف DB لا فائدة من إبقائه
    await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    }).catch(() => {});
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

  } catch (err) {
    console.error('❌ [create-upload-session] Signature error:', err.message);
    // تنظيف الفيديو الفاشل من Bunny والصف المبدئي في DB لتجنب بقاء بيانات يتيمة
    await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    }).catch(() => {});
    if (placeholderVideoId) {
      await supabase.from('videos').delete().eq('id', placeholderVideoId).catch(() => {});
    }
    return res.status(502).json({ error: `فشل إنشاء توقيع الرفع: ${err.message}` });
  }

  console.log(`✅ [create-upload-session] TUS session created. videoId=${bunnyVideoId}`);

  // 5. الرد بالبيانات المطلوبة للعميل لبدء الرفع المباشر
  return res.status(200).json({
    success: true,
    bunnyVideoId,      // سيُستخدم لاحقاً لربط الفيديو بالـ chapter في DB
    videoId: placeholderVideoId, // ✅ صف DB تم إنشاؤه بالفعل بحالة 'uploading'
    libraryId,         // سيحتاجه العميل في headers
    signature,         // التوقيع الذي سيتم إرساله في الـ headers
    expiresAt,         // وقت الانتهاء
    chapterId,
    title: videoTitle,
  });
}
