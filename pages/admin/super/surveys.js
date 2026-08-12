import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';

// ─── SVG Icons ──────────────────────────────────────────
const ClipboardIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"></path><rect x="4" y="4" width="16" height="18" rx="2"></rect><line x1="8" y1="11" x2="16" y2="11"></line><line x1="8" y1="15" x2="16" y2="15"></line></svg>);
const PlusIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const TrashIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>);
const EditIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>);
const EyeIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
const StarIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>);
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const ChevronDownIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>);
const CheckIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);

const QUESTION_TYPES = [
  { value: 'mcq_single', label: 'اختيار واحد (Radio)' },
  { value: 'mcq_multiple', label: 'اختيار متعدد (Checkboxes)' },
  { value: 'written', label: 'إجابة كتابية' },
  { value: 'rating', label: 'تقييم بالنجوم' },
];

const emptyQuestion = () => ({ question_text: '', question_type: 'mcq_single', options: ['', ''], max_rating: 5, is_required: true });

const RESPONSES_PAGE_SIZE = 50;

// ─── Toggle switch: مكوّن موحّد لكل مفاتيح التبديل في الشاشة ──────────────
// مكتوب بحيث تكون قيمة "checked" مُتحكَّم فيها بالكامل من الأب (controlled)،
// ولا يوجد أي مصدر مزدوج لتغيير الحالة، فلا يحدث أي "فتح وقفل" مرئي بعد
// الضغط. لو فيه استدعاء غير متزامن (onChange async)، الأب مسؤول عن التحديث
// المتفائل (optimistic) فوراً حتى لا ترجع القيمة قبل اكتمال الطلب.
const ToggleSwitch = ({ checked, onChange, small = false, disabled = false }) => (
  <label className={`switch ${small ? 'small' : ''}`}>
    <input
      type="checkbox"
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="slider"></span>
  </label>
);

