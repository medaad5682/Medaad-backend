import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';

// ─── SVG ICONS ─────────────────────────────────────────────────────────
const IconTeams = ({ size = 28, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>);
const IconPlus = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const IconTrash = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>);
const IconEdit = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"></path></svg>);
const IconCrown = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"></path><path d="M4 20l1.5-11L9 13l3-8 3 8 3.5-4L20 20"></path></svg>);
const IconX = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const IconCheck = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);
const IconWarning = ({ size = 24, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>);
const IconBox = ({ size = 18, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>);
const IconArchive = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>);
// ───────────────────────────────────────────────────────────────────────

export default function TeamsAndPackages() {
  const [tab, setTab] = useState('teams'); // 'teams' | 'packages'
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ show: false, text: '', type: 'success' });
  const showToast = (text, type = 'success') => {
    setToast({ show: true, text, type });
    setTimeout(() => setToast({ show: false, text: '', type: 'success' }), 3000);
  };

  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', action: null });
  const closeConfirm = () => setConfirmModal({ show: false, title: '', message: '', action: null });

  // ------- Teams state -------
  const [teams, setTeams] = useState([]);
  const [unassignedTeachers, setUnassignedTeachers] = useState([]);
  const [createTeamModal, setCreateTeamModal] = useState({ show: false, name: '', leaderTeacherId: '' });
  const [addTeacherPick, setAddTeacherPick] = useState({}); // teamId -> teacherId selected in the "add teacher" dropdown
  const [renameModal, setRenameModal] = useState({ show: false, teamId: null, name: '' });

  // ------- Packages state -------
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [packages, setPackages] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packageModal, setPackageModal] = useState(null);
  // packageModal shape: { mode: 'create'|'edit', packageId, title, report_price, price, courseIds: Set }

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/super/teams');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الفرق');
      setTeams(data.teams || []);
      setUnassignedTeachers(data.unassignedTeachers || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, []);

  const fetchPackages = useCallback(async (teamId) => {
    if (!teamId) { setPackages([]); setAvailableCourses([]); return; }
    setPackagesLoading(true);
    try {
      const res = await fetch(`/api/dashboard/super/packages?teamId=${teamId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الباقات');
      setPackages(data.packages || []);
      setAvailableCourses(data.availableCourses || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchTeams();
      setLoading(false);
    })();
  }, [fetchTeams]);

  useEffect(() => {
    if (tab === 'packages' && selectedTeamId) fetchPackages(selectedTeamId);
  }, [tab, selectedTeamId, fetchPackages]);

  // keep the packages-tab team selector pointed at a real team
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) setSelectedTeamId(String(teams[0].id));
  }, [teams, selectedTeamId]);

  // ============================================================
  // Teams actions
  // ============================================================
  const postTeams = async (payload) => {
    const res = await fetch('/api/dashboard/super/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'حدث خطأ'), { data, status: res.status });
    return data;
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    const { name, leaderTeacherId } = createTeamModal;
    if (!name.trim() || !leaderTeacherId) return showToast('الاسم وقائد الفريق مطلوبان', 'error');
    try {
      await postTeams({ action: 'create_team', name, leaderTeacherId });
      showToast('تم إنشاء الفريق بنجاح');
      setCreateTeamModal({ show: false, name: '', leaderTeacherId: '' });
      fetchTeams();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRenameTeam = async (e) => {
    e.preventDefault();
    try {
      await postTeams({ action: 'rename_team', teamId: renameModal.teamId, name: renameModal.name });
      showToast('تم تعديل اسم الفريق');
      setRenameModal({ show: false, teamId: null, name: '' });
      fetchTeams();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTeam = (team, force = false) => {
    setConfirmModal({
      show: true,
      title: 'حذف الفريق',
      message: force
        ? `سيتم حذف فريق "${team.name}" وكل باقاته نهائياً. هل أنت متأكد؟`
        : `هل أنت متأكد من حذف فريق "${team.name}"؟`,
      action: async () => {
        try {
          await postTeams({ action: 'delete_team', teamId: team.id, force });
          showToast('تم حذف الفريق');
          fetchTeams();
          closeConfirm();
        } catch (err) {
          closeConfirm();
          if (err.status === 409 && err.data?.requiresConfirm) {
            handleDeleteTeam(team, true);
          } else {
            showToast(err.message, 'error');
          }
        }
      },
    });
  };

  const handleAddTeacher = async (teamId) => {
    const teacherId = addTeacherPick[teamId];
    if (!teacherId) return showToast('اختر مدرساً أولاً', 'error');
    try {
      await postTeams({ action: 'add_teacher', teamId, teacherId });
      showToast('تمت إضافة المدرس للفريق');
      setAddTeacherPick(prev => ({ ...prev, [teamId]: '' }));
      fetchTeams();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveTeacher = (team, member) => {
    setConfirmModal({
      show: true,
      title: 'إزالة عضو',
      message: `هل تريد إزالة "${member.name}" من فريق "${team.name}"؟`,
      action: async () => {
        try {
          await postTeams({ action: 'remove_teacher', teamId: team.id, teacherId: member.id });
          showToast('تمت الإزالة');
          fetchTeams();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          closeConfirm();
        }
      },
    });
  };

  const handleSetLeader = (team, member) => {
    setConfirmModal({
      show: true,
      title: 'تعيين قائد جديد',
      message: `سيصبح "${member.name}" قائد فريق "${team.name}"، وستتحول طريقة حسابه المالية إلى "سعر الكورس". متابعة؟`,
      action: async () => {
        try {
          await postTeams({ action: 'set_leader', teamId: team.id, teacherId: member.id });
          showToast('تم تعيين القائد الجديد');
          fetchTeams();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          closeConfirm();
        }
      },
    });
  };

  // ============================================================
  // Packages actions
  // ============================================================
  const postPackages = async (payload) => {
    const res = await fetch('/api/dashboard/super/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'حدث خطأ'), { data, status: res.status });
    return data;
  };

  const openCreatePackage = () => {
    if (!selectedTeamId) return showToast('اختر فريقاً أولاً', 'error');
    setPackageModal({ mode: 'create', packageId: null, title: '', report_price: '', price: '', courseIds: new Set() });
  };

  const openEditPackage = (pkg) => {
    setPackageModal({
      mode: 'edit',
      packageId: pkg.id,
      title: pkg.title,
      report_price: String(pkg.report_price ?? ''),
      price: pkg.price === null || pkg.price === undefined ? '' : String(pkg.price),
      courseIds: new Set((pkg.courses || []).map(c => c.id)),
    });
  };

  const toggleCourseInModal = (courseId) => {
    setPackageModal(prev => {
      const next = new Set(prev.courseIds);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return { ...prev, courseIds: next };
    });
  };

  const submitPackageModal = async (e) => {
    e.preventDefault();
    const { mode, packageId, title, report_price, price, courseIds } = packageModal;
    if (courseIds.size === 0) return showToast('اختر كورساً واحداً على الأقل', 'error');

    const payload = {
      title,
      report_price: report_price === '' ? undefined : Number(report_price),
      price: price === '' ? null : Number(price),
      courseIds: [...courseIds],
    };

    try {
      if (mode === 'create') {
        await postPackages({ action: 'create_package', teamId: selectedTeamId, ...payload });
        showToast('تم إنشاء الباقة');
      } else {
        await postPackages({ action: 'update_package', packageId, ...payload });
        showToast('تم تعديل الباقة');
      }
      setPackageModal(null);
      fetchPackages(selectedTeamId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSetActive = async (pkg) => {
    try {
      await postPackages({ action: 'set_active', packageId: pkg.id, is_active: !pkg.is_active });
      showToast(pkg.is_active ? 'تمت أرشفة الباقة' : 'تم تفعيل الباقة');
      fetchPackages(selectedTeamId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePackage = (pkg, force = false) => {
    setConfirmModal({
      show: true,
      title: 'حذف الباقة',
      message: force
        ? `هذه الباقة مُفعّلة في طلبات سابقة. سيتم حذفها نهائياً. هل أنت متأكد؟`
        : `هل أنت متأكد من حذف باقة "${pkg.title}"؟`,
      action: async () => {
        try {
          await postPackages({ action: 'delete_package', packageId: pkg.id, force });
          showToast('تم حذف الباقة');
          fetchPackages(selectedTeamId);
          closeConfirm();
        } catch (err) {
          closeConfirm();
          if (err.status === 409 && err.data?.requiresConfirm) {
            handleDeletePackage(pkg, true);
          } else {
            showToast(err.message, 'error');
          }
        }
      },
    });
  };

  const money = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

  return (
    <SuperLayout>
      <Head><title>فرق المدرسين والباقات | الإدارة العليا</title></Head>

      <div className={`smart-toast ${toast.show ? 'show' : ''} ${toast.type}`}>
        <div className="toast-icon">{toast.type === 'success' ? <IconCheck size={20} /> : <IconWarning size={20} />}</div>
        <div className="toast-msg">{toast.text}</div>
      </div>

      <div className="page-wrapper">
        <div className="page-header">
          <h2 className="flex-center gap-2">
            <IconTeams size={30} style={{ color: 'var(--gold)' }} />
            فرق المدرسين والباقات
          </h2>
          <p>تجميع المدرسين في فرق لها قائد، وإنشاء باقات كورسات مشتركة يتم تفعيلها للطلاب دفعة واحدة.</p>
        </div>

        <div className="tabs-bar">
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>الفرق</button>
          <button className={tab === 'packages' ? 'active' : ''} onClick={() => setTab('packages')}>الباقات</button>
        </div>

        {loading ? (
          <div className="loading-state">جارِ التحميل...</div>
        ) : tab === 'teams' ? (
          <TeamsTab
            teams={teams}
            unassignedTeachers={unassignedTeachers}
            addTeacherPick={addTeacherPick}
            setAddTeacherPick={setAddTeacherPick}
            onCreateClick={() => setCreateTeamModal({ show: true, name: '', leaderTeacherId: '' })}
            onRenameClick={(team) => setRenameModal({ show: true, teamId: team.id, name: team.name })}
            onDelete={handleDeleteTeam}
            onAddTeacher={handleAddTeacher}
            onRemoveTeacher={handleRemoveTeacher}
            onSetLeader={handleSetLeader}
          />
        ) : (
          <PackagesTab
            teams={teams}
            selectedTeamId={selectedTeamId}
            setSelectedTeamId={setSelectedTeamId}
            packages={packages}
            packagesLoading={packagesLoading}
            money={money}
            onCreateClick={openCreatePackage}
            onEditClick={openEditPackage}
            onSetActive={handleSetActive}
            onDelete={handleDeletePackage}
          />
        )}
      </div>

      {/* ---------------- Create team modal ---------------- */}
      {createTeamModal.show && (
        <div className="modal-overlay" onClick={() => setCreateTeamModal({ show: false, name: '', leaderTeacherId: '' })}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>فريق جديد</h3>
              <button className="icon-btn" onClick={() => setCreateTeamModal({ show: false, name: '', leaderTeacherId: '' })}><IconX /></button>
            </div>
            <form onSubmit={handleCreateTeam} className="modal-form">
              <div className="form-group">
                <label>اسم الفريق</label>
                <input className="form-input" value={createTeamModal.name} onChange={(e) => setCreateTeamModal(p => ({ ...p, name: e.target.value }))} placeholder="مثال: فريق الرياضيات" />
              </div>
              <div className="form-group">
                <label>قائد الفريق</label>
                <select className="form-input" value={createTeamModal.leaderTeacherId} onChange={(e) => setCreateTeamModal(p => ({ ...p, leaderTeacherId: e.target.value }))}>
                  <option value="">اختر مدرساً...</option>
                  {unassignedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {unassignedTeachers.length === 0 && <small className="hint">لا يوجد مدرسون بلا فريق حالياً.</small>}
              </div>
              <button type="submit" className="btn-primary full-width">إنشاء الفريق</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Rename team modal ---------------- */}
      {renameModal.show && (
        <div className="modal-overlay" onClick={() => setRenameModal({ show: false, teamId: null, name: '' })}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>تعديل اسم الفريق</h3>
              <button className="icon-btn" onClick={() => setRenameModal({ show: false, teamId: null, name: '' })}><IconX /></button>
            </div>
            <form onSubmit={handleRenameTeam} className="modal-form">
              <div className="form-group">
                <label>الاسم الجديد</label>
                <input className="form-input" value={renameModal.name} onChange={(e) => setRenameModal(p => ({ ...p, name: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary full-width">حفظ</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Package create/edit modal ---------------- */}
      {packageModal && (
        <div className="modal-overlay" onClick={() => setPackageModal(null)}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{packageModal.mode === 'create' ? 'باقة جديدة' : 'تعديل الباقة'}</h3>
              <button className="icon-btn" onClick={() => setPackageModal(null)}><IconX /></button>
            </div>
            <form onSubmit={submitPackageModal} className="modal-form">
              <div className="form-group">
                <label>عنوان الباقة</label>
                <input className="form-input" value={packageModal.title} onChange={(e) => setPackageModal(p => ({ ...p, title: e.target.value }))} placeholder="مثال: باقة كل مواد الثانوية العامة" required />
              </div>
              <div className="two-col">
                <div className="form-group">
                  <label>سعر التقرير الثابت (report_price)</label>
                  <input type="number" min="0" step="0.01" className="form-input" value={packageModal.report_price} onChange={(e) => setPackageModal(p => ({ ...p, report_price: e.target.value }))} required />
                  <small className="hint">مبلغ منصة ثابت للباقة كاملة — وليس مجموع أسعار الكورسات.</small>
                </div>
                <div className="form-group">
                  <label>سعر البيع للطالب (اختياري)</label>
                  <input type="number" min="0" step="0.01" className="form-input" value={packageModal.price} onChange={(e) => setPackageModal(p => ({ ...p, price: e.target.value }))} placeholder="افتراضياً: مجموع أسعار الكورسات" />
                </div>
              </div>
              <div className="form-group">
                <label>كورسات الباقة ({packageModal.courseIds.size} مُختارة)</label>
                <div className="courses-picker">
                  {availableCourses.length === 0 && <div className="empty-msg">لا توجد كورسات لمدرسي هذا الفريق.</div>}
                  {availableCourses.map(c => (
                    <label key={c.id} className={`course-pick-row ${packageModal.courseIds.has(c.id) ? 'checked' : ''}`}>
                      <input type="checkbox" checked={packageModal.courseIds.has(c.id)} onChange={() => toggleCourseInModal(c.id)} />
                      <span className="course-pick-title">{c.title}</span>
                      <span className="course-pick-teacher">{c.teacher_name}</span>
                      <span className="course-pick-price">{money(c.report_price)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary full-width">{packageModal.mode === 'create' ? 'إنشاء الباقة' : 'حفظ التعديلات'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Confirm modal ---------------- */}
      {confirmModal.show && (
        <div className="modal-overlay">
          <div className="modal-box small">
            <div className="confirm-icon"><IconWarning size={32} /></div>
            <h3>{confirmModal.title}</h3>
            <p className="confirm-msg">{confirmModal.message}</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={closeConfirm}>إلغاء</button>
              <button className="btn-danger" onClick={confirmModal.action}>تأكيد</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-wrapper { padding: 10px 0 40px; }
        .page-header { margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .page-header h2 { margin: 0; color: var(--text-primary); font-size: 1.8rem; }
        .page-header p { margin: 5px 0 0 0; color: var(--text-secondary); }
        .flex-center { display: flex; align-items: center; }
        .gap-2 { gap: 10px; }

        .tabs-bar { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
        .tabs-bar button { background: transparent; border: none; padding: 12px 22px; color: var(--text-secondary); font-weight: bold; cursor: pointer; border-bottom: 3px solid transparent; transition: 0.2s; font-size: 1rem; font-family: inherit; }
        .tabs-bar button:hover { color: var(--text-primary); }
        .tabs-bar button.active { color: var(--gold); border-bottom-color: var(--gold); }

        .loading-state { text-align: center; padding: 60px; color: var(--text-muted); font-weight: bold; }

        .smart-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-100px); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 10px; z-index: 999; opacity: 0; transition: 0.3s; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .smart-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .smart-toast.success .toast-icon { color: #22c55e; }
        .smart-toast.error .toast-icon { color: #ef4444; }
        .toast-msg { color: var(--text-primary); font-weight: bold; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .modal-box { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 25px; width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto; }
        .modal-box.wide { max-width: 640px; }
        .modal-box.small { max-width: 380px; text-align: center; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-header h3 { margin: 0; color: var(--text-primary); }
        .icon-btn { background: transparent; border: 1px solid var(--border); padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); }
        .icon-btn:hover { background: var(--bg-hover); }
        .modal-form { display: flex; flex-direction: column; gap: 16px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group label { display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px; font-weight: bold; }
        .form-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); outline: none; font-family: inherit; }
        .form-input:focus { border-color: var(--gold); }
        .hint { display: block; margin-top: 5px; color: var(--text-muted); font-size: 0.78rem; }
        .full-width { width: 100%; }
        .btn-primary { background: var(--gold); color: #111009; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.95rem; }
        .btn-primary:hover { filter: brightness(1.1); }
        .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-danger { background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .confirm-icon { color: #f59e0b; margin-bottom: 10px; }
        .confirm-msg { color: var(--text-secondary); margin: 10px 0 20px; }
        .confirm-actions { display: flex; justify-content: center; gap: 10px; }

        .courses-picker { max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
        .course-pick-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: 0.15s; }
        .course-pick-row:hover { background: var(--bg-hover); }
        .course-pick-row.checked { background: var(--bg-elevated); }
        .course-pick-title { flex: 1; color: var(--text-primary); font-size: 0.9rem; }
        .course-pick-teacher { color: var(--text-muted); font-size: 0.78rem; }
        .course-pick-price { color: var(--gold); font-size: 0.8rem; font-weight: bold; white-space: nowrap; }
        .empty-msg { text-align: center; color: var(--text-muted); padding: 20px; }
      `}</style>
    </SuperLayout>
  );
}

// ============================================================
// Teams tab
// ============================================================
function TeamsTab({ teams, unassignedTeachers, addTeacherPick, setAddTeacherPick, onCreateClick, onRenameClick, onDelete, onAddTeacher, onRemoveTeacher, onSetLeader }) {
  return (
    <div>
      <div className="toolbar">
        <button className="btn-primary-sm" onClick={onCreateClick}><IconPlus /> فريق جديد</button>
      </div>

      {teams.length === 0 && <div className="empty-state">لا توجد فرق حتى الآن. أنشئ أول فريق.</div>}

      <div className="teams-grid">
        {teams.map(team => (
          <div key={team.id} className="team-card">
            <div className="team-card-header">
              <div>
                <h3>{team.name}</h3>
                <span className="team-leader-line"><IconCrown className="gold-icon" /> القائد: {team.leader_name || '—'}</span>
              </div>
              <div className="team-card-actions">
                <button className="icon-btn" onClick={() => onRenameClick(team)} title="تعديل الاسم"><IconEdit /></button>
                <button className="icon-btn danger" onClick={() => onDelete(team)} title="حذف الفريق"><IconTrash /></button>
              </div>
            </div>

            <div className="team-meta">{team.members.length} أعضاء · {team.packages_count} باقة/باقات</div>

            <div className="members-list">
              {team.members.map(member => (
                <div key={member.id} className="member-row">
                  <span className="member-name">
                    {String(member.id) === String(team.leader_teacher_id) && <IconCrown className="gold-icon" size={13} />}
                    {member.name}
                  </span>
                  <span className={`billing-badge billing-${member.billing_method}`}>{billingLabel(member.billing_method)}</span>
                  {String(member.id) !== String(team.leader_teacher_id) && (
                    <div className="member-actions">
                      <button className="link-btn" onClick={() => onSetLeader(team, member)}>تعيين قائد</button>
                      <button className="link-btn danger" onClick={() => onRemoveTeacher(team, member)}>إزالة</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="add-member-row">
              <select className="form-input-sm" value={addTeacherPick[team.id] || ''} onChange={(e) => setAddTeacherPick(prev => ({ ...prev, [team.id]: e.target.value }))}>
                <option value="">إضافة مدرس...</option>
                {unassignedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn-sm" onClick={() => onAddTeacher(team.id)}><IconPlus size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .toolbar { display: flex; justify-content: flex-end; margin-bottom: 18px; }
        .btn-primary-sm { display: flex; align-items: center; gap: 8px; background: var(--gold); color: #111009; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .btn-primary-sm:hover { filter: brightness(1.1); }
        .empty-state { text-align: center; padding: 50px; color: var(--text-muted); background: var(--bg-elevated); border-radius: 14px; font-weight: bold; }

        .teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
        .team-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
        .team-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .team-card-header h3 { margin: 0 0 4px 0; color: var(--text-primary); font-size: 1.15rem; }
        .team-leader-line { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 0.85rem; }
        .gold-icon { color: var(--gold); }
        .team-card-actions { display: flex; gap: 6px; }
        .icon-btn { background: transparent; border: 1px solid var(--border); padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); }
        .icon-btn:hover { background: var(--bg-hover); }
        .icon-btn.danger:hover { background: #ef4444; border-color: #ef4444; color: white; }

        .team-meta { color: var(--text-muted); font-size: 0.8rem; margin: 10px 0; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

        .members-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .member-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
        .member-name { display: flex; align-items: center; gap: 5px; flex: 1; color: var(--text-primary); font-size: 0.9rem; }
        .billing-badge { font-size: 0.7rem; padding: 3px 8px; border-radius: 10px; font-weight: bold; white-space: nowrap; }
        .billing-course_price { background: rgba(189,168,120,0.15); color: var(--gold); }
        .billing-percentage { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .billing-new_student { background: rgba(34,197,94,0.15); color: #22c55e; }
        .member-actions { display: flex; gap: 8px; }
        .link-btn { background: none; border: none; color: var(--text-muted); font-size: 0.78rem; cursor: pointer; text-decoration: underline; padding: 0; font-family: inherit; }
        .link-btn:hover { color: var(--gold); }
        .link-btn.danger:hover { color: #ef4444; }

        .add-member-row { display: flex; gap: 8px; }
        .form-input-sm { flex: 1; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; }
        .btn-sm { background: var(--bg-base); border: 1px solid var(--border); color: var(--text-secondary); border-radius: 6px; padding: 0 10px; cursor: pointer; }
        .btn-sm:hover { background: var(--gold); color: #111009; border-color: var(--gold); }
      `}</style>
    </div>
  );
}

function billingLabel(method) {
  if (method === 'course_price') return 'سعر الكورس';
  if (method === 'new_student') return 'طالب جديد';
  return 'نسبة مئوية';
}

// ============================================================
// Packages tab
// ============================================================
function PackagesTab({ teams, selectedTeamId, setSelectedTeamId, packages, packagesLoading, money, onCreateClick, onEditClick, onSetActive, onDelete }) {
  return (
    <div>
      <div className="toolbar">
        <select className="form-input team-select" value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
          <option value="">اختر فريقاً...</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary-sm" onClick={onCreateClick} disabled={!selectedTeamId}><IconPlus /> باقة جديدة</button>
      </div>

      {!selectedTeamId && <div className="empty-state">اختر فريقاً لعرض باقاته.</div>}
      {selectedTeamId && packagesLoading && <div className="empty-state">جارِ التحميل...</div>}
      {selectedTeamId && !packagesLoading && packages.length === 0 && <div className="empty-state">لا توجد باقات لهذا الفريق بعد.</div>}

      <div className="packages-grid">
        {packages.map(pkg => (
          <div key={pkg.id} className={`package-card ${!pkg.is_active ? 'archived' : ''}`}>
            <div className="package-card-header">
              <h3><IconBox className="gold-icon" /> {pkg.title}</h3>
              {!pkg.is_active && <span className="archived-badge">مؤرشفة</span>}
            </div>
            <div className="package-prices">
              <span>سعر التقرير: <b>{money(pkg.report_price)}</b></span>
              <span>سعر البيع: <b>{pkg.price !== null && pkg.price !== undefined ? money(pkg.price) : 'تلقائي (مجموع الكورسات)'}</b></span>
            </div>
            <div className="package-courses">
              {(pkg.courses || []).map(c => (
                <div key={c.id} className="package-course-row">
                  <span>{c.title}</span>
                  <span className="course-teacher-tag">{c.teacher_name}</span>
                </div>
              ))}
            </div>
            <div className="package-actions">
              <button className="icon-btn" onClick={() => onEditClick(pkg)} title="تعديل"><IconEdit /></button>
              <button className="icon-btn" onClick={() => onSetActive(pkg)} title={pkg.is_active ? 'أرشفة' : 'تفعيل'}><IconArchive /></button>
              <button className="icon-btn danger" onClick={() => onDelete(pkg)} title="حذف"><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
        .team-select { max-width: 280px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: inherit; }
        .btn-primary-sm { display: flex; align-items: center; gap: 8px; background: var(--gold); color: #111009; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .btn-primary-sm:hover:not(:disabled) { filter: brightness(1.1); }
        .btn-primary-sm:disabled { opacity: 0.5; cursor: not-allowed; }
        .empty-state { text-align: center; padding: 50px; color: var(--text-muted); background: var(--bg-elevated); border-radius: 14px; font-weight: bold; }

        .packages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
        .package-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
        .package-card.archived { opacity: 0.6; }
        .package-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .package-card-header h3 { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-size: 1.05rem; }
        .gold-icon { color: var(--gold); }
        .archived-badge { font-size: 0.7rem; background: rgba(239,68,68,0.15); color: #ef4444; padding: 3px 8px; border-radius: 10px; font-weight: bold; }

        .package-prices { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
        .package-prices b { color: var(--gold); }

        .package-courses { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; max-height: 130px; overflow-y: auto; }
        .package-course-row { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-primary); }
        .course-teacher-tag { color: var(--text-muted); }

        .package-actions { display: flex; gap: 6px; justify-content: flex-end; }
        .icon-btn { background: transparent; border: 1px solid var(--border); padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); }
        .icon-btn:hover { background: var(--bg-hover); }
        .icon-btn.danger:hover { background: #ef4444; border-color: #ef4444; color: white; }
      `}</style>
    </div>
  );
}
