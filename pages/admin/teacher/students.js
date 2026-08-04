import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect } from 'react';

// --- أيقونات SVG الاحترافية ---
const Icons = {
    search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
    filter: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>,
    refresh: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>,
    close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
    add: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
    device: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>,
    course: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    subject: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [allCourses, setAllCourses] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0); 
  const [currentUserId, setCurrentUserId] = useState(null); 
  
  // حالة لمعرفة هل المستخدم الحالي هو الأدمن الرئيسي
  const [isMainAdmin, setIsMainAdmin] = useState(false);

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

  // متغير لتخزين الكورسات والمواد المتاحة للمنح
  const [grantOptions, setGrantOptions] = useState({ courses: [], subjects: [] }); 

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantTarget, setGrantTarget] = useState(null);
  const [selectedGrantItems, setSelectedGrantItems] = useState({ courses: [], subjects: [] });

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

  // --- 1. جلب البيانات ---
  const fetchData = async () => {
    setLoading(true);
    try {
        if (allCourses.length === 0) {
            const resCourses = await fetch('/api/dashboard/teacher/content');
            const coursesData = await resCourses.json();
            const coursesList = coursesData.courses || [];
            setAllCourses(coursesList);
        }

        let url = `/api/dashboard/teacher/students?page=${currentPage}&limit=${itemsPerPage}`;
        
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (activeFilters.courses.length > 0) params.append('courses_filter', activeFilters.courses.join(','));
        if (activeFilters.subjects.length > 0) params.append('subjects_filter', activeFilters.subjects.join(','));
        if (activeFilters.courses.length + activeFilters.subjects.length > 1) params.append('filter_mode', filterMode);
        
        if (params.toString()) url += `&${params.toString()}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.ok) {
            setStudents(data.students || []);
            setTotalStudents(data.total || 0);
            setIsMainAdmin(data.isMainAdmin || false);
            setSelectedUsers([]); 
        }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  useEffect(() => { 
      setCurrentUserId(localStorage.getItem('admin_user_id'));
      window.scrollTo(0, 0);
      fetchData(); 
  }, [currentPage, activeFilters, filterMode]);

  const handleSearchKey = (e) => {
      if (e.key === 'Enter') {
          setCurrentPage(1);
          fetchData();
      }
  };

  // --- منطق الفلتر ---
  const openFilterModal = () => { setTempFilters(activeFilters); setTempFilterMode(filterMode); setShowFilterModal(true); };
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
  const clearFilters = () => {
      setTempFilters({ courses: [], subjects: [] });
      setActiveFilters({ courses: [], subjects: [] });
      setTempFilterMode('or');
      setFilterMode('or');
      setCurrentPage(1);
      setShowFilterModal(false);
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
              subjects: data.available_subjects || []
          });

      } catch (e) {}
      setLoadingSubs(false);
  };

  // --- 3. تنفيذ الإجراءات ---
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
              if (autoCloseProfile) setViewUser(null);
              // إعادة تحميل البيانات لتحديث الصلاحيات
              if (viewUser && ['grant_access','revoke_access'].includes(action)) {
                  openUserProfile(viewUser);
                  fetchData();
              } else {
                  fetchData();
              }
          } else { showToast(resData.error, 'error'); }
      } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  };

  // مودال المنح
  const openGrantModal = (target) => {
      setGrantTarget(target);
      setSelectedGrantItems({ courses: [], subjects: [] });
      setShowGrantModal(true);
  };
  const toggleGrantItem = (type, id) => {
      const list = selectedGrantItems[type];
      const newList = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
      setSelectedGrantItems({ ...selectedGrantItems, [type]: newList });
  };
  const submitGrant = () => {
      if (!selectedGrantItems.courses.length && !selectedGrantItems.subjects.length) return showToast("اختر شيئاً واحداً على الأقل", 'error');
      const isBulk = grantTarget === 'bulk';
      runApiCall('grant_access', { userIds: isBulk ? selectedUsers : [grantTarget.id], grantList: selectedGrantItems }, false);
      setShowGrantModal(false);
  };

  // العمليات الجماعية
  const toggleSelectAll = (e) => setSelectedUsers(e.target.checked ? students.map(u => u.id) : []);
  const toggleSelectUser = (id) => setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  
  const handleBulkAction = (actionType) => {
      if (!selectedUsers.length) return;
      
      if (actionType === 'grant') {
        setGrantOptions({ courses: allCourses, subjects: [] }); 
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

  // --- دالة مساعدة لتجهيز قائمة المنح ---
  const getRenderableGrantGroups = () => {
    return allCourses.filter(course => {
        if (grantTarget === 'bulk') return true;
        const isCourseAvailable = grantOptions.courses.some(c => c.id === course.id);
        const hasSubjectsAvailable = course.subjects?.some(s => grantOptions.subjects.some(gs => gs.id === s.id));
        return isCourseAvailable || hasSubjectsAvailable;
    });
  };
  const renderableGrantGroups = getRenderableGrantGroups();

  return (
    <TeacherLayout title="إدارة الطلاب">
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>
        {toast.message}
      </div>

      {/* ── PAGE HEADER ── */}
      <div className="page-header">
          <div>
            <h1 className="page-title">إدارة الطلاب</h1>
            <p className="page-sub">تصفح طلابك، تحكم في الصلاحيات، وتابع الحالات.</p>
          </div>
      </div>

      <div className="controls-container">
          <div className="search-wrapper">
              <span className="search-icon">{Icons.search}</span>
              <input 
                className="search-input" 
                placeholder="بحث (اسم، هاتف، ID) + Enter..." 
                value={searchTerm} 
                onChange={e=>setSearchTerm(e.target.value)} 
                onKeyDown={handleSearchKey}
              />
          </div>
          
          <button className={`filter-btn ${hasActiveFilters ? 'active' : ''}`} onClick={openFilterModal}>
              <span className="icon-wrap">{Icons.filter}</span> فلترة {hasActiveFilters && `(${activeFilters.courses.length + activeFilters.subjects.length})`}
          </button>

          <button onClick={() => { setCurrentPage(1); fetchData(); }} className="btn-refresh" title="تحديث">
              {Icons.refresh}
          </button>
      </div>

      {selectedUsers.length > 0 && (
          <div className="bulk-glass-bar">
              <div className="bulk-info">
                  <span className="count-badge">{selectedUsers.length}</span> 
                  <span>طالب محدد</span>
              </div>
              <div className="bulk-actions">
                  <button onClick={() => handleBulkAction('grant')} className="glass-btn primary-glass">
                      <span className="icon-wrap">{Icons.add}</span> منح صلاحية
                  </button>
                  {hasActiveFilters && (
                      <button onClick={() => handleBulkAction('revoke_filtered')} className="glass-btn danger-glass">
                          سحب المفلتر
                      </button>
                  )}
              </div>
          </div>
      )}

      <div className="table-box">
          {loading ? (
              <div className="loading-state">
                  <div className="spinner"></div>
                  <span>جاري تحميل بيانات الطلاب...</span>
              </div>
          ) : (
            <div className="table-responsive">
                <table className="std-table">
                    <thead>
                        <tr>
                            <th style={{width:'50px', textAlign: 'center'}}>
                                <input type="checkbox" className="custom-checkbox" onChange={toggleSelectAll} checked={students.length > 0 && selectedUsers.length === students.length} />
                            </th>
                            <th style={{width:'80px'}}>ID</th>
                            <th style={{textAlign:'right'}}>الاسم</th>
                            <th style={{textAlign:'center'}}>المستخدم</th>
                            <th style={{textAlign:'center'}}>الهاتف</th>
                            <th style={{textAlign:'center'}}>تاريخ الانضمام</th>
                            <th style={{textAlign:'center', width:'100px'}}>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map(std => (
                            <tr key={std.id} onClick={() => openUserProfile(std)} className="clickable hover-row">
                                <td onClick={e => e.stopPropagation()} style={{textAlign:'center'}}>
                                    <input type="checkbox" className="custom-checkbox" checked={selectedUsers.includes(std.id)} onChange={() => toggleSelectUser(std.id)} />
                                </td>
                                <td className="mono-text">{std.id}</td>
                                <td className="name-cell">
                                    <div className="name-wrap">
                                        <span className="avatar-mini">{std.first_name?.[0]}</span>
                                        <span className="full-name">{std.first_name}</span>
                                        {std.is_admin && <span className="admin-tag">مشرف</span>}
                                    </div>
                                </td>
                                <td className="mono-text center-text highlight-text">{std.username}</td>
                                <td className="mono-text center-text">{std.phone}</td>
                                <td className="date-cell">{formatDate(std.created_at)}</td>
                                <td>
                                    <div className="status-cell">
                                        {std.is_blocked ? <span className="status-dot red" title="محظور"></span> : <span className="status-dot green" title="نشط"></span>}
                                        {std.device_linked && <span className="device-icon" title="جهاز مرتبط">{Icons.device}</span>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {students.length === 0 && (
                            <tr><td colSpan="7" className="empty-state">لا يوجد نتائج تطابق بحثك</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
          )}
      </div>

      {totalPages > 1 && (
          <div className="pagination">
              <button className="page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>السابق</button>
              <div className="page-info">
                  <span>الصفحة <strong className="highlight-text">{currentPage}</strong> من {totalPages}</span>
                  <span className="total-info">(الإجمالي: {totalStudents})</span>
              </div>
              <button className="page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>التالي</button>
          </div>
      )}

      {/* --- Filter Modal --- */}
      {showFilterModal && (
          <div className="modal-overlay" onClick={() => setShowFilterModal(false)}>
              <div className="modal-box filter-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head">
                      <h3>تصفية الطلاب</h3>
                      <button className="close-icon" onClick={() => setShowFilterModal(false)}>{Icons.close}</button>
                  </div>
                  <div className="modal-content scrollable">
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
                      {allCourses.map(course => (
                          <div key={course.id} className="filter-group">
                              <label className="checkbox-row main">
                                  <input type="checkbox" className="custom-checkbox" checked={tempFilters.courses.includes(String(course.id))} onChange={() => toggleTempFilter('courses', String(course.id))} />
                                  <span className="filter-label"><span className="icon-wrap">{Icons.course}</span> {course.title}</span>
                              </label>
                              <div className="filter-subs">
                                  {course.subjects?.map(subject => (
                                      <label key={subject.id} className="checkbox-row sub">
                                          <input type="checkbox" className="custom-checkbox" checked={tempFilters.subjects.includes(String(subject.id))} onChange={() => toggleTempFilter('subjects', String(subject.id))} />
                                          <span className="filter-label">{subject.title}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      ))}
                      {allCourses.length === 0 && <div className="empty-state">لا توجد كورسات متاحة للفلترة</div>}
                  </div>
                  <div className="modal-footer split-footer">
                      <button className="cancel-btn danger-text" onClick={clearFilters}>مسح الفلاتر</button>
                      <button className="confirm-btn" onClick={applyFilters}>تطبيق الفرز ({tempFilters.courses.length + tempFilters.subjects.length})</button>
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
                              {viewUser.is_admin && <span className="admin-tag-large">مشرف</span>}
                          </h3>
                          <span className="sub-text">ID: <span className="highlight-text">{viewUser.id}</span> &nbsp;•&nbsp; انضم: {formatDate(viewUser.created_at)}</span>
                      </div>
                      <button className="close-icon" onClick={() => setViewUser(null)}>{Icons.close}</button>
                  </div>
                  <div className="modal-content profile-content">
                      <div className="data-row">
                          <div className="data-item">
                              <label>اسم المستخدم</label>
                              <div className="val-box highlight-text">{viewUser.username}</div>
                          </div>
                          <div className="data-item">
                              <label>رقم الهاتف</label>
                              <div className="val-box ltr">{viewUser.phone}</div>
                          </div>
                      </div>

                      <div className="subs-wrapper">
                          <div className="subs-header">
                              <h4>الاشتراكات والصلاحيات</h4>
                              <button className="btn-primary small" onClick={() => openGrantModal(viewUser)}>
                                  <span className="icon-wrap">{Icons.add}</span> إضافة
                              </button>
                          </div>
                          {loadingSubs ? (
                              <div className="loading-state mini"><div className="spinner"></div></div>
                          ) : (
                              <div className="subs-grid">
                                  <div className="sub-column">
                                      <h5><span className="icon-wrap">{Icons.course}</span> الكورسات الكاملة</h5>
                                      {userSubs.courses.length === 0 && <div className="empty-sub">لا توجد اشتراكات</div>}
                                      {userSubs.courses.map(c => (
                                          <div key={c.course_id} className="sub-chip">
                                              <span>{c.courses?.title}</span>
                                              <button className="remove-btn" title="سحب الصلاحية" onClick={() => showConfirm('هل أنت متأكد من سحب هذا الكورس؟', () => runApiCall('revoke_access', { userId: viewUser.id, courseId: c.course_id }))}>×</button>
                                          </div>
                                      ))}
                                  </div>
                                  <div className="sub-column">
                                      <h5><span className="icon-wrap">{Icons.subject}</span> المواد الفردية</h5>
                                      {userSubs.subjects.length === 0 && <div className="empty-sub">لا توجد اشتراكات</div>}
                                      {userSubs.subjects.map(s => (
                                          <div key={s.subject_id} className="sub-chip">
                                              <span>{s.subjects?.title}</span>
                                              <button className="remove-btn" title="سحب الصلاحية" onClick={() => showConfirm('هل أنت متأكد من سحب هذه المادة؟', () => runApiCall('revoke_access', { userId: viewUser.id, subjectId: s.subject_id }))}>×</button>
                                          </div>
                                      ))}
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
                  <div className="modal-head">
                      <h3>إضافة صلاحيات</h3>
                      <button className="close-icon" onClick={() => setShowGrantModal(false)}>{Icons.close}</button>
                  </div>
                  <div className="modal-content scrollable">
                      {renderableGrantGroups.length > 0 ? renderableGrantGroups.map(course => {
                          const isCourseGrantable = grantTarget === 'bulk' || grantOptions.courses.some(c => c.id === course.id);
                          
                          const visibleSubjects = course.subjects?.filter(s => 
                              grantTarget === 'bulk' || grantOptions.subjects.some(gs => gs.id === s.id)
                          ) || [];

                          return (
                              <div key={course.id} className="course-group">
                                  {isCourseGrantable ? (
                                      <label className="checkbox-row main">
                                          <input 
                                              type="checkbox" 
                                              className="custom-checkbox"
                                              checked={selectedGrantItems.courses.includes(course.id)} 
                                              onChange={() => toggleGrantItem('courses', course.id)} 
                                          />
                                          <span className="filter-label"><span className="icon-wrap">{Icons.course}</span> {course.title} <span className="badge-full">(كامل)</span></span>
                                      </label>
                                  ) : (
                                      <div className="checkbox-row main disabled-row">
                                          <span className="filter-label"><span className="icon-wrap">{Icons.course}</span> {course.title} <span className="badge-owned">(مملوك مسبقاً)</span></span>
                                      </div>
                                  )}

                                  <div className="filter-subs">
                                      {visibleSubjects.map(subject => (
                                          <label key={subject.id} className="checkbox-row sub">
                                              <input 
                                                  type="checkbox" 
                                                  className="custom-checkbox"
                                                  checked={selectedGrantItems.subjects.includes(subject.id)} 
                                                  onChange={() => toggleGrantItem('subjects', subject.id)}
                                                  disabled={selectedGrantItems.courses.includes(course.id)}
                                              />
                                              <span className="filter-label">{subject.title}</span>
                                          </label>
                                      ))}
                                      {visibleSubjects.length === 0 && !isCourseGrantable && <span className="empty-sub inline">جميع المواد مملوكة</span>}
                                  </div>
                              </div>
                          );
                      }) : (
                          <div className="empty-state">
                              لا توجد صلاحيات جديدة يمكن إضافتها.
                          </div>
                      )}
                  </div>
                  <div className="modal-footer">
                      <button className="cancel-btn" onClick={() => setShowGrantModal(false)}>إلغاء</button>
                      <button className="confirm-btn" onClick={submitGrant}>تأكيد المنح</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- Alerts --- */}
      {confirmData.show && (
          <div className="modal-overlay alert-overlay">
              <div className="modal-box alert-box">
                  <div className="modal-head alert-head">
                      <h3>تأكيد الإجراء</h3>
                  </div>
                  <div className="modal-content">
                      <p>{confirmData.message}</p>
                  </div>
                  <div className="modal-footer alert-footer">
                      <button className="cancel-btn" onClick={() => setConfirmData({...confirmData, show:false})}>تراجع</button>
                      <button className="confirm-btn danger-bg" onClick={() => {confirmData.onConfirm(); setConfirmData({...confirmData,show:false})}}>نعم، متأكد</button>
                  </div>
              </div>
          </div>
      )}

      <style jsx>{`
        /* ── THEME VARS ── */
        .toast { position: fixed; top: 24px; left: 50%; transform: translate(-50%, -150%); padding: 14px 28px; border-radius: 12px; font-weight: bold; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); z-index: 99999; box-shadow: 0 10px 30px rgba(0,0,0,0.5); font-size: 0.95rem; border: 1px solid rgba(255,255,255,0.1); }
        .toast.show { transform: translate(-50%, 0); } 
        .toast.success { background: #22c55e; color: #111009; } 
        .toast.error { background: #ef4444; color: #fff; }

        .page-header { margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid var(--border); }
        .page-title { margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.6rem; font-weight: 800; }
        .page-sub { margin: 0; color: var(--text-secondary); font-size: 0.95rem; }

        .controls-container { display: flex; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; align-items: stretch; }
        .search-wrapper { flex: 2; min-width: 250px; position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; right: 14px; color: var(--text-muted); display: flex; }
        .search-input { width: 100%; padding: 12px 40px 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-family: inherit; transition: 0.2s; font-size: 0.95rem; }
        .search-input:focus { border-color: var(--gold); outline: none; box-shadow: 0 0 0 2px var(--gold-dim); }
        
        .filter-btn { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border); padding: 0 24px; border-radius: 10px; cursor: pointer; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .filter-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .filter-btn.active { background: var(--gold-dim); color: var(--gold); border-color: var(--border-accent); }

        .btn-refresh { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border); width: 44px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn-refresh:hover { background: var(--bg-hover); color: var(--gold); border-color: var(--border-accent); }

        .btn-primary { background: var(--gold); color: #111009; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--gold-dim); }
        .btn-primary.small { padding: 8px 14px; font-size: 0.85rem; }

        .bulk-glass-bar { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); width: 92%; max-width: 800px; background: rgba(22, 19, 12, 0.85); backdrop-filter: blur(16px); border: 1px solid var(--border-accent); padding: 14px 24px; border-radius: 50px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6); z-index: 100; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .bulk-info { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-weight: 600; }
        .count-badge { background: var(--gold); color: #111009; padding: 2px 12px; border-radius: 20px; font-weight: 800; font-size: 0.9rem; }
        .bulk-actions { display: flex; gap: 10px; }
        .glass-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 18px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: bold; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .glass-btn:hover { background: var(--bg-hover); }
        .primary-glass { background: var(--gold-dim); color: var(--gold); border-color: var(--border-accent); }
        .primary-glass:hover { background: var(--gold); color: #111009; }
        .danger-glass { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
        .danger-glass:hover { background: #ef4444; color: white; }

        /* ── TABLE STYLES ── */
        .table-box { background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .table-responsive { overflow-x: auto; }
        .std-table { width: 100%; border-collapse: collapse; min-width: 850px; text-align: right; }
        .std-table th { background: var(--bg-elevated); padding: 16px; color: var(--text-secondary); border-bottom: 1px solid var(--border); font-size: 0.85rem; font-weight: 700; white-space: nowrap; }
        .std-table td { padding: 16px; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; font-size: 0.95rem; }
        .std-table tbody tr:last-child td { border-bottom: none; }
        .hover-row { transition: background 0.2s; cursor: pointer; }
        .hover-row:hover { background: var(--bg-hover); }
        
        .name-cell { font-weight: 600; }
        .name-wrap { display: flex; align-items: center; gap: 10px; }
        .avatar-mini { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: #111009; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: bold; flex-shrink: 0; }
        .admin-tag { background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: bold; margin-right: auto; }
        
        .mono-text { font-family: 'Courier New', Courier, monospace; color: var(--text-secondary); }
        .center-text { text-align: center; }
        .highlight-text { color: var(--gold) !important; font-weight: bold; }
        .date-cell { text-align: center; font-size: 0.85rem; color: var(--text-muted); }
        
        .status-cell { display: flex; justify-content: center; align-items: center; gap: 8px; }
        .status-dot { height: 12px; width: 12px; border-radius: 50%; display: inline-block; }
        .status-dot.green { background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); } 
        .status-dot.red { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }
        .device-icon { color: var(--text-muted); display: flex; }

        .custom-checkbox { width: 18px; height: 18px; accent-color: var(--gold); cursor: pointer; }

        .loading-state { padding: 60px 20px; text-align: center; color: var(--gold); font-weight: bold; display: flex; flex-direction: column; align-items: center; gap: 15px; }
        .loading-state.mini { padding: 30px; }
        .spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .empty-state { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.95rem; }

        .pagination { display: flex; justify-content: center; gap: 15px; margin-top: 25px; color: var(--text-secondary); padding-bottom: 80px; align-items: center; }
        .page-btn { padding: 8px 18px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .page-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--gold); color: var(--gold); }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-info { display: flex; flex-direction: column; align-items: center; font-size: 0.9rem; }
        .total-info { font-size: 0.8rem; color: var(--text-muted); }

        /* ── MODALS ── */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-box { background: var(--bg-surface); width: 100%; border-radius: 20px; border: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: 0 25px 50px rgba(0,0,0,0.5); animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
        
        .profile-modal { max-width: 600px; max-height: 90vh; }
        .grant-modal { max-width: 550px; max-height: 85vh; }
        .filter-modal { max-width: 480px; max-height: 85vh; }
        .alert-box { max-width: 400px; } 

        .modal-head { background: var(--bg-elevated); padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
        .modal-head h3 { margin: 0; color: var(--text-primary); font-size: 1.2rem; font-weight: bold; }
        .close-icon { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-secondary); width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s; }
        .close-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
        
        .modal-content { padding: 24px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 18px 24px; background: var(--bg-elevated); display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border); }
        .split-footer { justify-content: space-between; }

        .cancel-btn { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .cancel-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .confirm-btn { background: var(--gold); color: #111009; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; box-shadow: 0 4px 12px var(--gold-dimmer); }
        .confirm-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px var(--gold-dim); }
        .danger-text { color: #ef4444 !important; border-color: rgba(239, 68, 68, 0.3) !important; }
        .danger-text:hover { background: rgba(239, 68, 68, 0.1) !important; }
        .danger-bg { background: #ef4444 !important; color: white !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2) !important; }

        /* Filter & Grant Lists */
        .filter-group, .course-group { margin-bottom: 16px; background: var(--bg-base); padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .checkbox-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; cursor: pointer; }
        .checkbox-row.main { font-weight: bold; color: var(--text-primary); border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 12px; }
        .checkbox-row.sub { margin-right: 24px; font-size: 0.95em; color: var(--text-secondary); }
        .checkbox-row.disabled-row { cursor: not-allowed; opacity: 0.6; }
        .filter-label { display: flex; align-items: center; gap: 8px; flex: 1; }
        .icon-wrap { display: flex; align-items: center; justify-content: center; opacity: 0.8; }
        .filter-subs { display: flex; flex-direction: column; gap: 8px; }

        /* Filter Mode Toggle (AND / OR) */
        .filter-mode-section { margin-bottom: 20px; padding: 16px; background: var(--bg-elevated); border-radius: 12px; border: 1px solid var(--border); }
        .filter-mode-label { display: block; color: var(--text-secondary); font-size: 0.85rem; font-weight: 700; margin-bottom: 12px; }
        .filter-mode-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .mode-btn { background: var(--bg-base); border: 2px solid var(--border); color: var(--text-secondary); padding: 10px 14px; border-radius: 10px; cursor: pointer; font-weight: 700; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 2px; font-family: inherit; }
        .mode-btn:hover { border-color: var(--gold); color: var(--text-primary); background: var(--bg-hover); }
        .mode-icon { font-size: 1.3em; line-height: 1; }
        .mode-text { font-size: 0.95em; font-weight: 800; letter-spacing: 1px; }
        .mode-hint { font-size: 0.72em; font-weight: 500; color: var(--text-muted); text-align: center; }
        .mode-btn.active.or-active { border-color: #3b82f6; background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
        .mode-btn.active.or-active .mode-hint { color: #93c5fd; }
        .mode-btn.active.and-active { border-color: #a855f7; background: rgba(168, 85, 247, 0.12); color: #c084fc; }
        .mode-btn.active.and-active .mode-hint { color: #d8b4fe; }
        
        .badge-full { font-size: 0.75rem; background: var(--gold-dim); color: var(--gold); padding: 2px 8px; border-radius: 12px; font-weight: bold; margin-right: auto; border: 1px solid var(--border-accent); }
        .badge-owned { font-size: 0.75rem; background: var(--bg-elevated); color: var(--text-muted); padding: 2px 8px; border-radius: 12px; margin-right: auto; border: 1px solid var(--border); }

        /* Profile Modal Specifics */
        .profile-head { display: flex; align-items: center; gap: 16px; padding: 24px; }
        .user-avatar-placeholder { width: 64px; height: 64px; background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: #111009; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 2rem; font-weight: 800; box-shadow: 0 4px 15px rgba(201, 168, 76, 0.3); }
        .head-info { flex: 1; }
        .head-info h3 { font-size: 1.4rem; display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .admin-tag-large { background: var(--gold-dim); color: var(--gold); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; border: 1px solid var(--border-accent); }
        
        .data-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; }
        .data-item label { display: block; color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px; font-weight: bold; }
        .val-box { background: var(--bg-base); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border); color: var(--text-primary); font-size: 1rem; }
        .val-box.ltr { direction: ltr; font-family: monospace; text-align: left; }
        
        .subs-wrapper { border-top: 1px dashed var(--border); padding-top: 24px; }
        .subs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .subs-header h4 { margin: 0; color: var(--text-primary); font-size: 1.1rem; }
        
        .subs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .sub-column h5 { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); margin: 0 0 12px 0; font-size: 0.95rem; }
        .sub-chip { background: var(--bg-base); border: 1px solid var(--border); padding: 10px 14px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--text-primary); transition: 0.2s; }
        .sub-chip:hover { border-color: var(--border-accent); }
        .remove-btn { background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; width: 24px; height: 24px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; transition: 0.2s; }
        .remove-btn:hover { background: #ef4444; color: white; }
        .empty-sub { color: var(--text-muted); font-size: 0.85rem; padding: 10px; background: var(--bg-base); border-radius: 8px; text-align: center; border: 1px dashed var(--border); }
        .empty-sub.inline { border: none; background: transparent; padding: 0; text-align: right; margin-right: 24px; }

        @keyframes popIn { from { transform: scale(0.95) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes slideUp { from { transform: translate(-50%, 40px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

        @media (max-width: 768px) {
            .controls-container { flex-direction: column; }
            .search-wrapper { width: 100%; }
            .filter-btn, .btn-refresh { width: 100%; justify-content: center; }
            .data-row { grid-template-columns: 1fr; }
            .subs-grid { grid-template-columns: 1fr; }
            .bulk-glass-bar { width: 90%; flex-direction: column; gap: 12px; border-radius: 20px; padding: 16px; }
            .bulk-actions { width: 100%; justify-content: space-between; }
        }
      `}</style>
    </TeacherLayout>
  );
}
