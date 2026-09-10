import SuperLayout from '../../../components/SuperLayout';
import { useState, useEffect, useRef } from 'react';

// ─── SVG ICONS COMPONENTS ──────────────────────────────────────────────
const IconInbox = ({ size = 24, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>);
const IconTeacher = ({ size = 18, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>);
const IconClock = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>);
const IconCheck = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);
const IconX = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const IconRefresh = ({ size = 18, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>);
const IconEmpty = ({ size = 48, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>);
const IconUser = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>);
const IconPhone = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>);
const IconEdit = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>);
const IconCart = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>);
const IconNote = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>);
const IconReceipt = ({ size = 14, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>);
const IconZoom = ({ size = 24, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>);
const IconWarning = ({ size = 24, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>);
const IconArrowRight = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>);
const IconArrowLeft = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const IconChevronDown = ({ size = 16, className = "" }) => (<svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>);
// ───────────────────────────────────────────────────────────────────────

export default function SuperRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  
  // ✅ حالات Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  // ✅ حالات المدرسين و Dropdown
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
  const dropdownRef = useRef(null); // لإغلاق القائمة عند النقر خارجها

  // حالات النوافذ والتنبيهات
  const [modalImage, setModalImage] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, id: null, action: null });
  const [rejectionReason, setRejectionReason] = useState('');
  
  // ✅ حالة نافذة تعديل السعر
  const [editPriceModal, setEditPriceModal] = useState({ show: false, id: null, price: '' });

  // الفلترة
  const [filter, setFilter] = useState('pending'); // pending, approved, rejected

  const showToast = (msg, type = 'success') => {
      setToast({ show: true, message: msg, type });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  // ✅ إغلاق قائمة المدرسين عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTeacherDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ جلب قائمة المدرسين للفلتر
  const fetchTeachers = async () => {
    try {
      const res = await fetch('/api/dashboard/super/teachers'); 
      if (res.ok) {
        const data = await res.json();
        setTeachers(data);
      }
    } catch (err) {
      console.error("فشل جلب المدرسين", err);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // ✅ إرسال teacherId مع الطلب
      const res = await fetch(`/api/dashboard/super/requests?status=${filter}&page=${page}&limit=${pageSize}&teacherId=${selectedTeacher}`);
      const result = await res.json();
      
      if (result.data) {
          setRequests(result.data);
          setTotalCount(result.count || 0);
      } else if (Array.isArray(result)) {
          setRequests(result);
          setTotalCount(result.length);
      } else {
          setRequests([]);
          setTotalCount(0);
      }
    } catch (err) {
      console.error(err);
      showToast('فشل جلب البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ✅ جلب المدرسين عند تحميل الصفحة مرة واحدة
  useEffect(() => {
    fetchTeachers();
  }, []);

  // إعادة تعيين الصفحة عند تغيير الفلتر أو المدرس
  useEffect(() => {
    setPage(1);
  }, [filter, selectedTeacher]);

  // جلب الطلبات عند تغيير أي من المحددات
  useEffect(() => {
    fetchRequests();
  }, [filter, page, selectedTeacher]);

  const initiateAction = (requestId, action) => {
      setRejectionReason('');
      setConfirmModal({ show: true, id: requestId, action });
  };

  const executeAction = async () => {
    const { id: requestId, action } = confirmModal;
    setConfirmModal({ show: false, id: null, action: null });
    setProcessingId(requestId);

    try {
      const res = await fetch('/api/dashboard/super/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            requestId, 
            action: action === 'delete' ? 'delete_request' : action, 
            rejectionReason: action === 'reject' ? rejectionReason : null 
        })
      });
      
      const result = await res.json();
      
      if (res.ok) {
        showToast(result.message || 'تم تنفيذ العملية بنجاح', 'success');
        setRequests(requests.filter(r => r.id !== requestId));
        setTotalCount(prev => Math.max(0, prev - 1));
      } else {
        showToast(result.error, 'error');
      }
    } catch (err) {
      showToast("حدث خطأ في الاتصال", 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ✅ دالة تحديث السعر الفعلي (تحدث عمود actual_paid_price بدلاً من total_price)
  const handleUpdatePrice = async () => {
    const { id, price } = editPriceModal;
    if (!price || isNaN(price) || price < 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    setProcessingId(id);
    try {
      const res = await fetch('/api/dashboard/super/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: id,
          action: 'update_price',
          newPrice: Number(price)
        })
      });

      const result = await res.json();
      if (res.ok) {
        showToast(result.message, 'success');
        // ✅ تحديث السعر الفعلي في الواجهة فوراً
        setRequests(requests.map(req => req.id === id ? { ...req, actual_paid_price: result.newPrice } : req));
        setEditPriceModal({ show: false, id: null, price: '' });
      } else {
        showToast(result.error, 'error');
      }
    } catch (err) {
      showToast("حدث خطأ في الاتصال", 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // إيجاد اسم المدرس المختار حالياً للعرض
  const getSelectedTeacherName = () => {
    if (selectedTeacher === 'all') return 'كل المدرسين';
    const teacher = teachers.find(t => t.id == selectedTeacher);
    return teacher ? teacher.name : 'كل المدرسين';
  };

  return (
    <SuperLayout title="كل طلبات الاشتراك">
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>
          {toast.message}
      </div>

      <div className="header-container">
        <div>
            <h1 className="flex-center gap-2">
              <IconInbox size={26} style={{ color: 'var(--gold)' }} /> 
              مركز طلبات الاشتراك
            </h1>
            <p className="sub-header">مراقبة وإدارة جميع طلبات الاشتراك لكافة المدرسين</p>
        </div>
        
        <div className="header-actions">
            
            {/* ✅ قائمة اختيار المدرس الاحترافية (Custom Dropdown) */}
            <div className="custom-dropdown-container" ref={dropdownRef}>
              <button 
                className={`custom-dropdown-trigger ${isTeacherDropdownOpen ? 'open' : ''}`}
                onClick={() => setIsTeacherDropdownOpen(!isTeacherDropdownOpen)}
              >
                <div className="flex-center gap-2">
                  <IconTeacher size={18} className="teacher-icon-color" />
                  <span>{getSelectedTeacherName()}</span>
                </div>
                <IconChevronDown size={16} className={`chevron-icon ${isTeacherDropdownOpen ? 'rotated' : ''}`} />
              </button>

              {isTeacherDropdownOpen && (
                <ul className="custom-dropdown-menu">
                  <li 
                    className={selectedTeacher === 'all' ? 'active' : ''}
                    onClick={() => { setSelectedTeacher('all'); setIsTeacherDropdownOpen(false); }}
                  >
                    كل المدرسين
                  </li>
                  {teachers.map(teacher => (
                    <li 
                      key={teacher.id} 
                      className={selectedTeacher == teacher.id ? 'active' : ''}
                      onClick={() => { setSelectedTeacher(teacher.id); setIsTeacherDropdownOpen(false); }}
                    >
                      {teacher.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="filter-tabs">
                <button 
                    className={`tab flex-center gap-2 ${filter === 'pending' ? 'active' : ''}`} 
                    onClick={() => setFilter('pending')}
                >
                    <IconClock /> المعلقة
                </button>
                <button 
                    className={`tab flex-center gap-2 ${filter === 'approved' ? 'active' : ''}`} 
                    onClick={() => setFilter('approved')}
                >
                    <IconCheck /> المقبولة
                </button>
                <button 
                    className={`tab flex-center gap-2 ${filter === 'rejected' ? 'active' : ''}`} 
                    onClick={() => setFilter('rejected')}
                >
                    <IconX /> المرفوضة
                </button>
            </div>
            <button onClick={fetchRequests} className="refresh-btn" title="تحديث البيانات">
                <IconRefresh />
            </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
            <div className="spinner"></div>
            <p>جاري تحميل الطلبات...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
            <div style={{ marginBottom:'15px', color: 'var(--border-accent)' }} className="flex-center justify-center">
                <IconEmpty size={64} />
            </div>
            <h3>لا توجد طلبات للعرض</h3>
            <p>جرب تغيير الفلتر أو اختيار مدرس آخر.</p>
        </div>
      ) : (
        <>
            <div className="requests-grid">
            {requests.map(req => {
                const receiptUrl = req.payment_file_path 
                    ? `/api/admin/file-proxy?type=receipts&filename=${req.payment_file_path}` 
                    : null;
                
                // ✅ التحقق من وجود سعر فعلي مدفوع
                const hasActualPrice = req.actual_paid_price !== null && req.actual_paid_price !== undefined;
                
                return (
                    <div key={req.id} className={`request-card ${req.status}`}>
                        <div className="card-header">
                            <div className="req-meta">
                                <span className="req-id">#{req.id}</span>
                                <span className="req-date">{new Date(req.created_at).toLocaleDateString('ar-EG')}</span>
                            </div>
                            <div className="header-right-actions flex-center gap-2">
                                {req.teachers && (
                                    <span className="teacher-badge flex-center gap-1" title={req.teachers.name}>
                                        <IconTeacher size={14} className="teacher-badge-icon" />
                                        <span className="teacher-badge-name">{req.teachers.name}</span>
                                    </span>
                                )}
                                <button
                                    className="btn-delete-request flex-center justify-center"
                                    onClick={() => initiateAction(req.id, 'delete')}
                                    disabled={processingId === req.id}
                                    title="حذف سجل الطلب نهائياً (لا يؤثر على اشتراك الطالب)"
                                >
                                    <IconX size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="card-body">
                            <div className="info-row">
                                <div className="info-col">
                                    <span className="label flex-center gap-1"><IconUser /> اسم الطالب</span>
                                    <span className="value">{req.user_name}</span>
                                </div>
                                <div className="info-col right">
                                    <span className="label flex-center gap-1"><IconPhone /> هاتف الطالب</span>
                                    <span className="value ltr">{req.phone}</span>
                                </div>
                            </div>
                            
                            {/* ✅ قسم عرض السعر الجديد (الأصلي + المعدل) */}
                            <div className="price-box">
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
                                    <span className="label">المبلغ المطلوب</span>
                                    {/* إظهار السعر الأصلي (مشطوب في حال وجود سعر معدل) */}
                                    <span className="price-value" style={hasActualPrice ? {textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.9em'} : {}}>
                                        {req.total_price} ج.م
                                    </span>
                                    
                                    {/* إظهار السعر الفعلي بلون مختلف (إن وُجد) */}
                                    {hasActualPrice && (
                                        <>
                                            <span className="label" style={{marginTop: '5px', color: 'var(--gold)'}}>المدفوع فعلياً</span>
                                            <span className="price-value" style={{color: 'var(--gold)'}}>{req.actual_paid_price} ج.م</span>
                                        </>
                                    )}
                                </div>
                                
                                <button 
                                    className="btn-edit-price flex-center gap-1"
                                    onClick={() => setEditPriceModal({ show: true, id: req.id, price: hasActualPrice ? req.actual_paid_price : req.total_price })}
                                    title="تعديل المبلغ الفعلي"
                                >
                                    <IconEdit /> تعديل
                                </button>
                            </div>
                            
                            <div className="details-box">
                                <span className="label flex-center gap-1"><IconCart /> المحتوى المطلوب</span>
                                <p className="details-text">{req.course_title || 'محتوى غير محدد'}</p>
                            </div>

                            {req.user_note && (
                                <div className="note-box">
                                    <span className="label flex-center gap-1"><IconNote /> ملاحظات الطالب</span>
                                    <p className="note-text">{req.user_note}</p>
                                </div>
                            )}

                            {receiptUrl && (
                                <div className="receipt-section">
                                    <p className="label flex-center gap-1 justify-center" style={{marginBottom:'8px'}}>
                                        <IconReceipt /> إيصال الدفع
                                    </p>
                                    <div 
                                        className="receipt-thumbnail-wrapper"
                                        onClick={() => setModalImage(receiptUrl)}
                                    >
                                        <img 
                                            src={receiptUrl} 
                                            alt="Receipt" 
                                            className="receipt-thumbnail" 
                                            loading="lazy"
                                            onError={(e) => {e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';}}
                                        />
                                        <div className="zoom-hint">
                                            <IconZoom size={32} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {filter === 'pending' && (
                            <div className="card-actions">
                                <button 
                                    onClick={() => initiateAction(req.id, 'approve')} 
                                    disabled={processingId === req.id}
                                    className="btn approve flex-center justify-center gap-2"
                                >
                                    {processingId === req.id ? '...' : <><IconCheck /> تفعيل</>}
                                </button>
                                <button 
                                    onClick={() => initiateAction(req.id, 'reject')} 
                                    disabled={processingId === req.id}
                                    className="btn reject flex-center justify-center gap-2"
                                >
                                    {processingId === req.id ? '...' : <><IconX /> رفض</>}
                                </button>
                            </div>
                        )}
                        
                        {filter === 'rejected' && req.rejection_reason && (
                            <div className="rejection-note">
                                <strong>سبب الرفض:</strong> {req.rejection_reason}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>

            <div className="pagination-controls">
                <button 
                    disabled={page === 1} 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="page-btn flex-center gap-2"
                >
                    <IconArrowRight /> السابق
                </button>
                <span className="page-info">صفحة {page} من {totalPages || 1}</span>
                <button 
                    disabled={page >= totalPages} 
                    onClick={() => setPage(p => p + 1)}
                    className="page-btn flex-center gap-2"
                >
                    التالي <IconArrowLeft />
                </button>
            </div>
        </>
      )}

      {/* نافذة عرض الصورة */}
      {modalImage && (
          <div className="modal-overlay" onClick={() => setModalImage(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                  <button className="close-modal" onClick={() => setModalImage(null)}>
                      <IconX size={20} />
                  </button>
                  <img src={modalImage} alt="Full Receipt" className="modal-img" />
              </div>
          </div>
      )}

      {/* نافذة التأكيد (القبول/الرفض) */}
      {confirmModal.show && (
          <div className="modal-overlay alert-mode">
              <div className="alert-box">
                  <h3 className="flex-center justify-center gap-2">
                      <IconWarning style={{ color: 'var(--gold)' }} /> 
                      تأكيد الإجراء
                  </h3>
                  <p>
                      {confirmModal.action === 'approve' 
                        ? 'هل أنت متأكد من تفعيل هذا الاشتراك؟ سيتمكن الطالب من الوصول للمحتوى فوراً.' 
                        : confirmModal.action === 'delete'
                        ? 'هل أنت متأكد من حذف سجل هذا الطلب نهائياً؟ لن يظهر بعد الآن في السجلات، لكن اشتراك الطالب (إن كان مفعّلاً) لن يتأثر ولن يُحذف.'
                        : 'هل أنت متأكد من رفض هذا الطلب؟'}
                  </p>

                  {confirmModal.action === 'reject' && (
                      <textarea
                          className="reason-input"
                          placeholder="اكتب سبب الرفض هنا (اختياري)..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          rows="3"
                      ></textarea>
                  )}

                  <div className="alert-actions">
                      <button className="cancel-btn" onClick={() => setConfirmModal({ show: false })}>تراجع</button>
                      <button 
                        className={`confirm-btn ${(confirmModal.action === 'reject' || confirmModal.action === 'delete') ? 'red' : 'green'}`} 
                        onClick={executeAction}
                      >
                          {confirmModal.action === 'delete' ? 'نعم، احذف' : 'نعم، نفذ'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ✅ نافذة تعديل السعر المخصصة للـ Super Admin */}
      {editPriceModal.show && (
          <div className="modal-overlay alert-mode">
              <div className="alert-box">
                  <h3 className="flex-center justify-center gap-2">
                      <IconEdit size={22} style={{ color: 'var(--gold)' }} /> 
                      تعديل المبلغ المدفوع
                  </h3>
                  <p style={{marginBottom: '10px', color: 'var(--text-secondary)'}}>أدخل المبلغ الفعلي الذي تم دفعه للاحتفاظ به في السجلات:</p>
                  <input
                      type="number"
                      className="reason-input"
                      style={{ textAlign: 'center', fontSize: '1.5em', fontWeight: 'bold' }}
                      value={editPriceModal.price}
                      onChange={(e) => setEditPriceModal({ ...editPriceModal, price: e.target.value })}
                      placeholder="المبلغ بالجنيه..."
                      min="0"
                  />
                  <div className="alert-actions">
                      <button className="cancel-btn" onClick={() => setEditPriceModal({ show: false, id: null, price: '' })}>تراجع</button>
                      <button 
                        className="confirm-btn green flex-center gap-2" 
                        onClick={handleUpdatePrice}
                        disabled={processingId === editPriceModal.id}
                      >
                          {processingId === editPriceModal.id ? 'جاري الحفظ...' : 'حفظ التعديل'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <style jsx>{`
        /* Utils */
        .flex-center { display: flex; align-items: center; }
        .justify-center { justify-content: center; }
        .gap-1 { gap: 6px; }
        .gap-2 { gap: 8px; }

        .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .header-container h1 { margin: 0 0 5px 0; color: var(--text-primary); font-size: 1.8rem; }
        .sub-header { color: var(--text-secondary); margin: 0; font-size: 0.95em; }
        
        .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        
        /* ✅ تنسيق القائمة الاحترافية للمدرسين */
        .custom-dropdown-container { position: relative; min-width: 220px; }
        .custom-dropdown-trigger { 
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          background: var(--bg-elevated); color: var(--text-primary); 
          padding: 8px 15px; border: 1px solid var(--border); border-radius: 8px; 
          font-size: 0.95rem; cursor: pointer; height: 40px; transition: all 0.2s;
        }
        .custom-dropdown-trigger:hover, .custom-dropdown-trigger.open { border-color: var(--gold); }
        .teacher-icon-color { color: var(--gold); }
        .chevron-icon { color: var(--text-secondary); transition: transform 0.3s ease; }
        .chevron-icon.rotated { transform: rotate(180deg); color: var(--gold); }
        
        .custom-dropdown-menu { 
          position: absolute; top: calc(100% + 6px); right: 0; width: 100%; 
          background: var(--bg-surface); border: 1px solid var(--border-accent); 
          border-radius: 8px; box-shadow: var(--shadow); z-index: 100; 
          list-style: none; padding: 6px 0; margin: 0; max-height: 250px; overflow-y: auto;
          animation: dropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .custom-dropdown-menu li { 
          padding: 10px 15px; cursor: pointer; color: var(--text-secondary); 
          font-size: 0.95rem; transition: all 0.2s; display: flex; align-items: center;
        }
        .custom-dropdown-menu li:hover { background: var(--bg-hover); color: var(--text-primary); }
        .custom-dropdown-menu li.active { background: var(--gold-dim); color: var(--gold); font-weight: bold; border-right: 3px solid var(--gold); }

        @keyframes dropIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .filter-tabs { display: flex; background: var(--bg-elevated); padding: 4px; border-radius: 8px; border: 1px solid var(--border); }
        .tab { background: transparent; border: none; color: var(--text-secondary); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; white-space: nowrap; }
        .tab:hover { color: var(--text-primary); }
        .tab.active { background: var(--gold); color: #111009; }

        .refresh-btn { background: var(--bg-elevated); color: var(--gold); border: 1px solid var(--border-accent); width: 40px; height: 40px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .refresh-btn:hover { background: var(--gold); color: #111009; }

        .loading-state { text-align: center; color: var(--gold); padding: 60px; }
        .empty-state { text-align: center; padding: 60px; color: var(--text-secondary); background: var(--bg-elevated); border-radius: 12px; border: 1px dashed var(--border); margin-top: 20px; }

        .requests-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px; }
        
        .request-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); transition: transform 0.2s, border-color 0.2s; display: flex; flex-direction: column; }
        .request-card:hover { transform: translateY(-5px); border-color: var(--gold); }
        .request-card.approved { border-color: #22c55e; }
        .request-card.rejected { border-color: #ef4444; opacity: 0.8; }

        .card-header { background: var(--bg-elevated); padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); }
        .req-meta { display: flex; gap: 8px; align-items: center; font-size: 0.8em; color: var(--text-secondary); flex-shrink: 0; }
        .req-id { font-family: monospace; background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; color: var(--text-primary); }
        .header-right-actions { min-width: 0; max-width: 100%; }
        .teacher-badge { background: var(--gold-dim); color: var(--gold); padding: 3px 8px; border-radius: 15px; font-size: 0.75em; font-weight: bold; border: 1px solid var(--border-accent); max-width: 110px; min-width: 0; }
        .teacher-badge-icon { flex-shrink: 0; }
        .teacher-badge-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

        .btn-delete-request { width: 24px; min-width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-muted); cursor: pointer; transition: all 0.2s; padding: 0; }
        .btn-delete-request:hover:not(:disabled) { background: #ef4444; border-color: #ef4444; color: #fff; transform: scale(1.1); }
        .btn-delete-request:disabled { opacity: 0.4; cursor: not-allowed; }

        .card-body { padding: 15px; flex: 1; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .info-col { display: flex; flex-direction: column; }
        .info-col.right { align-items: flex-end; }
        
        .label { color: var(--text-muted); font-size: 0.75em; font-weight: bold; text-transform: uppercase; margin-bottom: 3px; }
        .value { color: var(--text-primary); font-weight: 500; font-size: 0.95em; }
        .value.ltr { direction: ltr; font-family: monospace; }
        
        .price-box { background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.2); padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .price-value { color: #4ade80; font-weight: bold; font-size: 1.1em; }
        .layout-root.light .price-box { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); }
        .layout-root.light .price-value { color: #16a34a; }

        .btn-edit-price { background: var(--gold-dimmer); border: 1px solid var(--border-accent); color: var(--gold); padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8em; font-weight: bold; transition: all 0.2s; }
        .btn-edit-price:hover { background: var(--gold); color: #111009; }

        .details-box { background: var(--bg-base); padding: 10px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 12px; }
        .details-text { color: var(--text-primary); margin: 0; font-size: 0.9em; line-height: 1.4; white-space: pre-wrap; margin-top: 4px; }

        .note-box { background: var(--gold-dimmer); border: 1px solid var(--border-accent); padding: 10px; border-radius: 8px; margin-bottom: 12px; }
        .note-text { color: var(--gold); margin: 0; font-size: 0.9em; line-height: 1.4; white-space: pre-wrap; margin-top: 4px; }

        .receipt-section { margin-top: 12px; text-align: center; }
        .receipt-thumbnail-wrapper { position: relative; height: 140px; width: 100%; background: var(--bg-base); border-radius: 8px; overflow: hidden; cursor: zoom-in; border: 1px solid var(--border); transition: border-color 0.2s; }
        .receipt-thumbnail-wrapper:hover { border-color: var(--gold); }
        .receipt-thumbnail { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
        .receipt-thumbnail-wrapper:hover .receipt-thumbnail { transform: scale(1.05); opacity: 0.3; }
        .zoom-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0; transition: opacity 0.3s; pointer-events: none; color: var(--gold); }
        .receipt-thumbnail-wrapper:hover .zoom-hint { opacity: 1; }

        .card-actions { display: flex; gap: 8px; padding: 12px 15px; border-top: 1px solid var(--border); background: var(--bg-elevated); }
        .btn { flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: opacity 0.2s; font-size: 0.95em; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn.approve { background: #22c55e; color: #fff; }
        .btn.reject { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); }
        .btn.reject:hover { background: #ef4444; color: white; }

        .rejection-note { padding: 12px 15px; background: rgba(239, 68, 68, 0.1); color: #ef4444; font-size: 0.85em; border-top: 1px solid rgba(239, 68, 68, 0.3); }

        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
        .modal-content { position: relative; max-width: 95%; max-height: 95%; display: flex; justify-content: center; align-items: center; }
        .modal-img { max-width: 100%; max-height: 90vh; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        .close-modal { position: absolute; top: -40px; right: 0px; background: white; color: black; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; }

        .alert-mode { background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); }
        .alert-box { background: var(--bg-surface); padding: 25px; border-radius: 16px; border: 1px solid var(--border-accent); width: 90%; max-width: 400px; text-align: center; box-shadow: var(--shadow); animation: popIn 0.3s; }
        .alert-box h3 { margin-top: 0; color: var(--gold); }
        .alert-box p { color: var(--text-secondary); font-size: 1.1em; margin-bottom: 25px; }
        .reason-input { width: 100%; padding: 10px; background: var(--bg-base); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); margin-bottom: 20px; resize: vertical; font-family: inherit; }
        .reason-input:focus { border-color: var(--gold); outline: none; }
        
        .alert-actions { display: flex; gap: 10px; justify-content: center; }
        .alert-actions button { padding: 10px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; font-size: 1em; }
        .cancel-btn { background: transparent; border: 1px solid var(--border) !important; color: var(--text-secondary); }
        .cancel-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .confirm-btn.green { background: #22c55e; color: #fff; }
        .confirm-btn.red { background: #ef4444; color: white; }

        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--bg-elevated); color: var(--text-primary); padding: 12px 25px; border-radius: 50px; font-weight: bold; box-shadow: var(--shadow); z-index: 2000; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; border: 1px solid var(--border); }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.success { background: #22c55e; color: #fff; border-color: #22c55e; }
        .toast.error { background: #ef4444; color: white; border-color: #ef4444; }
        
        .spinner { width: 30px; height: 30px; border: 3px solid var(--border); border-top: 3px solid var(--gold); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        .pagination-controls { display: flex; justify-content: center; align-items: center; gap: 20px; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border); }
        .page-btn { background: var(--bg-surface); color: var(--gold); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: bold; }
        .page-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--border-accent); }
        .page-btn:disabled { opacity: 0.5; cursor: not-allowed; color: var(--text-muted); }
        .page-info { color: var(--text-secondary); font-family: monospace; }
      `}</style>
    </SuperLayout>
  );
}
