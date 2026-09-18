import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { buildGrantTimestamps, isExemptFromExpiry } from '../../../../lib/accessExpiryHelper';
import { attachCourseOwnerTeachers } from '../../../../lib/requestOwnerHelper';

export default async function handler(req, res) {
  // 1. التحقق من صلاحية السوبر أدمن
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return; 

  // ==========================================================
  // 🟢 التعامل مع طلبات GET (جلب الطلبات مع Pagination والفلترة)
  // ==========================================================
  if (req.method === 'GET') {
    // ✅ نستقبل teacherId مع باقي المعاملات
    const { status, page = 1, limit = 10, teacherId } = req.query;

    // تحويل القيم إلى أرقام لحساب النطاق
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum - 1;

    try {
      // بناء الاستعلام الأساسي
      let query = supabase
        .from('subscription_requests')
        .select(`
            *,
            teachers (name) 
        `, { count: 'exact' }) // ✅ طلب العدد الإجمالي للصفوف
        .order('created_at', { ascending: false })
        .range(start, end); // ✅ تحديد النطاق

      // 1. تطبيق فلتر الحالة (pending, approved, rejected)
      if (status) {
        query = query.eq('status', status);
      }

      // 2. ✅ تطبيق فلتر المدرس
      if (teacherId && teacherId !== 'all') {
        query = query.eq('teacher_id', teacherId);
      }

      // تنفيذ الاستعلام
      const { data, count, error } = await query;

      if (error) throw error;

      // ✅ إضافة معلومة "المدرس صاحب الكورس" الفعلي (قد يختلف عن teacher_id
      // الخاص بصاحب الطلب في حالة باقات قائد الفريق) دون المساس بمنطق الملكية
      const enrichedData = await attachCourseOwnerTeachers(data);

      // إرجاع البيانات
      return res.status(200).json({ data: enrichedData, count });

    } catch (err) {
      console.error("Fetch Error:", err);
      return res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
  }

  // ==========================================================
  // 🟠 التعامل مع طلبات POST (تغيير الحالة: تفعيل/رفض/تعديل السعر)
  // ==========================================================
  if (req.method === 'POST') {
    const { requestId, action, rejectionReason } = req.body;

    try {
      // --- حالة تعديل المبلغ (Update Price) ---
      // وضعناها هنا لتُنفذ مباشرة دون الحاجة لجلب تفاصيل الطلب بالكامل
      if (action === 'update_price') {
        const { newPrice } = req.body;
        
        if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) {
           return res.status(400).json({ error: 'مبلغ غير صالح' });
        }

        // تخزين السعر الجديد في عمود actual_paid_price بدلاً من total_price
        const { error: updateError } = await supabase
          .from('subscription_requests')
          .update({ actual_paid_price: newPrice })
          .eq('id', requestId);

        if (updateError) throw updateError;

        return res.status(200).json({ success: true, message: 'تم تحديث المبلغ الفعلي بنجاح', newPrice });
      }

      // --- حالة حذف سجل الطلب (Delete Request Record) ---
      // ⚠️ يحذف سجل الطلب فقط من جدول subscription_requests
      // ولا يمس اشتراك الطالب الفعلي (user_course_access / user_subject_access)
      if (action === 'delete_request') {
        if (!requestId) {
          return res.status(400).json({ error: 'معرف الطلب مطلوب' });
        }

        const { error: deleteError, count: deletedCount } = await supabase
          .from('subscription_requests')
          .delete({ count: 'exact' })
          .eq('id', requestId);

        if (deleteError) throw deleteError;

        if (!deletedCount) {
          return res.status(404).json({ error: 'الطلب غير موجود بالفعل' });
        }

        return res.status(200).json({ success: true, message: 'تم حذف سجل الطلب بنجاح' });
      }

      // 1. جلب تفاصيل الطلب أولاً لمعرفة البيانات المطلوبة لباقي الإجراءات (ومعرفة الكود المرتبط)
      const { data: request, error: fetchError } = await supabase
        .from('subscription_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchError || !request) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      // --- حالة الرفض (Reject) ---
      if (action === 'reject') {
        // أ. تحديث حالة الطلب إلى مرفوض
        await supabase
          .from('subscription_requests')
          .update({ 
            status: 'rejected', 
            rejection_reason: rejectionReason || 'مرفوض من قبل الإدارة' 
          })
          .eq('id', requestId);

        // ب. ♻️ إعادة تفعيل (إنعاش) كود الخصم إذا كان الطلب يحتوي على كود
        if (request.discount_code_id) {
            await supabase
              .from('discount_codes')
              .update({ is_used: false })
              .eq('id', request.discount_code_id);
        }

        return res.status(200).json({ success: true, message: 'تم رفض الطلب وإعادة تفعيل كود الخصم (إن وجد) بنجاح' });
      }

      // --- حالة الموافقة (Approve) ---
      if (action === 'approve') {
        let targetUserId = request.user_id;

        // أ) التحقق من المستخدم أو إنشاؤه إذا لم يكن موجوداً
        // نستخدم user_username للبحث لأنه فريد
        if (!targetUserId) {
           const { data: existingUser } = await supabase
             .from('users')
             .select('id')
             .eq('username', request.user_username)
             .maybeSingle();

           if (existingUser) {
             targetUserId = existingUser.id;
           } else {
             // إنشاء مستخدم جديد إذا لم يكن موجوداً
             const { data: newUser, error: createError } = await supabase
               .from('users')
               .insert({
                   username: request.user_username,
                   password: '123456', // ⚠️ كلمة مرور افتراضية
                   first_name: request.user_name,
                   phone: request.phone,
                   role: 'student',
                   is_blocked: false
               })
               .select('id')
               .single();
             
             if (createError) throw createError;
             targetUserId = newUser.id;
           }
        }

        // ب) منح الصلاحيات (Loop through requested items)
        // 🎓 المدرسون/المشرفون يحصلون دائماً على وصول مدى الحياة، حتى لو
        // كان الحساب المستهدف قد رُقّي لهذا الدور بعد إنشاء الطلب.
        const { data: targetUserRoleRow } = await supabase.from('users').select('role').eq('id', targetUserId).maybeSingle();
        const exemptFromExpiry = isExemptFromExpiry(targetUserRoleRow?.role);

        const items = request.requested_data || []; 
        const courseInserts = [];
        const subjectInserts = [];

        for (const item of items) {
            if (item.type === 'course') {
                // ⏳ نحسب تاريخ انتهاء الصلاحية بناءً على مدة الكورس (إن وُجدت) عند لحظة المنح فقط
                const { granted_at, expires_at } = await buildGrantTimestamps(item.id, null);
                courseInserts.push({ user_id: targetUserId, course_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at });
            } else if (item.type === 'subject') {
                // ⏳ نفس المنطق لصلاحية المادة (مع مراعاة override الخاص بالمادة إن وُجد)
                const { granted_at, expires_at } = await buildGrantTimestamps(null, item.id);
                subjectInserts.push({ user_id: targetUserId, subject_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at });
            }
        }

        // تنفيذ الإدخال (Upsert لمنع الأخطاء عند التكرار)
        if (courseInserts.length > 0) {
            await supabase.from('user_course_access').upsert(courseInserts, { onConflict: 'user_id, course_id' });
        }
        if (subjectInserts.length > 0) {
            await supabase.from('user_subject_access').upsert(subjectInserts, { onConflict: 'user_id, subject_id' });
        }

        // ج) تحديث حالة الطلب إلى "مقبول" وربطه بالمستخدم الفعلي
        await supabase
          .from('subscription_requests')
          .update({ 
            status: 'approved', 
            user_id: targetUserId,
            rejection_reason: null
          })
          .eq('id', requestId);

        return res.status(200).json({ success: true, message: 'تم تفعيل الاشتراك وإنشاء الحساب (إن لزم) بنجاح' });
      }

      return res.status(400).json({ error: 'إجراء غير معروف' });

    } catch (err) {
      console.error('Action Error:', err);
      return res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ العملية: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
