// pages/api/dashboard/teacher/requests.js
import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { notifyStudentSubscriptionDecision } from '../../../../lib/notifyHelper';
import { buildGrantTimestamps, isExemptFromExpiry } from '../../../../lib/accessExpiryHelper';
import { attachCourseOwnerTeachers } from '../../../../lib/requestOwnerHelper';

export default async (req, res) => {
  const { user, error } = await requireTeacherOrAdmin(req, res);
  // ✅ تعديل: إرجاع رسالة خطأ 401 بدلاً من return فارغ لتجنب تعليق الطلب
  if (error) return res.status(401).json({ error: 'Unauthorized' });

  const teacherId = user.teacherId;

  // ==========================================================
  // --- GET: جلب الطلبات الخاصة بالمدرس (مع فلترة وتقليب صفحات) ---
  // ==========================================================
  if (req.method === 'GET') {
    const { status = 'pending', page = 1, limit = 10 } = req.query;

    // ✅ حماية: تحويل صريح لأرقام صحيحة + سقف لحجم الصفحة (بدونه، limit ضخم
    // قادم من الطلب كان يجعل .range() يجلب آلاف الصفوف دفعة واحدة)
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum - 1;

    try {
      let query = supabase
        .from('subscription_requests')
        .select('*', { count: 'exact' }) // يجلب كل البيانات ومن ضمنها السعرين
        .eq('teacher_id', teacherId)     // ✅ حماية أساسية: جلب طلبات هذا المدرس فقط
        .order('created_at', { ascending: false })
        .range(start, end);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, count, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // ✅ التعديل الجديد: تجهيز البيانات وإضافة مؤشر `has_discount` للتسهيل على واجهة العرض
      const withDiscountFlag = data.map(request => ({
          ...request,
          has_discount: request.actual_paid_price !== null && request.actual_paid_price < request.total_price
      }));

      // ✅ إضافة معلومة "المدرس صاحب الكورس" الفعلي (قد يختلف عن قائد الفريق
      // الذي يظهر الطلب تحت حسابه) دون المساس بمنطق ملكية الطلب (لا يزال
      // مفلتراً بـ teacher_id كما هو الحال الآن)
      const enrichedData = await attachCourseOwnerTeachers(withDiscountFlag);

      return res.status(200).json({ data: enrichedData, count });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ==========================================================
  // --- POST: قبول أو رفض الطلب ---
  // ==========================================================
  if (req.method === 'POST') {
    const { requestId, action, rejectionReason } = req.body;
    
    try {
      // 1. التحقق من أن الطلب يخص هذا المدرس وجلب بياناته (بما فيها كود الخصم)
      const { data: request } = await supabase
        .from('subscription_requests')
        .select('*')
        .eq('id', requestId)
        .eq('teacher_id', teacherId) // ✅ حماية إضافية
        .single();

      if (!request) return res.status(404).json({ error: 'الطلب غير موجود أو لا تملك صلاحية عليه' });

      // 2. التنفيذ
      if (action === 'reject') {
         // أ. تحديث حالة الطلب إلى مرفوض
         await supabase.from('subscription_requests')
           .update({ status: 'rejected', rejection_reason: rejectionReason || 'مرفوض' })
           .eq('id', requestId);

         // ب. ♻️ إعادة تفعيل كود الخصم (إن وُجد) لكي يتمكن الطالب من استخدامه مجدداً
         if (request.discount_code_id) {
             await supabase.from('discount_codes')
               .update({ is_used: false })
               .eq('id', request.discount_code_id);
         }

         // ج. 🔔 إشعار الطالب بالرفض
         await notifyStudentSubscriptionDecision({
             userId: request.user_id,
             decision: 'reject',
             courseTitle: request.course_title,
             rejectionReason: rejectionReason || 'مرفوض',
             requestId: request.id,
             senderRole: 'teacher'
         });

         return res.status(200).json({ success: true, message: 'تم رفض الطلب وإعادة تفعيل كود الخصم (إن وجد) بنجاح' });
      }

      if (action === 'approve') {
         let targetUserId = request.user_id;

         // منطق إنشاء المستخدم إذا لم يكن موجوداً
         if (!targetUserId) {
            const { data: existing } = await supabase.from('users').select('id').eq('username', request.user_username).maybeSingle();
            if (existing) targetUserId = existing.id;
            else {
               const { data: newUser } = await supabase.from('users').insert({
                   username: request.user_username, 
                   password: request.password_hash || '123456', 
                   first_name: request.user_name, 
                   phone: request.phone, 
                   role: 'student'
               }).select('id').single();
               targetUserId = newUser.id;
            }
         }

         // منح الصلاحيات
         // 🎓 المدرسون/المشرفون يحصلون دائماً على وصول مدى الحياة، حتى لو
         // كان الحساب المستهدف (المسجل مسبقاً) قد رُقّي لاحقاً لهذا الدور.
         const { data: targetUserRoleRow } = await supabase.from('users').select('role').eq('id', targetUserId).maybeSingle();
         const exemptFromExpiry = isExemptFromExpiry(targetUserRoleRow?.role);

         const items = request.requested_data || [];
         for (const item of items) {
             if (item.type === 'course') {
                 // ⏳ حساب تاريخ انتهاء الصلاحية بناءً على مدة الكورس عند لحظة المنح
                 const { granted_at, expires_at } = await buildGrantTimestamps(item.id, null);
                 await supabase.from('user_course_access').upsert({ user_id: targetUserId, course_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at }, { onConflict: 'user_id, course_id' });
             } else if (item.type === 'subject') {
                 const { granted_at, expires_at } = await buildGrantTimestamps(null, item.id);
                 await supabase.from('user_subject_access').upsert({ user_id: targetUserId, subject_id: item.id, granted_at, expires_at: exemptFromExpiry ? null : expires_at }, { onConflict: 'user_id, subject_id' });
             }
         }

         await supabase.from('subscription_requests').update({ status: 'approved', user_id: targetUserId }).eq('id', requestId);

         // 🔔 إشعار الطالب بالقبول
         await notifyStudentSubscriptionDecision({
             userId: targetUserId,
             decision: 'approve',
             courseTitle: request.course_title,
             requestId: request.id,
             senderRole: 'teacher'
         });

         return res.status(200).json({ success: true, message: 'تم تفعيل الاشتراك بنجاح' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
};
