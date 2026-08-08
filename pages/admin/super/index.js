import Head from 'next/head';
import { useState, useEffect, useMemo } from 'react';
import SuperLayout from '../../../components/SuperLayout';
import { BarChart, Bar, ComposedChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

const Icons = {
  users: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  money: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  course: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  activity: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  pulse: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>,
  teachers: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  eye: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
};

export default function SuperDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0, totalTeachers: 0, totalRevenue: 0,
    activeCourses: 0, activeUsersToday: 0,
    recentUsers: [], chartData: [], activeUsersChartData: []
  });
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);

  // ── بيانات المشاهدات (كل المدرسين — Firebase) ──
  const [watchData, setWatchData] = useState(null);
  const [watchLoading, setWatchLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('medaad_theme');
    setIsDark(saved !== 'light');
    // Also watch for theme changes
    const interval = setInterval(() => {
      const current = localStorage.getItem('medaad_theme');
      setIsDark(current !== 'light');
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/super/stats');
        if (res.ok) { const data = await res.json(); setStats(data); }
        else console.error('فشل جلب الإحصائيات:', res.status);
      } catch (error) { console.error('Network error', error); }
      finally { setLoading(false); }
    };
    fetchStats();

    // ✅ إحصائيات المشاهدات لكل المنصة (بدون تقييد بمدرس معين)
    const fetchWatchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/super/watch-stats');
        if (res.ok) { const data = await res.json(); setWatchData(data); }
        else console.error('فشل جلب إحصائيات المشاهدات:', res.status);
      } catch (error) { console.error('Network error (watch-stats)', error); }
      finally { setWatchLoading(false); }
    };
    fetchWatchStats();
  }, []);

  const goldColor   = isDark ? '#c9a84c' : '#b8903a';
  const goldLight   = isDark ? '#e8c96a' : '#d4a843';
  const usersColor  = isDark ? '#38bdf8' : '#0ea5e9';
  const chartGrid   = isDark ? '#2c2818' : '#ddd4a8';
  const chartAxis   = isDark ? '#a89f7a' : '#9e8850';
  const tooltipBg   = isDark ? '#1a1710' : '#ffffff';
  const tooltipBdr  = isDark ? '#3a3420' : '#ddd4a8';
  const areaColor   = isDark ? '#c9a84c' : '#b8903a';

  // ✅ دمج مخطط المشاهدات (كل المنصة) مع مخطط النشاط في مصفوفة واحدة
  // بنفس الأيام السبعة، مربوطة بمفتاح date (نفس منطق لوحة المدرس)
  const watchChart = watchData?.chart || [];
  const activeUsersChart = stats.activeUsersChartData || [];
  const combinedChart = useMemo(() => {
    const map = new Map();
    watchChart.forEach(item => {
      map.set(item.date, { name: item.name, date: item.date, watches: item.watches || 0, users: 0 });
    });
    activeUsersChart.forEach(item => {
      const existing = map.get(item.date);
      if (existing) {
        existing.users = item.users || 0;
      } else {
        map.set(item.date, { name: item.name, date: item.date, watches: 0, users: item.users || 0 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [watchChart, activeUsersChart]);
  const activityChartLoading = loading || watchLoading;

  const statCards = [
    { label: 'الطلاب المسجلين',  value: stats.totalUsers || 0,                          icon: Icons.users,    key: 'users' },
    { label: 'النشطون اليوم',    value: stats.activeUsersToday || 0,                    icon: Icons.pulse,    key: 'pulse' },
    { label: 'مشاهدات اليوم',    value: watchLoading ? '…' : (watchData?.today || 0),   icon: Icons.eye,      key: 'eye' },
    { label: 'إجمالي الدخل',    value: `${(stats.totalRevenue || 0).toLocaleString()} ج.م`, icon: Icons.money, key: 'money' },
    { label: 'الكورسات النشطة',  value: stats.activeCourses || 0,                        icon: Icons.course,   key: 'course' },
    { label: 'عدد المدرسين',     value: stats.totalTeachers || 0,                        icon: Icons.teachers, key: 'teachers' },
  ];

  return (
    <SuperLayout>
      <Head><title>لوحة التحكم الرئيسية | مبداد</title></Head>

      <div className="dash">

        {/* ── PAGE HEADER ── */}
        <header className="page-header">
          <div>
            <h1 className="page-title">👋 مرحباً، المشرف العام</h1>
            <p className="page-sub">إليك نظرة عامة على أداء منصة مبداد اليوم.</p>
          </div>
          <div className="date-badge">
            {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>جاري تحميل البيانات...</span>
          </div>
        ) : (
          <>
            {/* ── STAT CARDS ── */}
            <div className="stats-grid">
              {statCards.map((card) => (
                <div key={card.key} className="stat-card">
                  <div className="stat-icon">{card.icon}</div>
                  <div className="stat-info">
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-value">{card.value}</div>
                  </div>
                  <div className="stat-glow" />
                </div>
              ))}
            </div>

            {/* ── CHARTS ── */}
            <div className="charts-row">
              <div className="chart-card">
                <div className="chart-card-header">
                  <h3>📊 نمو الإيرادات</h3>
                  <span className="chart-sub">آخر 7 أيام</span>
                </div>
                <div className="chart-wrap">
                  {stats.chartData?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.chartData} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="name" stroke={chartAxis} tick={{ fontSize: 11 }} />
                        <YAxis stroke={chartAxis} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: '10px', color: isDark ? '#f5f0e0' : '#1a1508' }} cursor={{ fill: `rgba(201,168,76,0.08)` }} />
                        <Bar dataKey="sales" fill={goldColor} radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-chart">لا توجد بيانات مبيعات في آخر 7 أيام</div>
                  )}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-header">
                  <h3>🚀 المشاهدات ونشاط المستخدمين</h3>
                  <span className="chart-sub">آخر 7 أيام</span>
                </div>
                <div className="chart-wrap">
                  {activityChartLoading ? (
                    <div className="empty-chart">جاري تحميل البيانات...</div>
                  ) : combinedChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={combinedChart}>
                        <defs>
                          <linearGradient id="watchGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={goldColor} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={goldColor} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={usersColor} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={usersColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="name" stroke={chartAxis} tick={{ fontSize: 11 }} />
                        <YAxis stroke={chartAxis} tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: '10px', color: isDark ? '#f5f0e0' : '#1a1508' }}
                          formatter={(value, name) => [
                            name === 'watches' ? `${value.toLocaleString()} مشاهدة` : `${value.toLocaleString()} مستخدم`,
                            name === 'watches' ? 'المشاهدات' : 'النشطون'
                          ]}
                        />
                        <Legend
                          formatter={(value) => value === 'watches' ? 'المشاهدات' : 'النشطون'}
                          wrapperStyle={{ fontSize: '12px', color: chartAxis }}
                        />
                        <Area type="monotone" dataKey="watches" name="watches" stroke={goldColor} strokeWidth={3} fillOpacity={1} fill="url(#watchGrad)" />
                        <Area type="monotone" dataKey="users" name="users" stroke={usersColor} strokeWidth={3} fillOpacity={1} fill="url(#usersGrad)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-chart">لا توجد بيانات نشاط متاحة</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── BOTTOM GRID ── */}
            <div className="bottom-grid">
              {/* Recent Users Table */}
              <div className="panel">
                <div className="panel-head">
                  <h3>🆕 أحدث التسجيلات</h3>
                  <button className="link-btn" onClick={() => window.location.href = '/admin/super/students'}>عرض الكل ←</button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th>الدور</th>
                        <th>تاريخ التسجيل</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentUsers?.length > 0 ? stats.recentUsers.map((user, i) => (
                        <tr key={i}>
                          <td>
                            <div className="user-cell">
                              <div className="avatar">{user.name ? user.name[0] : '?'}</div>
                              <span>{user.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${user.role === 'teacher' ? 'teacher' : 'student'}`}>
                              {user.role === 'teacher' ? 'مدرس' : 'طالب'}
                            </span>
                          </td>
                          <td>{user.date ? new Date(user.date).toLocaleDateString('ar-EG') : '-'}</td>
                          <td><span className="dot active" /> نشط</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="4" className="empty-row">لا توجد بيانات حديثة</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="panel actions-panel">
                <div className="panel-head">
                  <h3>⚡ إجراءات سريعة</h3>
                </div>
                <div className="quick-actions">
                  <button className="action-btn" onClick={() => window.location.href = '/admin/super/teachers'}>
                    <span className="action-icon">{Icons.users}</span>
                    <div>
                      <div className="action-title">إضافة مدرس جديد</div>
                      <div className="action-desc">إدارة فريق التدريس</div>
                    </div>
                  </button>
                  <button className="action-btn" onClick={() => window.location.href = '/admin/super/requests'}>
                    <span className="action-icon">{Icons.activity}</span>
                    <div>
                      <div className="action-title">مراجعة الطلبات</div>
                      <div className="action-desc">طلبات الاشتراك المعلّقة</div>
                    </div>
                  </button>
                  <button className="action-btn" onClick={() => window.location.href = '/admin/super/finance'}>
                    <span className="action-icon">{Icons.money}</span>
                    <div>
                      <div className="action-title">التقارير المالية</div>
                      <div className="action-desc">الإيرادات والمدفوعات</div>
                    </div>
                  </button>
                  <button className="action-btn" onClick={() => window.location.href = '/admin/super/notifications'}>
                    <span className="action-icon">📢</span>
                    <div>
                      <div className="action-title">إرسال إشعار</div>
                      <div className="action-desc">تواصل مع المستخدمين</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .dash { padding-bottom: 50px; }

        /* ── PAGE HEADER ── */
        .page-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 32px;
          padding-bottom: 22px;
          border-bottom: 1px solid var(--border);
        }
        .page-title { margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.75rem; font-weight: 800; }
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
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 18px;
          margin-bottom: 28px;
        }
        .stat-card {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px 18px;
          display: flex; align-items: center; gap: 14px;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          overflow: hidden;
        }
        .stat-card:hover {
          transform: translateY(-5px);
          border-color: var(--border-accent);
          box-shadow: 0 8px 24px rgba(201,168,76,0.15);
        }
        .stat-icon {
          width: 48px; height: 48px;
          background: var(--gold-dim);
          border-radius: 13px;
          display: flex; align-items: center; justify-content: center;
          color: var(--gold);
          flex-shrink: 0;
          border: 1px solid var(--border-accent);
        }
        .stat-info { flex: 1; min-width: 0; }
        .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 5px; font-weight: 600; }
        .stat-value { font-size: 1.45rem; font-weight: 800; color: var(--text-primary); }
        .stat-glow {
          position: absolute; top: -30px; left: -30px;
          width: 80px; height: 80px;
          background: radial-gradient(circle, rgba(201,168,76,0.12), transparent 70%);
          pointer-events: none;
        }

        /* ── CHARTS ── */
        .charts-row {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 20px; margin-bottom: 28px;
        }
        .chart-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 22px;
        }
        .chart-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .chart-card-header h3 { margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 700; }
        .chart-sub { color: var(--text-muted); font-size: 0.8rem; }
        .chart-wrap { height: 240px; }
        .empty-chart { display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; }

        /* ── BOTTOM GRID ── */
        .bottom-grid {
          display: grid; grid-template-columns: 2fr 1fr;
          gap: 20px;
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
          display: flex; justify-content: space-between; align-items: center;
        }
        .panel-head h3 { margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 700; }
        .link-btn { background: none; border: none; color: var(--gold); cursor: pointer; font-size: 0.85rem; font-weight: 600; }
        .link-btn:hover { text-decoration: underline; }

        /* Table */
        .table-scroll { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th {
          text-align: right;
          padding: 13px 20px;
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 700;
          background: var(--bg-elevated);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        td {
          padding: 14px 20px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border);
          font-size: 0.9rem;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--gold-dimmer); }

        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar {
          width: 34px; height: 34px;
          background: var(--gold-dim);
          border: 1px solid var(--border-accent);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--gold);
          font-weight: 800;
          font-size: 0.85rem;
        }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; }
        .badge.student { background: var(--gold-dimmer); color: var(--gold); border: 1px solid var(--border); }
        .badge.teacher { background: rgba(180, 120, 30, 0.15); color: var(--gold-light); border: 1px solid var(--border-accent); }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 5px; }
        .dot.active { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.5); }
        .empty-row { text-align: center; padding: 30px; color: var(--text-muted); }

        /* Quick Actions */
        .actions-panel { display: flex; flex-direction: column; }
        .quick-actions { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .action-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 14px 16px;
          border-radius: 12px;
          cursor: pointer;
          display: flex; align-items: center; gap: 14px;
          transition: all 0.2s;
          text-align: right;
          width: 100%;
        }
        .action-btn:hover {
          border-color: var(--gold);
          background: var(--gold-dimmer);
          color: var(--text-primary);
          transform: translateX(-3px);
        }
        .action-btn:hover .action-icon { color: var(--gold); }
        .action-icon { color: var(--text-muted); flex-shrink: 0; transition: color 0.2s; }
        .action-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 2px; }
        .action-desc { font-size: 0.75rem; color: var(--text-muted); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1100px) {
          .bottom-grid, .charts-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .page-header { flex-direction: column; align-items: flex-start; gap: 14px; }
          .stats-grid { grid-template-columns: 1fr 1fr; }
          .date-badge { display: none; }
        }
        @media (max-width: 400px) {
          .stats-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </SuperLayout>
  );
}
