import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useBunnyUploadQueue } from '../../../hooks/useBunnyUploadQueue';
import UploadQueueWidget from '../../../components/UploadQueueWidget';

// --- أيقونات SVG (محدثة لتتوافق مع الألوان الديناميكية) ---
const Icons = {
    back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
    add: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
    trash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
    edit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
    video: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>,
    pdf: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
    exam: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path></svg>,
    folder: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
    image: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    menu: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>,
    eye: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,    
    drag: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>,
    refresh: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
};

const formatDateForInput = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 16);
};

export default function ContentManager() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Navigation
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);

  // Modals & UI
  const [modalType, setModalType] = useState(null); 
  const [formData, setFormData] = useState({ 
    title: '', 
    url: '', 
    price: 0, 
    description: '', 
    notifyStudents: false,
    durHours: '',     
    durMinutes: '',   
    durSeconds: ''    
  });
  // ✅ [جديد] وضع اختيار المجلد داخل نافذة إضافة/تعديل الفصل:
  // 'existing' = عرض قائمة اختيار من المجلدات الموجودة بالفعل في المادة،
  // 'new' = عرض حقل نصي لكتابة اسم مجلد جديد.
  const [folderMode, setFolderMode] = useState('existing');
  const [notifyPdf, setNotifyPdf] = useState(false); 
  const [alertData, setAlertData] = useState({ show: false, type: 'info', msg: '' });
  const [confirmData, setConfirmData] = useState({ show: false, msg: '', onConfirm: null });
  
  // ✅ [جديد] مجموعات الفصول القابلة للطي حسب اسم المجلد (folder_name)
  // مغلقة افتراضيًا: هنا بنتتبع أسماء المجلدات المفتوحة فقط، أي مجلد مش موجود في المجموعة يبقى مقفول.
  const [openChapterFolders, setOpenChapterFolders] = useState(() => new Set());

  // Drag & Drop State (courses / subjects / exams / videos / pdfs)
  const dragItem = useRef();
  const dragOverItem = useRef();

  // ✅ [جديد] حالة السحب والإفلات الخاصة بالفصول — بتدعم مستويين:
  // 'top'    = ترتيب على مستوى القائمة الرئيسية (فصل منفرد أو مجلد كامل ككتلة واحدة)
  // 'folder' = ترتيب داخل مجلد مفتوح معين (بين الفصول اللي جوه نفس المجلد بس)
  const chapterDragRef = useRef(null);
  const chapterDragOverRef = useRef(null);

  // Exam Editor
  const [showExamSidebar, setShowExamSidebar] = useState(false);
  const [examForm, setExamForm] = useState({ id: null, title: '', duration: 30, requiresName: true, randQ: true, randO: true, startTime: '', endTime: '', questions: [], notifyStudents: false, allowRetake: false });
  const [currentQ, setCurrentQ] = useState({ id: null, text: '', image: null, questionType: 'mcq', maxScore: 1, modelAnswer: '', options: ['', '', '', ''], correctIndex: 0 });
  const [editingQIndex, setEditingQIndex] = useState(-1);
  const [deletedQIds, setDeletedQIds] = useState([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [examStats, setExamStats] = useState(null);

  // حالات إحصائيات المشاهدة
  const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
  const [mediaViews, setMediaViews] = useState([]);
  const [loadingViews, setLoadingViews] = useState(false);
  const [selectedMediaName, setSelectedMediaName] = useState("");
  const [currentMediaId, setCurrentMediaId] = useState(null); 
  const [viewsPage, setViewsPage] = useState(1); 
  const [totalViewsCount, setTotalViewsCount] = useState(0);

  // ✅ حالات رفع الفيديو إلى Bunny Stream — قائمة انتظار تدعم عدة رفعات متزامنة
  // يستطيع المعلم إغلاق نافذة "إضافة فيديو" أثناء الرفع وفتح نافذة أخرى
  // لفصل/مادة/كورس مختلف والرفع يستمر في الخلفية عبر الودجت العائم أسفل الشاشة.
  const [videoFile, setVideoFile] = useState(null);
  const {
    uploads: bunnyUploads,
    activeCount: activeUploadsCount,
    startUpload: startBunnyUpload,
    cancelUpload: cancelBunnyUpload,
    resumeUpload: resumeBunnyUpload,
    dismissUpload: dismissBunnyUpload,
  } = useBunnyUploadQueue();

  // حالة المعالجة لكل فيديو — تُملأ تلقائياً من Bunny عند تحميل الصفحة
  // الشكل: { [videoId]: { loading: bool, status: 'waiting'|'processing'|'ready'|'failed', label: string } }
  // حالة التشفير تُقرأ مباشرة من encoding_status في DB (يُحدَّث بواسطة Bunny Webhook)
  // المعلم يضغط refresh → refreshView() → Supabase يُعيد القيمة المحدّثة
  const [refreshingVideoId, setRefreshingVideoId] = useState(null);

  const refreshView = async () => {
      try {
          const res = await fetch('/api/dashboard/teacher/content');
          const data = await res.json();
          let newCourses = data.courses || [];

          if (selectedSubject) {
              const subRes = await fetch(`/api/dashboard/teacher/content?mode=subject_details&id=${selectedSubject.id}`);
              const subData = await subRes.json();
              
              if (subData.success) {
                  newCourses = newCourses.map(c => {
                      if (c.id === selectedCourse?.id) {
                          return {
                              ...c,
                              subjects: c.subjects.map(s => s.id === selectedSubject.id ? subData.subject : s)
                          };
                      }
                      return c;
                  });
                  setSelectedSubject(subData.subject);
                  if (selectedChapter) {
                      const updatedCh = subData.subject.chapters?.find(ch => ch.id === selectedChapter.id);
                      setSelectedChapter(updatedCh || null);
                  }
              }
          }
          if (selectedCourse) {
              const updatedC = newCourses.find(c => c.id === selectedCourse.id);
              setSelectedCourse(updatedC || null);
          }
          setCourses(newCourses);
      } catch (err) {
          console.error("Refresh Error:", err);
      }
  };

  useEffect(() => { 
      window.scrollTo(0, 0);
      refreshView(); 
  }, []);



  // --- Helpers ---
  const showAlert = (type, msg) => {
      setAlertData({ show: true, type, msg });
      setTimeout(() => setAlertData({ ...alertData, show: false }), 3000);
  };

  const showConfirm = (msg, action) => {
      setConfirmData({ show: true, msg, onConfirm: action });
  };

  const closeConfirm = () => {
      setConfirmData({ show: false, msg: '', onConfirm: null });
  };

  const handleBack = () => {
      if (selectedChapter) setSelectedChapter(null);
      else if (selectedSubject) setSelectedSubject(null);
      else if (selectedCourse) setSelectedCourse(null);
  };

  const handleSubjectClick = async (subject) => {
      if (subject.chapters && subject.exams) {
          setSelectedSubject(subject);
          return;
      }

      setLoading(true);
      try {
          const res = await fetch(`/api/dashboard/teacher/content?mode=subject_details&id=${subject.id}`);
          const data = await res.json();
          
          if (data.success) {
              const updatedCourses = courses.map(c => {
                  if (c.id === selectedCourse.id) {
                      return {
                          ...c,
                          subjects: c.subjects.map(s => s.id === subject.id ? data.subject : s)
                      };
                  }
                  return c;
              });
              setCourses(updatedCourses);
              setSelectedSubject(data.subject);
          } else {
              showAlert('error', 'فشل تحميل محتوى المادة');
          }
      } catch (err) {
          showAlert('error', 'حدث خطأ أثناء تحميل المادة');
      }
      setLoading(false);
  };

  // ✅ [جديد] تجميع الفصول حسب اسم المجلد (folder_name) مع الحفاظ على ترتيب الظهور.
  // أي فصل بدون folder_name يظهر منفرد كما هو. أي فصول لها نفس اسم المجلد
  // (حتى لو مش متتالية في الترتيب) بتتجمع تحت نفس عنوان المجلد القابل للطي.
  const getChapterEntries = () => {
      const chapters = selectedSubject?.chapters || [];
      const entries = [];
      const folderPosition = {};

      chapters.forEach((ch, index) => {
          const name = (ch.folder_name || '').trim();
          if (!name) {
              entries.push({ isFolder: false, chapter: ch, index });
              return;
          }
          if (folderPosition[name] === undefined) {
              folderPosition[name] = entries.length;
              entries.push({ isFolder: true, folderName: name, items: [{ chapter: ch, index }] });
          } else {
              entries[folderPosition[name]].items.push({ chapter: ch, index });
          }
      });

      return entries;
  };

  const toggleChapterFolder = (folderName) => {
      setOpenChapterFolders(prev => {
          const next = new Set(prev);
          if (next.has(folderName)) next.delete(folderName);
          else next.add(folderName);
          return next;
      });
  };

  // ✅ [جديد] عنصر الفصل (card) بستايلات inline صريحة بجانب الكلاسات —
  // بالشكل ده الكارت بيظهر وبيشتغل صح حتى لو حصل أي تعارض/مشكلة في الـ CSS
  // classes (زي اللي كان بيحصل جوه مجموعات المجلدات القابلة للطي).
  // dragHandlers: { onDragStart, onDragEnter, onDragOver, onDragEnd } مربوطة مسبقًا
  // حسب سياق العنصر (مستوى رئيسي أو داخل مجلد) من مكان الاستدعاء.
  const renderChapterItem = (ch, dragHandlers, compact = false) => (
      <div
        key={ch.id}
        className={`list-item clickable draggable-item${compact ? ' chapter-item-compact' : ''}`}
        onClick={() => setSelectedChapter(ch)}
        draggable
        onDragStart={dragHandlers.onDragStart}
        onDragEnter={dragHandlers.onDragEnter}
        onDragOver={dragHandlers.onDragOver}
        onDragEnd={dragHandlers.onDragEnd}
        style={{
            background: 'var(--bg-base)',
            padding: compact ? '10px 12px' : '15px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between',
            position: 'relative',
            cursor: 'pointer'
        }}
      >
          <div className="drag-handle" onClick={e => e.stopPropagation()} style={{flexShrink: 0, cursor: 'grab', color: 'var(--text-muted)'}}>{Icons.drag}</div>
          <div className="info" style={{minWidth: 0, overflow: 'hidden', flex: 1}}>
              <div style={{
                  fontWeight: 'bold',
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
              }}>
                  {ch.title}
              </div>

              <div className="chapter-counts" style={{color: 'var(--text-muted)', fontSize: '0.85em'}}>
                  {ch.videos?.length || 0} فيديو • {ch.pdfs?.length || 0} ملف
              </div>
          </div>
          <button
            className="btn-icon danger"
            onClick={(e) => {e.stopPropagation(); handleDelete('chapters', ch.id)}}
            style={{
                flexShrink: 0,
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid transparent',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
            }}
          >{Icons.trash}</button>
      </div>
  );

  // --- Drag & Drop (courses / subjects / exams / videos / pdfs) ---
  // ملحوظة: onDragStart لازم يعمل e.dataTransfer.setData + effectAllowed —
  // من غيرهم بعض المتصفحات (فايرفوكس تحديدًا) بترفض تبدأ عملية السحب أصلاً
  // أو بتوقفها في نص الطريق، وده كان سبب "مش قادر أسحب" اللي بيحصل.
  // وonDragOver لازم يعمل preventDefault على كل عنصر عشان يفضل يتحسب "drop target"
  // صالح باستمرار أثناء تحريك الماوس فوقه.
  const onDragStart = (e, index) => {
      dragItem.current = index;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
      e.currentTarget.classList.add('dragging');
  };

  const onDragEnter = (e, index) => {
      e.preventDefault();
      dragOverItem.current = index;
  };

  const onDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnd = async (e, listType) => {
      e.currentTarget.classList.remove('dragging');

      const from = dragItem.current;
      const to = dragOverItem.current;
      dragItem.current = null;
      dragOverItem.current = null;

      if (from === undefined || to === undefined || from === to) return;

      let list = [];
      if (listType === 'courses') list = [...courses];
      else if (listType === 'subjects') list = [...selectedCourse.subjects];
      else if (listType === 'exams') list = [...selectedSubject.exams];
      else if (listType === 'videos') list = [...selectedChapter.videos];
      else if (listType === 'pdfs') list = [...selectedChapter.pdfs];

      if (!list.length) return;

      const draggedItemContent = list[from];
      list.splice(from, 1);
      list.splice(to, 0, draggedItemContent);

      if (listType === 'courses') setCourses(list);
      else if (listType === 'subjects') setSelectedCourse({ ...selectedCourse, subjects: list });
      else if (listType === 'exams') setSelectedSubject({ ...selectedSubject, exams: list });
      else if (listType === 'videos') setSelectedChapter({ ...selectedChapter, videos: list });
      else if (listType === 'pdfs') setSelectedChapter({ ...selectedChapter, pdfs: list });

      const updatedItems = list.map((item, index) => ({ id: item.id, sort_order: index }));

      try {
          await fetch('/api/dashboard/teacher/reorder', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ type: listType, items: updatedItems })
          });
      } catch (err) {
          showAlert('error', 'فشل حفظ الترتيب');
          refreshView();
      }
  };

  // --- Drag & Drop (الفصول — مع دعم المجلدات) ---
  // فكرة التنفيذ: بنشتغل على "الوحدات" الظاهرة على الشاشة (entries) اللي بيرجعها
  // getChapterEntries()، مش على الـ index الخام جوه selectedSubject.chapters مباشرة،
  // عشان السحب يبقى متوافق تمامًا مع الترتيب اللي الأستاذ شايفه فعليًا:
  //   scope 'top'    → فصل منفرد أو مجلد كامل (بكل الفصول اللي جواه كوحدة واحدة)
  //   scope 'folder' → فصل داخل مجلد مفتوح، بيتحرك بين فصول نفس المجلد بس
  const onChapterDragStart = (e, scope, folderName, index) => {
      chapterDragRef.current = { scope, folderName, index };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
      e.stopPropagation();
      e.currentTarget.classList.add('dragging');
  };

  const onChapterDragEnter = (e, scope, folderName, index) => {
      e.preventDefault();
      e.stopPropagation();
      chapterDragOverRef.current = { scope, folderName, index };
  };

  const onChapterDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
  };

  // بيحول قائمة الوحدات (entries) بعد إعادة الترتيب إلى مصفوفة فصول مسطّحة
  // ويحفظها في selectedSubject.chapters، وبعدين يبعت sort_order الجديد للسيرفر.
  const commitChapterReorder = async (entries) => {
      const flatChapters = [];
      entries.forEach(en => {
          if (en.isFolder) en.items.forEach(it => flatChapters.push(it.chapter));
          else flatChapters.push(en.chapter);
      });

      setSelectedSubject(prev => ({ ...prev, chapters: flatChapters }));

      const updatedItems = flatChapters.map((ch, index) => ({ id: ch.id, sort_order: index }));

      try {
          await fetch('/api/dashboard/teacher/reorder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'chapters', items: updatedItems })
          });
      } catch (err) {
          showAlert('error', 'فشل حفظ الترتيب');
          refreshView();
      }
  };

  const onChapterDragEnd = (e) => {
      e.currentTarget.classList.remove('dragging');

      const from = chapterDragRef.current;
      const to = chapterDragOverRef.current;
      chapterDragRef.current = null;
      chapterDragOverRef.current = null;

      if (!from || !to) return;
      if (from.scope !== to.scope) return; // مش بنسمح نسحب بين مستوى رئيسي ومجلد مباشرة
      if (from.scope === 'folder' && from.folderName !== to.folderName) return; // بس داخل نفس المجلد
      if (from.index === to.index) return;

      const entries = getChapterEntries();

      if (from.scope === 'top') {
          if (from.index < 0 || from.index >= entries.length || to.index < 0 || to.index >= entries.length) return;
          const moved = entries[from.index];
          entries.splice(from.index, 1);
          entries.splice(to.index, 0, moved);
          commitChapterReorder(entries);
      } else {
          const folderEntry = entries.find(en => en.isFolder && en.folderName === from.folderName);
          if (!folderEntry) return;
          const items = [...folderEntry.items];
          if (from.index < 0 || from.index >= items.length || to.index < 0 || to.index >= items.length) return;
          const movedItem = items[from.index];
          items.splice(from.index, 1);
          items.splice(to.index, 0, movedItem);
          folderEntry.items = items;
          commitChapterReorder(entries);
      }
  };

  // --- API Actions ---
  const apiCall = async (action, type, dataPayload) => {
      setLoading(true);
      try {
          const res = await fetch('/api/dashboard/teacher/content', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ action, type, data: dataPayload })
          });
          const data = await res.json();
          if (res.ok) { 
              showAlert('success', 'تمت العملية بنجاح'); 
              setModalType(null); 
              await refreshView(); 
          }
          else { showAlert('error', data.error || 'حدث خطأ'); }
      } catch (e) { showAlert('error', 'خطأ في الاتصال'); }
      setLoading(false);
  };

  // ✅ حفظ/استكمال فيديو جديد عبر TUS Direct Upload إلى Bunny Stream
  // ─ إذا اختار المعلم ملفاً: يُضاف الرفع إلى قائمة الانتظار في الخلفية،
  //   وتُغلق النافذة فوراً حتى يستطيع المعلم فتح نافذة أخرى لفصل/مادة/كورس
  //   مختلف وبدء رفع جديد بينما الرفع الأول ما زال جارياً.
  // ─ إذا أدخل رابط يوتيوب فقط: يُرسل إلى content API مع مدة مطلوبة.
  const handleSaveVideo = async () => {
      if (!videoFile && !formData.url) {
          return showAlert('error', '⚠️ يجب رفع ملف فيديو أو إدخال رابط يوتيوب على الأقل.');
      }

      // ── مسار Bunny TUS: رفع مباشر في الخلفية عبر قائمة الانتظار ─────
      if (videoFile) {
          startBunnyUpload({
              file: videoFile,
              chapterId: selectedChapter.id,
              chapterTitle: selectedChapter.title,
              subjectTitle: selectedSubject?.title,
              courseTitle: selectedCourse?.title,
              title: formData.title || videoFile.name,
              notifyStudents: formData.notifyStudents,
              onComplete: async () => {
                  showAlert('success', '✅ تم رفع الفيديو بنجاح وسيكون متاحاً بعد اكتمال المعالجة.');
                  await refreshView();
              },
              onError: (err) => {
                  // الخطأ يُعرض داخل الودجت العائم نفسه، والمعلم يمكنه الضغط على "استكمال"
              },
          });
          // إغلاق النافذة فوراً — الرفع يستمر في الخلفية ويظهر في الودجت العائم
          setModalType(null);
          setVideoFile(null);
          showAlert('success', '📤 بدأ رفع الفيديو في الخلفية، يمكنك إضافة فيديو آخر الآن.');
          return;
      }

      // ── مسار يوتيوب: رابط فقط بدون ملف ────────────────────────────
      const hVal = parseInt(formData.durHours || 0);
      const mVal = parseInt(formData.durMinutes || 0);
      const sVal = parseInt(formData.durSeconds || 0);

      if (hVal === 0 && mVal === 0 && sVal === 0) {
          return showAlert('error', '⚠️ يرجى إدخال مدة الفيديو عند استخدام رابط يوتيوب.');
      }
      if (mVal > 59 || sVal > 59) {
          return showAlert('error', '⚠️ الدقائق والثواني يجب ألا تتجاوز 59.');
      }

      const h = String(hVal).padStart(2, '0');
      const m = String(mVal).padStart(2, '0');
      const s = String(sVal).padStart(2, '0');
      const finalDuration = h === '00' ? `${m}:${s}` : `${h}:${m}:${s}`;

      await apiCall('create', 'videos', {
          chapter_id: selectedChapter.id,
          title: formData.title,
          url: formData.url,
          duration: finalDuration,
          notifyStudents: formData.notifyStudents,
      });
  };

