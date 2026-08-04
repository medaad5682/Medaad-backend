import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import bcrypt from 'bcryptjs'; // ✅ استخدام bcryptjs بناءً على طلبك

export default async function handler(req, res) {
  // 1. التحقق من صلاحية السوبر أدمن
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return; 

  // ==========================================================
  // 🟢 التعامل مع طلبات GET (جلب البيانات)
  // ==========================================================
  if (req.method === 'GET') {
    const { page = 1, limit = 30, search, courses_filter, subjects_filter, filter_mode = 'or', get_details_for_user } = req.query;

    // ---------------------------------------------------------
    // A. جلب تفاصيل مستخدم محدد (للمودال - عرض الاشتراكات + قوائم المنح)
    // ---------------------------------------------------------
    if (get_details_for_user) {
      try {
        // 1. جلب كل الكورسات والمواد في النظام (للقوائم المنسدلة)
        const { data: allCourses } = await supabase.from('courses').select('id, title');
        const { data: allSubjects } = await supabase.from('subjects').select('id, title, course_id');

        // 2. جلب اشتراكات المستخدم الحالية
        const { data: userCourses } = await supabase
          .from('user_course_access')
          .select('course_id, courses(id, title)')
          .eq('user_id', get_details_for_user);

        const { data: userSubjects } = await supabase
          .from('user_subject_access')
          .select('subject_id, subjects(id, title, course_id)')
          .eq('user_id', get_details_for_user);

        // استخراج IDs التي يملكها المستخدم حالياً
        const ownedCourseIds = userCourses?.map(uc => uc.course_id) || [];
        const ownedSubjectIds = userSubjects?.map(us => us.subject_id) || [];

        // 3. حساب الكورسات المتاحة للإضافة (الكل - المملوك)
        const safeAllCourses = allCourses || [];
        const availableCourses = safeAllCourses.filter(c => !ownedCourseIds.includes(c.id));

        // 4. حساب المواد المتاحة للإضافة (الكل - المملوك - مواد الكورسات المملوكة)
        const safeAllSubjects = allSubjects || [];
        const availableSubjects = safeAllSubjects.filter(s => {
            const isOwned = ownedSubjectIds.includes(s.id);
            // إذا كان الطالب يملك الكورس، فهو يملك مواده تلقائياً
            const isParentCourseOwned = s.course_id ? ownedCourseIds.includes(s.course_id) : false;
            return !isOwned && !isParentCourseOwned;
        });

        return res.status(200).json({
          courses: userCourses || [],
          subjects: userSubjects || [],
          available_courses: availableCourses, // القائمة المتوافقة مع الـ Select في الفرونت
          available_subjects: availableSubjects
        });

      } catch (err) {
        console.error("Error fetching details:", err);
        return res.status(500).json({ error: err.message });
      }
    }

    // ---------------------------------------------------------
    // B. جلب قائمة المستخدمين (للجدول الرئيسي)
    // ---------------------------------------------------------
    try {
      // ✅ إصلاح: تحويل page و limit إلى أرقام صريحة
      // القيم القادمة من req.query هي نصوص (strings)، وبدون التحويل
      // كان "from + limit - 1" ينفذ عملية جمع نصوص (concatenation) بدل الجمع الحسابي
      // بداية من الصفحة الثانية، مما يجعل "to" رقماً ضخماً وخاطئاً (مثلاً 3029 بدل 59)
      // فتُرجع الاستعلامات كل الصفوف تقريباً بدل 30 صف فقط، ويتكرر نفس المشكل مع كل صفحة
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 30;
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      // بناء الاستعلام الأساسي
      // ✅ التعديل: إزالة شرط الرتبة لجلب كافة المستخدمين (مدرسين، طلاب، مشرفين، إلخ)
      let query = supabase
        .from('users')
        .select('id, first_name, username, phone, role, is_blocked, created_at, is_admin, devices(id, fingerprint)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // تطبيق البحث
      if (search) {
        const term = search.trim();
        let orQuery = `first_name.ilike.%${term}%,phone.ilike.%${term}%,username.ilike.%${term}%`;
        if (/^\d+$/.test(term)) orQuery += `,id.eq.${term}`;
        query = query.or(orQuery);
      }

      // تطبيق فلتر الكورسات والمواد مع دعم AND / OR
      const hasCourseFilter = !!courses_filter;
      const hasSubjectFilter = !!subjects_filter;

      if (hasCourseFilter || hasSubjectFilter) {
        const isAnd = filter_mode === 'and';

        // جلب معرفات المستخدمين لكل كورس على حدة (AND: intersection / OR: union)
        let courseUserSets = [];
        if (hasCourseFilter) {
          const courseIds = courses_filter.split(',');
          if (isAnd) {
            // AND: جلب كل كورس على حدة للتقاطع لاحقاً
            for (const cid of courseIds) {
              const { data } = await supabase.from('user_course_access').select('user_id').eq('course_id', cid);
              courseUserSets.push(data?.map(u => u.user_id) || []);
            }
          } else {
            // OR: جلب الكل دفعة واحدة
            const { data } = await supabase.from('user_course_access').select('user_id').in('course_id', courseIds);
            courseUserSets.push(data?.map(u => u.user_id) || []);
          }
        }

        // جلب معرفات المستخدمين لكل مادة على حدة
        let subjectUserSets = [];
        if (hasSubjectFilter) {
          const subjectIds = subjects_filter.split(',');
          if (isAnd) {
            for (const sid of subjectIds) {
              const { data } = await supabase.from('user_subject_access').select('user_id').eq('subject_id', sid);
              subjectUserSets.push(data?.map(u => u.user_id) || []);
            }
          } else {
            const { data } = await supabase.from('user_subject_access').select('user_id').in('subject_id', subjectIds);
            subjectUserSets.push(data?.map(u => u.user_id) || []);
          }
        }

        const allSets = [...courseUserSets, ...subjectUserSets];

        let finalUserIds;
        if (isAnd) {
          // AND: تقاطع جميع المجموعات — الطالب يجب أن يكون في كل مجموعة
          if (allSets.length === 0) {
            finalUserIds = [];
          } else {
            finalUserIds = allSets.reduce((acc, set) => acc.filter(id => set.includes(id)));
          }
        } else {
          // OR: اتحاد جميع المجموعات — الطالب في أي مجموعة
          const unionSet = new Set(allSets.flat());
          finalUserIds = [...unionSet];
        }

        if (finalUserIds.length > 0) query = query.in('id', finalUserIds);
        else query = query.eq('id', 0); // لا نتائج
      }

      const { data, count, error } = await query;

      if (error) throw error;

      // تنسيق البيانات
      const formattedData = data.map(user => {
          // التعامل مع مصفوفة الأجهزة
          const hasDevice = user.devices && Array.isArray(user.devices) && user.devices.length > 0;
          const mainDevice = hasDevice ? user.devices[0] : null;

          return {
            ...user,
            device_linked: hasDevice,
            device_id: mainDevice ? mainDevice.fingerprint : null 
          };
      });

      return res.status(200).json({
        students: formattedData,
        total: count,
        isMainAdmin: true // ✅ إضافة هذا العلم ليتمكن الفرونت إند من عرض الأزرار الإضافية (مثل الحذف النهائي)
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'فشل جلب المستخدمين' });
    }
  }

  // ==========================================================
  // 🟠 التعامل مع طلبات POST (الإجراءات)
  // ==========================================================
  if (req.method === 'POST') {
    const { action, userId, userIds, data, grantList, courseId, subjectId } = req.body;
    const targetIds = userIds || (userId ? [userId] : []);

    try {
      // متغير لتخزين رسالة النجاح
      let successMessage = '';

      switch (action) {
        // 1. الحظر
        case 'block_user':
          await supabase.from('users').update({ is_blocked: true }).in('id', targetIds);
          successMessage = 'تم حظر المستخدم/المستخدمين بنجاح';
          break;

        case 'unblock_user':
          await supabase.from('users').update({ is_blocked: false }).in('id', targetIds);
          successMessage = 'تم فك الحظر بنجاح';
          break;

        // 2. تصفير الجهاز
        case 'reset_device':
          const { error: resetErr } = await supabase
              .from('devices')
              .delete()
              .in('user_id', targetIds);
          if (resetErr) throw resetErr;

          // ✅ إبطال توكن الدخول (JWT) أيضاً حتى يتم تسجيل خروج التطبيق فوراً
          // بدون هذا، يبقى التطبيق القديم يعمل بتوكن صالح رغم حذف بصمة الجهاز
          const { error: tokenClearErr } = await supabase
              .from('users')
              .update({ jwt_token: null })
              .in('id', targetIds);
          if (tokenClearErr) throw tokenClearErr;

          successMessage = 'تم تصفير الأجهزة المرتبطة وتسجيل خروج التطبيق';
          break;

        // 3. حذف مستخدم
        case 'delete_user':
        case 'delete_user_bulk':
          if (!targetIds.length) return res.status(400).json({ error: 'لم يتم تحديد مستخدمين' });
          
          // الحذف اليدوي لضمان النظافة
          await supabase.from('user_course_access').delete().in('user_id', targetIds);
          await supabase.from('user_subject_access').delete().in('user_id', targetIds);
          await supabase.from('devices').delete().in('user_id', targetIds);
          
          const { error: delErr } = await supabase.from('users').delete().in('id', targetIds);
          if (delErr) throw delErr;

          successMessage = `تم حذف ${targetIds.length} حسابات نهائياً`;
          break;

        // 4. تحديث البيانات
        case 'update_profile':
          if (!data) return res.status(400).json({ error: 'لا توجد بيانات' });
          const updates = { 
             first_name: data.first_name, 
             phone: data.phone, 
             username: data.username 
          };
          
          // ✅ التعديل: التشفير باستخدام bcryptjs بنفس الطريقة التي أرسلتها
          if (data.password && data.password.trim() !== '') {
             const hashedPassword = await bcrypt.hash(data.password, 10);
             updates.password = hashedPassword; 
          }

          const { error: updateErr } = await supabase.from('users').update(updates).eq('id', userId);
          if (updateErr) throw updateErr;
          successMessage = 'تم تحديث البيانات بنجاح';
          break;

        // 5. منح صلاحيات (Grant Access)
        case 'grant_access':
          const { courses: gCourses, subjects: gSubjects } = grantList || {};

          const courseInserts = [];
          if (gCourses && gCourses.length > 0) {
            targetIds.forEach(uid => {
                gCourses.forEach(cid => {
                    courseInserts.push({ user_id: uid, course_id: cid });
                });
            });
          }

          const subjectInserts = [];
          if (gSubjects && gSubjects.length > 0) {
            targetIds.forEach(uid => {
                gSubjects.forEach(sid => {
                    subjectInserts.push({ user_id: uid, subject_id: sid });
                });
            });
          }

          if (courseInserts.length > 0) {
              await supabase.from('user_course_access').upsert(courseInserts, { onConflict: 'user_id,course_id' });
          }
          if (subjectInserts.length > 0) {
              await supabase.from('user_subject_access').upsert(subjectInserts, { onConflict: 'user_id,subject_id' });
          }

          successMessage = 'تم منح الصلاحيات بنجاح';
          break;

        // 6. سحب صلاحية (Revoke)
        case 'revoke_access':
          if (courseId) {
             await supabase.from('user_course_access').delete().in('user_id', targetIds).eq('course_id', courseId);
          }
          if (subjectId) {
             await supabase.from('user_subject_access').delete().in('user_id', targetIds).eq('subject_id', subjectId);
          }
          successMessage = 'تم سحب الصلاحية';
          break;

        // 7. حذف كل طلاب كورس معين (سحب صلاحية الكورس + مواده من جميع الطلاب دفعة واحدة)
        case 'delete_all_course_students':
          if (!courseId) return res.status(400).json({ error: 'لم يتم تحديد الكورس' });

          // أ. جلب كل مواد هذا الكورس أولاً
          const { data: courseSubjectsRows, error: courseSubjectsErr } = await supabase
            .from('subjects')
            .select('id')
            .eq('course_id', courseId);
          if (courseSubjectsErr) throw courseSubjectsErr;

          const courseSubjectIds = (courseSubjectsRows || []).map(s => s.id);

          // ب. حذف صلاحيات هذه المواد لكل الطلاب (لأنها تابعة للكورس المحذوف)
          if (courseSubjectIds.length > 0) {
            const { error: delSubjErr } = await supabase
              .from('user_subject_access')
              .delete()
              .in('subject_id', courseSubjectIds);
            if (delSubjErr) throw delSubjErr;
          }

          // ج. حذف صلاحية الكورس نفسه لكل الطلاب
          const { data: deletedCourseRows, error: delCourseErr } = await supabase
            .from('user_course_access')
            .delete()
            .eq('course_id', courseId)
            .select('user_id');
          if (delCourseErr) throw delCourseErr;

          successMessage = `تم حذف صلاحية الكورس وموادّه من ${deletedCourseRows?.length || 0} طالب بنجاح`;
          break;

        default:
          return res.status(400).json({ error: 'إجراء غير معروف' });
      }

      // ✅ الرد الموحد المتوافق مع الفرونت إند (بإضافة success: true)
      return res.json({ success: true, message: successMessage });

    } catch (err) {
      console.error(`Error in action ${action}:`, err);
      return res.status(500).json({ success: false, error: 'حدث خطأ: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
