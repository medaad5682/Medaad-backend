import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

// ─── الأيقونات الاحترافية للبطاقات ────────────────────────────────
const Icons = {
  requests: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>,
  students: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  courses: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>,
  earnings: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>,
  eye: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
};

export default function TeacherDashboard() {
  const router = useRouter();
  
  // الحالة الافتراضية
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── بيانات المشاهدات (Supabase فقط — بدون Firebase) ──
  const [watchData, setWatchData] = useState(null);
  const [watchLoading, setWatchLoading] = useState(true);

  // ── تتبع الوضع الليلي/النهاري لتلوين الرسم البياني ──
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('medaad_theme');
    setIsDark(saved !== 'light');
    const interval = setInterval(() => {
      const current = localStorage.getItem('medaad_theme');
      setIsDark(current !== 'light');
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // جلب الإحصائيات
    fetch('/api/dashboard/teacher/stats')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json);
        } else {
          console.error("Failed to load stats:", json.error);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Network error:", err);
        setLoading(false);
      });

    // جلب إحصائيات المشاهدات اليومية (آخر 7 أيام)
    fetch('/api/dashboard/teacher/watch-stats')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setWatchData(json);
        } else {
          console.error("Failed to load watch stats:", json.error);
        }
        setWatchLoading(false);
      })
      .catch(err => {
        console.error("Network error (watch-stats):", err);
        setWatchLoading(false);
      });
  }, []);

  // ============================================================
  // استخراج البيانات لتتوافق مع الـ API response
  // ============================================================
  
  // 1. استخدام summary بدلاً من stats
  const stats = data?.summary || { 
    students: 0, 
    earnings: 0, 
    courses: 0, 
    pending: 0 
  };
  
  // 2. استخدام details بدلاً من charts
  const courseDetails = data?.details?.courses || [];
  const subjectDetails = data?.details?.subjects || [];

  // 3. بيانات المشاهدات والنشاط
  const todayWatches = watchData?.today || 0;
  const todayActiveUsers = watchData?.todayActiveUsers || 0;
  const watchChart = watchData?.chart || [];

  // ألوان الرسم البياني حسب الوضع الليلي/النهاري
  const goldColor  = isDark ? '#c9a84c' : '#b8903a';
  const blueColor  = '#38bdf8';
  const chartGrid  = isDark ? '#2c2818' : '#ddd4a8';
  const chartAxis  = isDark ? '#a89f7a' : '#9e8850';
  const tooltipBg  = isDark ? '#1a1710' : '#ffffff';
  const tooltipBdr = isDark ? '#3a3420' : '#ddd4a8';

  return (
    <TeacherLayout title="الرئيسية">
      <Head><title>الرئيسية | لوحة المدرس</title></Head>

      <div className="dash-container">
        {/* ── PAGE HEADER ── */}
        <header className="page-header">
          <div>
            <h1 className="page-title">👋 مرحباً بك في لوحة القيادة</h1>
            <p className="page-sub">إليك نظرة عامة على أداء المحتوى والطلاب الخاص بك.</p>
          </div>
          <div className="date-badge">
            {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>جاري تحميل الإحصائيات...</span>
          </div>
        ) : (
          <>
            {/* ── STAT CARDS GRID ── */}
            <div className="stats-grid">
              
              {/* بطاقة الطلبات */}
              <div className="stat-card clickable-card" onClick={() => router.push('/admin/teacher/requests')}>
                <div className="stat-icon alert-icon">{Icons.requests}</div>
                <div className="stat-info">
                  <div className="stat-label">الطلبات المعلقة</div>
                  <div className="stat-value">{stats.pending}</div>
                  <div className="stat-desc">بانتظار المراجعة</div>
                </div>
                <div className="stat-glow" />
              </div>

              {/* بطاقة الطلاب */}
              <div className="stat-card clickable-card" onClick={() => router.push('/admin/teacher/students')}>
                <div className="stat-icon">{Icons.students}</div>
                <div className="stat-info">
                  <div className="stat-label">إجمالي الطلاب</div>
                  <div className="stat-value">{stats.students}</div>
                  <div className="stat-desc">طالب مسجل</div>
                </div>
                <div className="stat-glow" />
              </div>

              {/* بطاقة الكورسات */}
              <div className="stat-card clickable-card" onClick={() => router.push('/admin/teacher/content')}>
                <div className="stat-icon success-icon">{Icons.courses}</div>
                <div className="stat-info">
                  <div className="stat-label">الكورسات والمحتوى</div>
                  <div className="stat-value">{stats.courses}</div>
                  <div className="stat-desc">كورس / مادة فعالة</div>
                </div>
                <div className="stat-glow" />
              </div>

              {/* بطاقة الأرباح */}
              <div className="stat-card">
                <div className="stat-icon highlight-icon">{Icons.earnings}</div>
                <div className="stat-info">
                  <div className="stat-label">إجمالي الأرباح</div>
                  <div className="stat-value">{`${stats.earnings.toLocaleString()} ج.م`}</div>
                  <div className="stat-desc">أرباحك المباشرة</div>
                </div>
                <div className="stat-glow" />
              </div>

              {/* بطاقة مشاهدات اليوم */}
              <div className="stat-card">
                <div className="stat-icon watch-icon">{Icons.eye}</div>
                <div className="stat-info">
                  <div className="stat-label">مشاهدات اليوم</div>
                  <div className="stat-value">{watchLoading ? '…' : todayWatches.toLocaleString()}</div>
                  <div className="stat-desc">مشاهدة لفيديوهاتك اليوم</div>
                </div>
                <div className="stat-glow" />
              </div>

              {/* بطاقة الطلاب النشطين اليوم */}
              <div className="stat-card">
                <div className="stat-icon active-icon">{Icons.students}</div>
                <div className="stat-info">
                  <div className="stat-label">نشطون اليوم</div>
                  <div className="stat-value">{watchLoading ? '…' : todayActiveUsers.toLocaleString()}</div>
                  <div className="stat-desc">طالب فتح التطبيق اليوم</div>
                </div>
                <div className="stat-glow" />
              </div>

            </div>

            {/* ── مخطط المشاهدات والمستخدمين النشطين لآخر 7 أيام ── */}
            <div className="panel chart-panel">
              <div className="panel-head">
                <h3>👁️ المشاهدات والنشاط لآخر 7 أيام</h3>
              </div>
              <div className="chart-body">
                {watchLoading ? (
                  <div className="chart-loading">جاري تحميل بيانات المشاهدات...</div>
                ) : watchChart.length === 0 ? (
                  <div className="chart-loading">لا توجد بيانات مشاهدات بعد</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={watchChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="watchGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={goldColor} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={goldColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                      <XAxis dataKey="name" stroke={chartAxis} tick={{ fontSize: 11 }} />
                      <YAxis stroke={chartAxis} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: '10px', color: isDark ? '#f5f0e0' : '#1a1508' }}
                        cursor={{ stroke: goldColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                        formatter={(value, key) => [
                          `${value.toLocaleString()} ${key === 'activeUsers' ? 'مستخدم' : 'مشاهدة'}`,
                          key === 'activeUsers' ? 'المستخدمون النشطون' : 'المشاهدات'
                        ]}
                      />
                      <Legend
                        formatter={(value) => (value === 'activeUsers' ? 'المستخدمون النشطون' : 'المشاهدات')}
                        wrapperStyle={{ fontSize: '0.8rem' }}
                      />
                      <Area type="monotone" dataKey="watches" name="watches" stroke={goldColor} strokeWidth={2.5} fill="url(#watchGradient)" />
                      <Line type="monotone" dataKey="activeUsers" name="activeUsers" stroke={blueColor} strokeWidth={2.5} dot={{ r: 3, fill: blueColor }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── DETAILS PANELS ── */}
            {(courseDetails.length > 0 || subjectDetails.length > 0) && (
              <div className="details-grid">
                
                {courseDetails.length > 0 && (
                  <div className="panel">
                    <div className="panel-head">
                      <h3>📊 أداء الكورسات</h3>
                    </div>
                    <div className="list-container">
                      {courseDetails.map((c, i) => (
                        <div key={i} className="list-row">
                          <span className="row-title">{c.title}</span>
                          <span className="badge primary">{c.count} طالب</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {subjectDetails.length > 0 && (
                  <div className="panel">
                    <div className="panel-head">
                      <h3>📑 أداء المواد</h3>
                    </div>
                    <div className="list-container">
                      {subjectDetails.map((s, i) => (
                        <div key={i} className="list-row">
                          <span className="row-title">{s.title}</span>
                          <span className="badge secondary">{s.count} طالب</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .dash-container { padding-bottom: 50px; }

        /* ── PAGE HEADER ── */
        .page-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 32px;
          padding-bottom: 22px;
          border-bottom: 1px solid var(--border);
        }
        .page-title { margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.65rem; font-weight: 800; }
        .page-sub { margin: 0; color: var(--text-secondary); font-size: 0.95rem; }
        .date-badge {
          background: var(--gold-dimmer);
          color: var(--gold);
          padding: 8px 18px;
          border-radius: 24px;
          border: 1px solid var(--border-accent);
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
        }

        /* ── LOADING ── */
        .loading-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; color: var(--gold); }
        .spinner { width: 44px; height: 44px; border: 4px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── STAT CARDS ── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 35px;
        }
        .stat-card {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 22px 20px;
          display: flex; align-items: center; gap: 16px;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          overflow: hidden;
        }
        .clickable-card { cursor: pointer; }
        .clickable-card:hover {
          transform: translateY(-5px);
          border-color: var(--border-accent);
          box-shadow: 0 8px 24px rgba(201,168,76,0.15);
          background: var(--bg-hover);
        }
        
        .stat-icon {
          width: 52px; height: 52px;
          background: var(--gold-dim);
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          color: var(--gold);
          flex-shrink: 0;
          border: 1px solid var(--border-accent);
        }
        .stat-icon.alert-icon { color: #facc15; border-color: rgba(250,204,21,0.4); background: rgba(250,204,21,0.1); }
        .stat-icon.success-icon { color: #4ade80; border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.1); }
        .stat-icon.highlight-icon { color: #f472b6; border-color: rgba(244,114,182,0.4); background: rgba(244,114,182,0.1); }
        .stat-icon.watch-icon { color: #38bdf8; border-color: rgba(56,189,248,0.4); background: rgba(56,189,248,0.1); }
        .stat-icon.active-icon { color: #4ade80; border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.1); }

        .stat-info { flex: 1; min-width: 0; }
        .stat-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; }
        .stat-value { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
        .stat-desc { font-size: 0.75rem; color: var(--text-secondary); }
        
        .stat-glow {
          position: absolute; top: -30px; left: -30px;
          width: 80px; height: 80px;
          background: radial-gradient(circle, rgba(201,168,76,0.1), transparent 70%);
          pointer-events: none;
        }

        /* ── CHART PANEL (مشاهدات آخر 7 أيام) ── */
        .chart-panel { margin-bottom: 35px; }
        .chart-body {
          height: 260px;
          padding: 18px 14px 8px 14px;
        }
        .chart-loading {
          height: 100%;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        /* ── DETAILS PANELS ── */
        .details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 24px;
        }
        .panel {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
        }
        .panel-head {
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-elevated);
        }
        .panel-head h3 { margin: 0; color: var(--text-primary); font-size: 1.05rem; font-weight: 700; }
        
        .list-container {
          padding: 10px 15px;
          max-height: 320px;
          overflow-y: auto;
        }
        .list-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 10px;
          border-bottom: 1px solid var(--border);
          transition: background 0.2s;
          border-radius: 8px;
        }
        .list-row:last-child { border-bottom: none; }
        .list-row:hover { background: var(--gold-dimmer); }
        
        .row-title { color: var(--text-primary); font-weight: 600; font-size: 0.9rem; }
        
        .badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .badge.primary { background: var(--gold-dim); color: var(--gold); border: 1px solid var(--border-accent); }
        .badge.secondary { background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }

        /* ── SCROLLBAR FOR LISTS ── */
        .list-container::-webkit-scrollbar { width: 5px; }
        .list-container::-webkit-scrollbar-track { background: transparent; }
        .list-container::-webkit-scrollbar-thumb { background: var(--border-accent); border-radius: 4px; }

        /* ── RESPONSIVE ── */
        @media (max-width: 600px) {
          .page-header { flex-direction: column; align-items: flex-start; gap: 14px; }
          .date-badge { display: none; }
          .stats-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </TeacherLayout>
  );
}
