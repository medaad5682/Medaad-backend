// pages/api/dashboard/super/teams.js
// ============================================================
// 👥 Superadmin: Teacher teams management (Feature: teacher teams + packages)
// ============================================================
// NOT the "فريق العمل" (moderators) feature in pages/api/*/teacher/team.js —
// this manages teams of TEACHER profiles (teachers.team_id -> teacher_teams),
// one of whom is the leader (teacher_teams.leader_teacher_id). See
// lib/teamHelper.js for the read-side helpers other endpoints use.
//
// GET  -> lists every team with its members and each member's billing
//         method, plus the list of teachers not currently in any team
//         (for the "add teacher" / "pick a leader" pickers on the page).
//
// POST -> action-based, same style as pages/api/dashboard/super/courses.js:
//   { action: 'create_team', name, leaderTeacherId }
//   { action: 'rename_team', teamId, name }
//   { action: 'delete_team', teamId, force }
//       force: true required if the team still has course_packages —
//       otherwise responds 409 with a count so the UI can confirm first.
//   { action: 'add_teacher', teamId, teacherId }
//   { action: 'remove_teacher', teamId, teacherId }
//       Blocked for the current leader — reassign the leader first.
//   { action: 'set_leader', teamId, teacherId }
//       teacherId must already be a member of the team. The new leader's
//       billing_method is switched to 'course_price' (per product decision:
//       a leader's report is always calculated with the course-price
//       method today).
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
// GET — every team + members, and the unassigned-teachers pool
// ============================================================
async function handleGet(req, res) {
  try {
    const { data: teams, error: teamsError } = await supabase
      .from('teacher_teams')
      .select('id, name, leader_teacher_id, created_at')
      .order('created_at', { ascending: false });
    if (teamsError) throw teamsError;

    const { data: allTeachers, error: teachersError } = await supabase
      .from('teachers')
      .select('id, name, team_id, billing_method')
      .order('name', { ascending: true });
    if (teachersError) throw teachersError;

    const teamIds = (teams || []).map(t => t.id);
    const { data: packages, error: packagesError } = teamIds.length
      ? await supabase.from('course_packages').select('id, team_id').in('team_id', teamIds)
      : { data: [] };
    if (packagesError) throw packagesError;

    const packagesCountByTeam = new Map();
    for (const p of packages || []) {
      packagesCountByTeam.set(p.team_id, (packagesCountByTeam.get(p.team_id) || 0) + 1);
    }

    const structured = (teams || []).map(team => {
      const members = (allTeachers || []).filter(t => t.team_id === team.id);
      const leader = members.find(t => String(t.id) === String(team.leader_teacher_id));
      return {
        id: team.id,
        name: team.name,
        created_at: team.created_at,
        leader_teacher_id: team.leader_teacher_id,
        leader_name: leader ? leader.name : null,
        members: members.map(m => ({ id: m.id, name: m.name, billing_method: m.billing_method })),
        packages_count: packagesCountByTeam.get(team.id) || 0,
      };
    });

    const unassignedTeachers = (allTeachers || [])
      .filter(t => !t.team_id)
      .map(t => ({ id: t.id, name: t.name }));

    return res.status(200).json({ teams: structured, unassignedTeachers });
  } catch (error) {
    console.error('❌ [dashboard/super/teams][GET]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================================
// POST — action dispatch
// ============================================================
async function handlePost(req, res) {
  const { action } = req.body || {};

  try {
    if (action === 'create_team') return await createTeam(req, res);
    if (action === 'rename_team') return await renameTeam(req, res);
    if (action === 'delete_team') return await deleteTeam(req, res);
    if (action === 'add_teacher') return await addTeacher(req, res);
    if (action === 'remove_teacher') return await removeTeacher(req, res);
    if (action === 'set_leader') return await setLeader(req, res);
    return res.status(400).json({ error: 'إجراء غير معروف (action)' });
  } catch (error) {
    console.error('❌ [dashboard/super/teams][POST]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function createTeam(req, res) {
  const { name, leaderTeacherId } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الفريق مطلوب' });
  if (!leaderTeacherId) return res.status(400).json({ error: 'يجب اختيار قائد للفريق' });

  const { data: leader, error: leaderError } = await supabase
    .from('teachers')
    .select('id, team_id')
    .eq('id', leaderTeacherId)
    .maybeSingle();
  if (leaderError) throw leaderError;
  if (!leader) return res.status(404).json({ error: 'المدرس المختار كقائد غير موجود' });
  if (leader.team_id) return res.status(400).json({ error: 'هذا المدرس منضم لفريق آخر بالفعل' });

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .insert({ name: name.trim(), leader_teacher_id: leaderTeacherId })
    .select('id, name, leader_teacher_id, created_at')
    .single();
  if (teamError) throw teamError;

  const { error: updateError } = await supabase
    .from('teachers')
    .update({ team_id: team.id, billing_method: 'course_price' })
    .eq('id', leaderTeacherId);

  if (updateError) {
    // تراجع: حذف الفريق في حال فشل ربط القائد به
    await supabase.from('teacher_teams').delete().eq('id', team.id);
    throw updateError;
  }

  return res.status(200).json({ success: true, team });
}

async function renameTeam(req, res) {
  const { teamId, name } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId مطلوب' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الفريق مطلوب' });

  const { data, error } = await supabase
    .from('teacher_teams')
    .update({ name: name.trim() })
    .eq('id', teamId)
    .select('id, name')
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'الفريق غير موجود' });

  return res.status(200).json({ success: true, team: data });
}

async function deleteTeam(req, res) {
  const { teamId, force } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId مطلوب' });

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!team) return res.status(404).json({ error: 'الفريق غير موجود' });

  const { count: packagesCount, error: countError } = await supabase
    .from('course_packages')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (countError) throw countError;

  if (packagesCount > 0 && !force) {
    return res.status(409).json({
      error: `هذا الفريق لديه ${packagesCount} باقة/باقات. سيتم حذفها أيضاً عند تأكيد الحذف.`,
      requiresConfirm: true,
      packagesCount,
    });
  }

  // teachers.team_id -> ON DELETE SET NULL, course_packages.team_id -> ON DELETE CASCADE,
  // both handled automatically by the DB once the team row is gone.
  const { error: deleteError } = await supabase.from('teacher_teams').delete().eq('id', teamId);
  if (deleteError) throw deleteError;

  return res.status(200).json({ success: true, message: `تم حذف فريق "${team.name}"` });
}

