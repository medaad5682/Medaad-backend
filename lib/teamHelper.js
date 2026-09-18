import { supabase } from './supabaseClient';

// ============================================================
// 👥 Teacher-team helper (Feature: teams of teachers + shared packages)
// ============================================================
// NOT to be confused with the existing "فريق العمل" (moderators) feature
// in lib/teacherAuth.js / pages/api/*/teacher/team.js — that manages
// moderator accounts under ONE teacher. This file is about a team made
// of several TEACHER profiles (teachers.team_id -> teacher_teams.id),
// one of whom is the leader (teacher_teams.leader_teacher_id).
//
// Every consumer of this helper gets EXACTLY today's behaviour for a
// teacher with no team_id, or for a non-leader member: getTeacherTeamContext
// returns inTeam=false-equivalent shape (isLeader=false, empty course/subject
// lists) unless the caller explicitly needs "my team's stuff" regardless of
// leadership (see includeForMembers option) — so nothing regresses for the
// ~all of today's teachers who aren't in a team.
// ============================================================

const emptyContext = () => ({
  inTeam: false,
  isLeader: false,
  team: null,
  teamTeachers: [],
  teamTeacherIds: [],
  courses: [],
  courseIds: [],
  subjects: [],
  subjectIds: [],
});

/**
 * Resolve everything about a teacher's team in one place: whether they're
 * in a team, whether they're its leader, and (for the leader) every
 * course/subject owned by any teacher in the team.
 *
 * @param {number|string} teacherId - teachers.id of the acting teacher
 * @param {object} [options]
 * @param {boolean} [options.forMembersToo=false] - by default the
 *   course/subject/teammate lists are only populated for the LEADER (that's
 *   the only role with today's widened abilities). Pass true when a caller
 *   needs the team roster/courses regardless of who's asking (e.g. an
 *   internal check like "does this course belong to my team" for billing
 *   rollup) — isLeader still reflects the real role either way.
 * @returns {Promise<{
 *   inTeam: boolean,
 *   isLeader: boolean,
 *   team: {id:number, name:string, leader_teacher_id:number}|null,
 *   teamTeachers: Array<{id:number, name:string}>,
 *   teamTeacherIds: Array<number>,
 *   courses: Array<{id:number, title:string, teacher_id:number}>,
 *   courseIds: Array<number>,
 *   subjects: Array<{id:number, title:string, course_id:number}>,
 *   subjectIds: Array<number>,
 * }>}
 */
export async function getTeacherTeamContext(teacherId, options = {}) {
  if (!teacherId) return emptyContext();

  const { data: teacher, error: teacherError } = await supabase
    .from('teachers')
    .select('id, team_id')
    .eq('id', teacherId)
    .maybeSingle();

  if (teacherError || !teacher || !teacher.team_id) return emptyContext();

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .select('id, name, leader_teacher_id')
    .eq('id', teacher.team_id)
    .maybeSingle();

  if (teamError || !team) return emptyContext();

  const isLeader = String(team.leader_teacher_id) === String(teacherId);

  // Non-leaders get the "nothing regresses" shape unless the caller opted in.
  if (!isLeader && !options.forMembersToo) {
    return { ...emptyContext(), inTeam: true, isLeader: false, team };
  }

  const { data: teamTeachers } = await supabase
    .from('teachers')
    .select('id, name')
    .eq('team_id', team.id);

  const teamTeacherIds = (teamTeachers || []).map(t => t.id);

  const { data: teamCourses } = teamTeacherIds.length
    ? await supabase.from('courses').select('id, title, teacher_id, price, report_price').in('teacher_id', teamTeacherIds)
    : { data: [] };

  const teamCourseIds = (teamCourses || []).map(c => c.id);

  const { data: teamSubjects } = teamCourseIds.length
    ? await supabase.from('subjects').select('id, title, course_id, price').in('course_id', teamCourseIds)
    : { data: [] };

  return {
    inTeam: true,
    isLeader,
    team,
    teamTeachers: teamTeachers || [],
    teamTeacherIds,
    courses: teamCourses || [],
    courseIds: teamCourseIds,
    subjects: teamSubjects || [],
    subjectIds: (teamSubjects || []).map(s => s.id),
  };
}

