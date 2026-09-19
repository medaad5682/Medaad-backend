// pages/api/dashboard/super/teacher-stats.js
import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

export default async (req, res) => {
  const adminUser = await requireSuperAdmin(req, res);
  if (!adminUser) return;

  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query; // معرف المدرس
  if (!id) return res.status(400).json({ error: 'Teacher ID required' });

  try {
    // 1. جلب الكورسات
    const { data: courses } = await supabase
      .from('courses')
      .select('id, title')
      .eq('teacher_id', id);

    const courseIds = (courses || []).map(c => c.id);

    // 2. حساب الأرباح (RPC أو Fallback)
    let totalEarnings = 0;
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_teacher_revenue', { teacher_id_arg: id });
    
    if (!rpcError) {
      totalEarnings = rpcData;
    } else {
      // Fallback: الحساب اليدوي
      const { data: manualData } = await supabase
        .from('subscription_requests')
        .select('total_price')
        .eq('teacher_id', id)
        .eq('status', 'approved');
      totalEarnings = manualData?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
    }

    // 3. جلب المواد المرتبطة بالكورسات
    let subjectIds = [];
    if (courseIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id')
        .in('course_id', courseIds);
      subjectIds = (subjects || []).map(s => s.id);
    }

    // 4. حساب الطلاب الفريدين (Active Students)
    // نستثني المشرفين والمدرسين، ونستثني الصلاحيات المنتهية.
    // ⚡ استعلام واحد داخل Postgres بدل تنزيل كل صفوف الوصول إلى الذاكرة
    const { data: countsData, error: countsError } = await supabase.rpc('get_teacher_student_counts', {
      p_course_ids: courseIds,
      p_subject_ids: subjectIds
    });
    if (countsError) throw countsError;

    const uniqueStudentsCount = countsData?.total_unique_students || 0;

    // 5. الطلبات المعلقة
    const { count: pendingCount } = await supabase
      .from('subscription_requests')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', id)
      .eq('status', 'pending');

    return res.status(200).json({
      students_count: uniqueStudentsCount,
      balance: totalEarnings,
      pending_requests: pendingCount || 0,
      courses_count: courses?.length || 0
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
