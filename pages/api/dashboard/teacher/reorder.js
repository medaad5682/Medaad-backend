import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

// ============================================================
// 🔀 API لإعادة ترتيب العناصر بعد السحب والإفلات (Drag & Drop)
// يُعالج: courses, subjects, chapters, exams, videos, pdfs, flashcard_decks
// ============================================================

// الجداول المسموح بتحديث ترتيبها
const ALLOWED_TYPES = ['courses', 'subjects', 'chapters', 'exams', 'videos', 'pdfs', 'flashcard_decks'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // التحقق من الصلاحية
  const { user, error: authError } = await requireTeacherOrAdmin(req, res);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const teacherId = user.teacherId;
  const { type, items } = req.body;

  // التحقق من صحة المدخلات
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: `نوع غير صالح: ${type}` });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'قائمة العناصر فارغة أو غير صالحة.' });
  }

  // التحقق من أن كل عنصر يحتوي على id و sort_order رقمي
  for (const item of items) {
    if (!item.id || typeof item.sort_order !== 'number') {
      return res.status(400).json({ error: 'بيانات الترتيب غير مكتملة (id أو sort_order مفقود).' });
    }
  }

  try {
    // ============================================================
    // 🛡️ التحقق الأمني: هل يملك المعلم هذا الكورس؟
    // ============================================================
    const ownsCourse = await verifyOwnership(type, items, teacherId);
    if (!ownsCourse) {
      return res.status(403).json({ error: 'لا تملك صلاحية تعديل ترتيب هذه العناصر.' });
    }

    // ============================================================
    // ✅ تحديث sort_order لكل عنصر في جدوله
    // ============================================================
    const updatePromises = items.map(({ id, sort_order }) =>
      supabase.from(type).update({ sort_order }).eq('id', id)
    );

    const results = await Promise.all(updatePromises);

    // التحقق من وجود أخطاء في التحديثات
    const failedUpdates = results.filter(r => r.error);
    if (failedUpdates.length > 0) {
      console.error('⚠️ [Reorder] بعض التحديثات فشلت:', failedUpdates.map(r => r.error));
      return res.status(500).json({ error: 'فشل تحديث ترتيب بعض العناصر.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('⚠️ [Reorder] خطأ غير متوقع:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// 🛡️ دالة التحقق الأمني من ملكية العناصر
// ============================================================
async function verifyOwnership(type, items, teacherId) {
  if (!teacherId) return false;

  const firstId = items[0]?.id;
  if (!firstId) return false;

  try {
    if (type === 'courses') {
      // التحقق المباشر: يجب أن يكون المعلم هو المالك
      const { data } = await supabase
        .from('courses')
        .select('id')
        .eq('id', firstId)
        .eq('teacher_id', teacherId)
        .single();
      return !!data;
    }

    if (type === 'subjects') {
      // التحقق عبر الكورس المرتبط
      const { data } = await supabase
        .from('subjects')
        .select('courses!inner(teacher_id)')
        .eq('id', firstId)
        .single();
      return String(data?.courses?.teacher_id) === String(teacherId);
    }

    if (type === 'chapters') {
      // التحقق عبر المادة ثم الكورس
      const { data } = await supabase
        .from('chapters')
        .select('subjects!inner(courses!inner(teacher_id))')
        .eq('id', firstId)
        .single();
      return String(data?.subjects?.courses?.teacher_id) === String(teacherId);
    }

    if (type === 'exams') {
      // التحقق عبر المادة ثم الكورس
      const { data } = await supabase
        .from('exams')
        .select('subjects!inner(courses!inner(teacher_id))')
        .eq('id', firstId)
        .single();
      return String(data?.subjects?.courses?.teacher_id) === String(teacherId);
    }

    if (type === 'flashcard_decks') {
      // التحقق من كل المجموعات المُرسلة (وليس الأولى فقط) عبر المادة ثم الكورس
      const ids = [...new Set(items.map(i => i.id))];
      const { data } = await supabase
        .from('flashcard_decks')
        .select('id, subjects!inner(courses!inner(teacher_id))')
        .in('id', ids);
      if (!data || data.length !== ids.length) return false;
      return data.every(d => String(d.subjects?.courses?.teacher_id) === String(teacherId));
    }

    if (type === 'videos' || type === 'pdfs') {
      // التحقق عبر الفصل ثم المادة ثم الكورس
      const { data } = await supabase
        .from(type)
        .select('chapters!inner(subjects!inner(courses!inner(teacher_id)))')
        .eq('id', firstId)
        .single();
      return String(data?.chapters?.subjects?.courses?.teacher_id) === String(teacherId);
    }

    return false;
  } catch (err) {
    console.error('⚠️ [Reorder] خطأ في التحقق الأمني:', err.message);
    return false;
  }
}