/**
 * Billing rollup: given the teacher who is actually doing the granting/
 * approving, resolve which teacher_id a subscription_requests row should
 * be logged under.
 *
 * - Teacher not in a team, or is the team's leader -> their own id
 *   (unchanged behaviour).
 * - Non-leader member of a team -> the team's leader id, so every sale of
 *   a member's own course still rolls up into the leader's report.
 *
 * @param {number|string} actingTeacherId
 * @returns {Promise<number|string>} the teacher_id to log the sale under
 */
export async function resolveBillingTeacherId(actingTeacherId) {
  if (!actingTeacherId) return actingTeacherId;

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, team_id')
    .eq('id', actingTeacherId)
    .maybeSingle();

  if (!teacher || !teacher.team_id) return actingTeacherId;

  const { data: team } = await supabase
    .from('teacher_teams')
    .select('leader_teacher_id')
    .eq('id', teacher.team_id)
    .maybeSingle();

  if (!team || !team.leader_teacher_id) return actingTeacherId;

  return team.leader_teacher_id;
}

/**
 * Fetch the active, sellable packages for a team, each with its course
 * items (id/title/price/report_price) nested in `.courses`.
 * @param {number|string} teamId
 * @param {object} [opts]
 * @param {boolean} [opts.includeInactive=false]
 */
export async function getTeamPackages(teamId, opts = {}) {
  if (!teamId) return [];

  let query = supabase
    .from('course_packages')
    .select('id, team_id, title, report_price, price, is_active, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (!opts.includeInactive) query = query.eq('is_active', true);

  const { data: packages, error } = await query;
  if (error) throw error;
  if (!packages || packages.length === 0) return [];

  const packageIds = packages.map(p => p.id);
  const { data: items } = await supabase
    .from('course_package_items')
    .select('package_id, course_id, courses(id, title, price, report_price, teacher_id)')
    .in('package_id', packageIds);

  return packages.map(pkg => ({
    ...pkg,
    courses: (items || [])
      .filter(i => i.package_id === pkg.id)
      .map(i => i.courses)
      .filter(Boolean),
  }));
}

/**
 * Batch version of "is this teacher in a team, and are they its leader" —
 * used by pages/api/dashboard/super/finance.js to show a team/leader badge
 * next to each teacher in the report, in ONE round-trip instead of calling
 * getTeacherTeamContext() once per teacher.
 *
 * @param {Array<number|string>} teacherProfileIds - teachers.id values (the
 *   finance report's teacher_profile_id list)
 * @returns {Promise<Map<number|string, {teamId:number, teamName:string, isLeader:boolean}>>}
 *   Keyed by teacher id. A teacher with no team simply has no entry in the
 *   map (caller treats a missing key as "no team", same as today).
 */
export async function getTeamBadgesForTeachers(teacherProfileIds = []) {
  const uniqueIds = [...new Set((teacherProfileIds || []).filter(id => id !== null && id !== undefined))];
  const badgeById = new Map();
  if (uniqueIds.length === 0) return badgeById;

  const { data: teachers, error: teachersError } = await supabase
    .from('teachers')
    .select('id, team_id')
    .in('id', uniqueIds)
    .not('team_id', 'is', null);
  if (teachersError) throw teachersError;
  if (!teachers || teachers.length === 0) return badgeById;

  const teamIds = [...new Set(teachers.map(t => t.team_id))];
  const { data: teams, error: teamsError } = await supabase
    .from('teacher_teams')
    .select('id, name, leader_teacher_id')
    .in('id', teamIds);
  if (teamsError) throw teamsError;

  const teamById = new Map((teams || []).map(t => [t.id, t]));

  for (const teacher of teachers) {
    const team = teamById.get(teacher.team_id);
    if (!team) continue; // team_id points at a team that no longer exists — treat as no team
    badgeById.set(teacher.id, {
      teamId: team.id,
      teamName: team.name,
      isLeader: String(team.leader_teacher_id) === String(teacher.id),
    });
  }

  return badgeById;
}

export default {
  getTeacherTeamContext,
  resolveBillingTeacherId,
  getTeamPackages,
  getTeamBadgesForTeachers,
};
