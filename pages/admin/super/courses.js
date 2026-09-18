import SuperLayout from '../../../components/SuperLayout';
import { useState, useEffect, useMemo, Fragment } from 'react';

// أيقونة الكورسات للعنوان
const CoursesIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const TeacherIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const DURATION_PRESETS = [
  { label: 'شهر', days: 30 },
  { label: '3 أشهر', days: 90 },
  { label: '6 أشهر', days: 180 },
  { label: 'سنة', days: 365 },
];

export default function SuperCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  // --- Teacher-first navigation ---
  // null => showing the teachers grid. Otherwise the id of the teacher
  // whose courses are currently being managed.
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);

  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [confirmData, setConfirmData] = useState({ show: false, message: '', onConfirm: null });

  // --- Scheduled deletion modal ---
  const [deletionTarget, setDeletionTarget] = useState(null); // { id, title, scheduled_deletion_at }
  const [deletionDateInput, setDeletionDateInput] = useState('');

  // --- Access duration modal (course-level OR subject-level) ---
  const [durationTarget, setDurationTarget] = useState(null); // { type, id, courseId, title, current }
  const [durationCustomInput, setDurationCustomInput] = useState('');
  const [durationMode, setDurationMode] = useState('lifetime'); // 'lifetime' | 'preset' | 'custom'
  const [durationPreset, setDurationPreset] = useState(30);
  const [durationScope, setDurationScope] = useState('new'); // 'new' | 'all' — who the change applies to
  const [durationStudentCount, setDurationStudentCount] = useState(null); // fetched on demand, only for this one item
  const [durationCountLoading, setDurationCountLoading] = useState(false);

  // --- Report price modal (course-level OR subject-level) ---
  // Used only for teachers on billing_method='course_price' — see
  // lib/teacherBillingHelper.js. Doesn't touch access/expiry at all, so
  // unlike the duration modal there's no "apply to existing" scope.
  const [priceTarget, setPriceTarget] = useState(null); // { type, id, courseId, title, current }
  const [priceInput, setPriceInput] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };
  const showConfirm = (msg, callback) => setConfirmData({ show: true, message: msg, onConfirm: callback });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/courses');
      const data = await res.json();
      if (res.ok) {
        setCourses(data.courses || []);
      } else {
        showToast(data.error || 'فشل تحميل الكورسات', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const formatDateTime = (v) => {
    if (!v) return null;
    return new Date(v).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ============================================================
  // Teachers grid (Step 1)
  // ============================================================
  const teacherGroups = useMemo(() => {
    const map = new Map();
    for (const c of courses) {
      const key = c.teacher_id || 'none';
      if (!map.has(key)) {
        map.set(key, {
          teacher_id: c.teacher_id,
          teacher_name: c.teacher_name || '—',
          courses: [],
          scheduledDeletions: 0,
        });
      }
      const g = map.get(key);
      g.courses.push(c);
      if (c.scheduled_deletion_at) g.scheduledDeletions += 1;
    }
    return [...map.values()].sort((a, b) => b.courses.length - a.courses.length);
  }, [courses]);

  const filteredTeacherGroups = useMemo(() => {
    if (!searchTerm.trim()) return teacherGroups;
    const q = searchTerm.trim().toLowerCase();
    return teacherGroups.filter(g => g.teacher_name?.toLowerCase().includes(q));
  }, [teacherGroups, searchTerm]);

  const selectedTeacher = useMemo(
    () => teacherGroups.find(g => g.teacher_id === selectedTeacherId) || null,
    [teacherGroups, selectedTeacherId]
  );

  // ============================================================
  // Courses of the selected teacher (Step 2)
  // ============================================================
  const filteredCourses = useMemo(() => {
    if (!selectedTeacher) return [];
    let list = selectedTeacher.courses;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(c => c.title?.toLowerCase().includes(q) || String(c.id).includes(q));
    }
    return list;
  }, [selectedTeacher, searchTerm]);

  const openTeacher = (teacherId) => {
    setSelectedTeacherId(teacherId);
    setSearchTerm('');
    setExpanded({});
  };
  const backToTeachers = () => {
    setSelectedTeacherId(null);
    setSearchTerm('');
  };

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // ============================================================
  // Scheduled deletion
  // ============================================================
  const openDeletionModal = (course) => {
    setDeletionTarget(course);
    setDeletionDateInput(course.scheduled_deletion_at ? toLocalInputValue(course.scheduled_deletion_at) : '');
  };

  const toLocalInputValue = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const submitScheduledDeletion = async () => {
    if (!deletionTarget) return;
    const iso = deletionDateInput ? new Date(deletionDateInput).toISOString() : null;
    // لا نمرر رسالة ثابتة هنا: الباك إند قد يُلحق تحذيراً (باقة ستتأثر) برسالته،
    // ونريد لهذا التحذير أن يظهر بدل أن يُستبدل برسالة عامة.
    await callCoursesApi({
      action: 'set_scheduled_deletion',
      courseId: deletionTarget.id,
      scheduledDeletionAt: iso,
    });
    setDeletionTarget(null);
  };

  const cancelScheduledDeletion = (course) => {
    showConfirm(`إلغاء جدولة حذف كورس "${course.title}"؟`, async () => {
      await callCoursesApi({ action: 'set_scheduled_deletion', courseId: course.id, scheduledDeletionAt: null }, 'تم إلغاء جدولة الحذف');
    });
  };

  // ============================================================
  // Access duration
  // ============================================================
  const openDurationModal = (target) => {
    setDurationTarget(target);
    if (target.current) {
      setDurationMode('custom');
      setDurationCustomInput(String(target.current));
    } else {
      setDurationMode('lifetime');
      setDurationCustomInput('');
    }
    setDurationPreset(30);
    setDurationScope('new');

    // Fetch the student count for THIS item only, on demand — avoids
    // computing it for every course/subject up front on page load.
    setDurationStudentCount(null);
    setDurationCountLoading(true);
    const countType = target.type === 'subject' ? 'subject' : 'course';
    fetch(`/api/dashboard/super/courses?countType=${countType}&countId=${target.id}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setDurationStudentCount(data.active_students ?? 0);
        else setDurationStudentCount(null);
      })
      .catch(() => setDurationStudentCount(null))
      .finally(() => setDurationCountLoading(false));
  };

  const submitAccessDuration = async () => {
    if (!durationTarget) return;
    let durationDays = null;
    if (durationMode === 'preset') durationDays = durationPreset;
    if (durationMode === 'custom') {
      const n = Number(durationCustomInput);
      if (!Number.isFinite(n) || n <= 0) return showToast('أدخل عدد أيام صحيح', 'error');
      durationDays = Math.round(n);
    }

    const runSave = async () => {
      await callCoursesApi({
        action: 'set_access_duration',
        courseId: durationTarget.courseId,
        subjectId: durationTarget.type === 'subject' ? durationTarget.id : null,
        durationDays,
        applyToExisting: durationScope === 'all',
      }, `تم تحديث مدة الوصول لـ "${durationTarget.title}"`);
      setDurationTarget(null);
    };

    if (durationScope === 'all') {
      const periodLabel = durationDays ? `${durationDays} يوم` : 'مدى الحياة';
      const cascadeNote = durationTarget.type === 'course'
        ? ' وسيشمل ذلك أيضاً مواد هذا الكورس التي لا تملك مدة خاصة بها (الموروثة من إعداد الكورس).'
        : '';
      const countNote = durationStudentCount !== null ? ` (${durationStudentCount} طالب حالياً على هذا العنصر)` : '';
      showConfirm(
        `سيتم تطبيق المدة الجديدة (${periodLabel}) على كل الطلاب الحاليين في "${durationTarget.title}"${countNote} وإعادة حساب تاريخ انتهاء وصول كل واحد منهم بناءً على تاريخ اشتراكه.${cascadeNote} هل أنت متأكد؟`,
        runSave
      );
    } else {
      await runSave();
    }
  };

  // ============================================================
  // Report price (billing_method = 'course_price')
  // ============================================================
  const openPriceModal = (target) => {
    setPriceTarget(target);
    setPriceInput(target.current !== null && target.current !== undefined ? String(target.current) : '');
  };

  const submitReportPrice = async () => {
    if (!priceTarget) return;
    let price = null;
    if (priceInput.trim() !== '') {
      const n = Number(priceInput);
      if (!Number.isFinite(n) || n < 0) return showToast('أدخل سعراً صحيحاً (رقم موجب)', 'error');
      price = n;
    }

    await callCoursesApi({
      action: 'set_report_price',
      courseId: priceTarget.courseId,
      subjectId: priceTarget.type === 'subject' ? priceTarget.id : null,
      price,
    }, `تم تحديث سعر التقرير لـ "${priceTarget.title}"`);
    setPriceTarget(null);
  };

  // ============================================================
  // Shared API call
  // ============================================================
  const callCoursesApi = async (payload, successMsg) => {
    try {
      const res = await fetch('/api/dashboard/super/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(successMsg || data.message || 'تم بنجاح');
        fetchData();
      } else {
        showToast(data.error || 'حدث خطأ', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  };

  const durationBadge = (days) => {
    if (!days) return <span className="dur-badge lifetime">مدى الحياة</span>;
    return <span className="dur-badge timed">{days} يوم</span>;
  };

  const priceBadge = (price) => {
    if (price === null || price === undefined) return <span className="price-badge unset">غير محدد</span>;
    return <span className="price-badge set">{price} ج</span>;
  };

  return (
    <SuperLayout title="إدارة الكورسات">
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.message}</div>

      <div className="page-header">
        <div className="page-title">
          <div className="title-icon">{selectedTeacher ? <TeacherIcon /> : <CoursesIcon />}</div>
          <div>
            {selectedTeacher ? (
              <>
                <h1>{selectedTeacher.teacher_name}</h1>
                <p>{selectedTeacher.courses.length} كورس</p>
              </>
            ) : (
              <>
                <h1>إدارة الكورسات</h1>
                <p>اختر مدرساً لعرض كورساته والتحكم في مواده وفترات الوصول وجدولة الحذف.</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="controls-container">
        {selectedTeacher && (
          <button onClick={backToTeachers} className="btn-back">
            <BackIcon /> كل المدرسين
          </button>
        )}
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder={selectedTeacher ? 'بحث بعنوان الكورس أو الـ ID...' : 'بحث باسم المدرس...'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button onClick={fetchData} className="btn-refresh" title="تحديث البيانات">🔄</button>
      </div>

      {loading ? (
        <div className="table-box"><div className="loading-state">جاري التحميل...</div></div>
      ) : !selectedTeacher ? (
        // ============================================================
        // STEP 1 — Teachers grid
        // ============================================================
        <div className="teachers-grid">
          {filteredTeacherGroups.map(g => (
            <div key={g.teacher_id || 'none'} className="teacher-card" onClick={() => openTeacher(g.teacher_id)}>
              <div className="teacher-avatar">{(g.teacher_name || '—')[0]}</div>
              <div className="teacher-name">{g.teacher_name}</div>
              <div className="teacher-stats">
                <span className="t-stat"><CoursesIcon />{g.courses.length} كورس</span>
              </div>
              {g.scheduledDeletions > 0 && (
                <span className="del-badge teacher-del-badge">🗓️ {g.scheduledDeletions} حذف مجدول</span>
              )}
            </div>
          ))}
          {filteredTeacherGroups.length === 0 && (
            <div className="empty-text full-span">لا يوجد نتائج</div>
          )}
        </div>
      ) : (
        // ============================================================
        // STEP 2 — Selected teacher's courses
        // ============================================================
        <div className="table-box">
          <table className="std-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ textAlign: 'right' }}>الكورس</th>
                <th style={{ textAlign: 'center' }}>مدة الوصول</th>
                <th style={{ textAlign: 'center' }}>سعر التقرير</th>
                <th style={{ textAlign: 'center' }}>الحذف المجدول</th>
                <th style={{ textAlign: 'center', width: '260px' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map(course => (
                <Fragment key={course.id}>
                  <tr className="clickable" onClick={() => toggleExpand(course.id)}>
                    <td style={{ textAlign: 'center' }}><ChevronIcon open={!!expanded[course.id]} /></td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{course.id}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{course.title}</td>
                    <td style={{ textAlign: 'center' }}>{durationBadge(course.access_duration_days)}</td>
                    <td style={{ textAlign: 'center' }}>{priceBadge(course.report_price)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {course.scheduled_deletion_at
                        ? <span className="del-badge">🗓️ {formatDateTime(course.scheduled_deletion_at)}</span>
                        : <span className="empty-inline">-</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                      <div className="row-actions">
                        <button className="mini-btn" onClick={() => openDurationModal({ type: 'course', id: course.id, courseId: course.id, title: course.title, current: course.access_duration_days })}>⏳ المدة</button>
                        <button className="mini-btn" onClick={() => openPriceModal({ type: 'course', id: course.id, courseId: course.id, title: course.title, current: course.report_price })}>💰 سعر التقرير</button>
                        <button className="mini-btn" onClick={() => openDeletionModal(course)}>🗑️ جدولة</button>
                        {course.scheduled_deletion_at && (
                          <button className="mini-btn danger" onClick={() => cancelScheduledDeletion(course)}>إلغاء</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded[course.id] && (
                    <tr className="expand-row">
                      <td></td>
                      <td colSpan="6">
                        {course.subjects.length === 0 ? (
                          <p className="empty-text">لا توجد مواد في هذا الكورس</p>
                        ) : (
                          <div className="subjects-list">
                            {course.subjects.map(subject => (
                              <div key={subject.id} className="subject-row">
                                <span className="subject-title">📄 {subject.title}</span>
                                {durationBadge(subject.access_duration_days)}
                                {priceBadge(subject.report_price)}
                                <button
                                  className="mini-btn"
                                  onClick={() => openDurationModal({ type: 'subject', id: subject.id, courseId: course.id, title: `${course.title} / ${subject.title}`, current: subject.access_duration_days })}
                                >
                                  ⏳ المدة
                                </button>
                                <button
                                  className="mini-btn"
                                  onClick={() => openPriceModal({ type: 'subject', id: subject.id, courseId: course.id, title: `${course.title} / ${subject.title}`, current: subject.report_price })}
                                >
                                  💰 سعر التقرير
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filteredCourses.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>لا يوجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Scheduled Deletion Modal --- */}
      {deletionTarget && (
        <div className="modal-overlay" onClick={() => setDeletionTarget(null)}>
          <div className="modal-box duration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🗑️ جدولة حذف "{deletionTarget.title}"</h3>
              <button className="close-icon" onClick={() => setDeletionTarget(null)}>✕</button>
            </div>
            <div className="modal-content">
              <p className="hint-text">
                عند وصول هذا الموعد سيُحذف الكورس بالكامل (المواد، الفصول، الفيديوهات، الملفات، الاختبارات) بشكل نهائي، ولا يمكن التراجع بعدها.
              </p>
              <label className="field-label">تاريخ ووقت الحذف</label>
              <input
                type="datetime-local"
                className="input-field ltr"
                value={deletionDateInput}
                onChange={e => setDeletionDateInput(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setDeletionTarget(null)}>إلغاء</button>
              <button
                className="confirm-btn red"
                disabled={!deletionDateInput}
                onClick={() => showConfirm(`تأكيد جدولة حذف "${deletionTarget.title}" نهائياً في الموعد المحدد؟`, submitScheduledDeletion)}
              >
                تأكيد الجدولة 🗓️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Access Duration Modal --- */}
      {durationTarget && (
        <div className="modal-overlay" onClick={() => setDurationTarget(null)}>
          <div className="modal-box duration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>⏳ مدة الوصول لـ "{durationTarget.title}"</h3>
              <button className="close-icon" onClick={() => setDurationTarget(null)}>✕</button>
            </div>
            <div className="modal-content">
              <div className="student-count-badge">
                👤 الطلاب الحاليون على هذا العنصر:{' '}
                {durationCountLoading ? (
                  <span className="count-loading">جاري الحساب...</span>
                ) : (
                  <strong>{durationStudentCount ?? '—'}</strong>
                )}
              </div>

              <p className="hint-text">
                حدد المدة الجديدة، ثم اختر إن كانت تسري على المشتركين الجدد فقط أو على كل الطلاب الحاليين أيضاً.
                {durationTarget.type === 'subject' && ' هذا الضبط يخص هذه المادة فقط، وله أولوية على إعداد الكورس العام.'}
              </p>

              <div className="duration-options">
                <label className="radio-row">
                  <input type="radio" checked={durationMode === 'lifetime'} onChange={() => setDurationMode('lifetime')} />
                  <span>مدى الحياة (بدون انتهاء){durationTarget.type === 'subject' ? ' — أو الوراثة من الكورس إن تُرك بلا ضبط' : ''}</span>
                </label>

                <label className="radio-row">
                  <input type="radio" checked={durationMode === 'preset'} onChange={() => setDurationMode('preset')} />
                  <span>مدة محددة مسبقاً</span>
                </label>
                {durationMode === 'preset' && (
                  <div className="preset-chips">
                    {DURATION_PRESETS.map(p => (
                      <button
                        type="button"
                        key={p.days}
                        className={`chip ${durationPreset === p.days ? 'active' : ''}`}
                        onClick={() => setDurationPreset(p.days)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}

                <label className="radio-row">
                  <input type="radio" checked={durationMode === 'custom'} onChange={() => setDurationMode('custom')} />
                  <span>عدد أيام مخصص</span>
                </label>
                {durationMode === 'custom' && (
                  <input
                    type="number"
                    min="1"
                    className="input-field ltr"
                    placeholder="عدد الأيام"
                    value={durationCustomInput}
                    onChange={e => setDurationCustomInput(e.target.value)}
                  />
                )}
              </div>

              <div className="scope-section">
                <label className="field-label">نطاق التطبيق</label>
                <div className="duration-options">
                  <label className="radio-row">
                    <input type="radio" checked={durationScope === 'new'} onChange={() => setDurationScope('new')} />
                    <span>الطلاب الجدد فقط (الوضع الحالي) — لن يتأثر الطلاب الحاليون</span>
                  </label>
                  <label className="radio-row">
                    <input type="radio" checked={durationScope === 'all'} onChange={() => setDurationScope('all')} />
                    <span>كل الطلاب — بما فيهم الحاليون (إعادة حساب تاريخ الانتهاء لكل طالب بناءً على تاريخ اشتراكه)</span>
                  </label>
                </div>
                {durationScope === 'all' && (
                  <p className="hint-text warn-hint">
                    ⚠️ سيتم تعديل تاريخ انتهاء الوصول لكل طالب لديه وصول حالياً لهذا العنصر. كل طالب سيُحتسب من تاريخ اشتراكه الأصلي + المدة الجديدة، وليس من الآن.
                    {durationTarget.type === 'course' && ' سيشمل هذا أيضاً مواد هذا الكورس التي لم تُضبط لها مدة خاصة (تعتمد على إعداد الكورس).'}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setDurationTarget(null)}>إلغاء</button>
              <button className="confirm-btn" onClick={submitAccessDuration}>حفظ ✅</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Report Price Modal (billing_method = 'course_price') --- */}
      {priceTarget && (
        <div className="modal-overlay" onClick={() => setPriceTarget(null)}>
          <div className="modal-box duration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>💰 سعر التقرير لـ "{priceTarget.title}"</h3>
              <button className="close-icon" onClick={() => setPriceTarget(null)}>✕</button>
            </div>
            <div className="modal-content">
              <p className="hint-text">
                هذا السعر يُستخدم فقط لحساب عمولة المنصة من المدرسين الذين تم ضبط "طريقة حساب الأرباح" الخاصة بهم على "سعر ثابت لكل كورس/مادة" (من صفحة إدارة المدرسين). لا علاقة له بسعر بيع الكورس للطلاب.
                {priceTarget.type === 'subject' && ' اتركه فارغاً لوراثة سعر الكورس الأب.'}
              </p>
              <label className="field-label">السعر (جنيه)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="input-field ltr"
                placeholder={priceTarget.type === 'subject' ? 'اتركه فارغاً للوراثة من الكورس' : 'اتركه فارغاً لعدم التسعير'}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setPriceTarget(null)}>إلغاء</button>
              <button className="confirm-btn" onClick={submitReportPrice}>حفظ ✅</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm Alert --- */}
      {confirmData.show && (
        <div className="modal-overlay alert-overlay">
          <div className="modal-box alert-box">
            <h3>⚠️ تأكيد الإجراء</h3>
            <p>{confirmData.message}</p>
            <div className="alert-actions">
              <button className="cancel-btn" onClick={() => setConfirmData({ ...confirmData, show: false })}>إلغاء</button>
              <button className="confirm-btn red" onClick={() => { confirmData.onConfirm(); setConfirmData({ ...confirmData, show: false }); }}>نعم، تأكيد</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .toast { position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 8px; font-weight: bold; transform: translateX(150%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 99999999; box-shadow: var(--shadow); background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); }
        .toast.show { transform: translateX(0); }
        .toast.success { border-right: 4px solid #22c55e; }
        .toast.error { border-right: 4px solid #ef4444; }

        .page-header { margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .page-title { display: flex; align-items: center; gap: 15px; }
        .title-icon { color: var(--gold); display: flex; align-items: center; justify-content: center; background: var(--gold-dimmer); padding: 10px; border-radius: 12px; border: 1px solid var(--border-accent); }
        .page-title h1 { margin: 0 0 5px 0; color: var(--text-primary); font-size: 1.8rem; font-weight: 800; }
        .page-title p { margin: 0; color: var(--text-muted); font-size: 0.95rem; }

        .controls-container { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .btn-back { display: flex; align-items: center; gap: 8px; background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); padding: 12px 16px; border-radius: 12px; cursor: pointer; font-weight: 700; font-size: 0.9rem; transition: 0.2s; white-space: nowrap; }
        .btn-back:hover { border-color: var(--gold); color: var(--gold); }
        .search-wrapper { position: relative; flex: 2; min-width: 250px; }
        .search-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; opacity: 0.7; }
        .search-input { width: 100%; padding: 12px 12px 12px 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-size: 0.95rem; transition: 0.2s; outline: none; }
        .search-input:focus { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-dim); }

        .btn-refresh { background: var(--bg-elevated); color: var(--gold); border: 1px solid var(--border-accent); padding: 12px; border-radius: 12px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
        .btn-refresh:hover { background: var(--gold-dimmer); transform: rotate(15deg); }

        /* --- Teachers grid --- */
        .teachers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
        .teacher-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px 18px; box-shadow: var(--shadow); cursor: pointer; transition: 0.2s; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; position: relative; }
        .teacher-card:hover { transform: translateY(-4px); border-color: var(--gold); box-shadow: 0 10px 25px var(--gold-dim); }
        .teacher-avatar { width: 60px; height: 60px; border-radius: 50%; background: var(--gold-dim); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.6rem; border: 2px solid var(--border-accent); }
        .teacher-name { font-weight: 800; color: var(--text-primary); font-size: 1.05rem; }
        .teacher-stats { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .t-stat { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 0.82rem; font-weight: 600; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; }
        .t-stat svg { width: 14px; height: 14px; }
        .t-stat.gold { color: var(--gold); }
        .teacher-del-badge { position: static; margin-top: 4px; }
        .empty-text.full-span { grid-column: 1 / -1; }

        .table-box { background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow-x: auto; box-shadow: var(--shadow); -webkit-overflow-scrolling: touch; }
        .std-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .std-table th { background: var(--bg-elevated); padding: 16px 20px; color: var(--text-muted); border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 0.9em; text-transform: uppercase; font-weight: 700; }
        .std-table td { padding: 16px 20px; border-bottom: 1px solid var(--border); color: var(--text-secondary); vertical-align: middle; }
        .std-table tr:last-child td { border-bottom: none; }
        .clickable:hover td { background: var(--bg-hover); cursor: pointer; }

        .expand-row td { background: var(--bg-elevated); padding: 15px 20px; }
        .subjects-list { display: flex; flex-direction: column; gap: 10px; }
        .subject-row { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; }
        .subject-title { font-weight: 600; color: var(--text-primary); flex: 1; min-width: 160px; }
        .empty-text { color: var(--text-muted); font-size: 0.9em; text-align: center; font-style: italic; background: var(--bg-hover); padding: 15px; border-radius: 10px; border: 1px dashed var(--border); margin: 0; }
        .empty-inline { color: var(--text-muted); }

        .dur-badge { padding: 5px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; display: inline-block; white-space: nowrap; }
        .dur-badge.lifetime { background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); }
        .dur-badge.timed { background: var(--gold-dimmer); color: var(--gold); border: 1px solid var(--border-accent); }

        .price-badge { padding: 5px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; display: inline-block; white-space: nowrap; }
        .price-badge.set { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); }
        .price-badge.unset { background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); }

        .del-badge { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 5px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; white-space: nowrap; }

        .row-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
        .mini-btn { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.8em; transition: 0.2s; white-space: nowrap; }
        .mini-btn:hover { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }
        .mini-btn.danger { color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
        .mini-btn.danger:hover { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; }

        .loading-state { padding: 50px; text-align: center; color: var(--gold); font-weight: bold; font-size: 1.1rem; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
        .modal-box { background: var(--bg-surface); width: 90%; border-radius: 16px; border: 1px solid var(--border-accent); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 30px 60px rgba(0,0,0,0.6); animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .duration-modal { max-width: 520px; max-height: 85vh; }
        .alert-box { max-width: 420px; padding: 30px; text-align: center; }
        .alert-box h3 { margin: 0 0 15px 0; color: var(--gold); font-size: 1.4rem; }
        .alert-box p { color: var(--text-secondary); margin-bottom: 25px; font-size: 1rem; line-height: 1.5; }
        .alert-actions { display: flex; justify-content: center; gap: 12px; }

        .modal-head { background: var(--bg-elevated); padding: 20px 25px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
        .modal-head h3 { margin: 0; color: var(--gold); font-size: 1.15rem; }
        .close-icon { background: none; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; padding: 6px; border-radius: 50%; transition: 0.2s; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
        .close-icon:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }

        .modal-content { padding: 25px; overflow-y: auto; }
        .hint-text { color: var(--text-muted); font-size: 0.88em; line-height: 1.6; background: var(--bg-elevated); border: 1px dashed var(--border); border-radius: 10px; padding: 12px 15px; margin: 0 0 20px 0; }
        .student-count-badge { display: flex; align-items: center; gap: 6px; color: var(--text-primary); font-size: 0.95em; background: var(--gold-dimmer); border: 1px solid var(--border-accent); border-radius: 10px; padding: 10px 15px; margin: 0 0 16px 0; }
        .student-count-badge strong { color: var(--gold); font-size: 1.05em; }
        .count-loading { color: var(--text-muted); font-style: italic; }
        .hint-text.warn-hint { color: #ef4444; border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); margin: 12px 0 0 0; }
        .field-label { display: block; color: var(--text-secondary); font-weight: 600; font-size: 0.9em; margin-bottom: 8px; }

        .input-field { width: 100%; padding: 12px 15px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 10px; outline: none; font-size: 0.95rem; transition: 0.2s; }
        .input-field:focus { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-dim); }
        .input-field.ltr { direction: ltr; }

        .duration-options { display: flex; flex-direction: column; gap: 12px; }
        .radio-row { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 0.95em; cursor: pointer; }
        .radio-row input[type="radio"] { accent-color: var(--gold); width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; margin-top: 2px; }
        .preset-chips { display: flex; gap: 8px; flex-wrap: wrap; padding-right: 28px; }
        .chip { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 0.85em; transition: 0.2s; }
        .chip.active, .chip:hover { background: var(--gold); color: #111009; border-color: var(--gold-light); }

        .scope-section { margin-top: 22px; padding-top: 18px; border-top: 1px dashed var(--border); }

        .modal-footer { padding: 18px 25px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border); background: var(--bg-elevated); }

        .confirm-btn { background: var(--gold); color: #111009; border: none; padding: 12px 22px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 0.95rem; transition: 0.2s; min-height: 46px; display: flex; align-items: center; justify-content: center; }
        .confirm-btn:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 5px 15px var(--gold-dim); }
        .confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .confirm-btn.red { background: #ef4444; color: white; }
        .confirm-btn.red:hover { background: #dc2626; box-shadow: 0 5px 15px rgba(239, 68, 68, 0.3); }
        .cancel-btn { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); padding: 12px 22px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: 0.2s; min-height: 46px; display: flex; align-items: center; justify-content: center; }
        .cancel-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--text-muted); }

        @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        @media (max-width: 768px) {
          .page-title { flex-direction: column; text-align: center; }
          .page-title h1 { font-size: 1.5rem; }
          .controls-container { flex-direction: column; align-items: stretch; gap: 12px; }
          .search-wrapper { width: 100%; min-width: auto; }
          .btn-refresh { width: 100%; justify-content: center; }
          .btn-back { width: 100%; justify-content: center; }
          .std-table th, .std-table td { padding: 12px 10px; font-size: 0.85rem; }
          .modal-box { width: 95%; max-height: 90dvh; margin: 15px auto; }
          .modal-footer { flex-direction: column-reverse; }
          .modal-footer button { width: 100%; }
          .toast { top: 15px; left: 15px; right: 15px; text-align: center; transform: translateY(-150%); }
          .toast.show { transform: translateY(0); }
        }
      `}</style>
    </SuperLayout>
  );
}
