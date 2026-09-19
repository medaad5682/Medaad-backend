// pages/api/dashboard/super/courses.js
// ============================================================
// 🗂️ Superadmin: Courses management (Step 8)
// ============================================================
// GET (no query)            -> lists every course (all teachers) with its
//         subjects, the teacher's name, and the two policy fields set by
//         the superadmin:
//           - scheduled_deletion_at (Feature A)
//           - access_duration_days (course + per-subject override, Feature B)
//         NOTE: this list intentionally does NOT include active-student
//         counts anymore — computing that for every course/subject on
//         every page load doesn't scale once there are many teachers and
//         courses. Student counts are fetched on demand instead (see below).
//
// GET ?countType=course|subject&countId=<id>
//         -> lightweight, single-target lookup: returns just
//         { active_students } for that one course or subject. The
//         dashboard calls this only when the superadmin opens the
//         "⏳ المدة" (access duration) modal for that specific item.
//
// POST -> two actions:
//   { action: 'set_scheduled_deletion', courseId, scheduledDeletionAt }
//     scheduledDeletionAt: ISO string (future) to (re)schedule, or null to cancel.
//     Does NOT delete anything itself — pages/api/cron/scheduled-course-deletion.js
//     picks it up and calls deepDeleteCourse() once the date arrives.
//
//   { action: 'set_access_duration', courseId, subjectId, durationDays, applyToExisting }
//     subjectId null/undefined -> sets the course-level default.
//     subjectId present -> sets that subject's override only.
//     durationDays: positive integer (days), or null for "lifetime".
//     By default this only affects *future* grants — lib/accessExpiryHelper.js
//     resolves it at grant time and existing students' expires_at is untouched.
//     applyToExisting: true -> opt-in — also recalculates expires_at for every
//     student who already has access to this course/subject, based on each
//     student's own granted_at + the new durationDays (see
//     lib/accessExpiryHelper.js -> recalculateExistingAccess).
//     When this is a COURSE-level change (subjectId omitted), it also
//     cascades to that course's subjects that have NO access_duration_days
//     override of their own (they inherit the course policy) — their
//     existing students are recalculated too. Subjects with their own
//     explicit duration are left untouched; they're managed independently.
//
//   { action: 'set_report_price', courseId, subjectId, price }
//     subjectId null/undefined -> sets the course-level report_price.
//     subjectId present -> sets that subject's override only.
//     price: a number >= 0, or null to clear (falls back to inherited value —
//     subject falls back to its course, course falls back to "unpriced").
//     Used only by teachers whose billing_method = 'course_price' (see
//     lib/teacherBillingHelper.js) — it never touches access/expiry, so
//     unlike set_access_duration there's no "apply to existing" concept:
//     it simply changes what future report calculations use.
// ============================================================

import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { buildActiveAccessFilter, recalculateExistingAccess } from '../../../../lib/accessExpiryHelper';

