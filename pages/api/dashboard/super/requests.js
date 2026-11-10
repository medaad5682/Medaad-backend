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

    // ✅ حماية: تحويل صريح لأرقام صحيحة + سقف لحجم الصفحة (بدونه، limit ضخم
    // قادم من الطلب كان يجعل .range() يجلب آلاف الصفوف دفعة واحدة)
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
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

      // --- حالة تعديل تفاصيل الطلب كاملة (Update Request Details) ---
      // يعدّل: المبلغ المطلوب (total_price)، المبلغ المدفوع فعلياً (actual_paid_price)،
      // وعلى مستوى كل عنصر داخل requested_data: سعر التقرير (report_price)،
      // وتغيير الباقة (للعناصر من نوع package).
      // ⚠️ هذا تعديل على سجل الطلب والتقارير فقط — لا يمنح ولا يسحب أي صلاحية وصول للطالب.
      if (action === 'update_request') {
        const { totalPrice, actualPaidPrice, itemEdits } = req.body;
        const updates = {};

        const toMoney = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? n : null;
        };
        const isBlank = (v) => v === null || v === '' || v === undefined;

        // 1) المبلغ المطلوب
        if (totalPrice !== undefined) {
          const n = isBlank(totalPrice) ? null : toMoney(totalPrice);
          if (n === null) return res.status(400).json({ error: 'المبلغ المطلوب غير صالح' });
          updates.total_price = n;
        }

        // 2) المبلغ المدفوع فعلياً (فارغ = إلغاء التعديل والرجوع للمبلغ المطلوب)
        if (actualPaidPrice !== undefined) {
          if (isBlank(actualPaidPrice)) {
            updates.actual_paid_price = null;
          } else {
            const n = toMoney(actualPaidPrice);
            if (n === null) return res.status(400).json({ error: 'المبلغ المدفوع فعلياً غير صالح' });
            updates.actual_paid_price = n;
          }
        }

        // 3) تعديلات العناصر (الباقة + سعر التقرير)
        const items = Array.isArray(request.requested_data)
          ? request.requested_data.map(i => ({ ...i }))
          : [];
        let courseTitle = request.course_title || '';
        let itemsChanged = false;

        if (Array.isArray(itemEdits) && itemEdits.length > 0) {
          for (const edit of itemEdits) {
            const idx = Number(edit?.index);
            if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
              return res.status(400).json({ error: 'عنصر غير موجود داخل الطلب' });
            }
            const item = items[idx];

            // 3.أ) تغيير الباقة
            if (!isBlank(edit.packageId) && String(edit.packageId) !== String(item.id)) {
              if (item.type !== 'package') {
                return res.status(400).json({ error: 'يمكن تغيير الباقة للعناصر من نوع باقة فقط' });
              }

              const { data: newPkg, error: pkgError } = await supabase
                .from('course_packages')
                .select('id, team_id, title, report_price, price')
                .eq('id', edit.packageId)
                .maybeSingle();
              if (pkgError) throw pkgError;
              if (!newPkg) return res.status(404).json({ error: 'الباقة المختارة غير موجودة' });

              const { data: oldPkg } = await supabase
                .from('course_packages')
                .select('id, team_id')
                .eq('id', item.id)
                .maybeSingle();

              const { data: pkgItems } = await supabase
                .from('course_package_items')
                .select('courses(id, title)')
                .eq('package_id', newPkg.id);

              const oldTitle = item.title;
              item.id = newPkg.id;
              item.title = newPkg.title;
              item.courses = (pkgItems || []).map(r => r.courses).filter(Boolean).map(c => ({ id: c.id, title: c.title }));
              item.full_report_price = Number(newPkg.report_price) || 0;
              // الافتراضي: سعر تقرير الباقة الجديدة (يمكن تجاوزه بقيمة report_price مرسلة)
              item.report_price = Number(newPkg.report_price) || 0;

              if (oldTitle && courseTitle.includes(oldTitle)) {
                courseTitle = courseTitle.replace(oldTitle, newPkg.title);
              } else if (items.length === 1) {
                courseTitle = `باقة: ${newPkg.title}`;
              }

              // لو الباقة الجديدة تتبع فريقاً آخر → ننقل الطلب لقائد ذلك الفريق
              // حتى يظهر في تقرير المدرس الصحيح
              if (newPkg.team_id && (!oldPkg || String(oldPkg.team_id) !== String(newPkg.team_id))) {
                const { data: team } = await supabase
                  .from('teacher_teams')
                  .select('leader_teacher_id')
                  .eq('id', newPkg.team_id)
                  .maybeSingle();
                if (team?.leader_teacher_id) updates.teacher_id = team.leader_teacher_id;
              }
              itemsChanged = true;
            }

            // 3.ب) سعر التقرير (فارغ = حذف التخصيص والرجوع للسعر الحالي المسجّل للكورس/المادة/الباقة)
            if (edit.report_price !== undefined) {
              if (isBlank(edit.report_price)) {
                if (item.report_price !== undefined) { delete item.report_price; itemsChanged = true; }
              } else {
                const n = toMoney(edit.report_price);
                if (n === null) return res.status(400).json({ error: 'سعر التقرير غير صالح' });
                item.report_price = n;
                itemsChanged = true;
              }
            }
          }
        }

        // عند طلب بعنصر واحد نُبقي سعر العنصر متسقاً مع المبلغ المطلوب
        if (updates.total_price !== undefined && items.length === 1) {
          items[0].price = updates.total_price;
          itemsChanged = true;
        }

        if (itemsChanged) {
          updates.requested_data = items;
          updates.course_title = courseTitle;
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'لا توجد تعديلات لحفظها' });
        }

        const { error: updateError } = await supabase
          .from('subscription_requests')
          .update(updates)
          .eq('id', requestId);
        if (updateError) throw updateError;

        // نعيد الصف محدّثاً بنفس شكل قائمة GET حتى تتحدث البطاقة فوراً
        const { data: fresh } = await supabase
          .from('subscription_requests')
          .select('*, teachers (name)')
          .eq('id', requestId)
          .single();
        const [enriched] = await attachCourseOwnerTeachers([fresh]);

        return res.status(200).json({ success: true, message: 'تم حفظ تعديلات الطلب بنجاح', data: enriched });
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
