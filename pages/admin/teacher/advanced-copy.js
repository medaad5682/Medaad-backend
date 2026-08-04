import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

// --- أيقونات SVG الاحترافية ---
const Icons = {
    copy: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>,
    back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>,
    course: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    target: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>,
    subject: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    folder: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    exam: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path></svg>,
    video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>,
    pdf: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
    arrowDown: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>,
    check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
    chevronDown: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>,
    alert: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
};

export default function AdvancedCopyPage() {
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  // الخيارات الأساسية
  const [sourceCourseId, setSourceCourseId] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  
  // الخيارات المتقدمة (النسخ لمادة/فصل موجود)
  const [targetSubjectId, setTargetSubjectId] = useState('');
  const [targetChapterId, setTargetChapterId] = useState('');
  const [targetTree, setTargetTree] = useState([]);

  const [sourceTree, setSourceTree] = useState([]);
  
  // شملنا الفيديوهات والملفات في هيكل التحديد
  const [selected, setSelected] = useState({ subjects: [], chapters: [], exams: [], videos: [], pdfs: [] });

  const [notifyStudents, setNotifyStudents] = useState(false);

  const [toast, setToast] = useState({ show: false, msg: '', type: '' });

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: '' }), 4000);
  };

  // جلب الكورسات عند التحميل
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch('/api/dashboard/teacher/content');
        const data = await res.json();
        if (res.ok) setCourses(data.courses || []);
      } catch (err) {
        showToast('خطأ في جلب الكورسات', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  // جلب شجرة المصدر
  useEffect(() => {
    if (!sourceCourseId) {
        setSourceTree([]);
        setSelected({ subjects: [], chapters: [], exams: [], videos: [], pdfs: [] });
        return;
    }
    const fetchTree = async () => {
      setTreeLoading(true);
      try {
        const res = await fetch(`/api/dashboard/teacher/advanced-copy?courseId=${sourceCourseId}`);
        const data = await res.json();
        if (res.ok) {
            setSourceTree(data.subjects || []);
            selectAll(data.subjects);
        }
      } catch (err) {
        showToast('خطأ في جلب تفاصيل الكورس', 'error');
      } finally {
        setTreeLoading(false);
      }
    };
    fetchTree();
  }, [sourceCourseId]);

  // جلب شجرة الهدف
  useEffect(() => {
    if (!targetCourseId) {
        setTargetTree([]);
        setTargetSubjectId('');
        setTargetChapterId('');
        return;
    }
    const fetchTargetTree = async () => {
        try {
            const res = await fetch(`/api/dashboard/teacher/advanced-copy?courseId=${targetCourseId}`);
            const data = await res.json();
            if (res.ok) setTargetTree(data.subjects || []);
        } catch(e) {}
    };
    fetchTargetTree();
  }, [targetCourseId]);

  const selectAll = (subjects) => {
    const newSelected = { subjects: [], chapters: [], exams: [], videos: [], pdfs: [] };
    subjects.forEach(sub => {
      newSelected.subjects.push(sub.id);
      sub.exams?.forEach(ex => newSelected.exams.push(ex.id));
      sub.chapters?.forEach(ch => {
          newSelected.chapters.push(ch.id);
          ch.videos?.forEach(v => newSelected.videos.push(v.id));
          ch.pdfs?.forEach(p => newSelected.pdfs.push(p.id));
      });
    });
    setSelected(newSelected);
  };

  // --- دوال التحديد الذكي ---
  const toggleSubject = (sub) => {
    setSelected(prev => {
        const isSelected = prev.subjects.includes(sub.id);
        let newSubjects = [...prev.subjects];
        let newChapters = [...prev.chapters];
        let newExams = [...prev.exams];
        let newVideos = [...prev.videos];
        let newPdfs = [...prev.pdfs];

        if (isSelected) {
            newSubjects = newSubjects.filter(id => id !== sub.id);
            const subChapterIds = sub.chapters?.map(c => c.id) || [];
            const subExamIds = sub.exams?.map(e => e.id) || [];
            
            newChapters = newChapters.filter(id => !subChapterIds.includes(id));
            newExams = newExams.filter(id => !subExamIds.includes(id));
            
            sub.chapters?.forEach(ch => {
                const vIds = ch.videos?.map(v => v.id) || [];
                const pIds = ch.pdfs?.map(p => p.id) || [];
                newVideos = newVideos.filter(id => !vIds.includes(id));
                newPdfs = newPdfs.filter(id => !pIds.includes(id));
            });
        } else {
            newSubjects.push(sub.id);
            sub.chapters?.forEach(c => { 
                if(!newChapters.includes(c.id)) newChapters.push(c.id); 
                c.videos?.forEach(v => { if(!newVideos.includes(v.id)) newVideos.push(v.id); });
                c.pdfs?.forEach(p => { if(!newPdfs.includes(p.id)) newPdfs.push(p.id); });
            });
            sub.exams?.forEach(e => { if(!newExams.includes(e.id)) newExams.push(e.id); });
        }
        return { subjects: newSubjects, chapters: newChapters, exams: newExams, videos: newVideos, pdfs: newPdfs };
    });
  };

  const toggleChapter = (chapterId, subjectId, videos, pdfs) => {
    setSelected(prev => {
        const isSelected = prev.chapters.includes(chapterId);
        let newChapters = isSelected ? prev.chapters.filter(id => id !== chapterId) : [...prev.chapters, chapterId];
        let newSubjects = [...prev.subjects];
        let newVideos = [...prev.videos];
        let newPdfs = [...prev.pdfs];
        
        if (isSelected) {
            const vIds = videos?.map(v => v.id) || [];
            const pIds = pdfs?.map(p => p.id) || [];
            newVideos = newVideos.filter(id => !vIds.includes(id));
            newPdfs = newPdfs.filter(id => !pIds.includes(id));
        } else {
            videos?.forEach(v => { if(!newVideos.includes(v.id)) newVideos.push(v.id); });
            pdfs?.forEach(p => { if(!newPdfs.includes(p.id)) newPdfs.push(p.id); });
            if (!newSubjects.includes(subjectId)) newSubjects.push(subjectId);
        }
        
        return { ...prev, chapters: newChapters, subjects: newSubjects, videos: newVideos, pdfs: newPdfs };
    });
  };

  const toggleExam = (examId, subjectId) => {
    setSelected(prev => {
        const isSelected = prev.exams.includes(examId);
        let newExams = isSelected ? prev.exams.filter(id => id !== examId) : [...prev.exams, examId];
        let newSubjects = [...prev.subjects];
        
        if (!isSelected && !newSubjects.includes(subjectId)) {
            newSubjects.push(subjectId);
        }
        return { ...prev, exams: newExams, subjects: newSubjects };
    });
  };

  const toggleVideo = (videoId) => {
    setSelected(prev => ({
        ...prev,
        videos: prev.videos.includes(videoId) ? prev.videos.filter(v => v !== videoId) : [...prev.videos, videoId]
    }));
  };

  const togglePdf = (pdfId) => {
    setSelected(prev => ({
        ...prev,
        pdfs: prev.pdfs.includes(pdfId) ? prev.pdfs.filter(p => p !== pdfId) : [...prev.pdfs, pdfId]
    }));
  };

  // --- التنفيذ للنسخ المتقدم ---
  const executeCopy = async () => {
    if (!sourceCourseId || !targetCourseId) return showToast('يرجى اختيار الكورس المصدري والهدف', 'error');
    
    const hasIndividualChaptersOrExams = selected.chapters.length > 0 || selected.exams.length > 0;
    if (hasIndividualChaptersOrExams && !targetSubjectId && selected.subjects.length === 0) {
        return showToast('يجب اختيار المادة الوجهة لنسخ الفصول والامتحانات الفردية', 'error');
    }

    // تصفية الفيديوهات لتجنب النسخ المزدوج
    let filteredVideos = [...selected.videos];
    let filteredPdfs = [...selected.pdfs];
    
    sourceTree.forEach(sub => {
        sub.chapters?.forEach(ch => {
            if (selected.chapters.includes(ch.id)) {
                filteredVideos = filteredVideos.filter(vid => !ch.videos?.some(v => v.id === vid));
                filteredPdfs = filteredPdfs.filter(pid => !ch.pdfs?.some(p => p.id === pid));
            }
        });
    });

    const finalPayload = { 
        subjects: [...selected.subjects],
        chapters: [...selected.chapters],
        exams: [...selected.exams],
        videos: filteredVideos, 
        pdfs: filteredPdfs 
    };

    if (finalPayload.subjects.length === 0 && finalPayload.chapters.length === 0 && finalPayload.exams.length === 0 && finalPayload.videos.length === 0 && finalPayload.pdfs.length === 0) {
        return showToast('يرجى تحديد عنصر واحد على الأقل للنسخ', 'error');
    }

    setCopying(true);
    try {
      const res = await fetch('/api/dashboard/teacher/advanced-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            sourceCourseId, 
            targetCourseId, 
            targetSubjectId, 
            targetChapterId, 
            selected: finalPayload,
            notifyStudents
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        showToast('تم النسخ بنجاح!', 'success');
        setSelected({ subjects: [], chapters: [], exams: [], videos: [], pdfs: [] });
      } else {
        showToast(data.error || 'حدث خطأ أثناء النسخ', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setCopying(false);
    }
  };

  return (
    <TeacherLayout title="النسخ المتقدم">
      <div className={`toast-notification ${toast.show ? 'show' : ''} ${toast.type}`}>
          <span className="toast-icon">
              {toast.type === 'success' ? Icons.check : Icons.alert}
          </span>
          <span>{toast.msg}</span>
      </div>

      <div className="page-header">
          <div className="title-area">
              <div className="title-icon">{Icons.copy}</div>
              <div>
                  <h1 className="page-title">النسخ الذكي للمحتوى</h1>
                  <p className="page-sub">يمكنك نسخ محتويات كاملة أو فردية إلى كورسات ومواد وفصول موجودة بالفعل.</p>
              </div>
          </div>
          <button className="btn-secondary" onClick={() => router.push('/admin/teacher/content')}>
              <span className="icon-wrap">{Icons.back}</span> رجوع للمحتوى
          </button>
      </div>

      {loading ? (
          <div className="loading-state">
              <div className="spinner"></div>
              <p>جاري تهيئة الأداة...</p>
          </div>
      ) : (
        <div className="main-layout">
            
            <div className="config-sidebar">
                <div className="sticky-box">
                    
                    <div className="step-box">
                        <div className="step-title">
                            <span className="step-badge">1</span>
                            <h3>تحديد المصدر</h3>
                        </div>
                        <div className="step-content">
                            <label><span className="icon-wrap mini">{Icons.course}</span> الكورس المصدري (يُنسخ منه):</label>
                            
                            {/* --- Custom Select UI --- */}
                            <div className="custom-select-container">
                                <select className="premium-select" value={sourceCourseId} onChange={e => setSourceCourseId(e.target.value)}>
                                    <option value="">-- اختر الكورس المصدري --</option>
                                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                                <span className="select-chevron">{Icons.chevronDown}</span>
                            </div>

                        </div>
                    </div>

                    <div className="down-arrow">{Icons.arrowDown}</div>

                    <div className="step-box">
                        <div className="step-title">
                            <span className="step-badge">2</span>
                            <h3>تحديد الهدف</h3>
                        </div>
                        <div className="step-content">
                            <label><span className="icon-wrap mini">{Icons.target}</span> الكورس الهدف (يُنسخ إليه):</label>
                            
                            <div className="custom-select-container target-select">
                                <select className="premium-select" value={targetCourseId} onChange={e => { setTargetCourseId(e.target.value); setTargetSubjectId(''); setTargetChapterId(''); }}>
                                    <option value="">-- اختر الكورس الهدف --</option>
                                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                                <span className="select-chevron">{Icons.chevronDown}</span>
                            </div>

                            {targetCourseId && (
                                <>
                                    <label className="mt-3"><span className="icon-wrap mini">{Icons.subject}</span> المادة الوجهة (اختياري - للنسخ بداخلها):</label>
                                    <div className="custom-select-container target-select">
                                        <select className="premium-select" value={targetSubjectId} onChange={e => { setTargetSubjectId(e.target.value); setTargetChapterId(''); }}>
                                            <option value="">-- إنشاء مواد جديدة --</option>
                                            {targetTree.map(sub => <option key={sub.id} value={sub.id}>{sub.title}</option>)}
                                        </select>
                                        <span className="select-chevron">{Icons.chevronDown}</span>
                                    </div>
                                </>
                            )}

                            {targetSubjectId && (
                                <>
                                    <label className="mt-3"><span className="icon-wrap mini">{Icons.folder}</span> الفصل الوجهة (اختياري - لنقل الفيديوهات والملفات):</label>
                                    <div className="custom-select-container target-select">
                                        <select className="premium-select" value={targetChapterId} onChange={e => setTargetChapterId(e.target.value)}>
                                            <option value="">-- إنشاء فصول جديدة --</option>
                                            {targetTree.find(s => String(s.id) === String(targetSubjectId))?.chapters?.map(ch => (
                                                <option key={ch.id} value={ch.id}>{ch.title}</option>
                                            ))}
                                        </select>
                                        <span className="select-chevron">{Icons.chevronDown}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="step-box execute-box">
                        <div className="step-title">
                            <span className="step-badge gold">3</span>
                            <h3>التنفيذ والملخص</h3>
                        </div>
                        <div className="step-content">
                            <div className="summary-tags">
                                <div className="tag"><span><span className="icon-wrap mini">{Icons.subject}</span> مواد</span><strong>{selected.subjects.length}</strong></div>
                                <div className="tag"><span><span className="icon-wrap mini">{Icons.folder}</span> فصول</span><strong>{selected.chapters.length}</strong></div>
                                <div className="tag"><span><span className="icon-wrap mini">{Icons.exam}</span> امتحانات</span><strong>{selected.exams.length}</strong></div>
                                <div className="tag"><span><span className="icon-wrap mini">{Icons.video}</span> محتوى فردي</span><strong>{selected.videos.length + selected.pdfs.length}</strong></div>
                            </div>

                            <label className="notify-toggle-row" onClick={() => setNotifyStudents(v => !v)}>
                                <div className={`notify-toggle-track ${notifyStudents ? 'on' : ''}`}>
                                    <div className="notify-toggle-thumb" />
                                </div>
                                <div className="notify-toggle-text">
                                    <span className="notify-toggle-label">إشعار الطلاب بالفيديوهات المنسوخة</span>
                                    <span className="notify-toggle-hint">
                                        {notifyStudents
                                            ? 'سيصل إشعار للطلاب عند جاهزية كل فيديو منسوخ'
                                            : 'لن يُرسل أي إشعار للطلاب (افتراضي)'}
                                    </span>
                                </div>
                            </label>

                            <button className="btn-primary full-width execute-btn" onClick={executeCopy} disabled={copying || !sourceCourseId || !targetCourseId}>
                                {copying ? (
                                    <><div className="spinner button-spinner"></div> جاري النسخ...</>
                                ) : (
                                    <><span className="icon-wrap">{Icons.copy}</span> تأكيد وبدء النسخ</>
                                )}
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <div className="tree-main-panel">
                <div className="panel-header">
                    <h2>هيكل الكورس والمحتوى</h2>
                    <span className="info-badge">حدد ما تريد نسخه بدقة</span>
                </div>
                
                <div className="panel-body custom-scrollbar">
                    {treeLoading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>جاري تحليل وبناء هيكل الكورس...</p>
                        </div>
                    ) : sourceTree.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">{Icons.course}</div>
                            <p>يرجى اختيار الكورس المصدري من القائمة الجانبية لعرض محتوياته هنا.</p>
                        </div>
                    ) : (
                        <div className="tree-structure">
                            {sourceTree.map(sub => (
                                <div key={sub.id} className="subject-block">
                                    
                                    {/* مستوى المادة */}
                                    <div className={`subject-item ${selected.subjects.includes(sub.id) ? 'selected' : ''}`}>
                                        <label className="custom-checkbox">
                                            <input type="checkbox" checked={selected.subjects.includes(sub.id)} onChange={() => toggleSubject(sub)} />
                                            <span className="checkmark main">{selected.subjects.includes(sub.id) && Icons.check}</span>
                                            <div className="item-text">
                                                <span className="icon">{Icons.subject}</span>
                                                <h4>{sub.title}</h4>
                                            </div>
                                        </label>
                                    </div>

                                    {/* مستوى الفصول والامتحانات */}
                                    <div className="subject-children">
                                        
                                        {/* الفصول */}
                                        {sub.chapters?.map(ch => (
                                            <div key={ch.id} className={`chapter-block ${selected.chapters.includes(ch.id) ? 'selected' : ''}`}>
                                                <div className="chapter-item">
                                                    <label className="custom-checkbox">
                                                        <input type="checkbox" checked={selected.chapters.includes(ch.id)} onChange={() => toggleChapter(ch.id, sub.id, ch.videos, ch.pdfs)} />
                                                        <span className="checkmark sub">{selected.chapters.includes(ch.id) && Icons.check}</span>
                                                        <div className="item-text">
                                                            <span className="icon" style={{color: 'var(--text-secondary)'}}>{Icons.folder}</span>
                                                            <h5>{ch.title}</h5>
                                                        </div>
                                                    </label>
                                                </div>
                                                
                                                {/* المرفقات */}
                                                <div className="attachments-area">
                                                    {(ch.videos?.length > 0 || ch.pdfs?.length > 0) ? (
                                                        <div className="attachments-flex">
                                                            {ch.videos?.map(v => (
                                                                <div 
                                                                    key={`v-${v.id}`} 
                                                                    className={`attach-pill video ${selected.videos.includes(v.id) ? 'selected-pill' : ''}`}
                                                                    onClick={() => toggleVideo(v.id)}
                                                                >
                                                                    <span className="icon-wrap">{Icons.video}</span> <span className="trunc">{v.title}</span>
                                                                </div>
                                                            ))}
                                                            {ch.pdfs?.map(p => (
                                                                <div 
                                                                    key={`p-${p.id}`} 
                                                                    className={`attach-pill pdf ${selected.pdfs.includes(p.id) ? 'selected-pill' : ''}`}
                                                                    onClick={() => togglePdf(p.id)}
                                                                >
                                                                    <span className="icon-wrap">{Icons.pdf}</span> <span className="trunc">{p.title}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="no-attachments">لا توجد مرفقات داخل هذا الفصل</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* الامتحانات */}
                                        {sub.exams?.map(ex => (
                                            <div key={ex.id} className={`exam-item ${selected.exams.includes(ex.id) ? 'selected' : ''}`}>
                                                <label className="custom-checkbox">
                                                    <input type="checkbox" checked={selected.exams.includes(ex.id)} onChange={() => toggleExam(ex.id, sub.id)} />
                                                    <span className="checkmark exam">{selected.exams.includes(ex.id) && Icons.check}</span>
                                                    <div className="item-text">
                                                        <span className="icon" style={{color: 'var(--gold)'}}>{Icons.exam}</span>
                                                        <h5>امتحان: {ex.title}</h5>
                                                    </div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
      )}

      <style jsx>{`
        /* ── THEME VARS ── */
        .toast-notification { position: fixed; top: 24px; left: 50%; transform: translate(-50%, -150%); padding: 14px 28px; border-radius: 12px; font-weight: bold; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); z-index: 99999; box-shadow: 0 10px 30px rgba(0,0,0,0.5); font-size: 0.95rem; border: 1px solid rgba(255,255,255,0.1); background: var(--bg-surface); color: var(--text-primary); display: flex; align-items: center; gap: 10px; }
        .toast-notification.show { transform: translate(-50%, 0); } 
        .toast-notification.success { border-bottom: 3px solid #22c55e; } 
        .toast-notification.success .toast-icon { color: #22c55e; }
        .toast-notification.error { border-bottom: 3px solid #ef4444; }
        .toast-notification.error .toast-icon { color: #ef4444; }

        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; gap: 20px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .title-area { display: flex; align-items: center; gap: 16px; }
        .title-icon { width: 50px; height: 50px; background: var(--gold-dim); color: var(--gold); border-radius: 14px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-accent); }
        .page-title { margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.6rem; font-weight: 800; }
        .page-sub { margin: 0; color: var(--text-secondary); font-size: 0.95rem; }

        .btn-secondary { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 10px 20px; border-radius: 10px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; transition: 0.2s; }
        .btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        
        .btn-primary { background: var(--gold); color: #111009; border: none; padding: 14px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 1.05rem; transition: 0.2s; box-shadow: 0 4px 12px var(--gold-dimmer); }
        .btn-primary.full-width { width: 100%; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px var(--gold-dim); background: var(--gold-light); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; transform: none; }

        .mt-3 { margin-top: 18px; display: flex; align-items: center; gap: 6px; }
        .icon-wrap { display: flex; align-items: center; justify-content: center; }
        .icon-wrap.mini { opacity: 0.7; }

        /* ================= Custom Select (Dropdowns) ================= */
        .custom-select-container {
            position: relative;
            width: 100%;
        }
        .premium-select {
            width: 100%;
            padding: 14px 16px 14px 45px; /* مسافة من اليسار للسهم */
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: 12px;
            color: var(--text-primary);
            font-size: 0.95rem;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            transition: all 0.2s ease;
            appearance: none; /* إخفاء سهم المتصفح الافتراضي */
            -webkit-appearance: none;
            -moz-appearance: none;
        }
        .premium-select:hover {
            border-color: var(--border-accent);
        }
        .premium-select:focus {
            border-color: var(--gold);
            box-shadow: 0 0 0 3px var(--gold-dim);
            background: var(--bg-surface);
        }
        .custom-select-container.target-select .premium-select:focus {
            border-color: #22c55e;
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
        }
        
        .select-chevron {
            position: absolute;
            left: 16px; /* محاذاة لليسار لأن الموقع بالعربية RTL */
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            color: var(--text-muted);
            display: flex;
            transition: 0.2s;
        }
        .premium-select:focus + .select-chevron {
            color: var(--gold);
            transform: translateY(-50%) rotate(180deg);
        }
        .custom-select-container.target-select .premium-select:focus + .select-chevron {
            color: #22c55e;
        }

        /* تنسيق الخيارات داخل الـ Select (تعمل في بعض المتصفحات فقط) */
        .premium-select option {
            background-color: var(--bg-surface);
            color: var(--text-primary);
            padding: 10px;
        }

        /* ================= Layout ================= */
        .main-layout { display: grid; grid-template-columns: 360px 1fr; gap: 30px; align-items: start; padding-bottom: 40px; }
        @media(max-width: 900px) { .main-layout { grid-template-columns: 1fr; } }

        /* ================= Sidebar Config ================= */
        .config-sidebar { position: relative; }
        .sticky-box { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 16px; }
        
        .step-box { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); }
        .execute-box { border-color: var(--border-accent); }
        
        .step-title { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--bg-elevated); border-bottom: 1px solid var(--border); }
        .step-badge { width: 28px; height: 28px; background: var(--border); color: var(--text-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; }
        .step-badge.gold { background: var(--gold); color: #111009; }
        .step-title h3 { margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: bold; }

        .step-content { padding: 20px; }
        .step-content label { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); margin-bottom: 10px; font-weight: bold; font-size: 0.9rem; }
        
        .down-arrow { text-align: center; color: var(--text-muted); margin: -5px 0; opacity: 0.5; display: flex; justify-content: center; }

        .summary-tags { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .tag { background: var(--bg-base); border: 1px solid var(--border); padding: 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; transition: 0.2s; }
        .tag:hover { border-color: var(--border-accent); background: var(--bg-hover); }
        .tag span { color: var(--text-secondary); font-size: 0.9rem; font-weight: bold; display: flex; align-items: center; gap: 6px; }
        .tag strong { color: var(--gold); font-size: 1.2rem; }

        /* ================= Notify Toggle ================= */
        .notify-toggle-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-base); cursor: pointer; margin-bottom: 14px; transition: 0.2s; user-select: none; }
        .notify-toggle-row:hover { border-color: var(--border-accent); background: var(--bg-hover); }

        .notify-toggle-track { width: 44px; min-width: 44px; height: 24px; border-radius: 12px; background: var(--border); position: relative; transition: background 0.25s; }
        .notify-toggle-track.on { background: var(--gold); }
        .notify-toggle-thumb { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); transition: transform 0.25s; }
        .notify-toggle-track.on .notify-toggle-thumb { transform: translateX(-20px); }

        .notify-toggle-text { display: flex; flex-direction: column; gap: 3px; }
        .notify-toggle-label { color: var(--text-primary); font-weight: bold; font-size: 0.9rem; }
        .notify-toggle-hint { color: var(--text-muted); font-size: 0.8rem; }

        .execute-btn { margin-top: 10px; }
        .button-spinner { width: 20px; height: 20px; border-width: 2px; border-top-color: #111009; border-left-color: rgba(17, 16, 9, 0.2); border-bottom-color: rgba(17, 16, 9, 0.2); border-right-color: rgba(17, 16, 9, 0.2); }

        /* ================= Tree Panel ================= */
        .tree-main-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; height: calc(100vh - 120px); min-height: 600px; box-shadow: var(--shadow); }
        .panel-header { padding: 20px 24px; background: var(--bg-elevated); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .panel-header h2 { margin: 0; color: var(--text-primary); font-size: 1.15rem; font-weight: bold; }
        .info-badge { background: var(--gold-dim); color: var(--gold); padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid var(--border-accent); }

        .panel-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-base); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-accent); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--gold); }

        .tree-structure { display: flex; flex-direction: column; gap: 24px; }

        /* --- Subject Level --- */
        .subject-block { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .subject-item { background: var(--bg-elevated); padding: 16px 20px; border-bottom: 1px solid var(--border); transition: 0.2s; }
        .subject-item.selected { background: var(--gold-dimmer); border-bottom-color: var(--border-accent); }
        
        .subject-children { padding: 20px 20px 20px 45px; position: relative; display: flex; flex-direction: column; gap: 16px; }
        .subject-children::before { content: ''; position: absolute; top: 0; bottom: 20px; right: 28px; width: 2px; background: var(--border); z-index: 1; }

        /* --- Chapter Level --- */
        .chapter-block { background: var(--bg-base); border: 1px dashed var(--border); border-radius: 10px; position: relative; z-index: 2; transition: 0.2s; overflow: hidden; }
        .chapter-block.selected { border-style: solid; border-color: var(--gold); box-shadow: 0 4px 15px var(--gold-dim); }
        .chapter-block::before { content: ''; position: absolute; top: 25px; right: -17px; width: 17px; height: 2px; background: var(--border); z-index: -1; }

        .chapter-item { padding: 14px 16px; background: transparent; border-bottom: 1px dashed var(--border); }
        .chapter-block.selected .chapter-item { background: var(--gold-dimmer); border-bottom: 1px solid var(--border-accent); }

        /* --- Attachments (Videos/PDFs) --- */
        .attachments-area { padding: 16px; }
        .attachments-flex { display: flex; flex-wrap: wrap; gap: 10px; }
        .attach-pill { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-secondary); user-select: none; transition: 0.2s; cursor: pointer; }
        .attach-pill:hover { border-color: var(--text-muted); color: var(--text-primary); }
        .chapter-block.selected .attach-pill.video.selected-pill { border-color: var(--gold); color: #111009; background: var(--gold); }
        .chapter-block.selected .attach-pill.pdf.selected-pill { border-color: #38bdf8; color: #0f172a; background: #38bdf8; }
        .trunc { max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .no-attachments { color: var(--text-muted); font-size: 0.85rem; font-style: italic; display: flex; justify-content: center; padding: 10px; opacity: 0.7; }

        /* --- Exam Level --- */
        .exam-item { background: var(--bg-base); border: 1px dashed var(--border); border-radius: 10px; padding: 14px 16px; position: relative; z-index: 2; transition: 0.2s; }
        .exam-item::before { content: ''; position: absolute; top: 20px; right: -17px; width: 17px; height: 2px; background: var(--border); z-index: -1; }
        .exam-item.selected { border-style: solid; border-color: #facc15; background: rgba(250, 204, 21, 0.08); }

        /* ================= Custom Checkboxes ================= */
        .custom-checkbox { display: flex; align-items: center; cursor: pointer; position: relative; user-select: none; width: 100%; }
        .custom-checkbox input { position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }
        
        .checkmark { position: relative; background-color: var(--bg-elevated); border: 2px solid var(--text-muted); border-radius: 6px; transition: 0.2s; flex-shrink: 0; margin-left: 15px; display: flex; align-items: center; justify-content: center; color: transparent; }
        .checkmark.main { height: 26px; width: 26px; border-radius: 8px; }
        .checkmark.sub { height: 22px; width: 22px; }
        .checkmark.exam { height: 22px; width: 22px; }

        .custom-checkbox:hover input ~ .checkmark { border-color: var(--text-primary); }
        
        .custom-checkbox input:checked ~ .checkmark.main { background-color: var(--gold); border-color: var(--gold); color: #111009; }
        .custom-checkbox input:checked ~ .checkmark.sub { background-color: var(--gold); border-color: var(--gold); color: #111009; }
        .custom-checkbox input:checked ~ .checkmark.exam { background-color: #facc15; border-color: #facc15; color: #111009; }

        .item-text { display: flex; align-items: center; gap: 10px; }
        .item-text h4 { margin: 0; font-size: 1.15rem; color: var(--text-primary); font-weight: bold; }
        .item-text h5 { margin: 0; font-size: 1.05rem; color: var(--text-primary); font-weight: bold; }
        .item-text .icon { display: flex; align-items: center; color: var(--gold); opacity: 0.9; }

        /* ================= States & UI ================= */
        .loading-state { text-align: center; color: var(--gold); padding: 80px 20px; display: flex; flex-direction: column; align-items: center; gap: 15px; font-weight: bold; height: 100%; justify-content: center; }
        .spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: var(--text-muted); height: 100%; text-align: center; font-size: 1.05rem; }
        .empty-icon { font-size: 3.5rem; color: var(--border); margin-bottom: 15px; display: flex; }
      `}</style>
    </TeacherLayout>
  );
}
