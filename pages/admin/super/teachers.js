import Head from 'next/head';
import { useState, useEffect } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import SuperLayout from '../../../components/SuperLayout';

// --- مكونات الأيقونات ---
const Icons = {
  add: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  edit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
  trash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  eye: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
  key: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>,
  warn: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  user: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  teachers: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  upgrade: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 8l-4-4-4 4"></path><path d="M18 4v11"></path></svg>,
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
};

// --- تعريف عناصر لوحة الصلاحيات (تُستخدم في مودال الصلاحيات) ---
const PERMISSION_ITEMS = [
  { key: 'can_upload_pdf', label: 'رفع ملفات PDF', icon: '📄' },
  { key: 'can_upload_video', label: 'رفع الفيديوهات', icon: '🎬' },
  { key: 'can_create_exam', label: 'إنشاء/تعديل الامتحانات', icon: '📝' },
  { key: 'can_manage_flashcards', label: 'إنشاء/تعديل الفلاش كاردس', icon: '🗂️' },
];

// --- مكون Toast للإشعارات ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <div className="icon">{type === 'success' ? Icons.check : Icons.warn}</div>
      <span>{message}</span>
      <style jsx>{`
        .toast {
          position: fixed; top: 20px; left: 20px; z-index: 2000;
          background: var(--bg-surface); color: var(--text-primary); padding: 12px 20px;
          border-radius: 12px; display: flex; align-items: center; gap: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          animation: slideIn 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
          border: 1px solid var(--border); min-width: 300px;
        }
        .toast.success { border-right: 4px solid #22c55e; }
        .toast.error { border-right: 4px solid #ef4444; }
        .toast.error .icon { stroke: #ef4444; }
        @keyframes slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

// --- شارة صغيرة تلخص طريقة حساب أرباح المدرس وقيمتها الحالية ---
const formatBillingMethod = (t) => {
  if (t.billing_method === 'new_student') {
    const lookback = t.new_student_lookback_mode === 'since_date' && t.new_student_lookback_since
      ? ` (منذ ${t.new_student_lookback_since})`
      : '';
    return `👤 ${Number(t.new_student_price) || 0} ج / طالب جديد${lookback}`;
  }
  if (t.billing_method === 'course_price') {
    return '📦 سعر لكل كورس/مادة';
  }
  // percentage (default)
  return t.custom_percentage !== null && t.custom_percentage !== undefined
    ? `٪ ${t.custom_percentage}% (خاصة)`
    : '٪ النسبة العامة';
};

export default function SuperTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  const [selectedStats, setSelectedStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // ألوان الرسم البياني تتبع ثيم اللوحة (نفس مفتاح التخزين المستخدم في super/index.js)
  useEffect(() => {
    if (!statsModalOpen) return;
    setIsDark(localStorage.getItem('medaad_theme') !== 'light');
  }, [statsModalOpen]);
  
  const [editingId, setEditingId] = useState(null);
  const [teacherToDelete, setTeacherToDelete] = useState(null);

  // حالة الإشعارات (Toast)
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  // حالة الأخطاء داخل الفورم
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState({
    name: '', phone: '', specialty: '', bio: '', whatsapp_number: '',
    cash_numbers: '', instapay_numbers: '', instapay_links: '',
    dashboard_username: '', dashboard_password: '', 
    app_username: '', app_password: '',
    billing_method: 'percentage', custom_percentage: '', new_student_price: '',
    new_student_lookback_mode: 'forever', new_student_lookback_since: ''
  });
  // حالة مودال تسجيل الدخول
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [teacherToLogin, setTeacherToLogin] = useState(null);

  // --- حالة مودال صلاحيات المعلم (رفع PDF / فيديو / امتحانات) ---
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [permTeacher, setPermTeacher] = useState(null); // { id, name }
  const [permsData, setPermsData] = useState(null); // { can_upload_pdf, can_upload_video, can_create_exam, can_manage_flashcards }
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  // --- حالة مودال ترقية طالب إلى مدرس ---
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeStep, setUpgradeStep] = useState('search'); // search | form
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradeFormData, setUpgradeFormData] = useState({
    specialty: '', bio: '', whatsapp_number: '',
    cash_numbers: '', instapay_numbers: '', instapay_links: '',
    dashboard_username: '', dashboard_password: ''
  });

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/teachers'); 
      if (res.ok) {
        setTeachers(await res.json());
      } else {
        showToast('فشل جلب البيانات', 'error');
      }
    } catch (error) { 
      console.error(error);
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchTeachers(); }, []);

  // --- بحث الطلاب (Debounced) لمودال الترقية ---
  useEffect(() => {
    if (!upgradeModalOpen || upgradeStep !== 'search') return;
    if (!studentSearch.trim()) { setStudentResults([]); return; }

    const timer = setTimeout(async () => {
      setSearchingStudents(true);
      try {
        const res = await fetch(`/api/dashboard/super/upgrade-student?search=${encodeURIComponent(studentSearch.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setStudentResults(data.students || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearchingStudents(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [studentSearch, upgradeModalOpen, upgradeStep]);

  // --- دوال مودال ترقية طالب إلى مدرس ---
  const openUpgradeModal = () => {
    setUpgradeStep('search');
    setStudentSearch('');
    setStudentResults([]);
    setSelectedStudent(null);
    setUpgradeError('');
    setUpgradeFormData({
      specialty: '', bio: '', whatsapp_number: '',
      cash_numbers: '', instapay_numbers: '', instapay_links: '',
      dashboard_username: '', dashboard_password: ''
    });
    setUpgradeModalOpen(true);
  };

  const closeUpgradeModal = () => setUpgradeModalOpen(false);

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
    setUpgradeError('');
    setUpgradeStep('form');
  };

  const handleUpgradeSubmit = async (e) => {
    e.preventDefault();
    setUpgradeError('');
    setUpgradeSubmitting(true);

    try {
      const payment_details = {
        cash_numbers: upgradeFormData.cash_numbers.split(',').map(s => s.trim()).filter(Boolean),
        instapay_numbers: upgradeFormData.instapay_numbers.split(',').map(s => s.trim()).filter(Boolean),
        instapay_links: upgradeFormData.instapay_links.split(',').map(s => s.trim()).filter(Boolean)
      };

      const res = await fetch('/api/dashboard/super/upgrade-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedStudent.id,
          ...upgradeFormData,
          payment_details
        })
      });

      const data = await res.json();

      if (res.ok) {
        await fetchTeachers();
        setUpgradeModalOpen(false);
        showToast(`تم ترقية ${selectedStudent.first_name} إلى مدرس بنجاح`, 'success');
      } else {
        setUpgradeError(data.error || 'حدث خطأ غير معروف');
      }
    } catch (err) {
      setUpgradeError('خطأ في الاتصال بالشبكة');
    } finally {
      setUpgradeSubmitting(false);
    }
  };

  // --- دوال عرض التفاصيل والإحصائيات والمشرفين ---
  const handleViewStats = async (teacher) => {
    setStatsModalOpen(true);
    setLoadingStats(true);
    // دمج البيانات الأساسية فوراً
    setSelectedStats({ ...teacher }); 
    
    try {
      const res = await fetch(`/api/dashboard/super/teacher-stats?id=${teacher.id}`);
      if (res.ok) {
        const statsData = await res.json();
        setSelectedStats(prev => ({ ...prev, ...statsData }));
      }
    } catch (err) { console.error(err); } 
    finally { setLoadingStats(false); }
  };

  // --- دوال مودال صلاحيات المعلم ---
  const openPermissionsModal = async (teacher) => {
    setPermTeacher(teacher);
    setPermissionsModalOpen(true);
    setPermsLoading(true);
    setPermsData(null);
    try {
      const res = await fetch(`/api/dashboard/super/teacher-permissions?teacherId=${teacher.id}`);
      const data = await res.json();
      if (res.ok) {
        setPermsData(data.permissions);
      } else {
        showToast(data.error || 'فشل جلب الصلاحيات', 'error');
        setPermissionsModalOpen(false);
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
      setPermissionsModalOpen(false);
    } finally {
      setPermsLoading(false);
    }
  };

  const togglePermission = (key) => {
    setPermsData(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const savePermissions = async () => {
    if (!permTeacher || !permsData) return;
    setPermsSaving(true);
    try {
      const res = await fetch('/api/dashboard/super/teacher-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: permTeacher.id, permissions: permsData })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`تم تحديث صلاحيات ${permTeacher.name}`, 'success');
        setPermissionsModalOpen(false);
      } else {
        showToast(data.error || 'فشل حفظ الصلاحيات', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      setPermsSaving(false);
    }
  };

  // --- دوال النموذج (إضافة/تعديل) ---
  const handleOpenForm = (teacher = null) => {
    setFormError('');
    if (teacher) {
      setEditingId(teacher.id);
      const pd = teacher.payment_details || {};
      
      const cashStr = Array.isArray(pd.cash_numbers) ? pd.cash_numbers.join(', ') : '';
      const instaNumStr = Array.isArray(pd.instapay_numbers) ? pd.instapay_numbers.join(', ') : '';
      const instaLinkStr = Array.isArray(pd.instapay_links) ? pd.instapay_links.join(', ') : '';

      setFormData({ 
        name: teacher.name, 
        phone: teacher.phone,
        specialty: teacher.specialty,
        bio: teacher.bio || '',
        whatsapp_number: teacher.whatsapp_number || '',
        cash_numbers: cashStr,
        instapay_numbers: instaNumStr,
        instapay_links: instaLinkStr,
        dashboard_username: teacher.dashboard_username || '', 
        dashboard_password: '', 
        app_username: teacher.app_username || '', 
        app_password: '',
        billing_method: teacher.billing_method || 'percentage',
        custom_percentage: teacher.custom_percentage ?? '',
        new_student_price: teacher.new_student_price ?? '',
        new_student_lookback_mode: teacher.new_student_lookback_mode || 'forever',
        new_student_lookback_since: teacher.new_student_lookback_since || ''
      });
    } else {
      setEditingId(null);
      setFormData({ 
        name: '', phone: '', specialty: '', bio: '', whatsapp_number: '',
        cash_numbers: '', instapay_numbers: '', instapay_links: '',
        dashboard_username: '', dashboard_password: '',
        app_username: '', app_password: '',
        billing_method: 'percentage', custom_percentage: '', new_student_price: '',
        new_student_lookback_mode: 'forever', new_student_lookback_since: ''
      });
    }
    setFormModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    
    try {
      const url = '/api/dashboard/super/teachers';
      const method = editingId ? 'PUT' : 'POST';

      const payment_details = {
          cash_numbers: formData.cash_numbers.split(',').map(s => s.trim()).filter(Boolean),
          instapay_numbers: formData.instapay_numbers.split(',').map(s => s.trim()).filter(Boolean),
          instapay_links: formData.instapay_links.split(',').map(s => s.trim()).filter(Boolean)
      };

      const bodyData = { 
          ...formData, 
          payment_details, 
          id: editingId 
      };

      const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
      });
      
      const data = await res.json();

      if (res.ok) {
          await fetchTeachers(); 
          setFormModalOpen(false);
          showToast(editingId ? 'تم تعديل البيانات بنجاح' : 'تم إضافة المدرس بنجاح', 'success');
      } else {
          setFormError(data.error || 'حدث خطأ غير معروف');
      }
    } catch (error) { 
      setFormError('خطأ في الاتصال بالشبكة');
    }
  };

  // --- دوال الحذف ---
  const confirmDelete = (teacher) => {
    setTeacherToDelete(teacher);
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!teacherToDelete) return;
    try {
        const res = await fetch(`/api/dashboard/super/teachers?id=${teacherToDelete.id}`, { method: 'DELETE' });
        if (res.ok) {
            setTeachers(prev => prev.filter(t => t.id !== teacherToDelete.id));
            setDeleteModalOpen(false);
            setTeacherToDelete(null);
            showToast('تم حذف المدرس وجميع بياناته بنجاح', 'success');
        } else {
            showToast('فشل الحذف، حاول مرة أخرى', 'error');
        }
    } catch (err) { 
        showToast('خطأ في الاتصال', 'error');
    }
  };

  // --- دوال الدخول الفرعي لحساب المدرس ---
  const confirmLogin = (teacher) => {
    setTeacherToLogin(teacher);
    setLoginModalOpen(true);
  };

  const executeLogin = async () => {
    if (!teacherToLogin) return;
    
    try {
        const res = await fetch('/api/auth/super-login-as', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: teacherToLogin.dashboard_username })
        });

        if (res.ok) {
            const data = await res.json();
            
            localStorage.removeItem('admin_user_id');
            localStorage.removeItem('admin_name');
            localStorage.removeItem('is_admin_session');

            localStorage.setItem('admin_user_id', data.user.id);
            localStorage.setItem('admin_name', data.user.name);
            localStorage.setItem('is_admin_session', 'true');
            
            showToast(`تم الدخول لحساب ${teacherToLogin.name} بنجاح`, 'success');
            setLoginModalOpen(false);

            setTimeout(() => {
                window.location.href = '/admin/teacher';
            }, 500);
            
        } else {
            const errData = await res.json();
            showToast(errData.error || 'فشل الدخول، تأكد من البيانات', 'error');
        }
    } catch (err) { 
        console.error(err);
        showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
  };
  
  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.dashboard_username?.includes(searchQuery) ||
    t.specialty?.includes(searchQuery)
  );

  return (
    <SuperLayout>
      <Head><title>إدارة المدرسين | الإدارة العليا</title></Head>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-container">
        <div className="top-bar">
          <div>
            <div className="page-title">
              <div className="title-icon">{Icons.teachers}</div>
              <h1>إدارة المدرسين</h1>
            </div>
            <p>إدارة الحسابات، المشرفين، والبيانات المالية.</p>
          </div>
          <div className="top-actions">
            <button className="btn-secondary" onClick={openUpgradeModal}>
              {Icons.upgrade} ترقية طالب لمدرس
            </button>
            <button className="btn-primary" onClick={() => handleOpenForm()}>
              {Icons.add} مدرس جديد
            </button>
          </div>
        </div>

        <div className="search-bar">
          <div className="search-input">
            {Icons.search}
            <input type="text" placeholder="بحث بالاسم، التخصص، أو اسم المستخدم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="table-wrapper">
          {loading ? <div className="loading">جاري التحميل...</div> : (
            <table>
              <thead>
                <tr>
                  <th>المدرس</th>
                  <th>بيانات الدخول</th>
                  <th>التخصص</th>
                  <th>الهاتف</th>
                  <th>طريقة الأرباح</th>
                  <th style={{textAlign:'center'}}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="user-info">
                        <div className="avatar">{t.name[0]}</div>
                        <span className="name">{t.name}</span>
                      </div>
                    </td>
                    <td>
                        <div className="credentials-cell">
                            <div className="cred-row">
                                <span className="lbl">Dash:</span>
                                <span className="val highlight">@{t.dashboard_username}</span>
                            </div>
                            <div className="cred-row">
                                <span className="lbl">App:</span>
                                <span className="val">@{t.app_username}</span>
                            </div>
                        </div>
                    </td>
                    <td><span className="badge">{t.specialty}</span></td>
                    <td dir="ltr" className="phone-col">{t.phone}</td>
                    <td><span className="badge billing-badge">{formatBillingMethod(t)}</span></td>
                    <td>
                      <div className="actions-wrapper">
                        <div className="main-actions">
                          <button className="btn-icon view" onClick={() => handleViewStats(t)} title="التفاصيل والمشرفين">{Icons.eye}</button>
                          <button className="btn-icon edit" onClick={() => handleOpenForm(t)} title="تعديل">{Icons.edit}</button>
                          <button className="btn-icon login" onClick={() => confirmLogin(t)} title="دخول للوحة" disabled={!t.dashboard_username}>{Icons.key}</button>
                          <button className="btn-icon perms" onClick={() => openPermissionsModal(t)} title="صلاحيات الميزات">{Icons.shield}</button>
                        </div>
                        
                        {/* خط فاصل لفصل زر الحذف وتجنب الخطأ */}
                        <div className="action-divider"></div>
                        
                        <button className="btn-icon delete separated" onClick={() => confirmDelete(t)} title="حذف">{Icons.trash}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTeachers.length === 0 && (
                  <tr><td colSpan="6" className="empty-row">لا يوجد نتائج.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* --- نافذة الإضافة / التعديل المحسنة --- */}
      {formModalOpen && (
        <div className="modal-overlay">
          <div className="modal form-modal">
            <div className="modal-header">
              <h3>{editingId ? 'تعديل بيانات مدرس' : 'إضافة مدرس جديد'}</h3>
              <button onClick={() => setFormModalOpen(false)}>{Icons.close}</button>
            </div>
            
            {formError && (
                <div className="error-banner">
                    ⚠️ {formError}
                </div>
            )}

            <form onSubmit={handleSave}>
              
              {/* 1. البيانات الشخصية */}
              <div className="form-section">
                <h4>1. البيانات الأساسية والاتصال</h4>
                <div className="form-group">
                    <label>الاسم بالكامل</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="مثال: أ. محمد أحمد"/>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>التخصص</label>
                        <input type="text" required value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})}/>
                    </div>
                    <div className="form-group">
                        <label>رقم الهاتف (للدخول)</label>
                        <input type="text" required dir="ltr" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}/>
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>رقم واتساب (اختياري)</label>
                        <input type="text" dir="ltr" value={formData.whatsapp_number} onChange={e => setFormData({...formData, whatsapp_number: e.target.value})} placeholder="مثال: 01xxxxxxxxx"/>
                    </div>
                    <div className="form-group">
                        <label>نبذة مختصرة (Bio)</label>
                        <input type="text" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="مدرس أول في..."/>
                    </div>
                </div>
              </div>

              {/* 2. البيانات المالية */}
              <div className="form-section">
                <h4>2. بيانات الدفع (Payment Details)</h4>
                <div className="form-group">
                    <label>أرقام فودافون كاش (افصل بفاصلة)</label>
                    <input type="text" dir="ltr" value={formData.cash_numbers} onChange={e => setFormData({...formData, cash_numbers: e.target.value})} placeholder="010xxxx, 012xxxx"/>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>أرقام إنستا باي (IPN)</label>
                        <input type="text" dir="ltr" value={formData.instapay_numbers} onChange={e => setFormData({...formData, instapay_numbers: e.target.value})} placeholder="01xxxx, 012xxx"/>
                    </div>
                    <div className="form-group">
                        <label>روابط/يوزرنيم إنستا باي (Links)</label>
                        <input type="text" dir="ltr" value={formData.instapay_links} onChange={e => setFormData({...formData, instapay_links: e.target.value})} placeholder="name@instapay, url..."/>
                    </div>
                </div>
              </div>

              {/* 3. بيانات لوحة التحكم */}
              <div className="form-section">
                <h4>3. دخول لوحة التحكم (للمدرس)</h4>
                <div className="form-row">
                    <div className="form-group">
                        <label>اسم المستخدم (Dashboard)</label>
                        <input type="text" required dir="ltr" className="input-dash" value={formData.dashboard_username} onChange={e => setFormData({...formData, dashboard_username: e.target.value})}/>
                    </div>
                    <div className="form-group">
                        <label>كلمة المرور {editingId && '(اختياري)'}</label>
                        <input type="password" dir="ltr" className="input-dash" value={formData.dashboard_password} onChange={e => setFormData({...formData, dashboard_password: e.target.value})} placeholder={editingId ? "اتركها فارغة لعدم التغيير" : "******"}/>
                    </div>
                </div>
              </div>

              {/* 4. بيانات التطبيق */}
              <div className="form-section">
                <h4>4. دخول التطبيق (للطلاب)</h4>
                <div className="form-row">
                    <div className="form-group">
                        <label>اسم المستخدم (App)</label>
                        <input type="text" required dir="ltr" className="input-app" value={formData.app_username} onChange={e => setFormData({...formData, app_username: e.target.value})}/>
                    </div>
                    <div className="form-group">
                        <label>كلمة المرور {editingId && '(اختياري)'}</label>
                        <input type="password" dir="ltr" className="input-app" value={formData.app_password} onChange={e => setFormData({...formData, app_password: e.target.value})} placeholder={editingId ? "اتركها فارغة لعدم التغيير" : "******"}/>
                    </div>
                </div>
              </div>

              {/* 5. طريقة حساب الأرباح (Billing Method) */}
              <div className="form-section">
                <h4>5. طريقة حساب الأرباح</h4>
                <div className="form-group">
                    <label>طريقة حساب أرباح المنصة من هذا المدرس</label>
                    <select
                        value={formData.billing_method}
                        onChange={e => setFormData({...formData, billing_method: e.target.value})}
                    >
                        <option value="percentage">نسبة مئوية من المبيعات</option>
                        <option value="new_student">سعر ثابت لكل طالب جديد</option>
                        <option value="course_price">سعر ثابت لكل كورس/مادة</option>
                    </select>
                </div>

                {formData.billing_method === 'percentage' && (
                    <div className="form-group">
                        <label>نسبة خاصة % (اختياري)</label>
                        <input
                            type="number" min="0" max="100" step="0.1" dir="ltr"
                            value={formData.custom_percentage}
                            onChange={e => setFormData({...formData, custom_percentage: e.target.value})}
                            placeholder="اتركها فارغة لاستخدام النسبة العامة (10%)"
                        />
                    </div>
                )}

                {formData.billing_method === 'new_student' && (
                    <>
                    <div className="form-group">
                        <label>سعر الطالب الجديد (جنيه)</label>
                        <input
                            type="number" min="0" step="1" dir="ltr" required
                            value={formData.new_student_price}
                            onChange={e => setFormData({...formData, new_student_price: e.target.value})}
                            placeholder="مثال: 100"
                        />
                    </div>

                    <div className="form-group">
                        <label>نطاق فحص الاشتراكات القديمة (لتحديد هل الطالب "جديد")</label>
                        <select
                            value={formData.new_student_lookback_mode}
                            onChange={e => setFormData({...formData, new_student_lookback_mode: e.target.value})}
                        >
                            <option value="forever">فحص كل تاريخ الطالب مع هذا المدرس (بلا حدود)</option>
                            <option value="since_date">فحص الاشتراكات بدءاً من تاريخ محدد فقط</option>
                        </select>
                        <p className="hint-text">
                            {formData.new_student_lookback_mode === 'forever'
                                ? 'أي اشتراك سابق (معتمد) لهذا الطالب مع هذا المدرس، مهما كان قديماً، يجعله "غير جديد".'
                                : 'الاشتراكات المعتمدة قبل التاريخ المحدد سيتم تجاهلها، فيُحتسب الطالب "جديد" من جديد لو كان آخر اشتراك له قبل هذا التاريخ.'}
                        </p>
                    </div>

                    {formData.new_student_lookback_mode === 'since_date' && (
                        <div className="form-group">
                            <label>تجاهل الاشتراكات قبل تاريخ</label>
                            <input
                                type="date" dir="ltr" required
                                value={formData.new_student_lookback_since}
                                onChange={e => setFormData({...formData, new_student_lookback_since: e.target.value})}
                            />
                        </div>
                    )}
                    </>
                )}

                {formData.billing_method === 'course_price' && (
                    <p className="hint-text">
                        يتم ضبط سعر كل كورس/مادة من صفحة "إدارة الكورسات".
                    </p>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setFormModalOpen(false)}>إلغاء</button>
                <button type="submit" className="btn-submit">حفظ البيانات</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- نافذة الحذف --- */}
      {deleteModalOpen && teacherToDelete && (
        <div className="modal-overlay">
            <div className="modal delete-modal">
                <div className="delete-icon">
                    {Icons.warn}
                </div>
                <h3>تأكيد الحذف</h3>
                <p>هل أنت متأكد من حذف المدرس <strong>{teacherToDelete.name}</strong>؟</p>
                <p className="warning-text">⚠️ سيتم حذف كافة البيانات المرتبطة به (الكورسات، الطلاب، الأرصدة) وحذف حسابات الدخول نهائياً.</p>
                
                <div className="modal-actions centered">
                    <button className="btn-cancel" onClick={() => setDeleteModalOpen(false)}>تراجع</button>
                    <button className="btn-danger" onClick={executeDelete}>نعم، احذف نهائياً</button>
                </div>
            </div>
        </div>
      )}

      {/* --- نافذة الإحصائيات --- */}
      {statsModalOpen && selectedStats && (
        <div className="modal-overlay">
          <div className="modal stats-modal">
            <div className="modal-header">
              <h3>📊 تفاصيل: {selectedStats.name}</h3>
              <button onClick={() => setStatsModalOpen(false)}>{Icons.close}</button>
            </div>
            
            {loadingStats ? <div className="loading">جاري التحميل...</div> : (
               <>
               <div className="stats-grid-modal">
                 <div className="stat-box blue"><h4>👨‍🎓 طلاب</h4><span className="val">{selectedStats.students_count || 0}</span></div>
                 <div className="stat-box green"><h4>💰 أرباح</h4><span className="val">{(selectedStats.balance || 0).toLocaleString()}</span></div>
                 <div className="stat-box yellow"><h4>⏳ طلبات</h4><span className="val">{selectedStats.pending_requests || 0}</span></div>
                 <div className="stat-box purple"><h4>📚 كورسات</h4><span className="val">{selectedStats.courses_count || 0}</span></div>
                 <div className="stat-box sky">
                   <h4>👁️ مشاهدات اليوم</h4>
                   <span className="val">{selectedStats.today_watches == null ? '—' : selectedStats.today_watches.toLocaleString()}</span>
                   {selectedStats.last7_watches != null && <small className="sub">{selectedStats.last7_watches.toLocaleString()} خلال آخر 7 أيام</small>}
                 </div>
                 <div className="stat-box teal">
                   <h4>🟢 الطلاب النشطون اليوم</h4>
                   <span className="val">{selectedStats.active_users_today == null ? '—' : selectedStats.active_users_today.toLocaleString()}</span>
                   <small className="sub">من إجمالي طلاب المدرس</small>
                 </div>
               </div>

               {/* مخطط المشاهدات ونشاط الطلاب لآخر 7 أيام (نفس مخطط صفحة المدرس) */}
               {selectedStats.activity_chart && selectedStats.activity_chart.length > 0 && (
                 <div className="activity-chart-section">
                   <h4>👁️ المشاهدات ونشاط الطلاب لآخر 7 أيام</h4>
                   <div className="activity-chart-body">
                     <ResponsiveContainer width="100%" height="100%">
                       <ComposedChart data={selectedStats.activity_chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                         <defs>
                           <linearGradient id="tWatchGradient" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor={isDark ? '#c9a84c' : '#b8903a'} stopOpacity={0.35} />
                             <stop offset="95%" stopColor={isDark ? '#c9a84c' : '#b8903a'} stopOpacity={0} />
                           </linearGradient>
                           <linearGradient id="tUsersGradient" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor={isDark ? '#38bdf8' : '#0ea5e9'} stopOpacity={0.3} />
                             <stop offset="95%" stopColor={isDark ? '#38bdf8' : '#0ea5e9'} stopOpacity={0} />
                           </linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2c2818' : '#ddd4a8'} vertical={false} />
                         <XAxis dataKey="name" stroke={isDark ? '#a89f7a' : '#9e8850'} tick={{ fontSize: 11 }} />
                         <YAxis stroke={isDark ? '#a89f7a' : '#9e8850'} tick={{ fontSize: 11 }} allowDecimals={false} />
                         <Tooltip
                           contentStyle={{ backgroundColor: isDark ? '#1a1710' : '#ffffff', border: `1px solid ${isDark ? '#3a3420' : '#ddd4a8'}`, borderRadius: '10px', color: isDark ? '#f5f0e0' : '#1a1508' }}
                           cursor={{ stroke: isDark ? '#c9a84c' : '#b8903a', strokeWidth: 1, strokeDasharray: '4 4' }}
                           formatter={(value, name) => [
                             name === 'watches' ? `${value.toLocaleString()} مشاهدة` : `${value.toLocaleString()} طالب`,
                             name === 'watches' ? 'المشاهدات' : 'الطلاب النشطون'
                           ]}
                         />
                         <Legend
                           formatter={(value) => value === 'watches' ? 'المشاهدات' : 'الطلاب النشطون'}
                           wrapperStyle={{ fontSize: '12px', color: isDark ? '#a89f7a' : '#9e8850' }}
                         />
                         <Area type="monotone" dataKey="watches" name="watches" stroke={isDark ? '#c9a84c' : '#b8903a'} strokeWidth={2.5} fill="url(#tWatchGradient)" />
                         <Area type="monotone" dataKey="users" name="users" stroke={isDark ? '#38bdf8' : '#0ea5e9'} strokeWidth={2.5} fill="url(#tUsersGradient)" />
                       </ComposedChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
               )}

               {/* المشرفون المساعدون */}
               <div className="moderators-section">
                  <h4>👥 فريق العمل والمشرفين</h4>
                  {selectedStats.moderators && selectedStats.moderators.length > 0 ? (
                      <div className="mods-list">
                          {selectedStats.moderators.map((mod, i) => (
                              <div key={i} className="mod-item">
                                  <div className="mod-icon">{Icons.user}</div>
                                  <div className="mod-info">
                                      <span className="mod-name">{mod.first_name}</span>
                                      <span className="mod-user">@{mod.admin_username}</span>
                                  </div>
                                  <span className="mod-role">مشرف</span>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="no-mods">لا يوجد مشرفين مساعدين لهذا المدرس.</p>
                  )}
               </div>
               </>
            )}
            <div className="modal-actions"><button className="btn-cancel full" onClick={() => setStatsModalOpen(false)}>إغلاق</button></div>
          </div>
        </div>
      )}

      {/* --- نافذة تأكيد الدخول لحساب المدرس --- */}
      {loginModalOpen && teacherToLogin && (
        <div className="modal-overlay">
            <div className="modal login-modal">
                <div className="login-icon-box">
                    {Icons.key}
                </div>
                <h3>تأكيد الدخول</h3>
                <p>هل أنت متأكد من الدخول إلى لوحة تحكم المدرس <strong>{teacherToLogin.name}</strong>؟</p>
                <p className="info-text">سيتم فتح لوحة التحكم الخاصة به في تبويب جديد بصلاحيات كاملة.</p>
                
                <div className="modal-actions centered">
                    <button className="btn-cancel" onClick={() => setLoginModalOpen(false)}>إلغاء</button>
                    <button className="btn-confirm" onClick={executeLogin}>نعم، دخول</button>
                </div>
            </div>
        </div>
      )}

      {/* --- نافذة صلاحيات المعلم (رفع PDF / فيديو / امتحانات) --- */}
      {permissionsModalOpen && permTeacher && (
        <div className="modal-overlay">
          <div className="modal perms-modal">
            <div className="modal-header">
              <h3>{Icons.shield} صلاحيات: {permTeacher.name}</h3>
              <button onClick={() => setPermissionsModalOpen(false)}>{Icons.close}</button>
            </div>

            {permsLoading || !permsData ? (
              <div className="loading">جاري التحميل...</div>
            ) : (
              <>
                <p className="hint-text">حدد الميزات المسموح للمعلم استخدامها. الميزة المُعطّلة تُخفي/تمنع الإجراء المرتبط بها في لوحة تحكم المعلم وتطبيقه.</p>
                <div className="perms-list">
                  {PERMISSION_ITEMS.map(item => (
                    <div key={item.key} className="perm-row">
                      <div className="perm-info">
                        <span className="perm-icon">{item.icon}</span>
                        <span className="perm-label">{item.label}</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={!!permsData[item.key]}
                          onChange={() => togglePermission(item.key)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={() => setPermissionsModalOpen(false)}>إلغاء</button>
                  <button className="btn-confirm" onClick={savePermissions} disabled={permsSaving}>
                    {permsSaving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- نافذة ترقية طالب إلى مدرس --- */}
      {upgradeModalOpen && (
        <div className="modal-overlay">
          <div className="modal form-modal">
            <div className="modal-header">
              <h3>
                {upgradeStep === 'form' && (
                  <button type="button" className="header-back" onClick={() => { setUpgradeStep('search'); setUpgradeError(''); }}>{Icons.back}</button>
                )}
                {upgradeStep === 'search' ? 'ترقية طالب إلى مدرس - البحث' : `ترقية: ${selectedStudent?.first_name}`}
              </h3>
              <button onClick={closeUpgradeModal}>{Icons.close}</button>
            </div>

            {upgradeStep === 'search' && (
              <>
                <p className="hint-text">ابحث عن الطالب بالاسم، اليوزرنيم، رقم الهاتف، أو المعرف (ID) لترقية حسابه إلى حساب مدرس.</p>
                <div className="search-input upgrade-search">
                  {Icons.search}
                  <input
                    type="text"
                    autoFocus
                    placeholder="ابحث عن طالب..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </div>

                <div className="student-results">
                  {searchingStudents && <div className="loading small">جاري البحث...</div>}
                  {!searchingStudents && studentSearch.trim() && studentResults.length === 0 && (
                    <p className="no-mods">لا يوجد طلاب مطابقين لبحثك.</p>
                  )}
                  {!searchingStudents && studentResults.map(s => (
                    <div key={s.id} className="mod-item clickable" onClick={() => handleSelectStudent(s)}>
                      <div className="mod-icon">{Icons.user}</div>
                      <div className="mod-info">
                        <span className="mod-name">{s.first_name}</span>
                        <span className="mod-user">@{s.username} · <span dir="ltr">{s.phone}</span></span>
                      </div>
                      <span className="mod-role">طالب</span>
                    </div>
                  ))}
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeUpgradeModal}>إلغاء</button>
                </div>
              </>
            )}

            {upgradeStep === 'form' && selectedStudent && (
              <form onSubmit={handleUpgradeSubmit}>
                {upgradeError && <div className="error-banner">⚠️ {upgradeError}</div>}

                <div className="selected-student-card">
                  <div className="avatar">{selectedStudent.first_name?.[0]}</div>
                  <div className="mod-info">
                    <span className="mod-name">{selectedStudent.first_name}</span>
                    <span className="mod-user">@{selectedStudent.username} · <span dir="ltr">{selectedStudent.phone}</span></span>
                  </div>
                </div>

                <div className="form-section">
                  <h4>1. بيانات المدرس الأساسية</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>التخصص</label>
                      <input type="text" required value={upgradeFormData.specialty} onChange={e => setUpgradeFormData({...upgradeFormData, specialty: e.target.value})}/>
                    </div>
                    <div className="form-group">
                      <label>رقم واتساب (اختياري)</label>
                      <input type="text" dir="ltr" value={upgradeFormData.whatsapp_number} onChange={e => setUpgradeFormData({...upgradeFormData, whatsapp_number: e.target.value})} placeholder="مثال: 01xxxxxxxxx"/>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>نبذة مختصرة (Bio)</label>
                    <input type="text" value={upgradeFormData.bio} onChange={e => setUpgradeFormData({...upgradeFormData, bio: e.target.value})} placeholder="مدرس أول في..."/>
                  </div>
                </div>

                <div className="form-section">
                  <h4>2. بيانات الدفع (Payment Details)</h4>
                  <div className="form-group">
                    <label>أرقام فودافون كاش (افصل بفاصلة)</label>
                    <input type="text" dir="ltr" value={upgradeFormData.cash_numbers} onChange={e => setUpgradeFormData({...upgradeFormData, cash_numbers: e.target.value})} placeholder="010xxxx, 012xxxx"/>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>أرقام إنستا باي (IPN)</label>
                      <input type="text" dir="ltr" value={upgradeFormData.instapay_numbers} onChange={e => setUpgradeFormData({...upgradeFormData, instapay_numbers: e.target.value})} placeholder="01xxxx, 012xxx"/>
                    </div>
                    <div className="form-group">
                      <label>روابط/يوزرنيم إنستا باي (Links)</label>
                      <input type="text" dir="ltr" value={upgradeFormData.instapay_links} onChange={e => setUpgradeFormData({...upgradeFormData, instapay_links: e.target.value})} placeholder="name@instapay, url..."/>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>3. دخول لوحة التحكم (جديد للمدرس)</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>اسم المستخدم (Dashboard)</label>
                      <input type="text" required dir="ltr" className="input-dash" value={upgradeFormData.dashboard_username} onChange={e => setUpgradeFormData({...upgradeFormData, dashboard_username: e.target.value})}/>
                    </div>
                    <div className="form-group">
                      <label>كلمة المرور</label>
                      <input type="password" required dir="ltr" className="input-dash" value={upgradeFormData.dashboard_password} onChange={e => setUpgradeFormData({...upgradeFormData, dashboard_password: e.target.value})} placeholder="******"/>
                    </div>
                  </div>
                  <p className="hint-text">💡 حساب الطالب الحالي في التطبيق (@{selectedStudent.username}) سيبقى كما هو ويُستخدم كبيانات دخول المدرس للتطبيق.</p>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setUpgradeStep('search')}>رجوع</button>
                  <button type="submit" className="btn-submit" disabled={upgradeSubmitting}>{upgradeSubmitting ? 'جاري الترقية...' : 'تأكيد الترقية'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        /* ================= Theme-Aware Styling ================= */
        .page-container { padding-bottom: 50px; }
        
        /* Title and Icon */
        .page-title { display: flex; align-items: center; gap: 12px; margin-bottom: 5px; }
        .title-icon { 
            color: var(--gold); 
            display: flex; align-items: center; justify-content: center; 
            background: var(--gold-dimmer); 
            padding: 8px; 
            border-radius: 10px; 
            border: 1px solid var(--border-accent);
        }
        
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .top-bar h1 { margin: 0; color: var(--text-primary); font-size: 1.75rem; font-weight: 800; }
        .top-bar p { margin: 0; color: var(--text-muted); font-size: 0.95rem; }
        
        .top-actions { display: flex; gap: 12px; align-items: center; }

        .btn-primary { background: var(--gold); color: #111009; padding: 10px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; display: flex; gap: 8px; align-items: center; transition: 0.2s; }
        .btn-primary:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 4px 12px var(--gold-dim); }

        .btn-secondary { background: var(--bg-elevated); color: var(--gold); padding: 10px 20px; border-radius: 8px; border: 1px solid var(--border-accent); font-weight: bold; cursor: pointer; display: flex; gap: 8px; align-items: center; transition: 0.2s; }
        .btn-secondary:hover { background: var(--gold-dim); transform: translateY(-2px); }

        .hint-text { color: var(--text-muted); font-size: 0.85rem; margin: 0 0 15px 0; line-height: 1.5; }

        .upgrade-search { margin-bottom: 15px; }

        .header-back { background: none; border: none; color: var(--text-muted); cursor: pointer; display: inline-flex; margin-left: 10px; transition: 0.2s; }
        .header-back:hover { color: var(--gold); }
        .modal-header h3 { display: flex; align-items: center; }

        .student-results { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; margin-bottom: 15px; }
        .mod-item.clickable { cursor: pointer; transition: 0.2s; }
        .mod-item.clickable:hover { border-color: var(--gold); background: var(--gold-dimmer); transform: translateY(-1px); }

        .selected-student-card { display: flex; align-items: center; gap: 12px; background: var(--gold-dimmer); border: 1px solid var(--border-accent); border-radius: 10px; padding: 12px 15px; margin-bottom: 20px; }
        .selected-student-card .avatar { width: 40px; height: 40px; background: var(--gold-dim); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 1px solid var(--border-accent); flex-shrink: 0; }

        .loading.small { padding: 15px; font-size: 0.9rem; }

        .search-bar { margin-bottom: 20px; }
        .search-input { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 15px; display: flex; align-items: center; gap: 10px; color: var(--text-muted); }
        .search-input input { background: transparent; border: none; color: var(--text-primary); font-size: 1rem; width: 100%; outline: none; }

        .table-wrapper { background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: var(--shadow, 0 4px 24px rgba(0,0,0,0.1)); }
        table { width: 100%; min-width: 800px; border-collapse: collapse; }
        thead { background: var(--bg-elevated); }
        th { text-align: right; padding: 15px 20px; color: var(--text-muted); font-size: 0.9rem; font-weight: 700; border-bottom: 1px solid var(--border); text-transform: uppercase; }
        td { padding: 15px 20px; border-bottom: 1px solid var(--border); color: var(--text-secondary); vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--bg-hover); }
        
        .empty-row { text-align: center; padding: 40px !important; color: var(--text-muted) !important; }
        .phone-col { color: var(--text-secondary); font-size: 0.9rem; }

        .user-info { display: flex; align-items: center; gap: 12px; }
        .avatar { width: 40px; height: 40px; background: var(--gold-dim); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; border: 1px solid var(--border-accent); }
        .name { font-weight: bold; font-size: 0.95rem; color: var(--text-primary); }

        .credentials-cell { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; }
        .cred-row { display: flex; gap: 8px; align-items: center; }
        .cred-row .lbl { color: var(--text-muted); font-size: 0.75rem; width: 35px; }
        .cred-row .val { font-family: monospace; color: var(--text-secondary); background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); }
        .cred-row .val.highlight { color: var(--gold); border-color: var(--border-accent); background: var(--gold-dimmer); }

        .badge { background: var(--gold-dimmer); color: var(--gold); padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; border: 1px solid var(--border-accent); }
        
        /* Actions Layout */
        .actions-wrapper { display: flex; align-items: center; justify-content: center; gap: 8px; }
        .main-actions { display: flex; gap: 6px; }
        .action-divider { width: 2px; height: 26px; background-color: var(--border); border-radius: 2px; margin: 0 4px; }
        
        .btn-icon { background: var(--bg-elevated); border: 1px solid var(--border); width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .view { color: var(--gold); } .view:hover { background: var(--gold-dim); border-color: var(--gold); }
        .edit { color: #facc15; } .edit:hover { background: rgba(250, 204, 21, 0.1); border-color: #facc15; }
        .login { color: #a855f7; } .login:hover { background: rgba(168, 85, 247, 0.1); border-color: #a855f7; }
        .perms { color: #38bdf8; } .perms:hover { background: rgba(56, 189, 248, 0.1); border-color: #38bdf8; }
        
        /* Delete Button */
        .delete { color: #ef4444; } 
        .delete.separated { border: 1px dashed rgba(239, 68, 68, 0.4); margin-right: 4px; }
        .delete.separated:hover { background: rgba(239, 68, 68, 0.2); border-style: solid; }
        
        .btn-icon:hover { transform: scale(1.1); filter: brightness(1.2); }

        /* Modals */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(5px); }
        .modal { background: var(--bg-surface); border: 1px solid var(--border-accent); width: 90%; border-radius: 16px; padding: 25px; box-shadow: 0 30px 60px rgba(0,0,0,0.5); animation: popIn 0.2s ease-out; }
        .form-modal { max-width: 650px; max-height: 90vh; overflow-y: auto; }
        .perms-modal { max-width: 480px; }

        /* Permissions list + toggle switches */
        .perms-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
        .perm-row { display: flex; align-items: center; justify-content: space-between; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 12px 15px; }
        .perm-info { display: flex; align-items: center; gap: 10px; }
        .perm-icon { font-size: 1.1rem; }
        .perm-label { color: var(--text-primary); font-weight: 600; font-size: 0.9rem; }

        .switch { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .switch .slider { position: absolute; cursor: pointer; inset: 0; background-color: var(--border-accent); transition: 0.25s; border-radius: 999px; }
        .switch .slider::before { position: absolute; content: ""; height: 20px; width: 20px; right: 3px; bottom: 3px; background-color: #fff; transition: 0.25s; border-radius: 50%; }
        .switch input:checked + .slider { background-color: #22c55e; }
        .switch input:checked + .slider::before { transform: translateX(-20px); }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .modal-header h3 { margin: 0; color: var(--gold); font-size: 1.35rem; }
        .modal-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; transition: 0.2s; }
        .modal-header button:hover { color: var(--text-primary); }

        .form-section { margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .form-section:last-child { border-bottom: none; }
        .form-section h4 { margin: 0 0 15px 0; color: var(--gold); font-size: 0.9rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .form-group { margin-bottom: 12px; }
        .form-row { display: flex; gap: 15px; }
        .form-row .form-group { flex: 1; }
        label { display: block; color: var(--text-secondary); margin-bottom: 6px; font-size: 0.85rem; font-weight: 600; }
        input, select { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border); padding: 10px; border-radius: 8px; color: var(--text-primary); outline: none; transition: 0.2s; font-family: inherit; }
        input:focus, select:focus { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-dim); }
        .input-dash:focus { border-color: var(--gold-light); }
        .input-app:focus { border-color: var(--gold-light); }

        .error-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem; }

        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
        .modal-actions.centered { justify-content: center; margin-top: 20px; }
        .btn-cancel { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .btn-cancel:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn-submit { background: var(--gold); border: none; color: #111009; padding: 8px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-submit:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 4px 12px var(--gold-dim); }
        .btn-danger { background: #ef4444; border: none; color: white; padding: 8px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-danger:hover { background: #dc2626; transform: translateY(-2px); }

        .delete-modal { max-width: 400px; text-align: center; border: 1px solid #ef4444; }
        .delete-icon { background: rgba(239, 68, 68, 0.1); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px auto; }
        .warning-text { color: #fca5a5; font-size: 0.85rem; background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 8px; margin-top: 10px; border: 1px dashed rgba(239, 68, 68, 0.3); }

        /* Stats Modal */
        .stats-grid-modal { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .stat-box { background: var(--bg-elevated); padding: 15px; border-radius: 12px; border: 1px solid var(--border); text-align: center; }
        .stat-box h4 { margin: 0 0 5px 0; color: var(--text-muted); font-size: 0.85rem; font-weight: normal; }
        .stat-box .val { font-size: 1.5rem; font-weight: bold; display: block; color: var(--text-primary); }
        .blue .val { color: var(--gold); } .green .val { color: #4ade80; }
        .yellow .val { color: #facc15; } .purple .val { color: #c084fc; }
        .sky .val { color: #38bdf8; } .teal .val { color: #2dd4bf; }
        .stat-box .sub { display: block; margin-top: 4px; color: var(--text-muted); font-size: 0.75rem; }
        .stats-modal { max-width: 560px; max-height: 90vh; overflow-y: auto; }
        .activity-chart-section { margin-top: 5px; border-top: 1px solid var(--border); padding-top: 15px; }
        .activity-chart-section h4 { color: var(--text-primary); font-size: 0.95rem; margin: 0 0 10px 0; }
        .activity-chart-body { width: 100%; height: 220px; direction: ltr; }
        .full { width: 100%; }

        .moderators-section { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 15px; }
        .moderators-section h4 { color: var(--text-primary); font-size: 0.95rem; margin-bottom: 10px; }
        .mods-list { display: grid; grid-template-columns: 1fr; gap: 10px; max-height: 150px; overflow-y: auto; }
        .mod-item { display: flex; align-items: center; gap: 10px; background: var(--bg-elevated); padding: 10px; border-radius: 8px; border: 1px solid var(--border); }
        .mod-icon { color: var(--text-muted); }
        .mod-info { flex: 1; display: flex; flex-direction: column; }
        .mod-name { color: var(--text-primary); font-size: 0.9rem; font-weight: 600; }
        .mod-user { color: var(--text-muted); font-size: 0.8rem; font-family: monospace; }
        .mod-role { background: var(--gold-dimmer); color: var(--gold); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-accent); font-weight: bold; }
        .no-mods { color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px; font-style: italic; }

        /* Login Modal */
        .login-modal { max-width: 400px; text-align: center; border: 1px solid var(--border-accent); }
        .login-icon-box { 
            background: var(--gold-dim); 
            width: 60px; height: 60px; 
            border-radius: 50%; 
            display: flex; align-items: center; justify-content: center; 
            margin: 0 auto 15px auto; 
            color: var(--gold);
            border: 1px solid var(--border-accent);
        }
        .info-text { 
            color: var(--text-secondary); 
            font-size: 0.85rem; 
            background: var(--bg-elevated); 
            padding: 10px; 
            border-radius: 8px; 
            margin-top: 10px; 
            border: 1px dashed var(--border);
        }
        .btn-confirm { 
            background: var(--gold); 
            border: none; 
            color: #111009; 
            padding: 8px 25px; 
            border-radius: 8px; 
            font-weight: bold; 
            cursor: pointer; 
            transition: 0.2s;
        }
        .btn-confirm:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 4px 12px var(--gold-dim); }
        
        .loading { color: var(--gold); text-align: center; padding: 40px; font-weight: bold; }

        @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        @media (max-width: 768px) {
            .form-row { flex-direction: column; gap: 0; }
            td, th { padding: 12px 10px; font-size: 0.85rem; }
            .top-bar { flex-direction: column; align-items: flex-start; gap: 15px; }
            .btn-primary { width: 100%; justify-content: center; }
            .stats-grid-modal { grid-template-columns: 1fr; }
        }
      `}</style>
    </SuperLayout>
  );
}