// ─── قائمة منسدلة مخصّصة (Custom Select) ──────────────────────────────
// بديل احترافي لعنصر <select> الافتراضي في المتصفح (اللي بيطلع بشكل
// مختلف وغير متناسق مع تصميم الداشبورد على كل نظام تشغيل/متصفح). القائمة
// دي متسقة مع باقي عناصر الفورم (نفس الألوان والحواف)، بتتقفل تلقائياً
// عند الضغط بره منها، وبتعلّم على الخيار المختار حالياً.
const CustomSelect = ({ value, onChange, options, placeholder = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selected = options.find(o => String(o.value) === String(value));

  return (
    <div className="custom-select" ref={rootRef}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'placeholder'}>{selected ? selected.label : placeholder}</span>
        <span className="chevron"><ChevronDownIcon /></span>
      </button>
      {open && (
        <ul className="custom-select-menu" role="listbox">
          {options.map(opt => {
            const isSelected = String(opt.value) === String(value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span>{opt.label}</span>
                {isSelected && <CheckIcon />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default function SurveysPage() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [lockQuestions, setLockQuestions] = useState(false); // true لو فيه ردود بالفعل
  const [wantsResendNotification, setWantsResendNotification] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', is_obligatory: false,
    starts_at: '', expires_at: '', notify_students: true,
    questions: [emptyQuestion()],
  });

  const [viewingSurvey, setViewingSurvey] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewPage, setViewPage] = useState(1);
  const [viewLoadingMore, setViewLoadingMore] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  const fetchSurveys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/surveys');
      const data = await res.json();
      if (res.ok) setSurveys(data.surveys || []);
    } catch (e) {
      showToast('فشل تحميل الاستبيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSurveys(); }, []);

  const resetForm = () => {
    setForm({
      title: '', description: '', is_obligatory: false,
      starts_at: '', expires_at: '', notify_students: true,
      questions: [emptyQuestion()],
    });
    setEditingId(null);
    setLockQuestions(false);
    setWantsResendNotification(false);
  };

  const openCreate = () => { resetForm(); setShowBuilder(true); };

  const openEdit = async (surveyId) => {
    try {
      const res = await fetch(`/api/dashboard/super/surveys?id=${surveyId}`);
      const data = await res.json();
      if (!res.ok) return showToast(data.message || 'فشل التحميل', 'error');
      setForm({
        title: data.survey.title || '',
        description: data.survey.description || '',
        is_obligatory: !!data.survey.is_obligatory,
        starts_at: data.survey.starts_at ? data.survey.starts_at.slice(0, 16) : '',
        expires_at: data.survey.expires_at ? data.survey.expires_at.slice(0, 16) : '',
        notify_students: data.survey.notify_students !== false,
        questions: (data.questions || []).map(q => ({
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options && q.options.length ? q.options : ['', ''],
          max_rating: q.max_rating || 5,
          is_required: q.is_required !== false,
        })),
      });
      setEditingId(surveyId);
      setLockQuestions((data.responseCount || 0) > 0);
      setWantsResendNotification(false);
      setShowBuilder(true);
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    }
  };

  const handleDelete = async (surveyId) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاستبيان؟ سيتم حذف كل الردود المرتبطة به.')) return;
    try {
      const res = await fetch(`/api/dashboard/super/surveys?id=${surveyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { showToast('تم الحذف بنجاح'); fetchSurveys(); }
      else showToast(data.message || 'فشل الحذف', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  };

  // تحديث متفائل (optimistic): نغيّر الحالة في الواجهة فوراً عند الضغط، بدل
  // انتظار رد السيرفر ثم عمل fetchSurveys() كامل من جديد. الطريقة القديمة
  // كانت تُبقي القيمة القديمة معروضة أثناء انتظار الطلب فيبدو المفتاح وكأنه
  // "يتفتح ويتقفل" لحظياً قبل ما يستقر على القيمة الصحيحة. لو فشل الطلب،
  // نرجّع القيمة القديمة فقط.
  const toggleActive = async (survey) => {
    const nextValue = !survey.is_active;
    setSurveys(prev => prev.map(s => (s.id === survey.id ? { ...s, is_active: nextValue } : s)));
    try {
      const res = await fetch('/api/dashboard/super/surveys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: survey.id, is_active: nextValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSurveys(prev => prev.map(s => (s.id === survey.id ? { ...s, is_active: survey.is_active } : s)));
        showToast(data.message || 'فشل التحديث', 'error');
      }
    } catch (e) {
      setSurveys(prev => prev.map(s => (s.id === survey.id ? { ...s, is_active: survey.is_active } : s)));
      showToast('خطأ في الاتصال', 'error');
    }
  };

  // ── Question builder helpers ──
  const updateQuestion = (idx, patch) => {
    setForm(f => ({ ...f, questions: f.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)) }));
  };
  const addQuestion = () => setForm(f => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
  const removeQuestion = (idx) => setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  const updateOption = (qIdx, oIdx, value) => {
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? value : o) } : q),
    }));
  };
  const addOption = (qIdx) => setForm(f => ({ ...f, questions: f.questions.map((q, i) => i === qIdx ? { ...q, options: [...q.options, ''] } : q) }));
  const removeOption = (qIdx, oIdx) => setForm(f => ({ ...f, questions: f.questions.map((q, i) => i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q) }));

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return showToast('عنوان الاستبيان مطلوب', 'error');
    if (form.questions.length === 0) return showToast('أضف سؤالاً واحداً على الأقل', 'error');

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        is_obligatory: form.is_obligatory,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        notify_students: form.notify_students,
      };
      if (editingId && wantsResendNotification) payload.notify_now = true;
      if (!lockQuestions) payload.questions = form.questions;

      let res;
      if (editingId) {
        res = await fetch('/api/dashboard/super/surveys', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch('/api/dashboard/super/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        let msg = editingId ? 'تم حفظ التعديلات' : 'تم إنشاء الاستبيان بنجاح';
        if (!editingId && form.notify_students) {
          msg += data.notified ? ' وتم إرسال إشعار للطلاب 🔔' : ' (تعذر إرسال الإشعار)';
        } else if (editingId && wantsResendNotification) {
          msg += data.notified ? ' وتم إرسال الإشعار 🔔' : ' (تعذر إرسال الإشعار)';
        }
        showToast(msg);
        setShowBuilder(false);
        resetForm();
        fetchSurveys();
      } else {
        showToast(data.message || 'فشل الحفظ', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setSaving(false);
    }
  };

  // النتائج المجمّعة (stats) بترجع كاملة دايماً من كل الردود، لكن قائمة
  // "الردود الفردية" بتتحمّل صفحة صفحة (pagination) عشان تفضل الشاشة سريعة
  // حتى لو الاستبيان عليه أكتر من 500 رد.
  const openResponses = async (survey) => {
    setViewingSurvey(survey);
    setViewLoading(true);
    setViewData(null);
    setViewPage(1);
    try {
      const res = await fetch(`/api/dashboard/super/survey-responses?survey_id=${survey.id}&page=1&page_size=${RESPONSES_PAGE_SIZE}`);
      const data = await res.json();
      if (res.ok) setViewData(data);
      else showToast(data.message || 'فشل التحميل', 'error');
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    } finally {
      setViewLoading(false);
    }
  };

  const loadMoreResponses = async () => {
    if (!viewingSurvey || !viewData || viewLoadingMore) return;
    const nextPage = viewPage + 1;
    setViewLoadingMore(true);
    try {
      const res = await fetch(`/api/dashboard/super/survey-responses?survey_id=${viewingSurvey.id}&page=${nextPage}&page_size=${RESPONSES_PAGE_SIZE}`);
      const data = await res.json();
      if (res.ok) {
        setViewData(prev => ({ ...data, responses: [...prev.responses, ...data.responses] }));
        setViewPage(nextPage);
      } else {
        showToast(data.message || 'فشل تحميل المزيد', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    } finally {
      setViewLoadingMore(false);
    }
  };

  return (
    <SuperLayout title="الاستبيانات وآراء الطلاب">
      <Head><title>الاستبيانات | الإدارة العليا</title></Head>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.message}</div>

      <div className="page-header">
        <div className="header-title-wrap">
          <div className="header-icon"><ClipboardIcon /></div>
          <div>
            <h1>الاستبيانات وآراء الطلاب</h1>
            <p>أنشئ استبيانات (اختيارات / كتابية / تقييم بالنجوم) تظهر للطلاب داخل التطبيق، وتابع نتائجها هنا.</p>
          </div>
        </div>
        <button className="primary-btn" onClick={openCreate}><PlusIcon /> استبيان جديد</button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>جارِ التحميل...</div>
      ) : surveys.length === 0 ? (
        <div className="card empty-state">لا توجد استبيانات بعد. اضغط "استبيان جديد" للبدء.</div>
      ) : (
        <div className="card">
          <table className="surveys-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الحالة</th>
                <th>إلزامي؟</th>
                <th>الأسئلة</th>
                <th>الردود</th>
                <th>يبدأ في</th>
                <th>ينتهي في</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map(s => {
                const notYetStarted = s.starts_at && new Date(s.starts_at) > new Date();
                return (
                <tr key={s.id}>
                  <td className="title-cell">{s.title}</td>
                  <td>
                    <ToggleSwitch checked={s.is_active} onChange={() => toggleActive(s)} />
                    <span className={`status-text ${s.is_active ? 'on' : 'off'}`}>{s.is_active ? 'مفعّل' : 'موقوف'}</span>
                    {s.is_active && notYetStarted && <span className="status-text off"> (لم يبدأ بعد)</span>}
                  </td>
                  <td>{s.is_obligatory ? <span className="badge obligatory">إلزامي</span> : <span className="badge optional">اختياري</span>}</td>
                  <td>{s.question_count}</td>
                  <td>{s.response_count}</td>
                  <td>{s.starts_at ? new Date(s.starts_at).toLocaleString('ar-EG') : 'فوراً'}</td>
                  <td>{s.expires_at ? new Date(s.expires_at).toLocaleString('ar-EG') : 'بدون انتهاء'}</td>
                  <td className="actions-cell">
                    <button className="icon-btn" title="عرض النتائج" onClick={() => openResponses(s)}><EyeIcon /></button>
                    <button className="icon-btn" title="تعديل" onClick={() => openEdit(s.id)}><EditIcon /></button>
                    <button className="icon-btn danger" title="حذف" onClick={() => handleDelete(s.id)}><TrashIcon /></button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════ Builder Modal ══════════════ */}
      {showBuilder && (
        <div className="modal-overlay" onClick={() => setShowBuilder(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'تعديل الاستبيان' : 'استبيان جديد'}</h3>
              <button className="icon-btn" onClick={() => setShowBuilder(false)}><CloseIcon /></button>
            </div>

            <form onSubmit={handleSubmitForm} className="modal-body">
              <div className="form-group">
                <label>عنوان الاستبيان</label>
                <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength={120} />
              </div>

              <div className="form-group">
                <label>وصف مختصر (اختياري)</label>
                <textarea className="input-field textarea" rows="2" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={300} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاريخ ووقت بدء الاستبيان (اختياري)</label>
                  <input type="datetime-local" className="input-field" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
                  <span className="hint">لو فارغ، الاستبيان يبدأ الظهور للطلاب فوراً بمجرد تفعيله.</span>
                </div>
                <div className="form-group">
                  <label>تاريخ انتهاء الصلاحية (اختياري)</label>
                  <input type="datetime-local" className="input-field" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group toggle-group">
                  <label>استبيان إلزامي؟</label>
                  <ToggleSwitch checked={form.is_obligatory} onChange={(val) => setForm({ ...form, is_obligatory: val })} />
                  <span className="hint">لو مفعّل، الطالب لن يستطيع تجاوز الاستبيان دون الإجابة عليه.</span>
                </div>
                <div className="form-group toggle-group">
                  <label>إشعار الطلاب بالاستبيان؟</label>
                  <ToggleSwitch checked={form.notify_students} onChange={(val) => setForm({ ...form, notify_students: val })} />
                  <span className="hint">
                    {editingId
                      ? 'الإشعار الأساسي يُرسل مرة واحدة عند الإنشاء فقط.'
                      : 'لو مفعّل، هيتم إرسال إشعار Push فوري لكل الطلاب عند إنشاء الاستبيان.'}
                  </span>
                  {editingId && (
                    <label className="resend-check">
                      <input
                        type="checkbox"
                        checked={wantsResendNotification}
                        onChange={e => setWantsResendNotification(e.target.checked)}
                      />
                      <span> إرسال إشعار الآن مرة أخرى لكل الطلاب</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="section-divider"><span>الأسئلة</span></div>

              {lockQuestions && (
                <div className="info-box">
                  <strong>تنبيه</strong>
                  <p>هذا الاستبيان لديه ردود بالفعل من الطلاب، لذلك لا يمكن تعديل الأسئلة حفاظاً على سلامة النتائج. يمكنك تعديل العنوان/الوصف/الحالة فقط.</p>
                </div>
              )}

              {!lockQuestions && form.questions.map((q, qIdx) => (
                <div className="question-card" key={qIdx}>
                  <div className="question-card-header">
                    <span className="q-number">سؤال {qIdx + 1}</span>
                    {form.questions.length > 1 && (
                      <button type="button" className="icon-btn danger small" onClick={() => removeQuestion(qIdx)}><TrashIcon /></button>
                    )}
                  </div>

                  <div className="form-group">
                    <label>نص السؤال</label>
                    <input className="input-field" value={q.question_text} onChange={e => updateQuestion(qIdx, { question_text: e.target.value })} required maxLength={250} />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>نوع السؤال</label>
                      <CustomSelect
                        value={q.question_type}
                        onChange={(val) => updateQuestion(qIdx, { question_type: val, options: ['', ''] })}
                        options={QUESTION_TYPES}
                      />
                    </div>
                    <div className="form-group toggle-group">
                      <label>مطلوب إجباري؟</label>
                      <ToggleSwitch small checked={q.is_required} onChange={(val) => updateQuestion(qIdx, { is_required: val })} />
                    </div>
                  </div>

                  {['mcq_single', 'mcq_multiple'].includes(q.question_type) && (
                    <div className="options-list">
                      <label>الخيارات</label>
                      {q.options.map((opt, oIdx) => (
                        <div className="option-row" key={oIdx}>
                          <input className="input-field" placeholder={`خيار ${oIdx + 1}`} value={opt} onChange={e => updateOption(qIdx, oIdx, e.target.value)} required />
                          {q.options.length > 2 && (
                            <button type="button" className="icon-btn danger small" onClick={() => removeOption(qIdx, oIdx)}><CloseIcon /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="link-btn" onClick={() => addOption(qIdx)}>+ إضافة خيار</button>
                    </div>
                  )}

                  {q.question_type === 'rating' && (
                    <div className="form-group">
                      <label>عدد النجوم</label>
                      <CustomSelect
                        value={q.max_rating}
                        onChange={(val) => updateQuestion(qIdx, { max_rating: parseInt(val) })}
                        options={[3, 5, 10].map(n => ({ value: n, label: `${n} نجوم` }))}
                      />
                    </div>
                  )}
                </div>
              ))}

              {!lockQuestions && (
                <button type="button" className="secondary-btn" onClick={addQuestion}><PlusIcon /> إضافة سؤال</button>
              )}

              <button type="submit" className="submit-btn" disabled={saving}>
                {saving ? 'جارِ الحفظ...' : (editingId ? 'حفظ التعديلات' : 'إنشاء الاستبيان')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ Responses / Results Modal ══════════════ */}
      {viewingSurvey && (
        <div className="modal-overlay" onClick={() => setViewingSurvey(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>نتائج: {viewingSurvey.title}</h3>
              <button className="icon-btn" onClick={() => setViewingSurvey(null)}><CloseIcon /></button>
            </div>
            <div className="modal-body">
              {viewLoading ? (
                <div style={{ textAlign: 'center', padding: 30 }}>جارِ التحميل...</div>
              ) : !viewData ? (
                <div style={{ textAlign: 'center', padding: 30 }}>لا توجد بيانات</div>
              ) : (
                <>
                  <p className="hint">إجمالي عدد الردود: <strong>{viewData.total_responses}</strong></p>

                  {viewData.stats.map(st => (
                    <div className="stat-card" key={st.question_id}>
                      <h4>{st.question_text}</h4>

                      {st.question_type === 'written' && (
                        <div className="written-list">
                          {st.written_feedback.length === 0 ? (
                            <p className="hint">لا توجد إجابات كتابية بعد</p>
                          ) : st.written_feedback.map((txt, i) => (
                            <div className="written-item" key={i}>{txt}</div>
                          ))}
                        </div>
                      )}

                      {st.question_type === 'rating' && (
                        <div className="rating-summary">
                          <div className="avg-rating"><StarIcon /> {st.average_rating} / {st.max_rating} <span className="hint">({st.total_ratings} تقييم)</span></div>
                          {Object.entries(st.distribution).reverse().map(([star, count]) => (
                            <div className="bar-row" key={star}>
                              <span>{star} ⭐</span>
                              <div className="bar-track"><div className="bar-fill" style={{ width: `${st.total_ratings ? (count / st.total_ratings) * 100 : 0}%` }}></div></div>
                              <span>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {['mcq_single', 'mcq_multiple'].includes(st.question_type) && (
                        <div className="options-summary">
                          {st.options.map(opt => {
                            const count = st.option_counts[opt] || 0;
                            const pct = st.total_respondents ? Math.round((count / st.total_respondents) * 100) : 0;
                            return (
                              <div className="bar-row" key={opt}>
                                <span>{opt}</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }}></div></div>
                                <span>{count} ({pct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="section-divider"><span>الردود الفردية</span></div>
                  <p className="hint">
                    عرض {viewData.responses.length} من أصل {viewData.total_responses} رد
                  </p>
                  {viewData.responses.length === 0 ? (
                    <p className="hint">لا يوجد طلاب أجابوا بعد</p>
                  ) : viewData.responses.map(r => (
                    <div className="response-card" key={r.response_id}>
                      <div className="response-header">
                        <strong>{r.student_name}</strong>
                        <span className="hint">{new Date(r.submitted_at).toLocaleString('ar-EG')}</span>
                      </div>
                      {r.answers.map((a, i) => {
                        const q = viewData.questions.find(q => q.id === a.question_id);
                        return (
                          <div className="answer-line" key={i}>
                            <span className="q-label">{q?.question_text}:</span>{' '}
                            {a.answer_text || (a.selected_options || []).join('، ') || (a.rating_value ? `${a.rating_value} ⭐` : '-')}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {viewData.has_more && (
                    <button type="button" className="secondary-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={loadMoreResponses} disabled={viewLoadingMore}>
                      {viewLoadingMore ? 'جارِ التحميل...' : `تحميل المزيد (${viewData.total_responses - viewData.responses.length} متبقي)`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
        .header-title-wrap { display: flex; align-items: center; gap: 16px; }
        .header-icon { width: 52px; height: 52px; border-radius: 14px; background: var(--gold-dimmer); color: var(--gold); display: flex; align-items: center; justify-content: center; }
        .page-header h1 { margin: 0; font-size: 1.4rem; color: var(--text-primary); }
        .page-header p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.9rem; }

        .primary-btn { display: flex; align-items: center; gap: 8px; background: var(--gold); color: #111009; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .primary-btn:hover { background: var(--gold-light); transform: translateY(-1px); }
        .secondary-btn { display: flex; align-items: center; gap: 6px; background: var(--gold-dimmer); color: var(--gold); border: 1px solid var(--border-accent); padding: 10px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; margin-top: 10px; }

        .card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
        .empty-state { text-align: center; color: var(--text-muted); padding: 40px; }

        .surveys-table { width: 100%; border-collapse: collapse; }
        .surveys-table th, .surveys-table td { padding: 12px 10px; text-align: right; border-bottom: 1px solid var(--border); font-size: 0.88rem; color: var(--text-primary); }
        .surveys-table th { color: var(--text-secondary); font-weight: 600; }
        .title-cell { font-weight: 700; }
        .status-text { margin-right: 8px; font-size: 0.8rem; }
        .status-text.on { color: #4ade80; }
        .status-text.off { color: var(--text-muted); }

        .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; }
        .badge.obligatory { background: rgba(248,113,113,0.15); color: #f87171; }
        .badge.optional { background: var(--gold-dimmer); color: var(--gold); }

        .actions-cell { display: flex; gap: 6px; }
        .icon-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-btn.danger { color: #f87171; }
        .icon-btn.small { width: 26px; height: 26px; }
        .icon-btn:hover { border-color: var(--gold); color: var(--gold); }
        .icon-btn.danger:hover { border-color: #f87171; color: #f87171; }

        /* ── ToggleSwitch / CustomSelect بيتعرّضوا كـ components منفصلة
           في نفس الملف، فـ styled-jsx مبيحطّش الـ scope class بتاعه على
           عناصرهم تلقائياً (بيحطها بس على العناصر المكتوبة مباشرة جوه نفس
           الدالة اللي فيها <style jsx>). لازم نلف القواعد دي بـ :global()
           عشان تتطبّق فعلياً، وإلا هتفضل من غير أي تنسيق (شكل افتراضي). ── */
        :global(.switch) { position: relative; display: inline-block; width: 42px; height: 22px; vertical-align: middle; }
        :global(.switch.small) { width: 34px; height: 18px; }
        :global(.switch input) { opacity: 0; width: 0; height: 0; }
        :global(.slider) { position: absolute; cursor: pointer; inset: 0; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 22px; transition: 0.2s; }
        :global(.slider:before) { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 2px; background: white; border-radius: 50%; transition: 0.2s; }
        :global(.switch.small .slider:before) { height: 12px; width: 12px; }
        :global(input:checked + .slider) { background: var(--gold); }
        :global(input:checked + .slider:before) { transform: translateX(20px); }
        :global(.switch.small input:checked + .slider:before) { transform: translateX(16px); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .modal-box { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; }
        .modal-box.wide { max-width: 720px; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid var(--border); }
        .modal-header h3 { margin: 0; color: var(--text-primary); font-size: 1.1rem; }
        .modal-body { padding: 20px; overflow-y: auto; }

        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .toggle-group { display: flex; flex-direction: column; gap: 6px; }
        .resend-check { display: flex; align-items: center; gap: 6px; color: var(--gold); font-size: 0.8rem; cursor: pointer; margin-top: 2px; }
        .input-field { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text-primary); font-size: 0.9rem; }
        .input-field:focus { outline: none; border-color: var(--gold); }

        :global(.custom-select) { position: relative; width: 100%; }
        :global(.custom-select-trigger) {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px;
          padding: 10px 12px; color: var(--text-primary); font-size: 0.9rem; font-family: inherit;
          cursor: pointer; transition: 0.15s; text-align: right;
        }
        :global(.custom-select-trigger:hover) { border-color: var(--border-accent); }
        :global(.custom-select-trigger.open) { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-dimmer); }
        :global(.custom-select-trigger .placeholder) { color: var(--text-muted); }
        :global(.custom-select-trigger .chevron) { display: flex; color: var(--text-secondary); transition: transform 0.15s; flex-shrink: 0; }
        :global(.custom-select-trigger.open .chevron) { transform: rotate(180deg); color: var(--gold); }
        :global(.custom-select-menu) {
          position: absolute; z-index: 40; top: calc(100% + 6px); right: 0; left: 0;
          background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.35); padding: 6px; margin: 0; list-style: none;
          max-height: 240px; overflow-y: auto;
          animation: selectDropIn 0.14s ease;
        }
        @keyframes selectDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        :global(.custom-select-option) {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 9px 10px; border-radius: 8px; font-size: 0.88rem; color: var(--text-primary);
          cursor: pointer; transition: 0.12s;
        }
        :global(.custom-select-option:hover) { background: var(--bg-elevated); }
        :global(.custom-select-option.selected) { background: var(--gold-dimmer); color: var(--gold); font-weight: 600; }
        :global(.custom-select-option.selected svg) { color: var(--gold); flex-shrink: 0; }
        .textarea { resize: vertical; }
        .hint { color: var(--text-muted); font-size: 0.8rem; }

        .section-divider { display: flex; align-items: center; gap: 10px; margin: 22px 0 14px; color: var(--gold); font-weight: 700; font-size: 0.9rem; }
        .section-divider::before, .section-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }

        .question-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
        .question-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .q-number { font-weight: 700; color: var(--gold); font-size: 0.85rem; }

        .options-list label { display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; }
        .option-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
        .link-btn { background: none; border: none; color: var(--gold); cursor: pointer; font-size: 0.85rem; padding: 4px 0; }

        .submit-btn { width: 100%; background: var(--gold); color: #111009; border: none; padding: 14px; border-radius: 10px; font-weight: 800; font-size: 1rem; cursor: pointer; margin-top: 12px; }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .info-box { background: var(--gold-dimmer); border: 1px solid var(--border-accent); padding: 14px; border-radius: 10px; margin-bottom: 16px; }
        .info-box strong { color: var(--gold); display: block; margin-bottom: 4px; }
        .info-box p { margin: 0; color: var(--text-secondary); font-size: 0.85rem; }

        .stat-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
        .stat-card h4 { margin: 0 0 10px; color: var(--text-primary); font-size: 0.95rem; }
        .avg-rating { display: flex; align-items: center; gap: 6px; color: var(--gold); font-weight: 700; margin-bottom: 10px; }
        .bar-row { display: grid; grid-template-columns: 90px 1fr 60px; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 0.82rem; color: var(--text-secondary); }
        .bar-track { height: 8px; background: var(--bg-hover); border-radius: 6px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--gold); }
        .written-item { background: var(--bg-hover); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary); }

        .response-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
        .response-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .answer-line { font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 4px; }
        .q-label { color: var(--text-primary); font-weight: 600; }

        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--bg-surface); color: var(--text-primary); padding: 14px 28px; border-radius: 50px; font-weight: 700; box-shadow: 0 10px 40px rgba(0,0,0,0.6); z-index: 2000; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; border: 1px solid var(--border); }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.success { border-bottom: 3px solid #4ade80; }
        .toast.error { border-bottom: 3px solid #f87171; }
      `}</style>
    </SuperLayout>
  );
}
