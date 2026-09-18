import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { buildGrantTimestamps, isExemptFromExpiry } from '../../../../lib/accessExpiryHelper';
import bcrypt from 'bcryptjs'; // ✅ استخدام bcryptjs بناءً على طلبك

// حد أقصى لحجم الصفحة (نفس القاعدة المستخدمة في لوحة المعلم)
const MAX_PAGE_SIZE = 100;

// "1,2,x,3" -> [1,2,3]  (أرقام صحيحة موجبة فقط، بدون تكرار)
const toIntList = (raw) => [...new Set(
  String(Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map(v => Number(v.trim()))
    .filter(n => Number.isSafeInteger(n) && n > 0)
)];

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
          .select('course_id, granted_at, expires_at, courses(id, title)')
          .eq('user_id', get_details_for_user);

        const { data: userSubjects } = await supabase
          .from('user_subject_access')
          .select('subject_id, granted_at, expires_at, subjects(id, title, course_id)')
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
    // ⛔ تم حذف منطق الفلترة القديم: كان يجلب *كل* صفوف user_course_access/
    // user_subject_access لكل كورس/مادة مطلوبة إلى ذاكرة السيرفر (حتى بدون
    // أي فلتر صفحة)، وفي وضع AND كان يكرر ذلك استعلاماً مستقلاً لكل كورس على
    // حدة، ثم يحسب التقاطع/الاتحاد في JS ويعيد إرسال آلاف المعرفات الناتجة
    // داخل .in('id', [...]) في رابط الطلب. الآن كل ذلك (البحث + فلتر AND/OR +
    // الترقيم + العدّ) ينفَّذ داخل Postgres عبر get_admin_students_page
    // (انظر sql/admin_students_page.sql) باستخدام نفس فهارس user_*_access
    // المُنشأة في migration الفريق التعليمي.
    try {
      // ✅ تحويل page و limit إلى أرقام صريحة + سقف لحجم الصفحة
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 30, 1), MAX_PAGE_SIZE);
      const from = (pageNum - 1) * limitNum;

      const filterCourseIds = toIntList(courses_filter);
      const filterSubjectIds = toIntList(subjects_filter);
      const filterRequested = !!courses_filter || !!subjects_filter;

      let students = [];
      let total = 0;

      // طُلبت فلترة لكن كل المعرفات غير صالحة -> لا نتائج (بدل إرجاع القائمة بلا فلتر)
      if (!(filterRequested && filterCourseIds.length === 0 && filterSubjectIds.length === 0)) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_students_page', {
          p_search: (search && search.trim() !== '') ? search.trim() : null,
          p_filter_course_ids: filterCourseIds,
          p_filter_subject_ids: filterSubjectIds,
          p_filter_mode: filter_mode === 'and' ? 'and' : 'or',
          p_limit: limitNum,
          p_offset: from
        });
        if (rpcError) throw rpcError;

        students = rpcData?.students || [];
        total = Number(rpcData?.total) || 0;
      }

      return res.status(200).json({
        students,
        total,
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
          if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
            return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
          }
          const updates = { 
             first_name: data.first_name, 
             phone: data.phone, 
             username: data.username,
             ...(data.email !== undefined ? { email: data.email ? String(data.email).trim().toLowerCase() : null } : {})
          };
          
          // ✅ التعديل: التشفير باستخدام bcryptjs بنفس الطريقة التي أرسلتها
          if (data.password && data.password.trim() !== '') {
             const hashedPassword = await bcrypt.hash(data.password, 10);
             updates.password = hashedPassword; 
          }

          // ✅ التحقق من عدم تكرار البريد الإلكتروني مع مستخدم آخر قبل التحديث
          if (updates.email) {
            const { data: existingEmailUser } = await supabase
              .from('users')
              .select('id')
              .eq('email', updates.email)
              .neq('id', userId)
              .maybeSingle();
            if (existingEmailUser) {
              return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل من حساب آخر' });
            }
          }

          const { error: updateErr } = await supabase.from('users').update(updates).eq('id', userId);
          if (updateErr) throw updateErr;
          successMessage = 'تم تحديث البيانات بنجاح';
          break;

        // 5. منح صلاحيات (Grant Access)
        case 'grant_access':
          const { courses: gCourses, subjects: gSubjects } = grantList || {};

          // 🎓 لا نُعفي من انتهاء الصلاحية إلا مدرساً/مشرفاً يُمنح وصولاً
          // لكورس/مادة يملكها هو تحديداً (كورساته الخاصة)، وليس أي كورس آخر.
          const { data: targetUsersRoles } = await supabase
            .from('users')
            .select('id, role, teacher_profile_id')
            .in('id', targetIds);
          const roleMap = new Map((targetUsersRoles || []).map(u => [String(u.id), { role: u.role, teacherProfileId: u.teacher_profile_id }]));

          // خرائط "مالك الكورس" لكل كورس/مادة مستهدفة، لمقارنتها بـ teacher_profile_id
          // الخاص بكل مستخدم مستهدف.
          const courseOwnerMap = new Map();
          if (gCourses && gCourses.length > 0) {
            const { data: courseOwners } = await supabase.from('courses').select('id, teacher_id').in('id', gCourses);
            (courseOwners || []).forEach(c => courseOwnerMap.set(String(c.id), c.teacher_id));
          }

          const subjectOwnerMap = new Map();
          if (gSubjects && gSubjects.length > 0) {
            const { data: subjectOwners } = await supabase.from('subjects').select('id, courses(teacher_id)').in('id', gSubjects);
            (subjectOwners || []).forEach(s => subjectOwnerMap.set(String(s.id), s.courses?.teacher_id));
          }

          const isExemptForItem = (uid, ownerTeacherId) => {
            const target = roleMap.get(String(uid));
            if (!target || !isExemptFromExpiry(target.role)) return false;
            return target.teacherProfileId != null && ownerTeacherId != null && String(target.teacherProfileId) === String(ownerTeacherId);
          };

          // ⏳ نحسب تاريخ الانتهاء مرة واحدة لكل كورس/مادة (نفس المدة تُطبّق على كل الطلاب
          // المستهدفين في هذه الدفعة)، ثم نعيد استخدامها بدل استدعاء الهيلبر لكل صف.
          const courseGrantTimestamps = {};
          if (gCourses && gCourses.length > 0) {
            for (const cid of gCourses) {
              courseGrantTimestamps[cid] = await buildGrantTimestamps(cid, null);
            }
          }

          const subjectGrantTimestamps = {};
          if (gSubjects && gSubjects.length > 0) {
            for (const sid of gSubjects) {
              subjectGrantTimestamps[sid] = await buildGrantTimestamps(null, sid);
            }
          }

          const courseInserts = [];
          if (gCourses && gCourses.length > 0) {
            targetIds.forEach(uid => {
                gCourses.forEach(cid => {
                    const { granted_at, expires_at } = courseGrantTimestamps[cid] || {};
                    const exempt = isExemptForItem(uid, courseOwnerMap.get(String(cid)));
                    courseInserts.push({ user_id: uid, course_id: cid, granted_at, expires_at: exempt ? null : expires_at });
                });
            });
          }

          const subjectInserts = [];
          if (gSubjects && gSubjects.length > 0) {
            targetIds.forEach(uid => {
                gSubjects.forEach(sid => {
                    const { granted_at, expires_at } = subjectGrantTimestamps[sid] || {};
                    const exempt = isExemptForItem(uid, subjectOwnerMap.get(String(sid)));
                    subjectInserts.push({ user_id: uid, subject_id: sid, granted_at, expires_at: exempt ? null : expires_at });
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
