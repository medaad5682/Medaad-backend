import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// ─── SVG Icons ──────────────────────────────────────────
const Svg = ({ children }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const FileTextIcon = () => (<Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></Svg>);
const UserIcon = () => (<Svg><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></Svg>);
const PhoneIcon = () => (<Svg><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></Svg>);
const BookIcon = () => (<Svg><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></Svg>);
const LockIcon = () => (<Svg><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></Svg>);
const BanIcon = () => (<Svg><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></Svg>);
const UploadIcon = () => (<Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></Svg>);
const CheckSquareIcon = () => (<Svg><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></Svg>);
const BellIcon = () => (<Svg><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></Svg>);
const CloudIcon = () => (<Svg><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></Svg>);
const InfoIcon = () => (<Svg><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></Svg>);
const AlertIcon = () => (<Svg><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></Svg>);
const RefreshIcon = () => (<Svg><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></Svg>);
const ScaleIcon = () => (<Svg><path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M5 7l-3 7a3 3 0 0 0 6 0z"></path><path d="M19 7l-3 7a3 3 0 0 0 6 0z"></path></Svg>);
const MessageIcon = () => (<Svg><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></Svg>);
const SunIcon = () => (<Svg><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></Svg>);
const MoonIcon = () => (<Svg><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></Svg>);

// ─── تاريخ آخر تحديث (ثابت — عدّله يدوياً عند تغيير الشروط) ───
const LAST_UPDATED = '6 نوفمبر 2026';

// ─── محتوى الشروط ───────────────────────────────────────
const SECTIONS = [
  {
    icon: <FileTextIcon />,
    title: 'قبول الشروط',
    paragraphs: [
      <>باستخدامك تطبيق <strong>مداد (Medaad)</strong> أو تسجيلك فيه، فإنك تقر بأنك قرأت شروط الاستخدام هذه وفهمتها ووافقت على الالتزام بها، إلى جانب <Link href="/privacy-policy" className="inline-link">سياسة الخصوصية</Link>.</>,
      'إذا لم توافق على أي بند من البنود التالية، يرجى التوقف عن استخدام التطبيق. وإذا كنت دون السن القانونية، فيجب أن يتم استخدامك للتطبيق بعلم وموافقة ولي أمرك.',
    ],
  },
  {
    icon: <UserIcon />,
    title: 'الحساب والتسجيل',
    items: [
      ['صحة البيانات', 'يجب تقديم بيانات صحيحة ومحدّثة عند إنشاء الحساب (الاسم، البريد الإلكتروني، رقم الهاتف).'],
      ['حساب شخصي', 'الحساب مخصص لك وحدك، ولا يجوز مشاركته مع الآخرين أو التنازل عنه لأي شخص.'],
      ['سرية بيانات الدخول', 'أنت مسؤول عن الحفاظ على سرية كلمة المرور وعن أي نشاط يتم من خلال حسابك.'],
    ],
  },
  {
    icon: <PhoneIcon />,
    title: 'ربط الحساب بالجهاز',
    paragraphs: [
      'لأغراض الأمان وحماية المحتوى، يتم ربط حسابك بجهاز واحد عن طريق معرّف فريد للجهاز. أي محاولة للدخول من جهاز آخر قد تؤدي إلى إغلاق الحساب.',
      'إذا قمت بتغيير جهازك، يمكنك التواصل مع الدعم الفني لمساعدتك.',
    ],
  },
  {
    icon: <BookIcon />,
    title: 'الوصول إلى المحتوى التعليمي',
    paragraphs: [
      'يتم تفعيل الوصول إلى المحتوى التعليمي (الكورسات والمواد) عن طريق الإدارة أو من خلال أكواد التفعيل المخصصة.',
    ],
    items: [
      ['تنظيم الصلاحيات', 'تحتفظ الإدارة بالحق في تنظيم الوصول وإدارة الصلاحيات وتعديلها.'],
      ['مدة الصلاحية', 'قد تكون بعض الصلاحيات محددة بمدة زمنية، وعند انتهائها يتوقف الوصول إلى المحتوى المرتبط بها.'],
      ['أكواد التفعيل', 'كود التفعيل مخصص للحساب الذي استُخدم فيه، ولا يجوز مشاركته أو تداوله.'],
      ['تحديث المحتوى', 'قد يتم تحديث المحتوى أو تعديله أو إزالته في أي وقت.'],
    ],
  },
  {
    icon: <LockIcon />,
    title: 'الملكية الفكرية وحماية المحتوى',
    paragraphs: [
      'جميع الفيديوهات والملفات والاختبارات والبطاقات التعليمية وسائر المواد داخل التطبيق مملوكة لمداد أو للمدرسين وأصحاب الحقوق، ومحمية بموجب قوانين حماية الملكية الفكرية.',
      'نمنحك ترخيصاً محدوداً وغير حصري وغير قابل للتحويل للاستخدام الشخصي غير التجاري فقط، ولا يجوز لك نسخ المحتوى أو تسجيله أو إعادة نشره أو توزيعه أو بيعه.',
      'نطبق إجراءات تقنية وتنظيمية لحماية المحتوى، وقد تشمل منع تصوير الشاشة أو تسجيلها داخل التطبيق.',
    ],
  },
  {
    icon: <BanIcon />,
    title: 'الأنشطة المحظورة',
    variant: 'danger-zone',
    paragraphs: ['يُمنع منعاً باتاً ما يلي:'],
    items: [
      ['بيئات غير آمنة', 'استخدام التطبيق على جهاز تم عمل Root أو Jailbreak له، أو أثناء تفعيل خيارات المطوّر (Developer Options).'],
      ['الهندسة العكسية', 'محاولة فك التطبيق أو تعديله أو الالتفاف على أنظمة الحماية والتحقق.'],
      ['تسريب المحتوى', 'تصوير المحتوى المحمي أو تسجيله أو تحميله أو نشره خارج التطبيق.'],
      ['مشاركة الوصول', 'مشاركة الحساب أو أكواد التفعيل مع الآخرين.'],
      ['التلاعب', 'استخدام برامج آلية أو أدوات تزيّف معرّف الجهاز أو تتلاعب بالنظام أو بنتائج الاختبارات.'],
      ['محتوى مخالف', 'رفع أي محتوى مخالف للقانون أو مسيء أو ينتهك حقوق الآخرين.'],
    ],
    after: 'يحق لنا إيقاف الحساب أو إنهاء الخدمة نهائياً دون سابق إنذار عند اكتشاف أي مخالفة.',
  },
  {
    icon: <UploadIcon />,
    title: 'المحتوى الذي ترفعه',
    paragraphs: [
      'قد تقوم برفع صورة شخصية أو حلول واجبات أو ملفات أخرى. أنت المسؤول عن هذا المحتوى وتقر بأن لك الحق في رفعه.',
      'تمنحنا ترخيصاً محدوداً لاستضافة هذا المحتوى وعرضه للمدرس المختص لغرض تقديم الخدمة فقط. ونحتفظ بالحق في حذف أي محتوى مخالف لهذه الشروط.',
    ],
  },
  {
    icon: <CheckSquareIcon />,
    title: 'الاختبارات والبطاقات التعليمية والمزايا',
    items: [
      ['الاختبارات', 'يجب أداء الاختبارات بشكل فردي ودون مساعدة غير مصرح بها. وقد يحدد المدرس موعد نشر الدرجات.'],
      ['البطاقات التعليمية', 'مخصصة لأغراض المذاكرة الشخصية، وتخضع لنفس قواعد حماية المحتوى.'],
      ['المزايا الترويجية', 'قد تتيح المنصة مزايا ترويجية (مثل عجلة الحظ) تخضع لشروطها الخاصة، ويحق للإدارة تعديلها أو إيقافها أو استبعاد أي مشاركة يُشتبه في التلاعب بها.'],
    ],
  },
  {
    icon: <BellIcon />,
    title: 'الإشعارات',
    paragraphs: [
      'نرسل إليك إشعارات بخصوص مواعيد الامتحانات والدروس الجديدة وحالة التحميل والتحديثات المهمة. يمكنك إيقافها من إعدادات جهازك، مع العلم أن ذلك قد يفوّتك تنبيهات مهمة.',
    ],
  },
  {
    icon: <CloudIcon />,
    title: 'خدمات الطرف الثالث',
    paragraphs: [
      'يعتمد التطبيق على مزوّدي خدمات موثوقين (مثل Supabase وFirebase وخدمات استضافة وبث الفيديو). قد تسري على هذه الخدمات شروط وسياسات خاصة بها، ولا نتحمل مسؤولية أي انقطاع أو عطل ينشأ من جهتها.',
    ],
  },
  {
    icon: <InfoIcon />,
    title: 'توفر الخدمة وإخلاء المسؤولية',
    items: [
      ['الخدمة «كما هي»', 'نسعى لتقديم تجربة مستقرة، لكننا لا نضمن خلو التطبيق من الانقطاع أو الأخطاء أو أن يعمل بشكل صحيح على كل الأجهزة، خصوصاً الأجهزة المعدّلة.'],
      ['النتائج الدراسية', 'المحتوى مقدم لأغراض تعليمية، ولا نضمن تحقيق نتائج أو درجات محددة.'],
      ['حدود المسؤولية', 'إلى الحد الذي يسمح به القانون، لا نتحمل مسؤولية الأضرار الناتجة عن سوء استخدامك للتطبيق أو مخالفتك لهذه الشروط.'],
    ],
  },
  {
    icon: <AlertIcon />,
    title: 'إنهاء الحساب وحذفه',
    variant: 'danger-zone',
    paragraphs: [
      'يمكننا تعليق حسابك أو إنهاؤه عند مخالفة هذه الشروط. كما يحق لك طلب حذف حسابك في أي وقت.',
    ],
    steps: {
      title: 'كيفية حذف حسابك:',
      list: [
        'انتقل إلى صفحة "حسابي" داخل التطبيق.',
        'اضغط على خيار "إعدادات الحساب" ثم "حذف الحساب".',
        'سيتم مسح بياناتك نهائياً ولن يمكن استرجاعها، وستفقد الوصول إلى المحتوى المرتبط بحسابك.',
      ],
    },
  },
  {
    icon: <RefreshIcon />,
    title: 'تعديل الشروط',
    paragraphs: [
      'قد نقوم بتحديث هذه الشروط من وقت لآخر. سنعرض النسخة المحدّثة في هذه الصفحة مع تعديل تاريخ آخر تحديث، واستمرارك في استخدام التطبيق بعد التعديل يعني موافقتك على الشروط الجديدة.',
    ],
  },
  {
    icon: <ScaleIcon />,
    title: 'القانون الواجب التطبيق',
    paragraphs: [
      'تخضع هذه الشروط وتُفسَّر وفقاً لقوانين جمهورية مصر العربية. وفي حال نشوء أي خلاف، نشجعك على التواصل مع الدعم الفني أولاً لمحاولة حله ودياً، وإلا فتختص المحاكم المصرية المختصة بنظره.',
    ],
  },
];

export default function TermsOfService() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // إزالة خلفية الـ body الزرقاء القادمة من globals.css لضمان تطبيق السمة الجديدة
    document.body.style.backgroundColor = 'transparent';

    const savedTheme = localStorage.getItem('medaad_theme');
    if (savedTheme) {
      setIsDark(savedTheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newVal = !isDark;
    setIsDark(newVal);
    localStorage.setItem('medaad_theme', newVal ? 'dark' : 'light');
  };

  return (
    <div className={`policy-layout ${isDark ? 'dark' : 'light'}`}>
      <Head>
        <title>الشروط والأحكام | تطبيق مداد</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="شروط الاستخدام والأحكام الخاصة بتطبيق مداد التعليمي" />
      </Head>

      {/* زر تبديل المظهر */}
      <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="تبديل المظهر">
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* خلفية جمالية */}
      <div className="bg-shape shape-1"></div>
      <div className="bg-shape shape-2"></div>

      <div className="policy-container">

        <header className="policy-header">
          <div className="logo-wrap">
             <img src="/medaad-logo.png" alt="مداد" className="brand-logo" onError={(e) => e.target.style.display = 'none'} />
             <div className="logo-fallback">مداد</div>
          </div>
          <h1>الشروط والأحكام</h1>
          <p className="last-updated">آخر تحديث: {LAST_UPDATED}</p>
        </header>

        <div className="policy-grid">

          {SECTIONS.map((s, i) => (
            <section
              key={s.title}
              className={`policy-card ${s.variant || ''}`}
              style={{ animationDelay: `${Math.min(i + 1, 8) * 0.08}s` }}
            >
              <h2>
                <span className={`icon-wrap ${s.variant === 'danger-zone' ? 'danger-icon' : ''}`}>{s.icon}</span>
                {s.title}
              </h2>

              {s.paragraphs && s.paragraphs.map((p, idx) => <p key={idx}>{p}</p>)}

              {s.items && (
                <ul className="policy-list">
                  {s.items.map(([label, text]) => (
                    <li key={label}><strong>{label}:</strong> {text}</li>
                  ))}
                </ul>
              )}

              {s.after && <p className="after-note">{s.after}</p>}

              {s.steps && (
                <div className="deletion-instructions">
                  <strong>{s.steps.title}</strong>
                  <ol>
                    {s.steps.list.map((step, idx) => <li key={idx}>{step}</li>)}
                  </ol>
                </div>
              )}
            </section>
          ))}

          {/* الدعم الفني */}
          <section className="policy-card contact-card" style={{ animationDelay: '0.7s' }}>
            <h2>
              <span className="icon-wrap"><MessageIcon /></span>
              تواصل معنا
            </h2>
            <p>هل لديك استفسار حول هذه الشروط أو واجهتك مشكلة؟ نحن هنا لمساعدتك.</p>

            <a
              href="https://wa.me/201559725404"
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-btn"
            >
              <MessageIcon />
              تواصل معنا عبر واتساب
            </a>
          </section>

        </div>

        <footer className="policy-footer">
          <div className="footer-links">
            <Link href="/privacy-policy" className="inline-link">سياسة الخصوصية</Link>
          </div>
          جميع الحقوق محفوظة © {new Date().getFullYear()} منصة مداد التعليمية
        </footer>
      </div>

      <style jsx global>{`
        /* ── THEME VARIABLES ── */
        .policy-layout.dark {
          --bg-base:        #121212;
          --bg-surface:     #1a1a1a;
          --bg-elevated:    #242424;
          --border:         #333333;
          --border-accent:  #6b5e43;
          --gold:           #bda878;
          --gold-hover:     #d6c598;
          --gold-dim:       rgba(189,168,120,0.15);
          --text-primary:   #f5f5f5;
          --text-secondary: #a3a3a3;
          --text-muted:     #737373;
          --danger-bg:      rgba(239, 68, 68, 0.1);
          --danger-border:  rgba(239, 68, 68, 0.2);
          --danger-text:    #fca5a5;
          --bg-shape:       rgba(189,168,120,0.06);
          --shadow:         0 10px 30px rgba(0,0,0,0.5);
        }

        .policy-layout.light {
          --bg-base:        #f8f9fa;
          --bg-surface:     #ffffff;
          --bg-elevated:    #f1f5f9;
          --border:         #e2e8f0;
          --border-accent:  #bda878;
          --gold:           #a6905d;
          --gold-hover:     #8a7649;
          --gold-dim:       rgba(166,144,93,0.12);
          --text-primary:   #0f172a;
          --text-secondary: #475569;
          --text-muted:     #94a3b8;
          --danger-bg:      rgba(220, 38, 38, 0.05);
          --danger-border:  rgba(220, 38, 38, 0.2);
          --danger-text:    #dc2626;
          --bg-shape:       rgba(166,144,93,0.08);
          --shadow:         0 10px 30px rgba(0,0,0,0.05);
        }

        body {
          margin: 0;
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          direction: rtl;
        }

        /* ── LAYOUT (FIX FOR BLUE BACKGROUND) ── */
        .policy-layout {
          min-height: 100vh;
          width: 100%;
          background-color: var(--bg-base) !important;
          color: var(--text-primary);
          transition: background 0.4s ease, color 0.4s ease;
          position: relative;
          overflow-x: hidden;
          padding-bottom: 20px;
        }

        /* تغطية كامل الشاشة إذا كان هناك عناصر أب زرقاء */
        #__next {
           background-color: transparent !important;
        }

        /* ── BACKGROUND ANIMATIONS ── */
        .bg-shape {
          position: fixed;
          border-radius: 50%;
          background: var(--bg-shape);
          filter: blur(100px);
          z-index: 0;
          animation: float 10s infinite ease-in-out alternate;
          pointer-events: none;
        }
        .shape-1 { width: 600px; height: 600px; top: -150px; right: -150px; }
        .shape-2 { width: 500px; height: 500px; bottom: -100px; left: -150px; animation-delay: -5s; }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, 40px) scale(1.1); }
        }

        /* ── THEME TOGGLE ── */
        .theme-toggle-btn {
          position: fixed;
          top: 25px; left: 25px;
          background: var(--bg-surface);
          color: var(--gold);
          border: 1px solid var(--border);
          width: 48px; height: 48px;
          border-radius: 50%;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.3s;
          z-index: 50;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .theme-toggle-btn:hover {
          transform: rotate(15deg) scale(1.05);
          border-color: var(--gold);
          background: var(--gold-dim);
        }

        /* ── CONTAINER ── */
        .policy-container {
          max-width: 850px;
          margin: 0 auto;
          padding: 60px 20px;
          position: relative;
          z-index: 2;
        }

        /* ── HEADER ── */
        .policy-header {
          text-align: center;
          margin-bottom: 50px;
          animation: fadeDown 0.8s ease forwards;
        }

        .logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 25px;
        }
        .brand-logo {
          max-height: 90px;
          object-fit: contain;
          filter: drop-shadow(0 8px 15px rgba(0,0,0,0.1));
        }
        .logo-fallback {
          font-size: 2.5rem;
          font-weight: 900;
          color: var(--gold);
          letter-spacing: 1px;
          display: none;
        }
        img.brand-logo[style*="display: none"] + .logo-fallback {
          display: block;
        }

        .policy-header h1 {
          font-size: 2.4rem;
          font-weight: 800;
          margin: 0 0 10px 0;
          color: var(--text-primary);
        }
        .last-updated {
          color: var(--text-secondary);
          font-size: 1rem;
          margin: 0;
          font-weight: 600;
        }

        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── GRID & CARDS ── */
        .policy-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .policy-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 35px 40px;
          box-shadow: var(--shadow);
          transition: transform 0.3s ease, border-color 0.3s ease;
          opacity: 0;
          animation: fadeUp 0.6s ease forwards;
        }
        .policy-card:hover {
          transform: translateY(-3px);
          border-color: var(--border-accent);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .policy-card h2 {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 0 0 20px 0;
          font-size: 1.4rem;
          color: var(--text-primary);
        }

        .icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 44px; height: 44px;
          background: var(--gold-dim);
          border-radius: 12px;
          color: var(--gold);
        }

        .policy-card p {
          line-height: 1.8;
          font-size: 1.05rem;
          color: var(--text-secondary);
          margin: 0 0 15px 0;
        }
        .policy-card p:last-child { margin: 0; }
        .policy-card p strong { color: var(--text-primary); }

        .after-note {
          margin-top: 18px !important;
          padding-top: 16px;
          border-top: 1px dashed var(--danger-border);
          color: var(--text-primary) !important;
          font-weight: 600;
        }

        .policy-list {
          margin: 0 0 15px 0;
          padding-right: 20px;
          color: var(--text-secondary);
        }
        .policy-list:last-child { margin-bottom: 0; }
        .policy-list li {
          margin-bottom: 12px;
          line-height: 1.7;
          font-size: 1.05rem;
        }
        .policy-list li strong {
          color: var(--text-primary);
        }

        .inline-link {
          color: var(--gold);
          font-weight: 700;
          text-decoration: none;
          border-bottom: 1px dashed var(--border-accent);
          transition: color 0.2s, border-color 0.2s;
        }
        .inline-link:hover { color: var(--gold-hover); border-color: var(--gold-hover); }

        /* ── DANGER ZONE ── */
        .danger-zone {
          border-color: var(--danger-border);
          background: var(--bg-surface);
          position: relative;
          overflow: hidden;
        }
        .danger-zone::before {
          content: '';
          position: absolute; top: 0; right: 0; width: 6px; height: 100%;
          background: var(--danger-text);
        }
        .danger-zone h2 { color: var(--danger-text); }
        .danger-icon { background: var(--danger-bg); color: var(--danger-text); }

        .deletion-instructions {
          margin-top: 20px;
          background: var(--bg-elevated);
          padding: 20px;
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .deletion-instructions strong {
          display: block;
          margin-bottom: 12px;
          color: var(--text-primary);
        }
        .deletion-instructions ol {
          margin: 0; padding-right: 25px;
          color: var(--text-secondary);
        }
        .deletion-instructions li {
          margin-bottom: 8px; line-height: 1.6;
        }

        /* ── CONTACT SECTION ── */
        .contact-card {
          text-align: center;
          display: flex; flex-direction: column; align-items: center;
        }
        .contact-card h2 { justify-content: center; width: 100%; color: var(--text-primary); }
        .contact-card .icon-wrap { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); }

        .whatsapp-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #25D366;
          color: #ffffff;
          padding: 16px 32px;
          border-radius: 14px;
          text-decoration: none;
          font-weight: bold;
          font-size: 1.1rem;
          margin-top: 20px;
          transition: all 0.3s ease;
          box-shadow: 0 8px 20px rgba(37, 211, 102, 0.25);
        }
        .whatsapp-btn:hover {
          background: #22c55e;
          transform: translateY(-3px);
          box-shadow: 0 12px 25px rgba(37, 211, 102, 0.35);
        }

        /* ── FOOTER ── */
        .policy-footer {
          text-align: center;
          margin-top: 50px;
          padding-top: 30px;
          border-top: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 0.95rem;
          font-weight: 600;
        }
        .policy-footer .footer-links { margin-bottom: 14px; }

        /* ── ACCESSIBILITY ── */
        .inline-link:focus-visible,
        .whatsapp-btn:focus-visible,
        .theme-toggle-btn:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .policy-card, .policy-header, .bg-shape { animation: none !important; opacity: 1; }
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
          .policy-container { padding: 40px 15px; }
          .policy-card { padding: 25px; }
          .policy-card h2 { font-size: 1.25rem; }
          .policy-header h1 { font-size: 2rem; }
          .theme-toggle-btn { top: 15px; left: 15px; width: 42px; height: 42px; }
        }
      `}</style>
    </div>
  );
}
