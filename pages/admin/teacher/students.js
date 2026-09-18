import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect } from 'react';

// أيقونة الطلاب للعنوان (نفس أيقونة لوحة الإدارة العليا)
const StudentsIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [currentUserId, setCurrentUserId] = useState(null);

  // حالة لمعرفة هل المستخدم الحالي هو الأدمن الرئيسي
  const [isMainAdmin, setIsMainAdmin] = useState(false);

  // 👑 حالة الفريق (تُملأ فقط إذا كان المدرس قائد فريق — غير ذلك تبقى فارغة
  // ويعمل كل شيء بنفس السلوك القديم تماماً)
  const [isLeader, setIsLeader] = useState(false);
  const [teamName, setTeamName] = useState(null);
  const [teamTeachers, setTeamTeachers] = useState([]);
  const [teamCourses, setTeamCourses] = useState([]); // شجرة كورسات الفريق كاملة (بديل allCourses للقائد)
  const [teamPackages, setTeamPackages] = useState([]);
  const [teacherFilterId, setTeacherFilterId] = useState(''); // فلترة القائد لقائمة الطلاب حسب مدرس معين

  // البحث والفلترة
  const [searchTerm, setSearchTerm] = useState('');

  // --- نظام الفلترة (Modal) ---
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ courses: [], subjects: [] });
  const [tempFilters, setTempFilters] = useState({ courses: [], subjects: [] });
  const [filterMode, setFilterMode] = useState('or'); // 'and' | 'or'
  const [tempFilterMode, setTempFilterMode] = useState('or');

  // التصفح (Pagination)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const [selectedUsers, setSelectedUsers] = useState([]);

  // حالات النوافذ
  const [viewUser, setViewUser] = useState(null);
  const [userSubs, setUserSubs] = useState({ courses: [], subjects: [] });
  const [loadingSubs, setLoadingSubs] = useState(false);

  // متغير لتخزين الكورسات والمواد والباقات المتاحة للمنح
  // (خاصة بهذا المدرس فقط — أو بكل الفريق إن كان قائداً)
  const [grantOptions, setGrantOptions] = useState({ courses: [], subjects: [], packages: [] });

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantTarget, setGrantTarget] = useState(null);
  const [selectedGrantItems, setSelectedGrantItems] = useState({ courses: [], subjects: [], packages: [] });

  const [confirmData, setConfirmData] = useState({ show: false, message: '', onConfirm: null });
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  // --- دوال المساعدة ---
  const showToast = (msg, type = 'success') => {
      setToast({ show: true, message: msg, type });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };
  const showConfirm = (msg, callback) => setConfirmData({ show: true, message: msg, onConfirm: callback });

  const formatDate = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // 🗓️ شارة "ينتهي في / منتهي" لكل صف وصول طالب (course/subject access row)
  const formatAccessExpiryBadge = (expiresAt) => {
      if (!expiresAt) return { text: 'مدى الحياة', expired: false, lifetime: true };
      const expired = new Date(expiresAt).getTime() <= Date.now();
      return { text: expired ? 'منتهي' : `ينتهي: ${formatDate(expiresAt)}`, expired, lifetime: false };
  };

  // --- 1. جلب البيانات ---
  const fetchData = async () => {
    setLoading(true);
    try {
        if (allCourses.length === 0) {
            const resCourses = await fetch('/api/dashboard/teacher/content');
            const coursesData = await resCourses.json();
            setAllCourses(coursesData.courses || []);
        }

        let url = `/api/dashboard/teacher/students?page=${currentPage}&limit=${itemsPerPage}`;

        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (activeFilters.courses.length > 0) params.append('courses_filter', activeFilters.courses.join(','));
        if (activeFilters.subjects.length > 0) params.append('subjects_filter', activeFilters.subjects.join(','));
        if (activeFilters.courses.length + activeFilters.subjects.length > 1) params.append('filter_mode', filterMode);
        if (teacherFilterId) params.append('teacher_filter', teacherFilterId);

        if (params.toString()) url += `&${params.toString()}`;

        const res = await fetch(url);
        const data = await res.json();

        if (res.ok) {
            setStudents(data.students || []);
            setTotalStudents(data.total || 0);
            setIsMainAdmin(data.isMainAdmin || false);
            setIsLeader(data.isLeader || false);
            setTeamName(data.teamName || null);
            setTeamTeachers(data.teamTeachers || []);
            setTeamCourses(data.teamCourses || []);
            setTeamPackages(data.teamPackages || []);
            setSelectedUsers([]);
        }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
      setCurrentUserId(localStorage.getItem('admin_user_id'));
      fetchData();
  }, [currentPage, activeFilters, filterMode, teacherFilterId]);

  const handleSearchKey = (e) => {
      if (e.key === 'Enter') {
          setCurrentPage(1);
          fetchData();
      }
  };

  // --- 2. ملف الطالب ---
  const openUserProfile = async (user) => {
      setViewUser(user);
      setLoadingSubs(true);
      setGrantOptions({ courses: [], subjects: [] });
      try {
          const res = await fetch(`/api/dashboard/teacher/students?get_details_for_user=${user.id}`);
          const data = await res.json();
          setUserSubs(data);

          setGrantOptions({
              courses: data.available_courses || [],
              subjects: data.available_subjects || [],
              packages: data.available_packages || []
          });
      } catch (e) {}
      setLoadingSubs(false);
  };

  // --- 3. تنفيذ الإجراءات العامة (API) ---
  const runApiCall = async (action, payload, autoCloseProfile = false) => {
      try {
          const res = await fetch('/api/dashboard/teacher/students', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, ...payload })
          });
          const resData = await res.json();
          if (res.ok) {
              showToast(resData.message, 'success');

              if (autoCloseProfile) {
                  setViewUser(null);
                  fetchData();
              } else {
                  if (viewUser && ['grant_access', 'revoke_access'].includes(action)) {
                      openUserProfile(viewUser);
                  }
                  fetchData();
              }
          } else { showToast(resData.error, 'error'); }
      } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  };

  // --- منطق المنح (Grant) ---
  const openGrantModal = (target) => {
      setGrantTarget(target);
      setSelectedGrantItems({ courses: [], subjects: [], packages: [] });
      setShowGrantModal(true);
  };
  const toggleGrantItem = (type, id) => {
      const list = selectedGrantItems[type];
      const newList = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
      setSelectedGrantItems({ ...selectedGrantItems, [type]: newList });
  };
  const submitGrant = () => {
      if (!selectedGrantItems.courses.length && !selectedGrantItems.subjects.length && !selectedGrantItems.packages.length) {
          return showToast("اختر شيئاً واحداً على الأقل", 'error');
      }
      const isBulk = grantTarget === 'bulk';
      runApiCall('grant_access', { userIds: isBulk ? selectedUsers : [grantTarget.id], grantList: selectedGrantItems }, false);
      setShowGrantModal(false);
  };

  // --- منطق الفلترة ---
  const toggleTempFilter = (type, id) => {
      const current = tempFilters[type];
      const updated = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      setTempFilters({ ...tempFilters, [type]: updated });
  };
  const applyFilters = () => {
      setActiveFilters(tempFilters);
      setFilterMode(tempFilterMode);
      setCurrentPage(1);
      setShowFilterModal(false);
  };

  // العمليات الجماعية
  const toggleSelectAll = (e) => setSelectedUsers(e.target.checked ? students.map(u => u.id) : []);
  const toggleSelectUser = (id) => setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleBulkAction = (actionType) => {
      if (!selectedUsers.length) return;
      if (actionType === 'grant') {
          // 👑 للقائد: كل كورسات ومواد وباقات الفريق متاحة للمنح الجماعي.
          // غير ذلك (السلوك القديم): كورسات هذا المدرس فقط.
          setGrantOptions(isLeader
              ? { courses: teamCourses, subjects: [], packages: teamPackages }
              : { courses: allCourses, subjects: [], packages: [] }
          );
          openGrantModal('bulk');
      }
      else if (actionType === 'revoke_filtered') {
          if (!activeFilters.courses.length && !activeFilters.subjects.length) return showToast('يجب تفعيل فلتر أولاً لمعرفة ما سيتم سحبه', 'error');
          showConfirm('سحب الكورسات/المواد المفلترة من هؤلاء الطلاب؟', () => {
              activeFilters.courses.forEach(cid => runApiCall('revoke_access', { userIds: selectedUsers, courseId: cid }));
              activeFilters.subjects.forEach(sid => runApiCall('revoke_access', { userIds: selectedUsers, subjectId: sid }));
          });
      }
  };

  const totalPages = Math.ceil(totalStudents / itemsPerPage);
  const hasActiveFilters = activeFilters.courses.length > 0 || activeFilters.subjects.length > 0;

  // 👑 شجرة الكورسات المستخدمة لبناء نوافذ المنح/الفلترة: كورسات هذا المدرس
  // فقط عادةً، أو شجرة كورسات الفريق كاملة إن كان قائداً — بدون أي تغيير
  // على allCourses نفسها أو على الصفحات الأخرى التي قد تستخدمها.
  const courseTree = isLeader ? teamCourses : allCourses;

  // --- دالة مساعدة لتجهيز قائمة المنح (مقيّدة بمحتوى هذا المدرس فقط، أو بالفريق كاملاً للقائد) ---
  const getRenderableGrantGroups = () => {
    return courseTree.filter(course => {
        if (grantTarget === 'bulk') return true;
        const isCourseAvailable = grantOptions.courses.some(c => c.id === course.id);
        const hasSubjectsAvailable = course.subjects?.some(s => grantOptions.subjects.some(gs => gs.id === s.id));
        return isCourseAvailable || hasSubjectsAvailable;
    });
  };
  const renderableGrantGroups = getRenderableGrantGroups();

  return (
    <TeacherLayout title="إدارة الطلاب">
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.message}</div>

      <div className="page-header">
        <div className="page-title">
          <div className="title-icon"><StudentsIcon /></div>
          <div>
            <h1>إدارة الطلاب</h1>
            <p>
              {isLeader
                ? <>👑 أنت قائد فريق "{teamName}" — تصفح طلاب كل مدرسي الفريق، وفعّل باقاتهم.</>
                : 'تصفح طلابك، تحكم في الصلاحيات، وتابع الحالات.'}
            </p>
          </div>
        </div>
      </div>

      {isLeader && teamTeachers.length > 0 && (
          <div className="controls-container" style={{marginBottom: '10px'}}>
              <select
                  className="search-input"
                  style={{flex: 'none', minWidth: '220px', padding: '10px 12px'}}
                  value={teacherFilterId}
                  onChange={e => { setTeacherFilterId(e.target.value); setCurrentPage(1); }}
              >
                  <option value="">كل مدرسي الفريق</option>
                  {teamTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
          </div>
      )}

      <div className="controls-container">
          <div className="search-wrapper">
             <span className="search-icon">🔍</span>
             <input
                className="search-input"
                placeholder="بحث بالاسم، رقم الهاتف، البريد الإلكتروني، أو الـ ID ثم اضغط Enter..."
                value={searchTerm}
                onChange={e=>setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKey}
             />
          </div>

          <button className={`filter-btn ${hasActiveFilters ? 'active' : ''}`} onClick={() => { setTempFilters(activeFilters); setTempFilterMode(filterMode); setShowFilterModal(true); }}>
              🌪️ فلترة {hasActiveFilters && `(${activeFilters.courses.length + activeFilters.subjects.length})`}
          </button>

          <button onClick={() => { setCurrentPage(1); fetchData(); }} className="btn-refresh" title="تحديث البيانات">🔄</button>
      </div>

      {selectedUsers.length > 0 && (
          <div className="bulk-glass-bar">
              <div className="bulk-info"><span className="count-badge">{selectedUsers.length}</span> <span>محدد</span></div>
              <div className="bulk-actions">
                  <button onClick={() => handleBulkAction('grant')} className="glass-btn">➕ منح صلاحية</button>
                  {hasActiveFilters && (
                      <button onClick={() => handleBulkAction('revoke_filtered')} className="glass-btn danger">
                          🚫 سحب المفلتر
                      </button>
                  )}
              </div>
          </div>
      )}

      <div className="table-box">
          {loading ? <div className="loading-state">جاري التحميل...</div> : (
            <table className="std-table">
                <thead>
                    <tr>
                        <th style={{width:'40px'}}><input type="checkbox" onChange={toggleSelectAll} checked={students.length > 0 && selectedUsers.length === students.length} /></th>
                        <th style={{width:'60px'}}>ID</th>
                        <th style={{textAlign:'right'}}>الاسم</th>
                        <th style={{textAlign:'center'}}>المستخدم</th>
                        <th style={{textAlign:'center'}}>الهاتف</th>
                        <th style={{textAlign:'center'}}>البريد الإلكتروني</th>
                        <th style={{textAlign:'center', width:'100px'}}>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    {students.map(std => (
                        <tr key={std.id} onClick={() => openUserProfile(std)} className="clickable">
                            <td onClick={e => e.stopPropagation()} style={{textAlign:'center'}}><input type="checkbox" checked={selectedUsers.includes(std.id)} onChange={() => toggleSelectUser(std.id)} /></td>
                            <td style={{fontFamily:'monospace', color:'var(--text-muted)'}}>{std.id}</td>
                            <td style={{fontWeight:'700', color:'var(--text-primary)'}}>
                                <span className="name-with-tag">
                                    <span>{std.first_name}</span>
                                    {(std.is_admin === true || std.role === 'super_admin') && <span className="admin-tag">مشرف</span>}
                                </span>
                            </td>
                            <td style={{textAlign:'center', direction:'ltr', fontFamily:'monospace', color:'var(--gold)'}}>@{std.username}</td>
                            <td style={{textAlign:'center', direction:'ltr', fontFamily:'monospace', color:'var(--text-secondary)'}}>{std.phone}</td>
                            <td style={{textAlign:'center', direction:'ltr', fontFamily:'monospace', fontSize:'0.85em', color:'var(--text-secondary)'}}>{std.email || '-'}</td>
                            <td style={{textAlign:'center'}}>
                                {std.is_blocked ?
                                    <span className="status-badge blocked">محظور</span> :
                                    <span className="status-badge active">نشط</span>
                                }
                            </td>
                        </tr>
                    ))}
                    {students.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>لا يوجد نتائج</td></tr>}
                </tbody>
            </table>
          )}
      </div>

      {totalPages > 1 && (
          <div className="pagination">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>السابق</button>
              <span>{currentPage} / {totalPages} (الإجمالي: {totalStudents})</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>التالي</button>
          </div>
      )}

      {/* --- Filter Modal --- */}
      {showFilterModal && (
          <div className="modal-overlay" onClick={() => setShowFilterModal(false)}>
              <div className="modal-box filter-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head">
                      <h3>🌪️ تصفية الطلاب</h3>
                      <button className="close-icon" onClick={() => setShowFilterModal(false)}>✕</button>
                  </div>
                  <div className="modal-content scrollable custom-scrollbar">
                      {/* And / Or Mode Toggle */}
                      <div className="filter-mode-section">
                          <span className="filter-mode-label">نوع الفلترة عند اختيار أكثر من عنصر:</span>
                          <div className="filter-mode-toggle">
                              <button
                                  type="button"
                                  className={`mode-btn ${tempFilterMode === 'or' ? 'active or-active' : ''}`}
                                  onClick={() => setTempFilterMode('or')}
                              >
                                  <span className="mode-icon">∪</span>
                                  <span className="mode-text">OR</span>
                                  <span className="mode-hint">مشترك في أي منها</span>
                              </button>
                              <button
                                  type="button"
                                  className={`mode-btn ${tempFilterMode === 'and' ? 'active and-active' : ''}`}
                                  onClick={() => setTempFilterMode('and')}
                              >
                                  <span className="mode-icon">∩</span>
                                  <span className="mode-text">AND</span>
                                  <span className="mode-hint">مشترك في كلها معاً</span>
                              </button>
                          </div>
                      </div>
                      {courseTree.map(course => (
                          <div key={course.id} className="filter-group">
                              <label className="checkbox-row main">
                                  <input type="checkbox" checked={tempFilters.courses.includes(String(course.id))} onChange={() => toggleTempFilter('courses', String(course.id))} />
                                  <span>📦 {course.title}{isLeader && <span className="badge-owned">{course.teacher_name}</span>}</span>
                              </label>
                              <div className="filter-subs">
                                  {course.subjects?.map(subject => (
                                      <label key={subject.id} className="checkbox-row sub">
                                          <input type="checkbox" checked={tempFilters.subjects.includes(String(subject.id))} onChange={() => toggleTempFilter('subjects', String(subject.id))} />
                                          <span>{subject.title}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      ))}
                      {courseTree.length === 0 && <p className="empty-text">لا توجد كورسات متاحة للفلترة</p>}
                  </div>
                  <div className="modal-footer" style={{justifyContent: 'space-between'}}>
                      <button className="cancel-btn danger-text" onClick={() => { setTempFilters({courses:[], subjects:[]}); setActiveFilters({courses:[], subjects:[]}); setTempFilterMode('or'); setFilterMode('or'); setCurrentPage(1); setShowFilterModal(false); }}>مسح الفلاتر</button>
                      <button className="confirm-btn" onClick={applyFilters}>عرض ({tempFilters.courses.length + tempFilters.subjects.length}) ✅</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- Profile Modal --- */}
      {viewUser && (
          <div className="modal-overlay" onClick={() => setViewUser(null)}>
              <div className="modal-box profile-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head profile-head">
                      <div className="user-avatar-placeholder">{viewUser.first_name?.[0]}</div>
                      <div className="head-info">
                          <h3>
                              {viewUser.first_name}
                              {(viewUser.is_admin === true || viewUser.role === 'super_admin') && <span className="admin-tag-large">مشرف</span>}
                          </h3>
                          <span className="sub-text">ID: {viewUser.id} &nbsp;•&nbsp; انضم: {formatDate(viewUser.created_at)}</span>
                      </div>
                      <div className="head-actions">
                          <button className="close-icon" onClick={() => setViewUser(null)}>✕</button>
                      </div>
                  </div>

                  <div className="modal-content custom-scrollbar">
                      {/* بيانات المستخدم (عرض فقط — لا يملك المدرس صلاحية التعديل) */}
                      <div className="data-form">
                          <div className="data-row">
                              <div className="data-item">
                                  <label>الاسم الكامل</label>
                                  <div className="val-box">{viewUser.first_name}</div>
                              </div>
                              <div className="data-item">
                                  <label>اسم المستخدم (Login)</label>
                                  <div className="val-box ltr highlight-box">@{viewUser.username}</div>
                              </div>
                          </div>

                          <div className="data-row">
                              <div className="data-item">
                                  <label>رقم الهاتف</label>
                                  <div className="val-box ltr">{viewUser.phone || '-'}</div>
                              </div>
                              <div className="data-item">
                                  <label>البريد الإلكتروني</label>
                                  <div className="val-box ltr">{viewUser.email || '-'}</div>
                              </div>
                          </div>
                      </div>

                      <hr className="divider" />

                      {/* الاشتراكات */}
                      <div className="subs-wrapper">
                          <div className="subs-header"><h4>الاشتراكات الحالية</h4><button className="add-sub-btn" onClick={() => openGrantModal(viewUser)}>➕ منح صلاحية</button></div>
                          {loadingSubs ? <div className="loader-line"></div> : (
                              <div className="subs-grid">
                                  <div className="sub-column">
                                      <h5>📦 الكورسات الكاملة</h5>
                                      {userSubs.courses.length > 0 ? userSubs.courses.map(c => {
                                          const badge = formatAccessExpiryBadge(c.expires_at);
                                          return (
                                          <div key={c.course_id} className="sub-chip">
                                              <span>{c.courses?.title}</span>
                                              {!badge.lifetime && (
                                                  <span className={`expiry-badge ${badge.expired ? 'expired' : ''}`}>{badge.text}</span>
                                              )}
                                              <button onClick={() => showConfirm('سحب الصلاحية؟', () => runApiCall('revoke_access', { userId: viewUser.id, courseId: c.course_id }))}>✕</button>
                                          </div>
                                      ); }) : <p className="empty-text">لا يوجد</p>}
                                  </div>
                                  <div className="sub-column">
                                      <h5>📄 المواد الفردية</h5>
                                      {userSubs.subjects.length > 0 ? userSubs.subjects.map(s => {
                                          const badge = formatAccessExpiryBadge(s.expires_at);
                                          return (
                                          <div key={s.subject_id} className="sub-chip">
                                              <span>{s.subjects?.title}</span>
                                              {!badge.lifetime && (
                                                  <span className={`expiry-badge ${badge.expired ? 'expired' : ''}`}>{badge.text}</span>
                                              )}
                                              <button onClick={() => showConfirm('سحب الصلاحية؟', () => runApiCall('revoke_access', { userId: viewUser.id, subjectId: s.subject_id }))}>✕</button>
                                          </div>
                                      ); }) : <p className="empty-text">لا يوجد</p>}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- Grant Modal --- */}
      {showGrantModal && (
          <div className="modal-overlay" onClick={() => setShowGrantModal(false)}>
              <div className="modal-box grant-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head"><h3>➕ إضافة صلاحيات {grantTarget === 'bulk' ? 'جماعية' : ''}</h3><button className="close-icon" onClick={() => setShowGrantModal(false)}>✕</button></div>
                  <div className="modal-content scrollable custom-scrollbar">
                      {renderableGrantGroups.length > 0 ? renderableGrantGroups.map(course => {
                          const isCourseGrantable = grantTarget === 'bulk' || grantOptions.courses.some(c => c.id === course.id);
                          const visibleSubjects = course.subjects?.filter(s =>
                              grantTarget === 'bulk' || grantOptions.subjects.some(gs => gs.id === s.id)
                          ) || [];

                          return (
                              <div key={course.id} className="course-group">
                                  {isCourseGrantable ? (
                                      <label className="checkbox-row main">
                                          <input type="checkbox" checked={selectedGrantItems.courses.includes(course.id)} onChange={() => toggleGrantItem('courses', course.id)} />
                                          <span>📦 {course.title} (كامل){isLeader && <span className="badge-owned">{course.teacher_name}</span>}</span>
                                      </label>
                                  ) : (
                                      <div className="checkbox-row main disabled-row">
                                          <span>📦 {course.title} <span className="badge-owned">(مملوك مسبقاً)</span></span>
                                      </div>
                                  )}
                                  <div className="filter-subs">
                                      {visibleSubjects.map(subject => (
                                          <label key={subject.id} className="checkbox-row sub">
                                              <input type="checkbox" checked={selectedGrantItems.subjects.includes(subject.id)} onChange={() => toggleGrantItem('subjects', subject.id)} disabled={selectedGrantItems.courses.includes(course.id)} />
                                              <span>{subject.title}</span>
                                          </label>
                                      ))}
                                      {visibleSubjects.length === 0 && !isCourseGrantable && <span className="empty-text inline">جميع المواد مملوكة</span>}
                                  </div>
                              </div>
                          );
                      }) : (
                          renderableGrantGroups.length === 0 && grantOptions.packages?.length === 0 && grantTarget !== 'bulk' &&
                          <p className="empty-text">لا توجد صلاحيات جديدة يمكن إضافتها.</p>
                      )}

                      {/* 👑 باقات الفريق — تظهر فقط لقائد الفريق */}
                      {isLeader && (grantTarget === 'bulk' ? teamPackages.length > 0 : grantOptions.packages?.length > 0) && (
                          <div className="course-group">
                              <div className="checkbox-row main" style={{borderBottom: 'none', marginBottom: '10px', paddingBottom: '0'}}>
                                  <span>📦 باقات الفريق</span>
                              </div>
                              {(grantTarget === 'bulk' ? teamPackages : grantOptions.packages).map(pkg => {
                                  const pkgCourses = pkg.courses || [];
                                  const pkgPrice = pkg.price ?? pkgCourses.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
                                  return (
                                      <label key={pkg.id} className="checkbox-row sub package-row">
                                          <input type="checkbox" checked={selectedGrantItems.packages.includes(pkg.id)} onChange={() => toggleGrantItem('packages', pkg.id)} />
                                          <div className="package-info">
                                              <div className="package-head">
                                                  <span className="package-title">📦 باقة: {pkg.title}</span>
                                                  <span className="package-meta">{pkgCourses.length} كورس • السعر: {pkgPrice}</span>
                                              </div>
                                              {/* 📋 محتوى الباقة: الكورسات المتضمنة */}
                                              <div className="package-content-label">محتوى الباقة:</div>
                                              {pkgCourses.length > 0 ? (
                                                  <ul className="package-content-list">
                                                      {pkgCourses.map(c => {
                                                          const tName = teamTeachers.find(t => t.id === c.teacher_id)?.name;
                                                          return (
                                                              <li key={c.id}>
                                                                  <span>{c.title}</span>
                                                                  {tName && <span className="badge-owned">{tName}</span>}
                                                              </li>
                                                          );
                                                      })}
                                                  </ul>
                                              ) : (
                                                  <span className="package-empty">لا توجد كورسات داخل هذه الباقة.</span>
                                              )}
                                          </div>
                                      </label>
                                  );
                              })}
                          </div>
                      )}
                  </div>
                  <div className="modal-footer"><button className="cancel-btn" onClick={() => setShowGrantModal(false)}>إلغاء</button><button className="confirm-btn" onClick={submitGrant}>تأكيد ✅</button></div>
              </div>
          </div>
      )}

      {/* --- Alerts --- */}
      {confirmData.show && (
        <div className="modal-overlay alert-overlay">
          <div className="modal-box alert-box">
            <h3>⚠️ تأكيد الإجراء</h3>
            <p>{confirmData.message}</p>
            <div className="alert-actions">
              <button className="cancel-btn" onClick={()=>setConfirmData({...confirmData, show:false})}>إلغاء</button>
              <button className="confirm-btn red" onClick={()=>{confirmData.onConfirm(); setConfirmData({...confirmData,show:false})}}>نعم، تأكيد</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* ================= Theme-Aware & Responsive Styling ================= */
        .toast { position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 8px; font-weight: bold; transform: translateX(150%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 99999999; box-shadow: var(--shadow); background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); }
        .toast.show { transform: translateX(0); }
        .toast.success { border-right: 4px solid #22c55e; }
        .toast.error { border-right: 4px solid #ef4444; }

        /* Page Header */
        .page-header { margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .page-title { display: flex; align-items: center; gap: 15px; }
        .title-icon { color: var(--gold); display: flex; align-items: center; justify-content: center; background: var(--gold-dimmer); padding: 10px; border-radius: 12px; border: 1px solid var(--border-accent); }
        .page-title h1 { margin: 0 0 5px 0; color: var(--text-primary); font-size: 1.8rem; font-weight: 800; }
        .page-title p { margin: 0; color: var(--text-muted); font-size: 0.95rem; }

        /* Controls */
        .controls-container { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .search-wrapper { position: relative; flex: 2; min-width: 250px; }
        .search-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; opacity: 0.7; }
        .search-input { width: 100%; padding: 12px 12px 12px 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-size: 0.95rem; transition: 0.2s; outline: none; }
        .search-input:focus { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-dim); }

        .btn-refresh { background: var(--bg-elevated); color: var(--gold); border: 1px solid var(--border-accent); padding: 12px; border-radius: 12px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
        .btn-refresh:hover { background: var(--gold-dimmer); transform: rotate(15deg); }

        .filter-btn { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); padding: 12px 25px; border-radius: 12px; cursor: pointer; font-weight: 600; transition: 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
        .filter-btn:hover, .filter-btn.active { background: var(--gold); color: #111009; border-color: var(--gold-light); }

        /* Bulk Actions Bar */
        .bulk-glass-bar { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); width: 95%; max-width: 850px; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); border: 1px solid var(--gold); padding: 12px 25px; border-radius: 50px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); z-index: 50; animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .bulk-info { display: flex; align-items: center; color: white; font-weight: 600; }
        .count-badge { background: var(--gold); color: #111009; padding: 2px 10px; border-radius: 20px; font-weight: 800; margin-left: 8px; font-size: 1.1rem; }
        .bulk-actions { display: flex; gap: 10px; }
        .glass-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 18px; border-radius: 20px; cursor: pointer; font-size: 0.9em; font-weight: bold; transition: 0.2s; }
        .glass-btn:hover { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }
        .glass-btn.danger { border-color: #ef4444; color: #fca5a5; }
        .glass-btn.danger:hover { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #fecaca; }

        /* Main Table - Scrollable gracefully on mobile */
        .table-box { background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow-x: auto; box-shadow: var(--shadow); -webkit-overflow-scrolling: touch; }
        .std-table { width: 100%; border-collapse: collapse; min-width: 800px; }
        .std-table th { background: var(--bg-elevated); padding: 16px 20px; color: var(--text-muted); border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 0.9em; text-transform: uppercase; font-weight: 700; }
        .std-table td { padding: 16px 20px; border-bottom: 1px solid var(--border); color: var(--text-secondary); vertical-align: middle; }
        .std-table tr:last-child td { border-bottom: none; }
        .clickable:hover td { background: var(--bg-hover); cursor: pointer; }

        .name-with-tag { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .admin-tag { background: var(--gold-dimmer); color: var(--gold); border: 1px solid var(--border-accent); padding: 2px 8px; border-radius: 6px; font-size: 0.75em; font-weight: bold; white-space: nowrap; line-height: 1.6; }

        .status-badge { padding: 5px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; display: inline-block; }
        .status-badge.active { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); }
        .status-badge.blocked { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }

        input[type="checkbox"] { accent-color: var(--gold); width: 18px; height: 18px; cursor: pointer; }

        .pagination { display: flex; justify-content: center; flex-wrap: wrap; gap: 15px; margin-top: 25px; color: var(--text-muted); padding-bottom: 50px; align-items: center; font-weight: 500; }
        .pagination button { padding: 8px 18px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .pagination button:hover:not(:disabled) { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }
        .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

        .loading-state { padding: 50px; text-align: center; color: var(--gold); font-weight: bold; font-size: 1.1rem; }

        /* General Modals */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
        .modal-box { background: var(--bg-surface); width: 90%; border-radius: 16px; border: 1px solid var(--border-accent); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 30px 60px rgba(0,0,0,0.6); animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .profile-modal { max-width: 650px; max-height: 90vh; }
        .grant-modal, .filter-modal { max-width: 650px; max-height: 85vh; }
        .alert-box { max-width: 420px; padding: 30px; text-align: center; }
        .alert-box h3 { margin: 0 0 15px 0; color: var(--gold); font-size: 1.4rem; }
        .alert-box p { color: var(--text-secondary); margin-bottom: 25px; font-size: 1rem; line-height: 1.5; }
        .alert-actions { display: flex; justify-content: center; gap: 12px; }

        .modal-head { background: var(--bg-elevated); padding: 20px 25px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
        .modal-head h3 { margin: 0; color: var(--gold); font-size: 1.25rem; }

        .profile-head { justify-content: flex-start; gap: 15px; }
        .head-info { flex: 1; }
        .head-info h3 { margin: 0; color: var(--text-primary); font-size: 1.3rem; display: flex; align-items: center; gap: 10px; }
        .admin-tag-large { background: var(--gold-dim); color: var(--gold); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; border: 1px solid var(--border-accent); }
        .sub-text { font-size: 0.85em; color: var(--text-muted); font-weight: 500; display: block; margin-top: 4px; }
        .head-actions { display: flex; align-items: center; gap: 12px; }

        .close-icon { background: none; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; padding: 6px; border-radius: 50%; transition: 0.2s; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
        .close-icon:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }

        .modal-content { padding: 25px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 18px 25px; background: var(--bg-elevated); display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border); }

        /* Grid Layout for Courses/Subjects */
        .filter-group, .course-group { margin-bottom: 18px; background: var(--bg-elevated); padding: 18px; border-radius: 12px; border: 1px solid var(--border); transition: 0.2s; }
        .filter-group:hover, .course-group:hover { border-color: var(--border-accent); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }

        .checkbox-row { display: flex; align-items: center; gap: 12px; padding: 5px; cursor: pointer; }
        .checkbox-row.main { font-weight: 700; font-size: 1.05rem; color: var(--text-primary); border-bottom: 1px dashed var(--border); padding-bottom: 12px; margin-bottom: 15px; }
        .checkbox-row.disabled-row { cursor: not-allowed; opacity: 0.6; }
        .checkbox-row.sub { margin-right: 0; font-size: 0.95em; font-weight: 500; color: var(--text-secondary); background: var(--bg-surface); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); transition: 0.2s; }
        .checkbox-row.sub:hover { border-color: var(--gold); color: var(--text-primary); }

        .filter-subs { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }

        /* 📦 Package rows (leader grant modal) */
        .package-row { width: 100%; justify-content: flex-start; align-items: flex-start; margin-bottom: 10px; }
        .package-row input[type="checkbox"] { margin-top: 4px; flex-shrink: 0; }
        .package-info { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
        .package-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
        .package-title { font-weight: 700; color: var(--text-primary); }
        .package-meta { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
        .package-content-label { font-size: 0.78rem; color: var(--text-muted); font-weight: 700; }
        .package-content-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .package-content-list li { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; color: var(--text-secondary); }
        .package-content-list li::before { content: '•'; color: var(--gold); }
        .package-empty { font-size: 0.85rem; color: var(--text-muted); }

        .badge-owned { font-size: 0.75rem; background: var(--bg-surface); color: var(--text-muted); padding: 2px 8px; border-radius: 12px; margin-right: 6px; border: 1px solid var(--border); font-weight: 600; }

        /* Filter Mode Toggle (AND / OR) */
        .filter-mode-section { margin-bottom: 20px; padding: 16px; background: var(--bg-elevated); border-radius: 12px; border: 1px solid var(--border); }
        .filter-mode-label { display: block; color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 12px; }
        .filter-mode-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .mode-btn { background: var(--bg-surface); border: 2px solid var(--border); color: var(--text-secondary); padding: 10px 14px; border-radius: 10px; cursor: pointer; font-weight: 700; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .mode-btn:hover { border-color: var(--gold); color: var(--text-primary); background: var(--bg-hover); }
        .mode-icon { font-size: 1.3em; line-height: 1; }
        .mode-text { font-size: 0.95em; font-weight: 800; }
        .mode-hint { font-size: 0.72em; font-weight: 500; color: var(--text-muted); text-align: center; }
        .mode-btn.active.or-active { border-color: #3b82f6; background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
        .mode-btn.active.or-active .mode-hint { color: #93c5fd; }
        .mode-btn.active.and-active { border-color: #a855f7; background: rgba(168, 85, 247, 0.12); color: #c084fc; }
        .mode-btn.active.and-active .mode-hint { color: #d8b4fe; }

        input:disabled + span { color: var(--text-muted); text-decoration: line-through; }

        /* Profile Data (read-only) */
        .user-avatar-placeholder { width: 56px; height: 56px; background: var(--gold-dim); color: var(--gold); border: 2px solid var(--border-accent); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.6em; font-weight: bold; }
        .data-form { margin-bottom: 25px; }
        .data-row { display: flex; gap: 20px; margin-bottom: 18px; }
        .data-item { flex: 1; }
        .data-item label { display: block; color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 8px; }

        .val-box { background: var(--bg-elevated); padding: 12px 15px; border-radius: 10px; border: 1px solid var(--border); color: var(--text-primary); min-height: 46px; display: flex; align-items: center; font-weight: 500; font-size: 0.95rem; }
        .val-box.ltr { direction: ltr; font-family: monospace; }
        .highlight-box { color: var(--gold); border-color: var(--border-accent); background: var(--gold-dimmer); font-weight: bold; }

        .divider { border: 0; border-top: 1px dashed var(--border); margin: 25px 0; }

        /* Subscriptions Grid */
        .subs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
        .subs-header h4 { margin: 0; color: var(--text-primary); font-size: 1.1rem; }
        .add-sub-btn { background: var(--gold); color: #111009; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: 0.2s; }
        .add-sub-btn:hover { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 4px 10px var(--gold-dim); }

        .subs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .sub-column h5 { color: var(--text-muted); margin: 0 0 12px 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
        .sub-chip { background: var(--bg-elevated); border: 1px solid var(--border); padding: 10px 14px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 0.95em; color: var(--text-primary); font-weight: 500; transition: 0.2s; }
        .sub-chip:hover { border-color: var(--border-accent); }
        .sub-chip button { background: rgba(239, 68, 68, 0.1); border: 1px solid transparent; color: #ef4444; font-weight: bold; cursor: pointer; border-radius: 6px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .sub-chip button:hover { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; }
        .expiry-badge { font-size: 0.72em; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin: 0 8px; white-space: nowrap; background: var(--gold-dimmer, rgba(212,175,55,0.1)); color: var(--gold, #bda878); border: 1px solid var(--border-accent, rgba(212,175,55,0.3)); }
        .expiry-badge.lifetime { background: rgba(34, 197, 94, 0.1); color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
        .expiry-badge.expired { background: rgba(239, 68, 68, 0.12); color: #ef4444; border-color: rgba(239, 68, 68, 0.35); }
        .empty-text { color: var(--text-muted); font-size: 0.9em; text-align: center; font-style: italic; background: var(--bg-hover); padding: 15px; border-radius: 10px; border: 1px dashed var(--border); }
        .empty-text.inline { border: none; background: transparent; padding: 0; text-align: right; font-style: normal; }

        /* General Buttons */
        .confirm-btn { background: var(--gold); color: #111009; border: none; padding: 12px 22px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 0.95rem; transition: 0.2s; min-height: 46px; display: flex; align-items: center; justify-content: center;}
        .confirm-btn:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 5px 15px var(--gold-dim); }
        .confirm-btn.red { background: #ef4444; color: white; }
        .confirm-btn.red:hover { background: #dc2626; box-shadow: 0 5px 15px rgba(239, 68, 68, 0.3); }
        .cancel-btn { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); padding: 12px 22px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: 0.2s; min-height: 46px; display: flex; align-items: center; justify-content: center;}
        .cancel-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--text-muted); }
        .danger-text { color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
        .danger-text:hover { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; color: #fca5a5; }

        @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { from { transform: translate(-50%, 50px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

        /* ================= Mobile Layout & Dimensions Fixes ================= */
        @media (max-width: 768px) {
            .page-title { flex-direction: column; text-align: center; }
            .page-title h1 { font-size: 1.5rem; }

            .controls-container { flex-direction: column; align-items: stretch; gap: 12px; }
            .search-wrapper { width: 100%; min-width: auto; }
            .filter-btn, .btn-refresh { width: 100%; justify-content: center; }

            .bulk-glass-bar { flex-direction: column; gap: 12px; border-radius: 20px; padding: 15px; bottom: 20px; width: 92%; }
            .bulk-actions { flex-wrap: wrap; justify-content: center; width: 100%; }
            .glass-btn { flex: 1; text-align: center; min-width: 130px; }

            .std-table th, .std-table td { padding: 12px 10px; font-size: 0.85rem; }

            .modal-box { width: 95%; max-height: 90dvh; margin: 15px auto; }
            .modal-head.profile-head { flex-direction: column; text-align: center; padding: 20px 15px; }
            .head-actions { width: 100%; justify-content: center; margin-top: 15px; flex-wrap: wrap; }

            .modal-content { padding: 15px; }
            .data-row { flex-direction: column; gap: 15px; margin-bottom: 15px; }

            .subs-grid { grid-template-columns: 1fr; gap: 20px; }
            .subs-header { flex-direction: column; align-items: stretch; gap: 15px; }
            .add-sub-btn { width: 100%; text-align: center; padding: 12px; }

            /* Responsive Grid inside Modals */
            .filter-subs { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }

            .modal-footer { padding: 15px; flex-wrap: wrap; justify-content: stretch !important; flex-direction: column-reverse; gap: 10px; }
            .modal-footer button { width: 100%; flex: none; margin: 0; }

            /* Fix Toast Position */
            .toast { top: 15px; left: 15px; right: 15px; text-align: center; transform: translateY(-150%); }
            .toast.show { transform: translateY(0); }
        }
      `}</style>
    </TeacherLayout>
  );
}