async function addTeacher(req, res) {
  const { teamId, teacherId } = req.body || {};
  if (!teamId || !teacherId) return res.status(400).json({ error: 'teamId و teacherId مطلوبان' });

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .select('id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!team) return res.status(404).json({ error: 'الفريق غير موجود' });

  const { data: teacher, error: teacherError } = await supabase
    .from('teachers')
    .select('id, team_id')
    .eq('id', teacherId)
    .maybeSingle();
  if (teacherError) throw teacherError;
  if (!teacher) return res.status(404).json({ error: 'المدرس غير موجود' });
  if (teacher.team_id) return res.status(400).json({ error: 'هذا المدرس منضم لفريق آخر بالفعل' });

  const { error: updateError } = await supabase
    .from('teachers')
    .update({ team_id: teamId })
    .eq('id', teacherId);
  if (updateError) throw updateError;

  return res.status(200).json({ success: true });
}

async function removeTeacher(req, res) {
  const { teamId, teacherId } = req.body || {};
  if (!teamId || !teacherId) return res.status(400).json({ error: 'teamId و teacherId مطلوبان' });

  const { data: team, error: teamError } = await supabase
    .from('teacher_teams')
    .select('id, leader_teacher_id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!team) return res.status(404).json({ error: 'الفريق غير موجود' });

  if (String(team.leader_teacher_id) === String(teacherId)) {
    return res.status(400).json({ error: 'لا يمكن إزالة قائد الفريق. يجب تعيين قائد آخر أولاً.' });
  }

  const { error: updateError } = await supabase
    .from('teachers')
    .update({ team_id: null })
    .eq('id', teacherId)
    .eq('team_id', teamId);
  if (updateError) throw updateError;

  return res.status(200).json({ success: true });
}

async function setLeader(req, res) {
  const { teamId, teacherId } = req.body || {};
  if (!teamId || !teacherId) return res.status(400).json({ error: 'teamId و teacherId مطلوبان' });

  const { data: teacher, error: teacherError } = await supabase
    .from('teachers')
    .select('id, team_id')
    .eq('id', teacherId)
    .maybeSingle();
  if (teacherError) throw teacherError;
  if (!teacher) return res.status(404).json({ error: 'المدرس غير موجود' });
  if (String(teacher.team_id) !== String(teamId)) {
    return res.status(400).json({ error: 'يجب أن يكون المدرس عضواً في الفريق أولاً' });
  }

  const { data: team, error: updateTeamError } = await supabase
    .from('teacher_teams')
    .update({ leader_teacher_id: teacherId })
    .eq('id', teamId)
    .select('id, name, leader_teacher_id')
    .maybeSingle();
  if (updateTeamError) throw updateTeamError;
  if (!team) return res.status(404).json({ error: 'الفريق غير موجود' });

  // القائد الجديد يُحسب دائماً بطريقة "سعر الكورس" حالياً (قرار المنتج).
  const { error: billingError } = await supabase
    .from('teachers')
    .update({ billing_method: 'course_price' })
    .eq('id', teacherId);
  if (billingError) throw billingError;

  return res.status(200).json({ success: true, team });
}
