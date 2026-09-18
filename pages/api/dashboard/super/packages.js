// pages/api/dashboard/super/packages.js
// ============================================================
// 📦 Superadmin: Course packages management (Feature: teacher teams + packages)
// ============================================================
// A package belongs to exactly one teacher_team and bundles a set of
// courses. `report_price` is the fixed platform-fee charged for the WHOLE
// package when a leader activates it (see lib/grantHelper.js) — never a
// sum of the member courses' own report_price. `price` is an optional
// selling price shown to students; when omitted, callers should treat it
// as the sum of the package's courses' `price` (the API here still
// persists null so that default keeps tracking the courses live).
//
// GET  ?teamId=<id>  -> packages for one team (with nested courses)
// GET  (no query)    -> every package, grouped implicitly by team_id,
//                       with nested courses — used by the "all packages"
//                       tab.
//
// POST -> action-based, same style as super/courses.js and super/teams.js:
//   { action: 'create_package', teamId, title, report_price, price, courseIds }
//   { action: 'update_package', packageId, title, report_price, price, courseIds }
//       courseIds fully REPLACES the package's current course list.
//   { action: 'set_active', packageId, is_active }
//       Archive/unarchive — the safe way to retire a package that's
//       already been sold, instead of deleting it.
//   { action: 'delete_package', packageId, force }
//       force: true required if the package already appears in at least
//       one subscription_requests row — otherwise responds 409 and
//       suggests archiving instead. course_package_items cascade-delete
//       automatically once the package row is gone.
//
// Every course in courseIds must belong to a teacher who is currently a
// member of the package's own team — enforced here (not at the DB level)
// so we can give a friendly Arabic error instead of a raw failure.
// ============================================================

import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';

