import { supabase } from './supabaseClient';

// ============================================================
// 🎓 Course-owner resolver for subscription_requests
// ============================================================
// A request's `teacher_id` is the teacher the request is filed/billed
// under (could be a team leader selling a package that contains courses
// belonging to other teachers). This helper looks INSIDE `requested_data`
// to find which teacher(s) actually own the requested content, so admin
// screens can show that as separate info without touching how requests
// are owned/filtered by teacher_id.
//
// ⚠️ Package items are the one exception: a package is treated as
// belonging to the team leader (the request's own `teacher_id`/`teachers`
// relation) as a whole, rather than resolving and listing the owner of
// every individual course bundled inside it.
// ============================================================

/**
 * @param {Array<Object>} requests - rows from subscription_requests (each with requested_data, teacher_id, teachers)
 * @returns {Promise<Array<Object>>} same rows with an added `course_owner_teachers` (array of names)
 */
export async function attachCourseOwnerTeachers(requests) {
  if (!requests || requests.length === 0) return requests || [];

  const subjectIds = new Set();
  const courseIds = new Set();

  for (const r of requests) {
    for (const item of (r.requested_data || [])) {
      if (item.type === 'course' && item.id) {
        courseIds.add(item.id);
      } else if (item.type === 'subject' && item.id) {
        subjectIds.add(item.id);
      }
      // 'package' items are intentionally skipped here — they're
      // attributed to the leader below, not to each bundled course's owner.
    }
  }

  // 1. حل معرّف الكورس الأب لكل مادة (subject -> course_id)
  const subjectToCourse = new Map();
  if (subjectIds.size > 0) {
    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('id, course_id')
      .in('id', Array.from(subjectIds));

    for (const s of (subjectsData || [])) {
      subjectToCourse.set(s.id, s.course_id);
      if (s.course_id) courseIds.add(s.course_id);
    }
  }

  // 2. جلب المدرس صاحب كل كورس
  const courseToTeacher = new Map();
  if (courseIds.size > 0) {
    const { data: coursesData } = await supabase
      .from('courses')
      .select('id, teacher_id, teachers ( id, name )')
      .in('id', Array.from(courseIds));

    for (const c of (coursesData || [])) {
      if (c.teachers) {
        courseToTeacher.set(c.id, { id: c.teachers.id, name: c.teachers.name });
      }
    }
  }

  // 2.5 جلب اسم قائد الفريق (leader) للطلبات التي تحتوي باقة، فقط إن لم يكن
  // اسمه موجوداً بالفعل ضمن r.teachers (بعض الـ endpoints لا تعمل join لها)
  const leaderIdsNeeded = new Set();
  for (const r of requests) {
    const hasPackageItem = (r.requested_data || []).some(item => item.type === 'package');
    if (hasPackageItem && !r.teachers?.name && r.teacher_id) {
      leaderIdsNeeded.add(r.teacher_id);
    }
  }

  const leaderIdToName = new Map();
  if (leaderIdsNeeded.size > 0) {
    const { data: leadersData } = await supabase
      .from('teachers')
      .select('id, name')
      .in('id', Array.from(leaderIdsNeeded));

    for (const t of (leadersData || [])) {
      leaderIdToName.set(t.id, t.name);
    }
  }

  // 3. إسقاط النتيجة على كل طلب
  return requests.map(r => {
    const owners = new Map(); // teacherId -> name
    const hasPackageItem = (r.requested_data || []).some(item => item.type === 'package');

    if (hasPackageItem) {
      // 🎯 الباقة تُنسب بالكامل لقائد الفريق صاحب الطلب، دون الدخول في
      // تفاصيل ملكية كل كورس داخلها
      const leaderName = r.teachers?.name || leaderIdToName.get(r.teacher_id) || null;
      if (leaderName) owners.set(r.teacher_id, leaderName);
    } else {
      for (const item of (r.requested_data || [])) {
        if (item.type === 'course' && item.id) {
          const t = courseToTeacher.get(item.id);
          if (t) owners.set(t.id, t.name);
        } else if (item.type === 'subject' && item.id) {
          const parentCourseId = subjectToCourse.get(item.id);
          const t = parentCourseId ? courseToTeacher.get(parentCourseId) : null;
          if (t) owners.set(t.id, t.name);
        }
      }
    }

    return { ...r, course_owner_teachers: Array.from(owners.values()) };
  });
}