export default async function handler(req, res) {
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return;

  if (req.method === 'GET') {
    if (req.query.countType && req.query.countId) {
      return handleGetActiveCount(req, res);
    }
    return handleGet(req, res);
  }
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// GET — full listing (cheap: no per-item student counts)
// ============================================================
async function handleGet(req, res) {
  try {
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, teacher_id, scheduled_deletion_at, access_duration_days, report_price')
      .order('id', { ascending: false });
    if (coursesError) throw coursesError;

    const courseIds = (courses || []).map(c => c.id);

    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('id, title, course_id, access_duration_days, report_price')
      .in('course_id', courseIds.length ? courseIds : [-1]);
    if (subjectsError) throw subjectsError;

    const teacherIds = [...new Set((courses || []).map(c => c.teacher_id).filter(Boolean))];
    const { data: teachers } = teacherIds.length
      ? await supabase.from('teachers').select('id, name').in('id', teacherIds)
      : { data: [] };
    const teacherNameById = new Map((teachers || []).map(t => [t.id, t.name]));

    const structured = (courses || []).map(course => {
      const courseSubjects = (subjects || [])
        .filter(s => s.course_id === course.id)
        .map(s => ({
          id: s.id,
          title: s.title,
          access_duration_days: s.access_duration_days,
          report_price: s.report_price,
        }));

      return {
        id: course.id,
        title: course.title,
        teacher_id: course.teacher_id,
        teacher_name: teacherNameById.get(course.teacher_id) || '—',
        scheduled_deletion_at: course.scheduled_deletion_at,
        access_duration_days: course.access_duration_days,
        report_price: course.report_price,
        subjects: courseSubjects,
      };
    });

    return res.status(200).json({ courses: structured });
  } catch (error) {
    console.error('❌ [dashboard/super/courses][GET]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================================
// GET — on-demand active-student count for ONE course or subject.
// Called only when the superadmin opens the duration modal for that
// specific item, instead of computing it for everything up front.
// ============================================================
async function handleGetActiveCount(req, res) {
  try {
    const { countType, countId } = req.query;
    if (!['course', 'subject'].includes(countType) || !countId) {
      return res.status(400).json({ error: 'معطيات غير صالحة' });
    }

    const table = countType === 'subject' ? 'user_subject_access' : 'user_course_access';
    const column = countType === 'subject' ? 'subject_id' : 'course_id';

    // ⚡ عدّ مباشر داخل Postgres بدل تنزيل كل صفوف الكورس/المادة إلى الذاكرة
    // لفلترة الصلاحيات المنتهية في JS — أهم لكورس/مادة شائعة بآلاف المشتركين.
    const { count, error } = await supabase
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq(column, countId)
      .or(buildActiveAccessFilter());
    if (error) throw error;

    return res.status(200).json({ active_students: count || 0 });
  } catch (error) {
    console.error('❌ [dashboard/super/courses][GET count]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================================
// POST — policy actions
// ============================================================
async function handlePost(req, res) {
  const { action } = req.body || {};

  try {
    if (action === 'set_scheduled_deletion') {
      return await setScheduledDeletion(req, res);
    }
    if (action === 'set_access_duration') {
      return await setAccessDuration(req, res);
    }
    if (action === 'set_report_price') {
      return await setReportPrice(req, res);
    }
    return res.status(400).json({ error: 'إجراء غير معروف (action)' });
  } catch (error) {
    console.error('❌ [dashboard/super/courses][POST]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function setScheduledDeletion(req, res) {
  const { courseId, scheduledDeletionAt } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId مطلوب' });

  let value = null;
  if (scheduledDeletionAt) {
    const parsed = new Date(scheduledDeletionAt);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'تاريخ غير صالح' });
    }
    if (parsed.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'يجب أن يكون تاريخ الحذف في المستقبل' });
    }
    value = parsed.toISOString();
  }

  const { data, error } = await supabase
    .from('courses')
    .update({ scheduled_deletion_at: value })
    .eq('id', courseId)
    .select('id, title, scheduled_deletion_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'الكورس غير موجود' });

  let message = value ? `تم جدولة حذف "${data.title}" بتاريخ ${value}` : `تم إلغاء جدولة حذف "${data.title}"`;

  // 📦 تحذير غير مانع: هذا الكورس ضمن باقة/باقات — سيؤدي حذفه لاحقاً (تلقائياً
  // عبر الـ cron) لإزالته منها، وقد يُفرغها تماماً فتُؤرشف تلقائياً حينها.
  // نُعلم السوبر أدمن الآن فقط، عند الجدولة نفسها — لا أحد سيرى تنبيهاً وقت
  // التنفيذ الفعلي لأنه غير مراقب.
  if (value) {
    const { data: pkgItems, error: pkgError } = await supabase
      .from('course_package_items')
      .select('course_packages(title)')
      .eq('course_id', courseId);
    if (!pkgError && pkgItems && pkgItems.length > 0) {
      const titles = pkgItems.map(i => i.course_packages?.title).filter(Boolean).join('، ');
      message += ` ⚠️ تنبيه: هذا الكورس ضمن باقة/باقات (${titles}) — سيُزال منها عند الحذف الفعلي، وقد تُؤرشف الباقة تلقائياً إن أصبحت بلا كورسات.`;
    }
  }

  return res.status(200).json({
    success: true,
    message,
    course: data,
  });
}

async function setAccessDuration(req, res) {
  const { courseId, subjectId, durationDays, applyToExisting } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId مطلوب' });

  let value = null;
  if (durationDays !== null && durationDays !== undefined && durationDays !== '') {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ error: 'عدد الأيام يجب أن يكون رقماً موجباً' });
    }
    value = Math.round(days);
  }

  const table = subjectId ? 'subjects' : 'courses';
  const targetId = subjectId || courseId;

  // Sanity check: a subject override must actually belong to the given course.
  if (subjectId) {
    const { data: subjectRow } = await supabase
      .from('subjects')
      .select('id, course_id')
      .eq('id', subjectId)
      .maybeSingle();
    if (!subjectRow || subjectRow.course_id !== Number(courseId)) {
      return res.status(400).json({ error: 'المادة لا تنتمي لهذا الكورس' });
    }
  }

  const { data, error } = await supabase
    .from(table)
    .update({ access_duration_days: value })
    .eq('id', targetId)
    .select('id, title, access_duration_days')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'غير موجود' });

  // By default this only changes the policy used for FUTURE grants.
  // If the superadmin explicitly opted in, also recalculate expires_at
  // for every student who already has access to this course/subject.
  let recalcResult = null;
  let cascadedSubjectsCount = 0;
  if (applyToExisting) {
    recalcResult = await recalculateExistingAccess({
      courseId,
      subjectId: subjectId || null,
      durationDays: value,
    });

    // A course-level change also flows down to that course's subjects —
    // but ONLY the ones with no access_duration_days override of their
    // own (they inherit the course policy). A subject with its own
    // explicit period is left alone; it's managed independently.
    if (!subjectId) {
      const { data: inheritingSubjects, error: subjError } = await supabase
        .from('subjects')
        .select('id')
        .eq('course_id', courseId)
        .is('access_duration_days', null);
      if (subjError) throw subjError;

      let subjectsUpdatedStudents = 0;
      for (const subj of inheritingSubjects || []) {
        const subjResult = await recalculateExistingAccess({
          subjectId: subj.id,
          durationDays: value,
        });
        subjectsUpdatedStudents += subjResult.updated;
      }
      cascadedSubjectsCount = (inheritingSubjects || []).length;
      recalcResult.updated += subjectsUpdatedStudents;
    }
  }

  const scopeMsg = applyToExisting
    ? ` — وتمت إعادة حساب الفترة لِـ ${recalcResult.updated} طالب حالي${cascadedSubjectsCount ? ` (شاملة ${cascadedSubjectsCount} مادة تابعة بلا مدة خاصة بها)` : ''}`
    : ' (يسري على المنح الجديدة فقط)';

  return res.status(200).json({
    success: true,
    message: (value
      ? `تم ضبط مدة الوصول لـ "${data.title}" إلى ${value} يوم`
      : `تم ضبط "${data.title}" على وصول مدى الحياة`) + scopeMsg,
    item: data,
    recalculated: recalcResult ? recalcResult.updated : 0,
  });
}