const fetchMediaViews = async (mediaId, mediaTitle, pageNum = 1) => {
      if (pageNum === 1) setIsViewsModalOpen(true);
      
      setLoadingViews(true);
      setSelectedMediaName(mediaTitle);
      setCurrentMediaId(mediaId);
      setViewsPage(pageNum);
      
      if (pageNum === 1) setMediaViews([]); 
      
      try {
          const response = await fetch(`/api/dashboard/teacher/get-video-views?videoId=${mediaId}&page=${pageNum}&limit=100`);
          const data = await response.json();

          if (data.success) {
              setMediaViews(data.views);
              setTotalViewsCount(data.total || 0);
          } else {
              showAlert('error', data.message || 'فشل جلب البيانات');
          }
      } catch (error) {
          showAlert('error', 'خطأ في الاتصال بالسيرفر');
      } finally {
          setLoadingViews(false);
      }
  };

  // ✅ التحقق من حالة معالجة فيديو واحد فقط (وليس كل الفيديوهات) عند الضغط على الزر
  // زر التحديث اليدوي — يُعيد جلب البيانات من Supabase (encoding_status محدَّث بواسطة Bunny Webhook)
  const refreshVideoStatus = async (videoId) => {
      setRefreshingVideoId(videoId);
      await refreshView();
      setRefreshingVideoId(null);
  };
    

  const handleDelete = (type, id) => showConfirm('هل أنت متأكد من الحذف النهائي؟', async () => {
      await apiCall('delete', type, { id });
      closeConfirm();
      if(type === 'courses' && selectedCourse?.id === id) setSelectedCourse(null);
      if(type === 'subjects' && selectedSubject?.id === id) setSelectedSubject(null);
  });

  // --- Modal Opening ---
  const openModal = async (type, data = {}) => {
      setFormData({ 
    title: '', url: '', price: 0, description: '', notifyStudents: false,
    durHours: '', durMinutes: '', durSeconds: '', folderName: ''
});
      setNotifyPdf(false);
      setVideoFile(null);
      // ملاحظة: لا حاجة لإعادة تعيين أي حالة رفع هنا — كل عملية رفع في قائمة
      // الانتظار (useBunnyUploadQueue) مستقلة تماماً ولا تتأثر بفتح/إغلاق النافذة.
      
      if (['edit_course', 'edit_subject', 'edit_chapter'].includes(type)) {
          setFormData({ 
              title: data.title || '', 
              url: '', 
              price: data.price || 0 ,
              description: data.description || '',
              notifyStudents: false,
              folderName: data.folder_name || ''
          });
      }

      if (['add_chapter', 'edit_chapter'].includes(type)) {
          // لو الفصل الحالي (عند التعديل) له مجلد بالفعل، أو المادة تحتوي
          // على مجلدات موجودة مسبقاً، نبدأ بوضع "اختيار من الموجود" لتسهيل
          // العملية على المدرس. لو المادة لا تحتوي على أي مجلدات، نعرض حقل
          // كتابة مباشرة.
          const existing = Array.from(new Set(
              (selectedSubject?.chapters || [])
                  .map(c => (c.folder_name || '').trim())
                  .filter(Boolean)
          ));
          setFolderMode(existing.length > 0 ? 'existing' : 'new');
      }

      if (type === 'exam_editor') {
          if (data.id && data.attempts_count > 0) {
              showAlert('error', '⛔ لا يمكن تعديل هذا الامتحان لأنه تم حله من قبل طلاب مسبقاً.');
              return; 
          }

          setShowExamSidebar(false);
          
          if (data.id) {
              setLoading(true);
              try {
                  const res = await fetch(`/api/dashboard/teacher/content?mode=exam_details&id=${data.id}`);
                  const resData = await res.json();
                  
                  if (resData.success && resData.exam) {
                      const fullExam = resData.exam;
                      setExamForm({
                          id: fullExam.id, 
                          title: fullExam.title, 
                          duration: fullExam.duration_minutes,
                          requiresName: true, 
                          randQ: fullExam.randomize_questions,
                          randO: fullExam.randomize_options,
                          allowRetake: fullExam.allow_retake || false,
                          startTime: formatDateForInput(fullExam.start_time),
                          endTime: formatDateForInput(fullExam.end_time),
                          // ✅ نحمّل القيمة الحقيقية من قاعدة البيانات بدل تصفيرها دائماً،
                          //    حتى يرى المعلم إن كان الإشعار سيُرسل عند تعديل موعد البدء
                          notifyStudents: fullExam.notify_students === true,
                          questions: fullExam.questions ? fullExam.questions.map(q => ({
                              id: q.id, text: q.question_text, image: q.image_file_id,
                              questionType: q.question_type === 'essay' ? 'essay' : 'mcq',
                              maxScore: q.max_score || 1,
                              modelAnswer: q.model_answer || '',
                              options: q.options ? q.options.map(o => o.option_text) : [],
                              correctIndex: q.options ? q.options.findIndex(o => o.is_correct) : 0
                          })) : []
                      });
                  } else {
                      showAlert('error', 'فشل جلب بيانات الامتحان');
                      setLoading(false);
                      return;
                  }
              } catch (e) {
                  showAlert('error', 'خطأ في الاتصال');
                  setLoading(false);
                  return;
              }
              setLoading(false);
          } else {
              setExamForm({ 
    id: null, title: '', duration: 30, requiresName: true, randQ: true, randO: true, 
    startTime: '', endTime: '', questions: [], notifyStudents: false,
    allowRetake: false 
});
          }
          setDeletedQIds([]); setEditingQIndex(-1); 
          setCurrentQ({ id: null, text: '', image: null, questionType: 'mcq', maxScore: 1, modelAnswer: '', options: ['', '', '', ''], correctIndex: 0 });
      }
      setModalType(type);
  };

  const getModalTitle = () => {
      if(modalType?.includes('course')) return modalType.includes('add') ? 'إضافة كورس' : 'تعديل الكورس';
      if(modalType?.includes('subject')) return modalType.includes('add') ? 'إضافة مادة' : 'تعديل المادة';
      if(modalType?.includes('chapter')) return modalType.includes('add') ? 'إضافة فصل' : 'تعديل الفصل';
      if(modalType === 'add_video') return 'إضافة فيديو';
      return '';
  };

  // --- Exam Logic ---
  const handleImageUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setUploadingImg(true);
      const fd = new FormData();
      fd.append('file', file); fd.append('type', 'exam_image');
      try {
          const res = await fetch('/api/dashboard/teacher/upload', {method:'POST', body:fd});
          const data = await res.json();
          if(res.ok) setCurrentQ({...currentQ, image: data.fileName});
      } catch(e) {}
      setUploadingImg(false);
  };
  
  const handleOptionChange = (index, value) => {
      const newOpts = [...currentQ.options];
      newOpts[index] = value;
      setCurrentQ({ ...currentQ, options: newOpts });
  };
  const addOption = () => { setCurrentQ({ ...currentQ, options: [...currentQ.options, ''] }); };
  const removeOption = (index) => {
      if (currentQ.options.length <= 2) return showAlert('error', 'يجب أن يكون هناك خياران على الأقل');
      const newOpts = currentQ.options.filter((_, i) => i !== index);
      let newCorrect = currentQ.correctIndex;
      if (index < currentQ.correctIndex) newCorrect--;
      if (index === currentQ.correctIndex) newCorrect = 0;
      setCurrentQ({ ...currentQ, options: newOpts, correctIndex: newCorrect });
  };
  const resetCurrentQuestion = () => {
      setEditingQIndex(-1);
      setCurrentQ({ id: null, text: '', image: null, questionType: 'mcq', maxScore: 1, modelAnswer: '', options: ['', '', '', ''], correctIndex: 0 });
  };
  const saveQuestion = () => {
      if (!currentQ.text || !currentQ.text.trim()) return showAlert('error', 'نص السؤال مطلوب');
      if (currentQ.questionType === 'essay') {
          if (!currentQ.maxScore || parseFloat(currentQ.maxScore) <= 0) return showAlert('error', 'يجب تحديد الدرجة العظمى للسؤال المقالي');
      } else {
          if (currentQ.options.some(opt => !opt || !opt.trim())) return showAlert('error', 'لا يمكن إضافة سؤال باختيارات فارغة.');
      }
      const newQs = [...examForm.questions];
      if (editingQIndex >= 0) newQs[editingQIndex] = currentQ;
      else newQs.push(currentQ);
      setExamForm({ ...examForm, questions: newQs });
      resetCurrentQuestion();
  };
  const editQuestion = (i) => {
      setCurrentQ(examForm.questions[i]);
      setEditingQIndex(i);
      setShowExamSidebar(false);
  };
  const deleteQuestion = (i) => {
      const q = examForm.questions[i];
      if (q.id) setDeletedQIds([...deletedQIds, q.id]);
      setExamForm({ ...examForm, questions: examForm.questions.filter((_, idx) => idx !== i) });
      if (editingQIndex === i) resetCurrentQuestion();
  };

 const submitExam = async () => {
      if(!examForm.title || !examForm.startTime || !examForm.endTime || examForm.questions.length === 0) {
          return showAlert('error', 'البيانات ناقصة: يجب تحديد العنوان، وقت البدء والانتهاء، وإضافة أسئلة.');
      }

      const start = new Date(examForm.startTime);
      const end = new Date(examForm.endTime);
      if (end <= start) {
          return showAlert('error', '⚠️ خطأ في التوقيت: وقت نهاية الامتحان يجب أن يكون بعد وقت البداية.');
      }
      
      setLoading(true); 
      try {
          const res = await fetch('/api/dashboard/teacher/exams', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  action: 'save_exam',
                  id: examForm.id, 
                  subjectId: selectedSubject.id,
                  title: examForm.title, 
                  duration: examForm.duration,
                  requiresName: true,
                  randQ: examForm.randQ, 
                  randO: examForm.randO,
                  start_time: examForm.startTime,
                  end_time: examForm.endTime,
                  questions: examForm.questions, 
                  deletedQuestionIds: deletedQIds,
                  notifyStudents: examForm.notifyStudents, 
                  allow_retake: examForm.allowRetake
              })
          });

          const data = await res.json();
          if (res.ok) { 
              showAlert('success', 'تم الحفظ بنجاح'); 
              setModalType(null); 
              await refreshView(); 
          } else { 
              const errorMsg = data.error || data.message || 'فشل الحفظ';
              showAlert('error', errorMsg); 
          }
      } catch (err) {
          showAlert('error', 'حدث خطأ في الاتصال بالسيرفر');
      }
      setLoading(false);
  };
    
  const loadStats = async (examId) => {
      setLoading(true);
      const res = await fetch(`/api/dashboard/teacher/exam-stats?examId=${examId}`);
      if(res.ok) { setExamStats(await res.json()); setModalType('stats'); }
      setLoading(false);
  };

  // --- Render ---
  return (
    <TeacherLayout title="المحتوى">
      
      <div className="header-bar">
          <div className="title-area">
              <h1 className="page-title">إدارة المحتوى</h1>
              <div className="breadcrumbs">
                  <span onClick={() => {setSelectedCourse(null); setSelectedSubject(null); setSelectedChapter(null);}}>الرئيسية</span>
                  {selectedCourse && <span> / {selectedCourse.title}</span>}
                  {selectedSubject && <span> / {selectedSubject.title}</span>}
                  {selectedChapter && <span> / {selectedChapter.title}</span>}
              </div>
          </div>
          <div className="actions-area">
              {/* Edit Buttons */}
                   <button 
        className="btn-secondary accent-btn" 
        onClick={() => router.push('/admin/teacher/advanced-copy')}
    >
        🚀 مميزات متقدمة 
    </button>
              {selectedChapter && <button className="btn-secondary edit" onClick={() => openModal('edit_chapter', selectedChapter)}>{Icons.edit} تعديل الفصل</button>}
              {selectedSubject && !selectedChapter && <button className="btn-secondary edit" onClick={() => openModal('edit_subject', selectedSubject)}>{Icons.edit} تعديل المادة</button>}
              {selectedCourse && !selectedSubject && <button className="btn-secondary edit" onClick={() => openModal('edit_course', selectedCourse)}>{Icons.edit} تعديل الكورس</button>}
              
              {/* Add/Back Buttons */}
              {!selectedCourse && <button className="btn-primary" onClick={() => openModal('add_course')}>{Icons.add} كورس جديد</button>}
              {selectedCourse && !selectedSubject && <button className="btn-primary" onClick={() => openModal('add_subject')}>{Icons.add} مادة جديدة</button>}
              {(selectedCourse || selectedSubject || selectedChapter) && <button className="btn-secondary" onClick={handleBack}>{Icons.back} رجوع</button>}
          </div>
      </div>

      {loading && <div className="loader-line"></div>}

      {/* 1. Courses List */}
      {!selectedCourse && (
          <div className="grid-cards">
              {courses.map((c, index) => (
                  <div key={c.id} className="card folder-card draggable-item" onClick={() => setSelectedCourse(c)} draggable onDragStart={(e) => onDragStart(e, index)} onDragEnter={(e) => onDragEnter(e, index)} onDragOver={onDragOver} onDragEnd={(e) => onDragEnd(e, 'courses')}>
                      <div className="card-actions-abs">
                          <button className="btn-icon danger" onClick={(e) => {e.stopPropagation(); handleDelete('courses', c.id)}}>{Icons.trash}</button>
                          <div className="drag-handle-abs" onClick={e => e.stopPropagation()}>{Icons.drag}</div>
                      </div>
                      <div className="icon accent-icon">{Icons.folder}</div>
                      <h3>{c.title}</h3>
                      <p>{c.price > 0 ? `${c.price} جنية` : 'مجاني'}</p>
                      <small className="muted-text">{c.subjects?.length || 0} مواد</small>
                  </div>
              ))}
          </div>
      )}

      {/* 2. Subjects List */}
      {selectedCourse && !selectedSubject && (
          <div className="grid-cards">
              {selectedCourse.subjects?.map((s, index) => (
                  <div 
                    key={s.id} 
                    className="card folder-card draggable-item" 
                    onClick={() => handleSubjectClick(s)} 
                    draggable 
                    onDragStart={(e) => onDragStart(e, index)} 
                    onDragEnter={(e) => onDragEnter(e, index)} 
                    onDragOver={onDragOver}
                    onDragEnd={(e) => onDragEnd(e, 'subjects')}
                  >
                      <div className="card-actions-abs">
                          <button className="btn-icon danger" onClick={(e) => {e.stopPropagation(); handleDelete('subjects', s.id)}}>{Icons.trash}</button>
                          <div className="drag-handle-abs" onClick={e => e.stopPropagation()}>{Icons.drag}</div>
                      </div>
                      <div className="icon accent-icon">{Icons.folder}</div>
                      <h3>{s.title}</h3>
                      <p>{s.price > 0 ? `${s.price} جنية` : 'مجاني'}</p>
                      <small className="muted-text">{s.chapters?.length || 0} فصول</small>
                  </div>
              ))}
          </div>
      )}

      {/* 3. Subject Details */}
      {selectedSubject && !selectedChapter && (
          <div className="content-layout">
              <div className="panel">
                  <div className="panel-head">
                      <h3>📂 الفصول الدراسية</h3>
                      <button className="btn-small" onClick={() => openModal('add_chapter')}>{Icons.add} إضافة</button>
                  </div>
                  <div className="list-group">
                      {selectedSubject.chapters?.length === 0 && <div className="empty">لا توجد فصول</div>}
                      {getChapterEntries().map((entry, entryIndex) => (
                          entry.isFolder ? (
                              <div
                                key={`folder-${entry.folderName}`}
                                className="chapter-folder-group draggable-item"
                                draggable
                                onDragStart={(e) => onChapterDragStart(e, 'top', null, entryIndex)}
                                onDragEnter={(e) => onChapterDragEnter(e, 'top', null, entryIndex)}
                                onDragOver={onChapterDragOver}
                                onDragEnd={onChapterDragEnd}
                              >
                                  <div
                                    className="chapter-folder-header"
                                    onClick={() => toggleChapterFolder(entry.folderName)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        background: 'var(--bg-base)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        cursor: 'pointer'
                                    }}
                                  >
                                      <span className="drag-handle" onClick={e => e.stopPropagation()} style={{display: 'flex', cursor: 'grab', color: 'var(--text-muted)'}}>{Icons.drag}</span>
                                      <span className="chapter-folder-icon" style={{display: 'flex', color: 'var(--gold)'}}>{Icons.folder}</span>
                                      <span className="chapter-folder-name" style={{flex: 1, fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.95em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{entry.folderName}</span>
                                      <span className="chapter-folder-count" style={{fontSize: '0.8em', fontWeight: 'bold', color: 'var(--text-muted)'}}>{entry.items.length}</span>
                                      <span className="chapter-folder-chevron" style={{color: 'var(--text-muted)', fontSize: '0.9em', width: '14px', textAlign: 'center'}}>
                                          {openChapterFolders.has(entry.folderName) ? '▴' : '▾'}
                                      </span>
                                  </div>
                                  {openChapterFolders.has(entry.folderName) && (
                                      <div className="chapter-folder-items" style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', paddingInlineStart: '14px', borderInlineStart: '2px solid rgba(212, 175, 55, 0.2)'}}>
                                          {entry.items.map(({ chapter }, itemIndex) => renderChapterItem(chapter, {
                                              onDragStart: (e) => onChapterDragStart(e, 'folder', entry.folderName, itemIndex),
                                              onDragEnter: (e) => onChapterDragEnter(e, 'folder', entry.folderName, itemIndex),
                                              onDragOver: onChapterDragOver,
                                              onDragEnd: onChapterDragEnd,
                                          }, true))}
                                      </div>
                                  )}
                              </div>
                          ) : renderChapterItem(entry.chapter, {
                              onDragStart: (e) => onChapterDragStart(e, 'top', null, entryIndex),
                              onDragEnter: (e) => onChapterDragEnter(e, 'top', null, entryIndex),
                              onDragOver: onChapterDragOver,
                              onDragEnd: onChapterDragEnd,
                          }, false)
                      ))}
                  </div>
              </div>

              <div className="panel">
                  <div className="panel-head">
                      <h3>📝 الامتحانات</h3>
                      <button className="btn-small" onClick={() => openModal('exam_editor')}> {Icons.add} إنشاء</button>
                  </div>
                  <div className="exam-grid">
                      {selectedSubject.exams?.map((ex, index) => (
                          <div key={ex.id} className="exam-card-item draggable-item" draggable onDragStart={(e) => onDragStart(e, index)} onDragEnter={(e) => onDragEnter(e, index)} onDragOver={onDragOver} onDragEnd={(e) => onDragEnd(e, 'exams')}>
                              <div className="drag-handle-abs" onClick={e => e.stopPropagation()}>{Icons.drag}</div>
                              <div className="exam-icon">{Icons.exam}</div>
                              <div className="exam-info"><h4>{ex.title}</h4><span>{ex.duration_minutes} دقيقة</span></div>
                              <div className="exam-actions">
                                  <button title="إحصائيات" onClick={() => router.push(`/admin/teacher/exam-stats/${ex.id}`)}>📊</button>
                                  <button title="تعديل" onClick={() => openModal('exam_editor', ex)}>{Icons.edit}</button>
                                  <button title="حذف" className="danger" onClick={() => handleDelete('exams', ex.id)}>{Icons.trash}</button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* 4. Chapter Content */}
      {selectedChapter && (
          <div className="content-layout">
              <div className="panel">
                  <div className="panel-head">
                      <h3>🎬 الفيديوهات</h3>
                      <button className="btn-small" onClick={() => openModal('add_video')}> {Icons.add} إضافة</button>
                  </div>
                  <div className="media-grid">
                      {selectedChapter.videos?.map((v, index) => (
                          <div key={v.id} className="media-card draggable-item" draggable onDragStart={(e) => onDragStart(e, index)} onDragEnter={(e) => onDragEnter(e, index)} onDragOver={onDragOver} onDragEnd={(e) => onDragEnd(e, 'videos')}>
                              <div className="drag-handle-abs" onClick={e => e.stopPropagation()}>{Icons.drag}</div>
                              <div className="thumb video-thumb">{Icons.video}</div>
                              <div className="media-body">
                                  <div className="media-info-col">
                                      <h4>{v.title}</h4>

                              {v.bunny_video_id && (() => {
                                  // الحالة تُقرأ مباشرة من حقل encoding_status في Supabase
                                  // (يُحدَّث تلقائياً بواسطة Bunny Webhook عند اكتمال التشفير)
                                  const STATUS_MAP = {
                                      encoding: { status: 'processing', label: 'قيد المعالجة الآن' },
                                      ready:    { status: 'ready',      label: 'جاهز' },
                                  };
                                  const entry   = STATUS_MAP[v.encoding_status] || { status: 'waiting', label: 'في انتظار المعالجة' };
                                  const isRefreshing  = refreshingVideoId === v.id;
                                  const notYetReady   = entry.status !== 'ready';

                                  return (
                                      <div className="video-status-row">
                                          <span className={`status-badge status-${isRefreshing ? 'loading' : entry.status}`}>
                                              {isRefreshing
                                                  ? <><span className="status-spinner"></span> جاري التحديث</>
                                                  : entry.label
                                              }
                                          </span>
                                          {notYetReady && !isRefreshing && (
                                              <button
                                                  className="status-recheck-btn"
                                                  title="تحديث الحالة"
                                                  onClick={() => refreshVideoStatus(v.id)}
                                              >
                                                  {Icons.refresh}
                                              </button>
                                          )}
                                      </div>
                                  );
                              })()}
                                  </div>

                                  <div style={{display: 'flex', gap: '8px'}}>
                                      <button 
                                          className="btn-icon highlight-icon" 
                                          title="من شاهد الفيديو؟" 
                                          onClick={() => fetchMediaViews(v.id, v.title)}
                                      >
                                          {Icons.eye}
                                      </button>
                                      <button className="btn-icon danger" onClick={() => handleDelete('videos', v.id)}>
                                          {Icons.trash}
                                      </button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="panel">
                  <div className="panel-head">
                      <h3>📄 الملفات</h3>
                      <button className="btn-small" onClick={() => openModal('add_pdf')}> {Icons.add} رفع</button>
                  </div>
                  <div className="list-group">
                      {selectedChapter.pdfs?.map((p, index) => (
                          <div key={p.id} className="list-item draggable-item" draggable onDragStart={(e) => onDragStart(e, index)} onDragEnter={(e) => onDragEnter(e, index)} onDragOver={onDragOver} onDragEnd={(e) => onDragEnd(e, 'pdfs')}>
                              <div className="drag-handle" onClick={e => e.stopPropagation()}>{Icons.drag}</div>
                              <div className="info"><span className="icon-text pdf-icon">{Icons.pdf}</span><strong>{p.title}</strong></div>
                              <button className="btn-icon danger" onClick={() => handleDelete('pdfs', p.id)}>{Icons.trash}</button>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* --- Unified Modal System --- */}
      {['add_course', 'edit_course', 'add_subject', 'edit_subject', 'add_chapter', 'edit_chapter', 'add_video'].includes(modalType) && (
          <Modal title={getModalTitle()} onClose={() => setModalType(null)} closeOnOverlayClick={true}>
              <div className="form-group">
                  <label>العنوان</label>
                  <input 
                    className="input" 
                    autoFocus 
                    value={formData.title} 
                    onChange={e=>setFormData({...formData, title: e.target.value})} 
                    placeholder="اكتب العنوان..." 
                  />
              </div>

              {['add_chapter', 'edit_chapter'].includes(modalType) && (() => {
                  const existingFolders = Array.from(new Set(
                      (selectedSubject?.chapters || [])
                          .map(c => (c.folder_name || '').trim())
                          .filter(Boolean)
                  ));
                  const showDropdown = existingFolders.length > 0 && folderMode !== 'new';

                  return (
                      <div className="form-group">
                          <label>المجلد (اختياري)</label>

                          {existingFolders.length > 0 && (
                              <select
                                className="input"
                                value={showDropdown ? (formData.folderName || '') : '__new__'}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === '__new__') {
                                        setFolderMode('new');
                                        setFormData({...formData, folderName: ''});
                                    } else {
                                        setFolderMode('existing');
                                        setFormData({...formData, folderName: v});
                                    }
                                }}
                                style={{marginBottom: showDropdown ? 0 : '8px'}}
                              >
                                  <option value="">بدون مجلد</option>
                                  {existingFolders.map(f => (
                                      <option key={f} value={f}>📁 {f}</option>
                                  ))}
                                  <option value="__new__">➕ مجلد جديد...</option>
                              </select>
                          )}

                          {!showDropdown && (
                              <input
                                className="input"
                                autoFocus={existingFolders.length > 0}
                                value={formData.folderName}
                                onChange={e=>setFormData({...formData, folderName: e.target.value})}
                                placeholder="مثال: الترم الأول (اتركه فارغاً لعدم استخدام مجلد)"
                                style={{marginTop: existingFolders.length > 0 ? '8px' : 0}}
                              />
                          )}

                          {existingFolders.length > 0 && folderMode === 'new' && (
                              <button
                                type="button"
                                className="btn-small"
                                style={{marginTop: '8px'}}
                                onClick={() => { setFolderMode('existing'); setFormData({...formData, folderName: ''}); }}
                              >
                                  {Icons.back} الاختيار من المجلدات الموجودة
                              </button>
                          )}

                          <small style={{color: 'var(--text-muted)', display: 'block', marginTop: '6px'}}>
                              الفصول التي تحمل نفس اسم المجلد تُعرض مجمّعة معاً للطالب داخل التطبيق.
                          </small>
                      </div>
                  );
              })()}

              {['add_course', 'edit_course', 'add_subject', 'edit_subject'].includes(modalType) && (
                  <div className="form-group">
                      <label>السعر (جنية)</label>
                      <input 
                        type="number" 
                        className="input" 
                        value={formData.price} 
                        onChange={e=>setFormData({...formData, price: e.target.value})} 
                        placeholder="0" 
                      />
                  </div>
              )}

              {['add_course', 'edit_course'].includes(modalType) && (
                  <div className="form-group">
                      <label>وصف الكورس (اختياري)</label>
                      <textarea 
                        className="input" 
                        rows="3"
                        value={formData.description} 
                        onChange={e=>setFormData({...formData, description: e.target.value})} 
                        placeholder="أضف وصفاً مختصراً للكورس..." 
                        style={{ resize: 'vertical' }}
                      />
                  </div>
              )}

              {modalType === 'add_video' && (
                  <>
                  <div className="form-group">
                      <label>ملف الفيديو (رفع إلى السيرفر)</label>
                      <input 
                        className="input file" 
                        type="file" 
                        accept="video/*" 
                        onChange={e => setVideoFile(e.target.files[0] || null)} 
                      />
                      <small style={{color: 'var(--text-muted)', display: 'block', marginTop: '6px'}}>
                          يمكنك رفع ملف فيديو، أو إدخال رابط يوتيوب أدناه، أو كليهما معاً.
                          سيبدأ الرفع في الخلفية فور الحفظ، ويمكنك فتح فيديو آخر مباشرة.
                      </small>
                  </div>
                  <div className="form-group">
                      <label>رابط يوتيوب (اختياري)</label>
                      <input className="input" value={formData.url} onChange={e=>setFormData({...formData, url: e.target.value})} placeholder="https://... (اختياري)" dir="ltr" />
                  </div>
                  {activeUploadsCount > 0 && (
                      <div className="form-group" style={{marginTop: '8px', fontSize: '0.85em'}}>
                          <small style={{color: 'var(--gold)'}}>
                              📤 لديك {activeUploadsCount} رفع فيديو جارٍ حالياً — تابعه من النافذة العائمة أسفل الشاشة.
                          </small>
                      </div>
                  )}
                  {/* مدة الفيديو: مطلوبة فقط عند استخدام رابط يوتيوب بدون ملف */}
                  {!videoFile && (
                  <div className="form-group" style={{ marginTop: '15px' }}>
                      <label style={{ marginBottom: '10px', display: 'block', color: 'var(--gold)' }}>⏱️ مدة الفيديو (مطلوبة لرابط يوتيوب)</label>
                      <div className="duration-inputs-wrapper">
                          <div className="dur-col">
                              <input 
                                 type="number" 
                                 className="input text-center" 
                                 placeholder="00" 
                                 min="0" max="99"
                                 value={formData.durHours} 
                                 onChange={e => setFormData({...formData, durHours: e.target.value})} 
                              />
                              <small>ساعات</small>
                          </div>
                          
                          <span className="dur-colon">:</span>
                          
                          <div className="dur-col">
                              <input 
                                 type="number" 
                                 className="input text-center" 
                                 placeholder="00" 
                                 min="0" max="59"
                                 value={formData.durMinutes} 
                                 onChange={e => setFormData({...formData, durMinutes: e.target.value})} 
                              />
                              <small>دقائق</small>
                          </div>

                          <span className="dur-colon">:</span>

                          <div className="dur-col">
                              <input 
                                 type="number" 
                                 className="input text-center" 
                                 placeholder="00" 
                                 min="0" max="59"
                                 value={formData.durSeconds} 
                                 onChange={e => setFormData({...formData, durSeconds: e.target.value})} 
                              />
                              <small>ثواني</small>
                          </div>
                      </div>
                  </div>
                  )}
                  <div className="form-group" style={{marginTop: '15px'}}>
                      <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--text-secondary)'}}>
                          <input 
                            type="checkbox" 
                            style={{width: '18px', height: '18px', accentColor: 'var(--gold)'}} 
                            checked={formData.notifyStudents} 
                            onChange={e => setFormData({...formData, notifyStudents: e.target.checked})} 
                          />
                          <span>إرسال إشعار للطلاب المشتركين في المادة</span>
                      </label>
                  </div>
                  </>
              )}
              
              <div className="acts">
                  <button className="btn-cancel" onClick={() => setModalType(null)}>إلغاء</button>
                  <button className="btn-primary" onClick={() => {
                      if (modalType === 'add_course') apiCall('create', 'courses', { title: formData.title, price: formData.price, description: formData.description });
                      else if (modalType === 'edit_course') apiCall('update', 'courses', { id: selectedCourse.id, title: formData.title, price: formData.price, description: formData.description });
                      
                      else if (modalType === 'add_subject') apiCall('create', 'subjects', { course_id: selectedCourse.id, title: formData.title, price: formData.price });
                      else if (modalType === 'edit_subject') apiCall('update', 'subjects', { id: selectedSubject.id, title: formData.title, price: formData.price });
                      
                      else if (modalType === 'add_chapter') apiCall('create', 'chapters', { subject_id: selectedSubject.id, title: formData.title, folder_name: formData.folderName?.trim() || null });
                      else if (modalType === 'edit_chapter') apiCall('update', 'chapters', { id: selectedChapter.id, title: formData.title, folder_name: formData.folderName?.trim() || null });
                      
                      else if (modalType === 'add_video') handleSaveVideo();
                  }}>حفظ</button>
              </div>
          </Modal>
      )}
      
      {/* 2. PDF Modal */}
      {modalType === 'add_pdf' && (
          <Modal title="رفع ملف PDF" onClose={() => setModalType(null)} closeOnOverlayClick={false}>
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  const file = e.target.file.files[0];
                  if(!file) return showAlert('error', 'اختر الملف');
                  
                  setLoading(true); 
                  
                  const fd = new FormData();
                  fd.append('file', file); 
                  fd.append('title', e.target.title.value); 
                  fd.append('type', 'pdf'); 
                  fd.append('chapterId', selectedChapter.id);
                  fd.append('notifyStudents', notifyPdf);

                  try {
                      const res = await fetch('/api/dashboard/teacher/upload', {method:'POST', body:fd});
                      const data = await res.json();
                      if(res.ok) { refreshView(); setModalType(null); showAlert('success', 'تم الرفع'); }
                      else showAlert('error', 'فشل الرفع');
                  } catch(e) { showAlert('error', 'خطأ في الاتصال'); }
                  
                  setLoading(false); 
              }}>
                  <div className="form-group">
                      <label>اسم الملف</label>
                      <input className="input" name="title" required placeholder="اسم الملف..." />
                  </div>
                  <div className="form-group">
                      <label>اختر الملف</label>
                      <input className="input file" type="file" name="file" accept="application/pdf" required />
                  </div>
                  <div className="form-group" style={{marginTop: '15px'}}>
                      <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--text-secondary)'}}>
                          <input 
                            type="checkbox" 
                            style={{width: '18px', height: '18px', accentColor: 'var(--gold)'}} 
                            checked={notifyPdf} 
                            onChange={e => setNotifyPdf(e.target.checked)} 
                          />
                          <span>إرسال إشعار للطلاب المشتركين في المادة</span>
                      </label>
                  </div>
                  <div className="acts">
                      <button type="button" className="btn-cancel" onClick={() => setModalType(null)}>إلغاء</button>
                      <button type="submit" className="btn-primary" disabled={loading}>
                          {loading ? 'جاري الرفع... ⏳' : 'رفع وحفظ'}
                      </button>
                  </div>
              </form>
          </Modal>
      )}
      

      {/* 4. Exam Editor */}
      {modalType === 'exam_editor' && (
          <div className="editor-overlay">
              <div className="editor-container">
                  <div className="editor-header">
                      <h3>{examForm.id ? 'تعديل الامتحان' : 'إنشاء امتحان جديد'}</h3>
                      <div className="header-actions">
                          <button className="mobile-toggle" onClick={() => setShowExamSidebar(!showExamSidebar)}>{Icons.menu} القائمة</button>
                          <button className="close-btn" onClick={() => setModalType(null)}>{Icons.close} إغلاق</button>
                      </div>
                  </div>
                  
                  <div className="editor-body">
                      {/* Left: Sidebar */}
                      <div className={`editor-sidebar ${showExamSidebar ? 'mobile-visible' : ''}`}>
                          <div className="meta-section styled">
                              <label className="field-label">عنوان الامتحان</label>
                              <input className="input" value={examForm.title} onChange={e=>setExamForm({...examForm, title: e.target.value})} placeholder="العنوان..." />
                              
                              <label className="field-label" style={{marginTop:'15px'}}>المدة (بالدقائق)</label>
                              <div className="duration-input">
                                  <input type="number" value={examForm.duration} onChange={e=>setExamForm({...examForm, duration: e.target.value})} />
                                  <span>دقيقة</span>
                              </div>

                              <div style={{marginTop: '15px', borderTop: '1px solid var(--border)', paddingTop: '10px'}}>
                                  <label className="field-label" style={{color:'var(--gold)'}}>📅 الصلاحية الزمنية (إجباري)</label>
                                  <label className="field-label" style={{fontSize: '0.8rem', marginTop:'5px'}}>يبدأ في:</label>
                                  <input 
                                      type="datetime-local" 
                                      required 
                                      className="input" 
                                      style={{fontSize: '0.85rem', direction:'ltr', borderColor: !examForm.startTime ? '#ef4444' : 'var(--border)'}}
                                      value={examForm.startTime} 
                                      onChange={e=>setExamForm({...examForm, startTime: e.target.value})} 
                                  />

                                  <label className="field-label" style={{fontSize: '0.8rem', marginTop:'10px'}}>ينتهي في:</label>
                                  <input 
                                      type="datetime-local" 
                                      required
                                      className="input" 
                                      style={{fontSize: '0.85rem', direction:'ltr', borderColor: !examForm.endTime ? '#ef4444' : 'var(--border)'}}
                                      value={examForm.endTime} 
                                      onChange={e=>setExamForm({...examForm, endTime: e.target.value})} 
                                  />
                              </div>

                              <div className="toggles-group" style={{marginTop:'15px'}}>
                                  <div className="toggle-row"><span>عشوائية الأسئلة</span><label className="switch"><input type="checkbox" checked={examForm.randQ} onChange={e=>setExamForm({...examForm, randQ: e.target.checked})} /><span className="slider round"></span></label></div>
                                  <div className="toggle-row"><span>عشوائية الاختيارات</span><label className="switch"><input type="checkbox" checked={examForm.randO} onChange={e=>setExamForm({...examForm, randO: e.target.checked})} /><span className="slider round"></span></label></div>
                                  <div className="toggle-row" style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)'}}>
                                      <span style={{color: 'var(--gold)', fontSize: '0.85rem'}}>السماح بإعادة الامتحان (تدريب)</span>
                                      <label className="switch">
                                          <input type="checkbox" checked={examForm.allowRetake} onChange={e=>setExamForm({...examForm, allowRetake: e.target.checked})} />
                                          <span className="slider round"></span>
                                      </label>
                                  </div>

                                  {/* ✅ يظهر التبديل عند الإنشاء والتعديل معاً — الإشعار سيُرسل عند حلول موعد بدء الامتحان (start_time)
                                        وليس عند لحظة الحفظ، سواء كان إنشاءً جديداً أو تعديلاً لموعد امتحان موجود */}
                                  <div className="toggle-row" style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)'}}>
                                      <span style={{color: 'var(--gold)', fontSize: '0.85rem', fontWeight: 'bold'}}>إرسال إشعار للطلاب عند بدء الامتحان</span>
                                      <label className="switch">
                                          <input type="checkbox" checked={examForm.notifyStudents} onChange={e=>setExamForm({...examForm, notifyStudents: e.target.checked})} />
                                          <span className="slider round"></span>
                                      </label>
                                  </div>
                              </div>
                          </div>
                          
                          <div className="q-list-scroll">
                              <h4 className="list-title">قائمة الأسئلة ({examForm.questions.length})</h4>
                              {examForm.questions.map((q, i) => (
                                  <div key={i} className={`q-item ${editingQIndex === i ? 'active' : ''}`} onClick={() => editQuestion(i)}>
                                      <span className="q-num">{i+1}</span>
                                      <span className="q-text">{q.text.substring(0, 15)}...</span>
                                      {q.questionType === 'essay' && <span className="q-type-badge">مقالي</span>}
                                      <button className="del-btn" onClick={(e) => { e.stopPropagation(); deleteQuestion(i); }}>×</button>
                                  </div>
                              ))}
                              <button className="add-q-btn" onClick={() => { resetCurrentQuestion(); setShowExamSidebar(false); }}>{Icons.add} سؤال جديد</button>
                          </div>
                          <div className="sidebar-footer">
                              <button className="btn-save-exam" onClick={submitExam}>حفظ وإنهاء</button>
                          </div>
                      </div>
                      
                      {showExamSidebar && <div className="sidebar-overlay" onClick={() => setShowExamSidebar(false)}></div>}

                      {/* Right: Main Editor */}
                      <div className="editor-main">
                          <h4>{editingQIndex === -1 ? 'إضافة سؤال جديد' : `تعديل السؤال رقم ${editingQIndex + 1}`}</h4>

                          <label className="field-label">نوع السؤال</label>
                          <select
                              className="input"
                              style={{marginBottom: '15px'}}
                              value={currentQ.questionType || 'mcq'}
                              onChange={e => setCurrentQ({ ...currentQ, questionType: e.target.value })}
                          >
                              <option value="mcq">اختياري (متعدد الإجابات)</option>
                              <option value="essay">مقالي (تصحيح يدوي)</option>
                          </select>

                          <textarea className="input area" placeholder="نص السؤال هنا..." value={currentQ.text} onChange={e=>setCurrentQ({...currentQ, text: e.target.value})} rows="3"></textarea>
                          <div className="image-upload">
                              <label style={{ opacity: uploadingImg ? 0.5 : 1, pointerEvents: uploadingImg ? 'none' : 'auto', cursor: uploadingImg ? 'wait' : 'pointer' }}>
                                  {Icons.image} {currentQ.image ? 'تغيير الصورة' : 'إرفاق صورة'}
                                  <input type="file" hidden accept="image/*" onChange={handleImageUpload} disabled={uploadingImg} />
                              </label>
                              {uploadingImg && <span style={{marginLeft: '10px', color: 'var(--gold)', fontSize: '0.9em', fontWeight: 'bold'}}>جاري رفع الصورة... ⏳</span>}
                              {currentQ.image && <img src={`/api/dashboard/teacher/file-proxy?type=exam_images&filename=${currentQ.image}`} alt="preview" />}
                          </div>

                          {currentQ.questionType === 'essay' ? (
                              <div className="options-section">
                                  <label className="section-label">الدرجة العظمى لهذا السؤال:</label>
                                  <input
                                      type="number"
                                      min="0.5"
                                      step="0.5"
                                      className="input"
                                      style={{maxWidth: '160px'}}
                                      value={currentQ.maxScore}
                                      onChange={e => setCurrentQ({ ...currentQ, maxScore: e.target.value })}
                                  />
                                  <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px'}}>
                                      سيكتب الطالب إجابته في مربع نصي، وستحتاج لتصحيحها يدوياً بعد التسليم.
                                  </p>

                                  <label className="section-label" style={{marginTop: '15px'}}>الإجابة النموذجية (اختياري):</label>
                                  <textarea
                                      className="input area"
                                      placeholder="اكتب الإجابة النموذجية هنا ليراها الطالب بعد ظهور النتيجة..."
                                      value={currentQ.modelAnswer || ''}
                                      onChange={e => setCurrentQ({ ...currentQ, modelAnswer: e.target.value })}
                                      rows="3"
                                  ></textarea>
                                  <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px'}}>
                                      ستظهر هذه الإجابة للطالب في شاشة النتيجة والمراجعة بعد التصحيح، كمرجع لمقارنة إجابته.
                                  </p>
                              </div>
                          ) : (
                              <div className="options-section">
                                  <label className="section-label">الاختيارات (حدد الإجابة الصحيحة):</label>
                                  <div className="options-container dynamic">
                                      {currentQ.options.map((opt, i) => (
                                          <div key={i} className={`option-row ${currentQ.correctIndex === i ? 'correct' : ''}`}>
                                              <div className="radio" onClick={() => setCurrentQ({...currentQ, correctIndex: i})}>{currentQ.correctIndex === i && <div className="dot"></div>}</div>
                                              <input className="input small" value={opt} onChange={e => handleOptionChange(i, e.target.value)} placeholder={`الخيار ${i+1}`} />
                                              {currentQ.options.length > 2 && <button className="btn-remove-opt" onClick={() => removeOption(i)} title="حذف">×</button>}
                                          </div>
                                      ))}
                                  </div>
                                  <button className="btn-add-opt" onClick={addOption}>+ إضافة خيار</button>
                              </div>
                          )}
                          <div className="editor-actions">
                              <button className="btn-primary full" onClick={saveQuestion}>{editingQIndex === -1 ? 'إضافة السؤال للقائمة' : 'تحديث السؤال'}</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* ✅ نافذة عرض الطلاب الذين شاهدوا الفيديو */}
      {isViewsModalOpen && (
          <div className="modal-overlay" onClick={() => setIsViewsModalOpen(false)}>
              <div className="modal-box" style={{maxWidth: '600px', width: '90%'}} onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                      <h3 style={{fontSize: '1.1rem'}}>إحصائيات: <span style={{color: 'var(--gold)'}}>{selectedMediaName}</span></h3>
                      <button onClick={() => setIsViewsModalOpen(false)} className="close-btn">{Icons.close}</button>
                  </div>

                  {loadingViews ? (
                      <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>جاري التحميل... ⏳</div>
                  ) : (
                      <>
                          <div style={{background: 'var(--bg-base)', padding: '15px', borderRadius: '10px', marginBottom: '20px', textAlign: 'center', border: '1px solid var(--border)'}}>
                              <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>إجمالي المشاهدات</span>
                              <strong style={{display: 'block', fontSize: '1.8rem', color: '#22c55e'}}>{totalViewsCount}</strong>
                          </div>
                          
                          {mediaViews.length > 0 ? (
                              <div style={{maxHeight: '350px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border)'}}>
                                  <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'right'}}>
                                      <thead style={{background: 'var(--bg-elevated)', position: 'sticky', top: '0'}}>
                                          <tr>
                                              <th style={{padding: '12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>اسم الطالب</th>
                                              <th style={{padding: '12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>آخر وقت مشاهدة</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {mediaViews.map((view, idx) => (
                                              <tr key={idx} style={{borderBottom: '1px solid var(--border)'}} className="hover-row">
                                                  <td style={{padding: '12px', color: 'var(--text-primary)', fontWeight: '500'}}>{view.studentName}</td>
                                                  <td style={{padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem'}} dir="ltr">
                                                      {new Date(view.lastViewedAt).toLocaleString('ar-EG', {
                                                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                      })}
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          ) : (
                              <div style={{textAlign: 'center', padding: '30px', color: 'var(--text-muted)'}}>لا توجد سجلات مشاهدة لهذا الفيديو بعد.</div>
                          )}

                          {Math.ceil(totalViewsCount / 100) > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px' }}>
                                  <button
                                      disabled={viewsPage === 1}
                                      onClick={() => fetchMediaViews(currentMediaId, selectedMediaName, viewsPage - 1)}
                                      className="btn-secondary"
                                      style={{ padding: '8px 15px', opacity: viewsPage === 1 ? 0.5 : 1 }}
                                  >
                                      السابق
                                  </button>
                                  <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                                      صفحة {viewsPage} من {Math.ceil(totalViewsCount / 100)}
                                  </span>
                                  <button
                                      disabled={viewsPage >= Math.ceil(totalViewsCount / 100)}
                                      onClick={() => fetchMediaViews(currentMediaId, selectedMediaName, viewsPage + 1)}
                                      className="btn-secondary"
                                      style={{ padding: '8px 15px', opacity: viewsPage >= Math.ceil(totalViewsCount / 100) ? 0.5 : 1 }}
                                  >
                                      التالي
                                  </button>
                              </div>
                          )}
                      </>
                  )}
                  <div className="acts" style={{ marginTop: '20px' }}>
                      <button className="btn-cancel" onClick={() => setIsViewsModalOpen(false)}>إغلاق</button>
                  </div>
              </div>
          </div>
      )}

      {confirmData.show && (
          <div className="modal-overlay">
              <div className="modal-box">
                  <div className="modal-header"><h3>تأكيد</h3></div>
                  <p style={{textAlign:'center', color:'var(--text-secondary)', padding: '0 20px'}}>{confirmData.msg}</p>
                  <div className="acts">
                      <button className="btn-cancel" onClick={closeConfirm}>إلغاء</button>
                      <button className="btn-primary danger" style={{background: '#ef4444', color: 'white'}} onClick={confirmData.onConfirm}>نعم</button>
                  </div>
              </div>
          </div>
      )}

      {alertData.show && <div className={`alert-toast ${alertData.type}`}>{alertData.msg}</div>}

      {/* ✅ ودجت عائم يعرض كل عمليات رفع الفيديو الجارية/المنتهية في الخلفية */}
      <UploadQueueWidget
        uploads={bunnyUploads}
        onCancel={cancelBunnyUpload}
        onResume={resumeBunnyUpload}
        onDismiss={dismissBunnyUpload}
      />

      <style jsx>{`
      /* --- Duration Inputs Styles --- */
        .duration-inputs-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            background: var(--bg-base);
            padding: 15px;
            border-radius: 12px;
            border: 1px dashed var(--border);
            direction: ltr; 
        }
        .dur-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 70px;
        }
        .dur-col input.text-center {
            text-align: center;
            font-size: 1.5rem;
            font-weight: bold;
            font-family: monospace;
            padding: 10px 5px;
            border-color: var(--border);
            background: var(--bg-surface);
            color: var(--gold);
            border-radius: 8px;
        }
        .dur-col input.text-center:focus {
            border-color: var(--gold);
            box-shadow: 0 0 10px var(--gold-dim);
        }
        .dur-col input[type=number]::-webkit-inner-spin-button, 
        .dur-col input[type=number]::-webkit-outer-spin-button { 
            -webkit-appearance: none; 
            margin: 0; 
        }
        .dur-col small {
            margin-top: 8px;
            color: var(--text-muted);
            font-size: 0.85rem;
            font-weight: bold;
        }
        .dur-colon {
            font-size: 2rem;
            font-weight: bold;
            color: var(--text-muted);
            margin-top: -20px;
            animation: blink 2s infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        
        /* General Layout */
        .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .page-title { margin: 0 0 5px 0; color: var(--text-primary); font-size: 1.6rem; }
        .breadcrumbs { color: var(--text-muted); font-size: 0.9rem; cursor: pointer; }
        .actions-area { display: flex; gap: 10px; }
        
        /* Buttons */
        .btn-secondary { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; cursor: pointer; display: flex; gap: 5px; align-items: center; transition: all 0.2s; }
        .btn-secondary:hover { border-color: var(--gold); color: var(--gold); background: var(--gold-dimmer); }
        .btn-secondary.edit { color: var(--gold); border-color: var(--border-accent); background: var(--gold-dimmer); }
        .btn-secondary.edit:hover { background: var(--gold-dim); }
        
        .accent-btn { border-color: var(--gold) !important; color: var(--gold) !important; background: var(--gold-dimmer) !important; }
        .accent-btn:hover { background: var(--gold-dim) !important; box-shadow: 0 4px 12px var(--gold-dim); }
        
        .btn-primary { background: var(--gold); color: #111009; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; gap: 5px; align-items: center; transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--gold-dim); }
        
        .loader-line { height: 3px; background: var(--gold); width: 100%; position: fixed; top: 0; left: 0; z-index: 9999; }

        /* Grids & Cards */
        .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .draggable-item.dragging { opacity: 0.6; border: 2px dashed var(--gold) !important; transform: scale(0.98); }
        
        .folder-card { background: var(--bg-surface); padding: 20px; border-radius: 16px; border: 1px solid var(--border); text-align: center; cursor: pointer; transition: all 0.2s; position: relative; }
        .folder-card:hover { transform: translateY(-4px); border-color: var(--border-accent); box-shadow: 0 8px 24px rgba(0,0,0,0.15); background: var(--bg-hover); }
        .folder-card .icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
        .folder-card .icon.accent-icon { background: var(--gold-dim); color: var(--gold); }
        .folder-card h3 { margin: 10px 0 5px; font-size: 1.1rem; color: var(--text-primary); }
        .folder-card p { color: var(--gold); font-weight: bold; margin: 0 0 5px 0; }
        .folder-card .muted-text { color: var(--text-muted); }

        .card-actions-abs { position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; z-index: 20; }
        .drag-handle-abs { cursor: grab; color: var(--text-muted); padding: 5px; }
        .drag-handle-abs:hover { color: var(--text-primary); background: rgba(0,0,0,0.2); border-radius: 6px; }
        .btn-icon.danger { width: 28px; height: 28px; }

        /* Content Layout */
        .content-layout { display: grid; grid-template-columns: 1fr; gap: 30px; }
        .panel { background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow: hidden; }
        .panel-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding: 18px 20px; background: var(--bg-elevated); }
        .panel-head h3 { margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: bold; }
        .btn-small { background: var(--gold); color: #111009; padding: 6px 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; display: flex; gap: 5px; align-items: center; transition: all 0.2s; }
        .btn-small:hover { opacity: 0.9; transform: translateY(-1px); }

        /* Lists */
        .list-group { display: flex; flex-direction: column; gap: 10px; padding: 15px; }
        .list-item { background: var(--bg-base); padding: 15px; border-radius: 10px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: relative; transition: all 0.2s; }
        .drag-handle { cursor: grab; padding: 5px; color: var(--text-muted); margin-left: 10px; z-index: 10; }
        .list-item.clickable { cursor: pointer; }
        .list-item.clickable:hover { border-color: var(--gold); background: var(--bg-hover); }
        .list-item .info { flex: 1; }
        .list-item .info strong { display: block; color: var(--text-primary); margin-bottom: 3px; }
        .list-item .info small { color: var(--text-muted); }
        .folder-badge { display: inline-block; font-size: 0.75em; color: var(--gold); background: rgba(212, 175, 55, 0.12); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 6px; padding: 2px 8px; margin-bottom: 5px; }
        .list-item .info .chapter-counts { display: block; margin-top: 4px; }

        /* ✅ [جديد] مجموعة مجلد قابلة للطي في قائمة الفصول */
        .chapter-folder-group { margin-bottom: 12px; }
        .chapter-folder-header:hover { background: var(--bg-hover); border-color: var(--gold); }
        .chapter-folder-icon svg { width: 18px; height: 18px; }
        .chapter-item-compact .info strong,
        .chapter-item-compact .info > div:first-child { font-size: 0.92em; }
        .chapter-item-compact .info small,
        .chapter-item-compact .chapter-counts { font-size: 0.85em; }
        .list-item .icon-text { margin-left: 10px; display: inline-flex; vertical-align: middle; }
        .list-item .pdf-icon { color: #f472b6; }
        
        .btn-icon { background: var(--bg-elevated); width: 34px; height: 34px; border-radius: 8px; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: all 0.2s; }
        .btn-icon:hover { background: var(--bg-hover); border-color: var(--border); color: var(--text-primary); }
        .btn-icon.danger:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
        .btn-icon.highlight-icon { color: var(--gold); background: var(--gold-dimmer); }
        .btn-icon.highlight-icon:hover { background: var(--gold-dim); border-color: var(--gold); }

        /* Media & Exam Grids */
        .exam-grid, .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px; padding: 15px; }
        .exam-card-item { background: var(--bg-base); padding: 15px; border-radius: 10px; border: 1px solid var(--border); display: flex; align-items: center; gap: 15px; position: relative; transition: all 0.2s; }
        .exam-card-item:hover { border-color: var(--border-accent); }
        .exam-icon { color: var(--gold); background: var(--gold-dim); padding: 12px; border-radius: 10px; }
        .exam-info h4 { margin: 0 0 4px 0; color: var(--text-primary); font-size: 1rem; }
        .exam-info span { font-size: 0.8rem; color: var(--text-muted); }
        .exam-actions { display: flex; gap: 6px; z-index: 10; }
        .exam-actions button { background: var(--bg-elevated); border: 1px solid transparent; padding: 6px; border-radius: 6px; color: var(--text-secondary); cursor: pointer; transition: 0.2s; }
        .exam-actions button:hover { background: var(--bg-hover); color: var(--gold); border-color: var(--border-accent); }
        .exam-actions button.danger:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }

        .media-card { background: var(--bg-base); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); position: relative; transition: all 0.2s; }
        .media-card:hover { border-color: var(--border-accent); }
        .media-card .thumb { height: 110px; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; }
        .media-card .video-thumb { color: var(--gold); }
        .media-body { padding: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); gap: 8px; }
        .media-info-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
        .media-body h4 { margin: 0; font-size: 0.95rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }

        /* ✅ حالة معالجة فيديو Bunny Stream */
        .video-status-row { display: flex; align-items: center; gap: 6px; }
        .status-recheck-btn { 
            display: flex; align-items: center; justify-content: center;
            background: var(--bg-elevated); border: 1px solid var(--border); 
            color: var(--text-secondary); border-radius: 6px; padding: 4px 6px; 
            cursor: pointer; transition: all 0.2s; 
        }
        .status-recheck-btn:hover { background: var(--bg-hover); color: var(--gold); border-color: var(--gold); }
        .status-badge { 
            display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; 
            border-radius: 20px; font-size: 0.72rem; font-weight: bold; white-space: nowrap; 
        }
        /* في انتظار المعالجة */
        .status-badge.status-waiting    { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
        /* قيد المعالجة الآن */
        .status-badge.status-processing { background: rgba(234, 179, 8, 0.15); color: #eab308; }
        .status-badge.status-processing { animation: status-pulse 2s ease-in-out infinite; }
        /* جاهز */
        .status-badge.status-ready      { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        /* أخطاء */
        .status-badge.status-failed,
        .status-badge.status-error      { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .status-badge.status-unknown,
        .status-badge.status-loading    { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }
        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        /* spinner صغير بجانب "جاري التحقق" */
        .status-spinner {
            width: 10px; height: 10px;
            border: 2px solid currentColor; border-top-color: transparent;
            border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ✅ شريط تقدم رفع الفيديو إلى Bunny Stream */
        .upload-progress-track { width: 100%; height: 8px; background: var(--bg-elevated); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
        .upload-progress-fill { height: 100%; background: var(--gold); transition: width 0.2s ease; }

        /* --- Unified Modals (Popups) --- */
        .modal-overlay { 
            position: fixed; 
            top: 0; left: 0; right: 0; bottom: 0; 
            width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.75); 
            z-index: 10000; 
            display: flex; justify-content: center; align-items: center; 
            backdrop-filter: blur(5px);
        }
        .modal-box { 
            background: var(--bg-surface); 
            width: 95%; max-width: 480px; 
            border-radius: 18px; 
            border: 1px solid var(--border-accent); 
            padding: 25px 30px; 
            box-shadow: 0 25px 50px rgba(0,0,0,0.5); 
            animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .modal-header { 
            display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); 
            padding-bottom: 15px; margin-bottom: 20px; align-items: center; 
        }
        .modal-header h3 { margin: 0; color: var(--text-primary); font-size: 1.25rem; font-weight: bold; }
        .close-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .close-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--text-muted); }

        /* تنسيقات الفورم داخل النافذة */
        .form-group { margin-bottom: 18px; }
        .form-group label { display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 0.9rem; font-weight: bold; }
        .input { width: 100%; background: var(--bg-base); border: 1px solid var(--border); color: var(--text-primary); padding: 12px 14px; border-radius: 10px; font-family: inherit; transition: 0.2s; }
        .input:focus { border-color: var(--gold); outline: none; box-shadow: 0 0 0 2px var(--gold-dim); }

        .acts { display: flex; gap: 12px; justify-content: flex-end; margin-top: 25px; }
        .acts .btn-primary { padding: 10px 24px; }
        .btn-cancel { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-cancel:hover { background: var(--bg-elevated); color: var(--text-primary); }

        /* --- Exam Editor --- */
        .editor-overlay { position: fixed; inset: 0; background: var(--bg-base); z-index: 10000; display: flex; flex-direction: column; }
        .editor-container { display: flex; flex-direction: column; height: 100vh; }
        .editor-header { background: var(--bg-surface); padding: 15px 25px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header-actions { display: flex; gap: 15px; }
        .mobile-toggle { display: none; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 12px; border-radius: 8px; cursor: pointer; }

        .editor-body { flex: 1; display: flex; overflow: hidden; position: relative; }
        
        .editor-sidebar { width: 340px; background: var(--bg-surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; height: 100%; transition: transform 0.3s ease; z-index: 50; }
        .meta-section.styled { padding: 20px; border-bottom: 1px solid var(--border); background: var(--bg-elevated); margin: 15px; border-radius: 12px; border: 1px solid var(--border); }
        .field-label { display: block; color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 6px; font-weight: bold; }
        
        .duration-input { display: flex; align-items: center; gap: 10px; background: var(--bg-base); padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 15px; }
        .duration-input input { background: transparent; border: none; color: var(--text-primary); width: 50px; font-weight: bold; text-align: center; font-size: 1rem; outline: none; }
        .duration-input span { color: var(--text-muted); font-size: 0.85rem; }

        .toggles-group { display: flex; flex-direction: column; gap: 14px; }
        .toggle-row { display: flex; justify-content: space-between; align-items: center; }
        .toggle-row span { color: var(--text-primary); font-size: 0.9rem; }

        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border); transition: .3s; border-radius: 22px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--gold); }
        input:checked + .slider:before { transform: translateX(22px); }

        .q-list-scroll { flex: 1; overflow-y: auto; padding: 15px; }
        .list-title { color: var(--text-muted); font-size: 0.85rem; margin: 0 0 15px; border-bottom: 1px dashed var(--border); padding-bottom: 8px; font-weight: bold; }
        .q-item { padding: 12px; background: var(--bg-base); border-radius: 8px; margin-bottom: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; color: var(--text-secondary); font-size: 0.9rem; border: 1px solid var(--border); transition: 0.2s; }
        .q-item:hover, .q-item.active { background: var(--bg-elevated); border-color: var(--gold); color: var(--text-primary); }
        .q-num { background: var(--bg-surface); border: 1px solid var(--border); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; color: var(--gold); }
        .q-type-badge { background: var(--gold-dim); color: var(--gold); font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; font-weight: bold; flex-shrink: 0; }
        .del-btn { background: none; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer; padding: 0 5px; opacity: 0.7; transition: 0.2s; }
        .del-btn:hover { opacity: 1; transform: scale(1.1); }
        .add-q-btn { width: 100%; padding: 12px; background: var(--gold-dimmer); border: 1px dashed var(--border-accent); color: var(--gold); border-radius: 8px; cursor: pointer; margin-top: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold; transition: 0.2s; }
        .add-q-btn:hover { background: var(--gold-dim); }
        .sidebar-footer { padding: 20px; border-top: 1px solid var(--border); background: var(--bg-surface); }
        .btn-save-exam { width: 100%; background: #22c55e; color: #111009; padding: 14px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: 0.2s; }
        .btn-save-exam:hover { background: #16a34a; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3); }

        .editor-main { flex: 1; padding: 35px; overflow-y: auto; background: var(--bg-base); }
        .editor-main h4 { color: var(--gold); margin-top: 0; font-size: 1.2rem; margin-bottom: 20px; }
        .input.area { resize: vertical; margin-bottom: 20px; min-height: 100px; }
        .input.small { padding: 12px; width: 100%; }
        .image-upload { margin-bottom: 25px; }
        .image-upload label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; background: var(--bg-surface); padding: 10px 18px; border-radius: 8px; border: 1px solid var(--border); color: var(--text-secondary); font-weight: bold; transition: 0.2s; }
        .image-upload label:hover { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--gold); }
        .image-upload img { max-height: 180px; margin-top: 15px; border-radius: 10px; border: 1px solid var(--border); display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .options-section { margin-bottom: 35px; background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border); }
        .section-label { display: block; margin-bottom: 15px; color: var(--text-primary); font-size: 1rem; font-weight: bold; }
        .options-container.dynamic { display: flex; flex-direction: column; gap: 12px; }
        .option-row { display: flex; align-items: center; gap: 12px; background: var(--bg-base); padding: 10px 15px; border-radius: 10px; border: 1px solid var(--border); transition: 0.2s; }
        .option-row.correct { border-color: #22c55e; background: rgba(34, 197, 94, 0.05); }
        .radio { width: 24px; height: 24px; border: 2px solid var(--text-muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: 0.2s; }
        .option-row.correct .radio { border-color: #22c55e; background: rgba(34, 197, 94, 0.15); }
        .dot { width: 12px; height: 12px; background: #22c55e; border-radius: 50%; }
        .btn-remove-opt { background: transparent; border: none; color: #ef4444; font-size: 1.4rem; cursor: pointer; opacity: 0.7; transition: 0.2s; }
        .btn-remove-opt:hover { opacity: 1; transform: scale(1.1); }
        .btn-add-opt { background: var(--bg-elevated); color: var(--gold); border: 1px dashed var(--border-accent); padding: 10px; width: 100%; border-radius: 8px; margin-top: 15px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-add-opt:hover { background: var(--bg-hover); }
        .editor-actions { padding-top: 25px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
        .editor-actions .btn-primary { padding: 12px 30px; font-size: 1rem; }

        .alert-toast { position: fixed; bottom: 30px; left: 30px; padding: 16px 28px; border-radius: 12px; color: white; font-weight: bold; z-index: 20000; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
        .alert-toast.success { background: #22c55e; color: #111009; }
        .alert-toast.error { background: #ef4444; }

        @keyframes popIn { from { transform: scale(0.95) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

        @media (max-width: 768px) {
            .mobile-toggle { display: flex; align-items: center; gap: 8px; }
            .editor-sidebar { position: absolute; right: 0; top: 0; bottom: 0; width: 85%; max-width: 340px; z-index: 50; transform: translateX(100%); box-shadow: -5px 0 25px rgba(0,0,0,0.5); }
            .editor-sidebar.mobile-visible { transform: translateX(0); }
            .sidebar-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; backdrop-filter: blur(3px); }
            
            .editor-main { padding: 20px; }
        }

        @media (max-width: 600px) {
            .grid-cards { grid-template-columns: 1fr; gap: 15px; }
            .folder-card { padding: 18px; }
            .header-bar { flex-direction: column; align-items: flex-start; gap: 15px; }
            .actions-area { width: 100%; justify-content: space-between; overflow-x: auto; padding-bottom: 5px; }
            .btn-secondary, .btn-primary { font-size: 0.85rem; padding: 8px 12px; white-space: nowrap; }
        }
      `}</style>
  </TeacherLayout>
  );
}

const Modal = ({ title, children, onClose, closeOnOverlayClick = true }) => (
    <div className="modal-overlay" onClick={closeOnOverlayClick ? onClose : undefined}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
                <h3>{title}</h3>
                <button onClick={onClose} className="close-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            {children}
        </div>
        <style jsx>{`
            .modal-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.75);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(5px);
            }
            .modal-box {
                background: var(--bg-surface);
                width: 95%;
                max-width: 480px;
                border-radius: 18px;
                border: 1px solid var(--border-accent);
                padding: 25px 30px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                position: relative;
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                border-bottom: 1px solid var(--border);
                padding-bottom: 15px;
                margin-bottom: 20px;
                align-items: center;
            }
            .modal-header h3 { margin: 0; color: var(--text-primary); font-size: 1.25rem; font-weight: bold; }
            .close-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
            .close-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--text-muted); }
            @keyframes popIn { from { transform: scale(0.95) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        `}</style>
    </div>
);
