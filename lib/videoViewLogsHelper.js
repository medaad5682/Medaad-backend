import { db } from './firebaseAdmin';

// ============================================================
// 🗑️ حذف سجلات مشاهدة الفيديو (video_views) من Firestore
// ============================================================
// عند حذف فيديو (أو حذف كورس/مادة/فصل يحتوي فيديوهات) من لوحة تحكم
// المعلم، تبقى سجلات المشاهدة الخاصة به (documentId = `${videoId}_${studentId}`)
// يتيمة في Firestore لأنها غير مرتبطة بـ Foreign Key/Cascade في Supabase.
// هذه الدالة تبحث عن كل السجلات التي تخص معرفات الفيديوهات المُمرَّرة
// وتحذفها دفعة واحدة (Batch)، بغض النظر عن الطالب الذي شاهدها.
//
// ⚠️ هذا لا علاقة له بحذف الفيديو الفعلي من Bunny Stream (يبقى كما هو،
// بمنطقه ودالته المنفصلة deleteVideoFromBunny/getBunnyIdsSafeToDelete).
// ============================================================

const FIRESTORE_IN_QUERY_LIMIT = 10; // حد آمن لعدد القيم داخل شرط "in" في كل استعلام
const FIRESTORE_BATCH_LIMIT = 500; // الحد الأقصى لعدد عمليات الكتابة/الحذف في Batch واحد

export async function deleteVideoViewLogs(videoIds) {
  const uniqueIds = [...new Set((videoIds || []).filter(Boolean).map((v) => String(v)))];
  if (uniqueIds.length === 0) return;

  try {
    for (let i = 0; i < uniqueIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
      const chunk = uniqueIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);

      const snapshot = await db.collection('video_views').where('videoId', 'in', chunk).get();
      if (snapshot.empty) continue;

      const docs = snapshot.docs;
      for (let j = 0; j < docs.length; j += FIRESTORE_BATCH_LIMIT) {
        const batch = db.batch();
        docs.slice(j, j + FIRESTORE_BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }

    console.log(`✅ [Firebase] Deleted view logs for ${uniqueIds.length} video(s).`);
  } catch (err) {
    console.error('⚠️ [Firebase] Failed to delete video view logs:', err.message);
  }
}