export default async function handler(req, res) {
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// GET — packages (optionally scoped to one team) with nested courses
// ============================================================
async function handleGet(req, res) {
  try {
    const { teamId } = req.query;

    let query = supabase
      .from('course_packages')
      .select('id, team_id, title, report_price, price, is_active, created_at')
      .order('created_at', { ascending: false });
    if (teamId) query = query.eq('team_id', teamId);

    const { data: packages, error: packagesError } = await query;
    if (packagesError) throw packagesError;

    const packageIds = (packages || []).map(p => p.id);
    const { data: items, error: itemsError } = packageIds.length
      ? await supabase
          .from('course_package_items')
          .select('package_id, course_id, courses(id, title, teacher_id, price, report_price)')
          .in('package_id', packageIds)
      : { data: [] };
    if (itemsError) throw itemsError;

    const teacherIds = [...new Set((items || []).map(i => i.courses?.teacher_id).filter(Boolean))];
    const { data: teachers } = teacherIds.length
      ? await supabase.from('teachers').select('id, name').in('id', teacherIds)
      : { data: [] };
    const teacherNameById = new Map((teachers || []).map(t => [t.id, t.name]));

    const structured = (packages || []).map(pkg => ({
      ...pkg,
      courses: (items || [])
        .filter(i => i.package_id === pkg.id)
        .map(i => i.courses)
        .filter(Boolean)
        .map(c => ({ ...c, teacher_name: teacherNameById.get(c.teacher_id) || '—' })),
    }));

    // عند تحديد فريق، نُرجع أيضاً كل كورسات مدرسي هذا الفريق — تُستخدم في
    // نافذة إنشاء/تعديل الباقة لملء قائمة اختيار الكورسات (وليست مقصورة
    // على الكورسات الموجودة بالفعل داخل باقة).
    let availableCourses = [];
    if (teamId) {
      const { data: teamTeachers, error: teamTeachersError } = await supabase
        .from('teachers')
        .select('id, name')
        .eq('team_id', teamId);
      if (teamTeachersError) throw teamTeachersError;

      const teamTeacherIds = (teamTeachers || []).map(t => t.id);
      const teamTeacherNameById = new Map((teamTeachers || []).map(t => [t.id, t.name]));

      const { data: teamCourses, error: teamCoursesError } = teamTeacherIds.length
        ? await supabase
            .from('courses')
            .select('id, title, teacher_id, price, report_price')
            .in('teacher_id', teamTeacherIds)
            .order('title', { ascending: true })
        : { data: [] };
      if (teamCoursesError) throw teamCoursesError;

      availableCourses = (teamCourses || []).map(c => ({
        ...c,
        teacher_name: teamTeacherNameById.get(c.teacher_id) || '—',
      }));
    }

    return res.status(200).json({ packages: structured, availableCourses });
  } catch (error) {
    console.error('❌ [dashboard/super/packages][GET]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================================
// POST — action dispatch
// ============================================================
async function handlePost(req, res) {
  const { action } = req.body || {};

  try {
    if (action === 'create_package') return await createPackage(req, res);
    if (action === 'update_package') return await updatePackage(req, res);
    if (action === 'set_active') return await setActive(req, res);
    if (action === 'delete_package') return await deletePackage(req, res);
    return res.status(400).json({ error: 'إجراء غير معروف (action)' });
  } catch (error) {
    console.error('❌ [dashboard/super/packages][POST]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// --- شروط عامة على المدخلات (title / report_price / price / courseIds) ---
function validatePackageFields(body) {
  const title = (body.title || '').trim();
  if (!title) return { error: 'عنوان الباقة مطلوب' };

  const reportPriceRaw = body.report_price;
  const reportPrice = Number(reportPriceRaw);
  if (reportPriceRaw === undefined || reportPriceRaw === null || reportPriceRaw === '' || !Number.isFinite(reportPrice) || reportPrice < 0) {
    return { error: 'سعر التقرير (report_price) يجب أن يكون رقماً موجباً' };
  }

  let price = null;
  if (body.price !== undefined && body.price !== null && body.price !== '') {
    const parsedPrice = Number(body.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return { error: 'سعر البيع يجب أن يكون رقماً موجباً' };
    }
    price = parsedPrice;
  }

  const courseIds = Array.isArray(body.courseIds) ? [...new Set(body.courseIds)] : [];
  if (courseIds.length === 0) {
    return { error: 'يجب اختيار كورس واحد على الأقل للباقة' };
  }

  return { title, report_price: reportPrice, price, courseIds };
}

// --- كل كورس في courseIds يجب أن يتبع مدرساً عضواً في نفس فريق الباقة ---
async function assertCoursesBelongToTeam(teamId, courseIds) {
  const { data: teamTeachers, error: teachersError } = await supabase
    .from('teachers')
    .select('id')
    .eq('team_id', teamId);
  if (teachersError) throw teachersError;

  const teamTeacherIds = new Set((teamTeachers || []).map(t => t.id));

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, title, teacher_id')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  if (!courses || courses.length !== courseIds.length) {
    return { error: 'أحد الكورسات المختارة غير موجود' };
  }

  const outsiders = courses.filter(c => !teamTeacherIds.has(c.teacher_id));
  if (outsiders.length > 0) {
    return { error: `الكورسات التالية لا تتبع مدرسين من هذا الفريق: ${outsiders.map(c => c.title).join('، ')}` };
  }

  return { courses };
}

async function createPackage(req, res) {
  const { teamId } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId مطلوب' });

  const fields = validatePackageFields(req.body);
  if (fields.error) return res.status(400).json({ error: fields.error });

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .select('id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!team) return res.status(404).json({ error: 'الفريق غير موجود' });

  const ownership = await assertCoursesBelongToTeam(teamId, fields.courseIds);
  if (ownership.error) return res.status(400).json({ error: ownership.error });

  const { data: pkg, error: pkgError } = await supabase
    .from('course_packages')
    .insert({ team_id: teamId, title: fields.title, report_price: fields.report_price, price: fields.price })
    .select('id, team_id, title, report_price, price, is_active, created_at')
    .single();
  if (pkgError) throw pkgError;

  const { error: itemsError } = await supabase
    .from('course_package_items')
    .insert(fields.courseIds.map(courseId => ({ package_id: pkg.id, course_id: courseId })));

  if (itemsError) {
    // تراجع: حذف الباقة في حال فشل ربط الكورسات بها
    await supabase.from('course_packages').delete().eq('id', pkg.id);
    throw itemsError;
  }

  return res.status(200).json({ success: true, package: pkg });
}

async function updatePackage(req, res) {
  const { packageId } = req.body || {};
  if (!packageId) return res.status(400).json({ error: 'packageId مطلوب' });

  const fields = validatePackageFields(req.body);
  if (fields.error) return res.status(400).json({ error: fields.error });

  const { data: existing, error: existingError } = await supabase
    .from('course_packages')
    .select('id, team_id')
    .eq('id', packageId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return res.status(404).json({ error: 'الباقة غير موجودة' });

  const ownership = await assertCoursesBelongToTeam(existing.team_id, fields.courseIds);
  if (ownership.error) return res.status(400).json({ error: ownership.error });

  const { data: pkg, error: pkgError } = await supabase
    .from('course_packages')
    .update({ title: fields.title, report_price: fields.report_price, price: fields.price })
    .eq('id', packageId)
    .select('id, team_id, title, report_price, price, is_active, created_at')
    .maybeSingle();
  if (pkgError) throw pkgError;

  // نستبدل قائمة الكورسات بالكامل: حذف القديم ثم إدراج الجديد
  const { error: deleteItemsError } = await supabase
    .from('course_package_items')
    .delete()
    .eq('package_id', packageId);
  if (deleteItemsError) throw deleteItemsError;

  const { error: insertItemsError } = await supabase
    .from('course_package_items')
    .insert(fields.courseIds.map(courseId => ({ package_id: packageId, course_id: courseId })));
  if (insertItemsError) throw insertItemsError;

  return res.status(200).json({ success: true, package: pkg });
}

async function setActive(req, res) {
  const { packageId, is_active } = req.body || {};
  if (!packageId) return res.status(400).json({ error: 'packageId مطلوب' });

  const { data, error } = await supabase
    .from('course_packages')
    .update({ is_active: !!is_active })
    .eq('id', packageId)
    .select('id, title, is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'الباقة غير موجودة' });

  return res.status(200).json({
    success: true,
    message: data.is_active ? `تم تفعيل باقة "${data.title}"` : `تم أرشفة باقة "${data.title}"`,
    package: data,
  });
}

async function deletePackage(req, res) {
  const { packageId, force } = req.body || {};
  if (!packageId) return res.status(400).json({ error: 'packageId مطلوب' });

  const { data: pkg, error: pkgError } = await supabase
    .from('course_packages')
    .select('id, title')
    .eq('id', packageId)
    .maybeSingle();
  if (pkgError) throw pkgError;
  if (!pkg) return res.status(404).json({ error: 'الباقة غير موجودة' });

  // هل سبق تفعيل هذه الباقة لطالب؟ (تظهر كعنصر type:'package' داخل requested_data)
  const { count: usageCount, error: usageError } = await supabase
    .from('subscription_requests')
    .select('id', { count: 'exact', head: true })
    .contains('requested_data', [{ type: 'package', id: packageId }]);
  if (usageError) throw usageError;

  if (usageCount > 0 && !force) {
    return res.status(409).json({
      error: `هذه الباقة مُفعّلة بالفعل في ${usageCount} طلب/طلبات سابقة. يُفضّل الأرشفة بدلاً من الحذف حفاظاً على سجل الطلبات.`,
      requiresConfirm: true,
      usageCount,
    });
  }

  // course_package_items -> ON DELETE CASCADE، يُحذف تلقائياً مع الباقة
  const { error: deleteError } = await supabase.from('course_packages').delete().eq('id', packageId);
  if (deleteError) throw deleteError;

  return res.status(200).json({ success: true, message: `تم حذف باقة "${pkg.title}"` });
}
