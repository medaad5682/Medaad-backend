import { useState, useEffect } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';

// ─── SVG Icons ──────────────────────────────────────────
const GlobeIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>);
const CourseIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>);
const SubjectIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>);
const UserIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>);
const SendIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>);
const BellIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>);
const ChevronDownIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>);
const CheckIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);

const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const SearchIcon = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>);

// ─── منتقي بنافذة منبثقة (Select Modal) ────────────────────────────────
// بديل احترافي لعنصر <select> الافتراضي: بدل قائمة منسدلة ملزوقة بالحقل،
// الضغط على الحقل بيفتح نافذة (Modal) منظمة في نص الشاشة فيها بحث سريع
// وقائمة مرتّبة (مع تقسيم لمجموعات لو محتاجين، زي "كل مادة تحت كورسها").
// مناسب أكتر من الدروب داون العادي لما يكون عدد العناصر كبير (كورسات/مواد
// كتير) لأن فيه مساحة أوضح ومربع بحث.
//   - options: قائمة مسطّحة [{ value, label }]
//   - groups: قوائم مقسّمة لمجموعات [{ label, options: [...] }]
const SelectModal = ({ value, onChange, options, groups, placeholder = 'اختر...', title = 'اختر عنصر' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const flatOptions = groups ? groups.flatMap(g => g.options || []) : (options || []);
  const selected = flatOptions.find(o => String(o.value) === String(value));
  const isEmpty = flatOptions.length === 0;

  const q = search.trim().toLowerCase();
  const matches = (opt) => !q || opt.label.toLowerCase().includes(q);
  const filteredOptions = options ? options.filter(matches) : null;
  const filteredGroups = groups
    ? groups.map(g => ({ ...g, options: (g.options || []).filter(matches) }))
    : null;
  const hasResults = groups
    ? filteredGroups.some(g => g.options.length > 0)
    : (filteredOptions ? filteredOptions.length > 0 : false);

  const handleSelect = (val) => { onChange(val); setOpen(false); };

  return (
    <>
      <button
        type="button"
        className={`select-modal-trigger ${open ? 'open' : ''}`}
        onClick={() => { setSearch(''); setOpen(true); }}
        disabled={isEmpty}
      >
        <span className={selected ? '' : 'placeholder'}>{selected ? selected.label : placeholder}</span>
        <span className="chevron"><ChevronDownIcon /></span>
      </button>

      {open && (
        <div className="select-modal-overlay" onClick={() => setOpen(false)}>
          <div className="select-modal-box" onClick={e => e.stopPropagation()}>
            <div className="select-modal-header">
              <h4>{title}</h4>
              <button type="button" className="select-modal-close" onClick={() => setOpen(false)}><CloseIcon /></button>
            </div>

            <div className="select-modal-search">
              <SearchIcon />
              <input
                type="text"
                autoFocus
                placeholder="بحث..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="select-modal-list">
              {groups ? (
                filteredGroups.map(g => g.options.length > 0 && (
                  <div key={g.label} className="select-modal-group">
                    <div className="select-modal-group-label">{g.label}</div>
                    {g.options.map(opt => {
                      const isSelected = String(opt.value) === String(value);
                      return (
                        <div
                          key={opt.value}
                          className={`select-modal-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelect(opt.value)}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <CheckIcon />}
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                (filteredOptions || []).map(opt => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <div
                      key={opt.value}
                      className={`select-modal-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(opt.value)}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <CheckIcon />}
                    </div>
                  );
                })
              )}
              {!hasResults && (
                <div className="select-modal-empty">لا توجد نتائج مطابقة</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default function SuperNotifications() {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  // حالة الفورم
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    targetType: 'all', // all, course, subject, user
    targetId: '',      // Course ID or Subject ID
    userIdentifier: '' // Phone or Username
  });

  const showToast = (msg, type = 'success') => {
      setToast({ show: true, message: msg, type });
      setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  // جلب الكورسات والمواد لتعبئة القوائم المنسدلة
  useEffect(() => {
    const fetchContent = async () => {
      try {
        const res = await fetch('/api/dashboard/super/content?type=all');
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchContent();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return showToast('العنوان والنص مطلوبان', 'error');
    if (formData.targetType === 'user' && !formData.userIdentifier) return showToast('يرجى إدخال هاتف أو اسم المستخدم', 'error');
    if (['course', 'subject'].includes(formData.targetType) && !formData.targetId) return showToast('يرجى تحديد المحتوى المستهدف', 'error');

    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        showToast(result.message, 'success');
        setFormData({ ...formData, title: '', body: '', userIdentifier: '' }); // تصفير الحقول فقط
      } else {
        showToast(result.message || 'فشل الإرسال', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SuperLayout title="إرسال الإشعارات">
      <Head><title>نظام الإشعارات | الإدارة العليا</title></Head>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>
        {toast.message}
      </div>

      <div className="notifications-container">
        <div className="page-header">
          <div className="header-title-wrap">
            <div className="header-icon"><BellIcon /></div>
            <div>
              <h1>نظام الإشعارات الذكي</h1>
              <p>أرسل تنبيهات فورية تظهر على هواتف الطلاب كإشعارات منبثقة (Push Notifications).</p>
            </div>
          </div>
        </div>

        <div className="grid-layout">
          {/* قسم الفورم */}
          <div className="card form-card">
            <h3>تفاصيل الإشعار</h3>
            <form onSubmit={handleSend}>
              <div className="form-group">
                <label>عنوان الإشعار</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="مثال: تحديث هام جداً!" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  required 
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label>محتوى الرسالة</label>
                <textarea 
                  className="input-field textarea" 
                  placeholder="اكتب تفاصيل التنبيه هنا لتظهر للطالب..." 
                  value={formData.body}
                  onChange={e => setFormData({...formData, body: e.target.value})}
                  required 
                  rows="4"
                  maxLength={200}
                ></textarea>
              </div>

              <div className="section-divider">
                <span>تحديد المستهدفين (Target)</span>
              </div>

              <div className="target-options">
                <label className={`radio-card ${formData.targetType === 'all' ? 'active' : ''}`}>
                  <input type="radio" name="target" checked={formData.targetType === 'all'} onChange={() => setFormData({...formData, targetType: 'all', targetId: ''})} />
                  <span className="icon"><GlobeIcon /></span>
                  <span className="text">الجميع (كل المسجلين)</span>
                </label>

                <label className={`radio-card ${formData.targetType === 'course' ? 'active' : ''}`}>
                  <input type="radio" name="target" checked={formData.targetType === 'course'} onChange={() => setFormData({...formData, targetType: 'course', targetId: ''})} />
                  <span className="icon"><CourseIcon /></span>
                  <span className="text">طلاب كورس معين</span>
                </label>

                <label className={`radio-card ${formData.targetType === 'subject' ? 'active' : ''}`}>
                  <input type="radio" name="target" checked={formData.targetType === 'subject'} onChange={() => setFormData({...formData, targetType: 'subject', targetId: ''})} />
                  <span className="icon"><SubjectIcon /></span>
                  <span className="text">طلاب مادة معينة</span>
                </label>

                <label className={`radio-card ${formData.targetType === 'user' ? 'active' : ''}`}>
                  <input type="radio" name="target" checked={formData.targetType === 'user'} onChange={() => setFormData({...formData, targetType: 'user', targetId: ''})} />
                  <span className="icon"><UserIcon /></span>
                  <span className="text">مستخدم محدد (خاص)</span>
                </label>
              </div>

              {/* التحديد الديناميكي */}
              <div className="dynamic-target-section">
                {formData.targetType === 'course' && (
                  <div className="form-group animate-slide">
                    <label>اختر الكورس المستهدف:</label>
                    <SelectModal
                      value={formData.targetId}
                      onChange={(val) => setFormData({ ...formData, targetId: val })}
                      options={courses.map(c => ({ value: c.id, label: c.title }))}
                      placeholder="-- يرجى اختيار الكورس --"
                      title="اختر الكورس المستهدف"
                    />
                  </div>
                )}

                {formData.targetType === 'subject' && (
                  <div className="form-group animate-slide">
                    <label>اختر المادة المستهدفة:</label>
                    <SelectModal
                      value={formData.targetId}
                      onChange={(val) => setFormData({ ...formData, targetId: val })}
                      groups={courses.map(c => ({
                        label: `كورس: ${c.title}`,
                        options: (c.subjects || []).map(s => ({ value: s.id, label: s.title })),
                      }))}
                      placeholder="-- يرجى اختيار المادة --"
                      title="اختر المادة المستهدفة"
                    />
                  </div>
                )}

                {formData.targetType === 'user' && (
                  <div className="form-group animate-slide">
                    <label>معرف المستخدم (طالب، مدرس، أو مشرف):</label>
                    <input 
                      type="text" 
                      className="input-field ltr" 
                      placeholder="رقم الهاتف أو الـ Username" 
                      value={formData.userIdentifier}
                      onChange={e => setFormData({...formData, userIdentifier: e.target.value})}
                      required 
                    />
                    <small className="hint">سيتم إرسال الإشعار لهاتف هذا المستخدم فقط (شريطة أن يكون قد فتح التطبيق مسبقاً).</small>
                  </div>
                )}
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? <span className="spinner"></span> : <><SendIcon /> إرسال الإشعار الآن</>}
              </button>
            </form>
          </div>

          {/* قسم المعاينة (Preview) */}
          <div className="preview-section">
            <h3 className="preview-title">معاينة شكل الإشعار</h3>
            <div className="phone-mockup">
              <div className="phone-screen">
                <div className="notification-bubble">
                  <div className="notif-header">
                    <div className="app-icon">م</div>
                    <span className="app-name">مــــداد</span>
                    <span className="time">الآن</span>
                  </div>
                  <div className="notif-content">
                    <h4>{formData.title || 'عنوان الإشعار يظهر هنا'}</h4>
                    <p>{formData.body || 'نص الرسالة يظهر هنا ليعطي الطالب فكرة سريعة عن المحتوى...'}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="info-box mt-4">
              <strong>ملاحظة هامة:</strong>
              <p>الإشعارات تصل للمستخدمين حتى وإن كان التطبيق مغلقاً. عند الضغط على الإشعار سيتم توجيه المستخدم تلقائياً لصفحة الإشعارات داخل التطبيق.</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .notifications-container { 
          padding-bottom: 50px; 
          max-width: 1200px; 
          margin: 0 auto; 
        }
        
        .page-header { 
          margin-bottom: 30px; 
          border-bottom: 1px solid var(--border); 
          padding-bottom: 20px; 
        }
        .header-title-wrap { 
          display: flex; 
          align-items: center; 
          gap: 16px; 
        }
        .header-icon {
          width: 48px; height: 48px;
          background: var(--gold-dim);
          color: var(--gold);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-accent);
        }
        .page-header h1 { 
          margin: 0 0 6px 0; 
          color: var(--text-primary); 
          font-size: 1.6rem; 
          font-weight: 800; 
        }
        .page-header p { 
          color: var(--text-secondary); 
          margin: 0; 
          font-size: 0.95rem; 
        }

        .grid-layout { 
          display: grid; 
          grid-template-columns: 1.5fr 1fr; 
          gap: 30px; 
        }
        @media (max-width: 900px) { 
          .grid-layout { grid-template-columns: 1fr; } 
        }

        /* ── CARDS ── */
        .card { 
          background: var(--bg-surface); 
          border-radius: 16px; 
          padding: 28px; 
          border: 1px solid var(--border); 
          box-shadow: var(--shadow); 
        }
        .card h3 { 
          margin-top: 0; 
          color: var(--text-primary); 
          border-bottom: 1px dashed var(--border); 
          padding-bottom: 15px; 
          margin-bottom: 24px; 
          font-size: 1.15rem;
          font-weight: 700;
        }

        /* ── FORMS ── */
        .form-group { margin-bottom: 22px; }
        .form-group label { 
          display: block; 
          color: var(--text-secondary); 
          margin-bottom: 8px; 
          font-weight: 600; 
          font-size: 0.95rem; 
        }
        .input-field { 
          width: 100%; 
          background: var(--bg-elevated); 
          border: 1px solid var(--border); 
          padding: 14px 16px; 
          border-radius: 10px; 
          color: var(--text-primary); 
          font-size: 0.95rem; 
          transition: all 0.2s; 
          font-family: inherit; 
        }
        .input-field:focus { 
          border-color: var(--gold); 
          outline: none; 
          box-shadow: 0 0 0 3px var(--gold-dim); 
        }
        .input-field.textarea { 
          resize: vertical; 
          min-height: 110px; 
          line-height: 1.6; 
        }
        .input-field.ltr { 
          direction: ltr; 
          font-family: monospace; 
          font-size: 1.05rem; 
          text-align: left;
        }

        /* ── SelectModal بيتعرّض كـ component منفصل في نفس الملف، فـ
           styled-jsx مبيحطّش الـ scope class بتاعه على عناصره تلقائياً.
           لازم نلف القواعد دي بـ :global() عشان تتطبّق فعلياً. ── */
        :global(.select-modal-trigger) {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px;
          padding: 14px 16px; color: var(--text-primary); font-size: 0.95rem; font-family: inherit;
          cursor: pointer; transition: all 0.2s; text-align: right;
        }
        :global(.select-modal-trigger:hover:not(:disabled)) { border-color: var(--border-accent); }
        :global(.select-modal-trigger.open) { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-dim); }
        :global(.select-modal-trigger:disabled) { cursor: not-allowed; opacity: 0.6; }
        :global(.select-modal-trigger .placeholder) { color: var(--text-muted); }
        :global(.select-modal-trigger .chevron) { display: flex; color: var(--text-secondary); transition: transform 0.15s; flex-shrink: 0; }
        :global(.select-modal-trigger.open .chevron) { transform: rotate(180deg); color: var(--gold); }

        :global(.select-modal-overlay) {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2500;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          animation: selectModalFade 0.15s ease;
        }
        @keyframes selectModalFade { from { opacity: 0; } to { opacity: 1; } }
        :global(.select-modal-box) {
          width: 100%; max-width: 440px; max-height: 78vh; display: flex; flex-direction: column;
          background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
          animation: selectModalPop 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes selectModalPop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        :global(.select-modal-header) {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        :global(.select-modal-header h4) { margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 700; }
        :global(.select-modal-close) {
          background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary);
          width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: 0.15s;
        }
        :global(.select-modal-close:hover) { border-color: var(--gold); color: var(--gold); }
        :global(.select-modal-search) {
          display: flex; align-items: center; gap: 8px; margin: 14px 18px 6px;
          background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px;
          padding: 10px 12px; color: var(--text-muted); flex-shrink: 0;
        }
        :global(.select-modal-search input) {
          flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary);
          font-size: 0.9rem; font-family: inherit;
        }
        :global(.select-modal-search input::placeholder) { color: var(--text-muted); }
        :global(.select-modal-list) { overflow-y: auto; padding: 8px 10px 14px; }
        :global(.select-modal-option) {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 11px 12px; border-radius: 9px; font-size: 0.9rem; color: var(--text-primary);
          cursor: pointer; transition: 0.12s;
        }
        :global(.select-modal-option:hover) { background: var(--bg-elevated); }
        :global(.select-modal-option.selected) { background: var(--gold-dimmer); color: var(--gold); font-weight: 600; }
        :global(.select-modal-option.selected svg) { color: var(--gold); flex-shrink: 0; }
        :global(.select-modal-group) { margin-top: 4px; }
        :global(.select-modal-group + .select-modal-group) { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        :global(.select-modal-group-label) {
          padding: 4px 12px 6px; font-size: 0.72rem; font-weight: 700; color: var(--gold);
          text-transform: uppercase; letter-spacing: 0.03em;
        }
        :global(.select-modal-empty) { padding: 26px 10px; text-align: center; color: var(--text-muted); font-size: 0.88rem; }

        .section-divider { 
          margin: 35px 0 20px 0; 
          color: var(--text-muted); 
          font-weight: 700; 
          font-size: 0.85rem; 
          text-transform: uppercase; 
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        /* ── RADIO OPTIONS ── */
        .target-options { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 14px; 
          margin-bottom: 24px; 
        }
        @media (max-width: 600px) { 
          .target-options { grid-template-columns: 1fr; } 
        }

        .radio-card { 
          display: flex; 
          align-items: center; 
          gap: 12px; 
          background: var(--bg-elevated); 
          padding: 16px; 
          border-radius: 12px; 
          border: 1px solid var(--border); 
          cursor: pointer; 
          transition: all 0.2s; 
        }
        .radio-card:hover { 
          border-color: var(--gold-light); 
          transform: translateY(-2px);
        }
        .radio-card.active { 
          border-color: var(--gold); 
          background: var(--gold-dim); 
          box-shadow: 0 4px 15px var(--gold-dimmer);
        }
        .radio-card input { display: none; }
        .radio-card .icon { 
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted); 
          transition: color 0.2s;
        }
        .radio-card .text { 
          color: var(--text-primary); 
          font-weight: 600; 
          font-size: 0.9rem;
        }
        .radio-card.active .icon, .radio-card.active .text { 
          color: var(--gold); 
        }

        .dynamic-target-section { min-height: 95px; }
        .animate-slide { animation: slideDown 0.3s ease-out; }
        @keyframes slideDown { 
          from { opacity: 0; transform: translateY(-10px); } 
          to { opacity: 1; transform: translateY(0); } 
        }

        .hint { 
          display: block; 
          margin-top: 8px; 
          color: var(--text-muted); 
          font-size: 0.8rem; 
          line-height: 1.5; 
        }

        /* ── BUTTON ── */
        .submit-btn { 
          width: 100%; 
          background: var(--gold); 
          color: #111009; 
          border: none; 
          padding: 16px; 
          border-radius: 12px; 
          font-size: 1.05rem; 
          font-weight: 800; 
          cursor: pointer; 
          transition: all 0.3s; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          gap: 10px;
          margin-top: 15px; 
        }
        .submit-btn:hover:not(:disabled) { 
          background: var(--gold-light);
          transform: translateY(-2px); 
          box-shadow: 0 6px 20px rgba(201,168,76,0.3); 
        }
        .submit-btn:disabled { 
          background: var(--bg-elevated); 
          color: var(--text-muted);
          border: 1px solid var(--border);
          cursor: not-allowed; 
          box-shadow: none; 
        }

        /* ── PREVIEW SECTION ── */
        .preview-title {
          text-align: center;
          color: var(--text-secondary);
          margin-top: 0;
          font-size: 1.05rem;
          margin-bottom: 20px;
        }
        .phone-mockup { 
          width: 100%; 
          max-width: 300px; 
          height: 580px; 
          background: #000; 
          border-radius: 40px; 
          margin: 0 auto; 
          border: 12px solid #1a1710; 
          position: relative; 
          box-shadow: var(--shadow); 
          overflow: hidden; 
          display: flex; 
          flex-direction: column; 
        }
        .phone-mockup::before { 
          content: ''; 
          position: absolute; 
          top: 0; left: 50%; 
          transform: translateX(-50%); 
          width: 110px; height: 25px; 
          background: #1a1710; 
          border-bottom-left-radius: 16px; 
          border-bottom-right-radius: 16px; 
          z-index: 10; 
        }
        .phone-screen { 
          flex: 1; 
          background: url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop') center/cover; 
          padding: 50px 15px 20px 15px; 
          display: flex; 
          flex-direction: column; 
        }
        
        .notification-bubble { 
          background: rgba(255, 255, 255, 0.95); 
          backdrop-filter: blur(10px); 
          border-radius: 16px; 
          padding: 16px; 
          box-shadow: 0 10px 25px rgba(0,0,0,0.3); 
          animation: dropIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        }
        .notif-header { 
          display: flex; align-items: center; gap: 8px; margin-bottom: 10px; 
        }
        .app-icon { 
          width: 22px; height: 22px; 
          background: #111009; 
          color: #c9a84c; 
          border-radius: 6px; 
          display: flex; justify-content: center; align-items: center; 
          font-size: 11px; font-weight: 800; 
        }
        .app-name { font-size: 0.8rem; color: #333; font-weight: 700; }
        .time { margin-right: auto; font-size: 0.75rem; color: #888; }
        .notif-content h4 { margin: 0 0 5px 0; color: #111; font-size: 0.95rem; }
        .notif-content p { 
          margin: 0; color: #555; 
          font-size: 0.85rem; line-height: 1.4; 
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; 
        }

        @keyframes dropIn { 
          from { transform: translateY(-50px); opacity: 0; } 
          to { transform: translateY(0); opacity: 1; } 
        }

        /* ── INFO BOX ── */
        .info-box { 
          background: var(--gold-dimmer); 
          border: 1px solid var(--border-accent); 
          padding: 16px; 
          border-radius: 12px; 
        }
        .info-box strong { 
          color: var(--gold); 
          display: block; 
          margin-bottom: 6px; 
          font-size: 0.95rem;
        }
        .info-box p { 
          margin: 0; 
          color: var(--text-secondary); 
          font-size: 0.88rem; 
          line-height: 1.6; 
        }
        .mt-4 { margin-top: 24px; }

        /* ── SPINNER & TOAST ── */
        .spinner { 
          width: 24px; height: 24px; 
          border: 3px solid rgba(17,16,9,0.2); 
          border-top: 3px solid #111009; 
          border-radius: 50%; 
          animation: spin 0.8s linear infinite; 
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .toast { 
          position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); 
          background: var(--bg-surface); 
          color: var(--text-primary); 
          padding: 14px 28px; 
          border-radius: 50px; 
          font-weight: 700; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.6); 
          z-index: 2000; 
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
          opacity: 0; 
          border: 1px solid var(--border); 
        }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.success { border-bottom: 3px solid #4ade80; }
        .toast.error { border-bottom: 3px solid #f87171; }
      `}</style>
    </SuperLayout>
  );
}