// ============================================================
// POST — set the fixed report/commission price used by
// billing_method='course_price' (see lib/teacherBillingHelper.js).
// Same inheritance pattern as access_duration_days: a subject with no
// override of its own falls back to its parent course's price at
// calculation time — this endpoint just writes whichever level was asked
// for, no cascading writes needed.
// ============================================================
async function setReportPrice(req, res) {
  const { courseId, subjectId, price } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId مطلوب' });

  let value = null;
  if (price !== null && price !== undefined && price !== '') {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'السعر يجب أن يكون رقماً موجباً' });
    }
    value = amount;
  }

  const table = subjectId ? 'subjects' : 'courses';
  const targetId = subjectId || courseId;

  // Sanity check: a subject override must actually belong to the given course.
  if (subjectId) {
    const { data: subjectRow } = await supabase
      .from('subjects')
      .select('id, course_id')
      .eq('id', subjectId)
      .maybeSingle();
    if (!subjectRow || subjectRow.course_id !== Number(courseId)) {
      return res.status(400).json({ error: 'المادة لا تنتمي لهذا الكورس' });
    }
  }

  const { data, error } = await supabase
    .from(table)
    .update({ report_price: value })
    .eq('id', targetId)
    .select('id, title, report_price')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'غير موجود' });

  return res.status(200).json({
    success: true,
    message: value !== null
      ? `تم ضبط سعر التقرير لـ "${data.title}" إلى ${value}`
      : `تم إلغاء سعر التقرير الخاص بـ "${data.title}" (سيرث سعر الكورس الأب إن وُجد)`,
    item: data,
  });
}
