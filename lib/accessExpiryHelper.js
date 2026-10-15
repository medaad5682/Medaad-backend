import { supabase } from './supabaseClient';



// ============================================================
// ⏳ Access-expiry helper (Feature B: per-student access duration)
// ============================================================
// Used by every backend endpoint that grants a student access to a
// course or a single subject (approve request, grant access, free
// enroll...). It resolves the duration that should apply to a NEW
// grant and turns it into a concrete expires_at timestamp.
//
// Precedence: subject-level override -> course-level default -> null
// (lifetime access, current behaviour, unchanged).
//
// IMPORTANT: resolveAccessDurationDays/buildGrantTimestamps must be called
// at GRANT time only — they must never be re-applied to existing rows.
// By default, a superadmin changing a course/subject's access_duration_days
// only affects *future* grants; existing students keep whatever expires_at
// they already had. The one deliberate exception is
// recalculateExistingAccess() below, which a superadmin can opt into from
// the courses dashboard to retroactively re-apply a new duration to
// students who already have access.
// ============================================================

/**
 * Resolve how many days of access a NEW grant should get.
 * @param {number|string} courseId
 * @param {number|string|null} subjectId - pass null/undefined for a course-wide grant
 * @returns {Promise<number|null>} duration in days, or null for lifetime access
 */
export async function resolveAccessDurationDays(courseId, subjectId = null) {
  try {
    if (subjectId) {
      const { data: subject } = await supabase
        .from('subjects')
        .select('access_duration_days, course_id')
        .eq('id', subjectId)
        .maybeSingle();

      if (subject && subject.access_duration_days !== null && subject.access_duration_days !== undefined) {
        return subject.access_duration_days;
      }

      // No subject-level override -> fall back to the subject's own parent course
      const effectiveCourseId = courseId || subject?.course_id;
      if (effectiveCourseId) {
        return await getCourseAccessDurationDays(effectiveCourseId);
      }
      return null;
    }

    if (courseId) {
      return await getCourseAccessDurationDays(courseId);
    }

    return null;
  } catch (e) {
    // Fail safe: never block a grant because of an expiry-lookup error.
    // Worst case a student gets lifetime access instead of a timed one,
    // which a superadmin can still correct manually.
    console.error('⚠️ [AccessExpiry] Failed to resolve access duration:', e.message);
    return null;
  }
}

async function getCourseAccessDurationDays(courseId) {
  const { data: course } = await supabase
    .from('courses')
    .select('access_duration_days')
    .eq('id', courseId)
    .maybeSingle();

  return course && course.access_duration_days !== null && course.access_duration_days !== undefined
    ? course.access_duration_days
    : null;
}

/**
 * Turn a duration (days) into a concrete ISO timestamp.
 * @param {number|null} durationDays
 * @param {string|Date|null} [fromDate] - base timestamp to add the duration to.
 *   Defaults to now. Pass a row's own granted_at when recalculating an
 *   EXISTING grant so the student keeps their original start date instead
 *   of the clock resetting to today.
 * @returns {string|null} ISO timestamp, or null for lifetime access
 */
export function computeExpiresAt(durationDays, fromDate = null) {
  if (durationDays === null || durationDays === undefined) return null;
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) return null;

  const base = fromDate ? new Date(fromDate).getTime() : Date.now();
  const expires = new Date(base + days * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

/**
 * Convenience: resolve + compute in one call, for grant sites that just
 * want a ready-to-insert { granted_at, expires_at } pair.
 * @param {number|string} courseId
 * @param {number|string|null} subjectId
 */
export async function buildGrantTimestamps(courseId, subjectId = null) {
  const durationDays = await resolveAccessDurationDays(courseId, subjectId);
  return {
    granted_at: new Date().toISOString(),
    expires_at: computeExpiresAt(durationDays),
  };
}

/**
 * Build a Supabase `.or()` filter string for "access is currently active":
 * expires_at is null (lifetime) OR expires_at is in the future.
 * Kept here so every read/enforce site applies the exact same rule.
 * Must be generated fresh at query time (bakes in the current timestamp).
 *
 * Usage: query.or(buildActiveAccessFilter())
 */
export function buildActiveAccessFilter() {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;
}

/**
 * True/false check for a single already-fetched access row.
 * @param {{ expires_at?: string|null }} row
 */
export function isAccessRowActive(row) {
  if (!row) return false;
  if (!row.expires_at) return true; // lifetime access
  return new Date(row.expires_at).getTime() > Date.now();
}

/**
 * Retroactively re-apply a NEW access-duration policy to EXISTING grants.
 * Opt-in only — called when the superadmin explicitly chooses "apply to
 * all students" instead of the default "new students only" behaviour.
 *
 * Each existing row's new expires_at is computed from ITS OWN granted_at
 * (not "now"), so a student who already used part of their access keeps
 * that starting point — only the total length of the period changes.
 * durationDays === null recalculates everyone to lifetime access.
 * Teacher/moderator rows are always skipped (never subject to expiry).
 *
 * @param {Object} params
 * @param {number|string} params.courseId
 * @param {number|string|null} [params.subjectId] - null/undefined = course-level table
 * @param {number|null} params.durationDays
 * @returns {Promise<{ updated: number }>}
 */
export async function recalculateExistingAccess({ courseId, subjectId = null, durationDays }) {
  const table = subjectId ? 'user_subject_access' : 'user_course_access';
  const column = subjectId ? 'subject_id' : 'course_id';
  const targetId = subjectId || courseId;
  if (!targetId) return { updated: 0 };

  const { data: rows, error: rowsError } = await supabase
    .from(table)
    .select('user_id, granted_at')
    .eq(column, targetId);
  if (rowsError) throw rowsError;
  if (!rows || rows.length === 0) return { updated: 0 };

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const { data: users, error: usersError } = userIds.length
    ? await supabase.from('users').select('id, role').in('id', userIds)
    : { data: [] };
  if (usersError) throw usersError;
  const roleByUser = new Map((users || []).map(u => [u.id, u.role]));

  const updates = rows
    .filter(r => r.user_id && !isExemptFromExpiry(roleByUser.get(r.user_id)))
    .map(r => ({
      user_id: r.user_id,
      [column]: targetId,
      granted_at: r.granted_at,
      expires_at: computeExpiresAt(durationDays, r.granted_at),
    }));

  if (updates.length === 0) return { updated: 0 };

  const { error: upsertError } = await supabase
    .from(table)
    .upsert(updates, { onConflict: `user_id,${column}` });
  if (upsertError) throw upsertError;

  return { updated: updates.length };
}

/**
 * Teachers and moderators must never be locked out by an access-expiry
 * timer meant for paying students — even if the course/subject they're
 * granted (e.g. to preview their own content, or a colleague's) has a
 * configured access_duration_days. Always treat these roles as lifetime.
 * @param {string|null|undefined} role
 */
export function isExemptFromExpiry(role) {
  return role === 'teacher' || role === 'moderator';
}
