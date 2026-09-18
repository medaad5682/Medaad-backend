import { supabase } from './supabaseClient';
import { buildGrantTimestamps, isExemptFromExpiry } from './accessExpiryHelper';

// ============================================================
// 📦 Package-grant helper (Feature: teacher teams + course packages)
// ============================================================
// Used by pages/api/dashboard/teacher/students.js when a team leader
// activates one or more packages for one or more students. Kept separate
// from the plain course/subject grant code already in students.js (which
// is left as-is) because the partial-ownership discount rule below only
// makes sense for packages.
//
// Partial-ownership rule (per product decision):
//   - If the student owns NONE of the package's courses: grant all of
//     them, log the package's full report_price.
//   - If the student owns SOME of the package's courses: grant only the
//     missing ones, and log report_price = package.report_price - sum of
//     the report_price of the courses they already owned.
//   - If the student owns ALL of the package's courses: do nothing at all
//     for that (student, package) pair - no log, no grant, no charge.
// The applied report_price is snapshotted onto the logged request's
// requested_data item, so a later change to the package's report_price
// never rewrites history (teacherBillingHelper reads this snapshot first,
// falling back to the live price only for older/unsnapshotted rows).
// ============================================================

/**
 * @param {Object} params
 * @param {Array<number|string>} params.targetIds - user ids to activate the packages for
 * @param {Array<{id:number, title:string, report_price:number, price:number|null, courses:Array<{id:number, title:string, price:number, report_price:number|null}>}>} params.packages
 * @param {number|string} params.billingTeacherId - teacher_id the sale is logged under (the team leader)
 * @param {Array<{id:number|string, username:string, first_name:string, phone:string, role:string}>} params.usersData
 * @returns {Promise<{ requestsInserted: number, coursesGranted: number, alreadyOwnedCount: number }>}
 */
export async function grantPackagesToUsers({ targetIds = [], packages = [], billingTeacherId, usersData = [] }) {
  const result = { requestsInserted: 0, coursesGranted: 0, alreadyOwnedCount: 0 };
  if (!targetIds.length || !packages.length || !billingTeacherId) return result;

  const allCourseIds = [...new Set(packages.flatMap(p => (p.courses || []).map(c => c.id)))];
  if (allCourseIds.length === 0) return result;

  // One query for existing ownership across every target user x every
  // package course, instead of one query per (user, package) pair.
  const { data: existingRows } = await supabase
    .from('user_course_access')
    .select('user_id, course_id')
    .in('user_id', targetIds)
    .in('course_id', allCourseIds);

  const ownedSet = new Set((existingRows || []).map(r => `${r.user_id}-${r.course_id}`));

  const reqInserts = [];
  // course_id -> array of user_ids that still need to be granted that course
  const pendingCourseGrants = new Map();

  for (const uid of targetIds) {
    const user = usersData.find(u => String(u.id) === String(uid));
    if (!user) continue;

    for (const pkg of packages) {
      const pkgCourses = pkg.courses || [];
      if (pkgCourses.length === 0) continue;

      const ownedCourses = pkgCourses.filter(c => ownedSet.has(`${uid}-${c.id}`));
      const missingCourses = pkgCourses.filter(c => !ownedSet.has(`${uid}-${c.id}`));

      if (missingCourses.length === 0) {
        result.alreadyOwnedCount += 1;
        continue; // already owns the whole package - nothing to log or grant
      }

      const ownedReportPriceSum = ownedCourses.reduce((sum, c) => sum + (Number(c.report_price) || 0), 0);
      const appliedReportPrice = Math.max(0, (Number(pkg.report_price) || 0) - ownedReportPriceSum);

      const sellingPrice = (pkg.price !== null && pkg.price !== undefined)
        ? Number(pkg.price)
        : pkgCourses.reduce((sum, c) => sum + (Number(c.price) || 0), 0);

      reqInserts.push({
        user_id: uid,
        teacher_id: billingTeacherId,
        status: 'approved',
        total_price: sellingPrice,
        user_name: user.first_name,
        user_username: user.username,
        phone: user.phone,
        course_title: `باقة: ${pkg.title}`,
        requested_data: [{
          type: 'package',
          id: pkg.id,
          title: pkg.title,
          price: sellingPrice,
          report_price: appliedReportPrice,
          full_report_price: Number(pkg.report_price) || 0,
          courses: pkgCourses.map(c => ({ id: c.id, title: c.title })),
        }],
        user_note: 'تم تفعيل باقة يدوياً من قائمة الطلاب',
      });

      for (const c of missingCourses) {
        if (!pendingCourseGrants.has(c.id)) pendingCourseGrants.set(c.id, []);
        pendingCourseGrants.get(c.id).push({ userId: uid, role: user.role });
      }
    }
  }

  // Resolve access-duration timestamps once PER COURSE (not per user).
  const cInserts = [];
  for (const [courseId, grantees] of pendingCourseGrants.entries()) {
    const { granted_at, expires_at } = await buildGrantTimestamps(courseId, null);
    for (const { userId, role } of grantees) {
      cInserts.push({
        user_id: userId,
        course_id: courseId,
        granted_at,
        expires_at: isExemptFromExpiry(role) ? null : expires_at,
      });
    }
  }

  if (reqInserts.length > 0) {
    const { error: reqError } = await supabase.from('subscription_requests').insert(reqInserts);
    if (reqError) throw reqError;
    result.requestsInserted = reqInserts.length;
  }

  if (cInserts.length > 0) {
    const { error: cError } = await supabase
      .from('user_course_access')
      .upsert(cInserts, { onConflict: 'user_id, course_id' });
    if (cError) throw cError;
    result.coursesGranted = cInserts.length;
  }

  return result;
}
