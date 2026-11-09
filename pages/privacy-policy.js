import { useState, useEffect } from 'react';
import Head from 'next/head';

// ─── SVG Icons ──────────────────────────────────────────
const ShieldIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>);
const FolderIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>);
const LockIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>);
const CloudIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>);
const AlertIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>);
const SecurityIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>);
const MessageIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>);
const SunIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>);
const MoonIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>);

export default function PrivacyPolicy() {
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
        <title>سياسة الخصوصية | تطبيق مداد</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="سياسة الخصوصية وشروط الاستخدام لتطبيق مداد التعليمي" />
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
          <h1>سياسة الخصوصية</h1>
          <p className="last-updated">آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</p>
        </header>

        <div className="policy-grid">
          
          {/* مقدمة */}
          <section className="policy-card">
            <h2>
              <span className="icon-wrap"><ShieldIcon /></span> 
              مقدمة
            </h2>
            <p>
              نحن في <strong>مداد (Medaad)</strong> نلتزم بحماية خصوصيتك. توضح هذه الوثيقة بشفافية كيفية تعاملنا مع بياناتك وفقاً لسياسات متاجر التطبيقات. باستخدامك للتطبيق، فإنك توافق على الممارسات الموضحة أدناه.
            </p>
          </section>

          {/* البيانات المستخدمة */}
          <section className="policy-card">
            <h2>
              <span className="icon-wrap"><FolderIcon /></span> 
              البيانات المستخدمة
            </h2>
            <ul className="policy-list">
              <li>
                <strong>معلومات الحساب:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، والصورة الشخصية (اختياري) لإنشاء وإدارة حسابك الدراسي.
              </li>
              <li>
                <strong>البيانات الأكاديمية:</strong> نتائج الاختبارات، التقدم في الدورات، والملفات التي تقوم برفعها.
              </li>
              <li>
                <strong>معلومات الجهاز:</strong> نجمع معرف الجهاز (Device ID) لضمان أمان الحساب ومنع الاستخدام غير المصرح به.
              </li>
            </ul>
          </section>

          {/* الصلاحيات */}
          <section className="policy-card">
            <h2>
              <span className="icon-wrap"><LockIcon /></span> 
              الصلاحيات المطلوبة
            </h2>
            <ul className="policy-list">
              <li><strong>الكاميرا ومعرض الصور:</strong> لرفع صورة شخصية أو إرسال حلول الواجبات.</li>
              <li><strong>التخزين (Storage):</strong> لتحميل ملفات الدروس ومشاهدتها دون إنترنت.</li>
              <li><strong>الإشعارات:</strong> لتنبيهك بمواعيد الامتحانات والدروس الجديدة.</li>
            </ul>
          </section>

          {/* خدمات الطرف الثالث */}
          <section className="policy-card">
            <h2>
              <span className="icon-wrap"><CloudIcon /></span> 
              خدمات الطرف الثالث
            </h2>
            <p>نستخدم خدمات موثوقة قد تجمع بعض البيانات وفقاً لسياساتها:</p>
            <ul className="policy-list">
              <li><strong>Supabase:</strong> لقاعدة البيانات والمصادقة وتخزين البيانات.</li>
              <li><strong>Firebase:</strong> لإرسال الإشعارات والتحليلات الأساسية.</li>
            </ul>
          </section>

          {/* حذف الحساب */}
          <section className="policy-card danger-zone">
            <h2>
              <span className="icon-wrap danger-icon"><AlertIcon /></span> 
              حذف البيانات والحساب
            </h2>
            <p>لديك الحق الكامل في طلب حذف حسابك وجميع بياناتك الأكاديمية والشخصية في أي وقت.</p>
            <div className="deletion-instructions">
              <strong>كيفية طلب الحذف:</strong>
              <ol>
                <li>انتقل إلى صفحة "حسابي" داخل التطبيق.</li>
                <li>اضغط على خيار "إعدادات الحساب" ثم "حذف الحساب".</li>
                <li>سيتم مسح بياناتك نهائياً ولن يمكن استرجاعها بعد ذلك.</li>
              </ol>
            </div>
          </section>

          {/* الأمن */}
          <section className="policy-card">
            <h2>
              <span className="icon-wrap"><SecurityIcon /></span> 
              أمن المعلومات
            </h2>
            <p>
              نستخدم أحدث تقنيات التشفير المتقدمة لحماية بياناتك أثناء النقل والتخزين، مما يضمن أقصى درجات الخصوصية والأمان لملفك الأكاديمي.
            </p>
          </section>

          {/* الدعم الفني */}
          <section className="policy-card contact-card">
            <h2>
              <span className="icon-wrap"><MessageIcon /></span> 
              الدعم الفني
            </h2>
            <p>هل واجهت مشكلة أو لديك استفسار؟ نحن هنا لمساعدتك على مدار الساعة.</p>
            
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

        /* تأخير تدريجي للأنيميشن */
        .policy-card:nth-child(1) { animation-delay: 0.1s; }
        .policy-card:nth-child(2) { animation-delay: 0.2s; }
        .policy-card:nth-child(3) { animation-delay: 0.3s; }
        .policy-card:nth-child(4) { animation-delay: 0.4s; }
        .policy-card:nth-child(5) { animation-delay: 0.5s; }
        .policy-card:nth-child(6) { animation-delay: 0.6s; }
        .policy-card:nth-child(7) { animation-delay: 0.7s; }

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

        .policy-list {
          margin: 0;
          padding-right: 20px;
          color: var(--text-secondary);
        }
        .policy-list li {
          margin-bottom: 12px;
          line-height: 1.7;
          font-size: 1.05rem;
        }
        .policy-list li strong {
          color: var(--text-primary);
        }

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

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
          .policy-container { padding: 40px 15px; }
          .policy-card { padding: 25px; }
          .policy-header h1 { font-size: 2rem; }
          .theme-toggle-btn { top: 15px; left: 15px; width: 42px; height: 42px; }
        }
      `}</style>
    </div>
  );
}
