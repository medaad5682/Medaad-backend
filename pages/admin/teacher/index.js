import TeacherLayout from '../../../components/TeacherLayout';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

// ─── الأيقونات الاحترافية للبطاقات ────────────────────────────────
const Icons = {
  requests: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>,
  students: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  courses: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>,
  earnings: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>,
  eye: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
  pulse: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
};

export default function TeacherDashboard() {
  const router = useRouter();
  
  // الحالة الافتراضية
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── بيانات المشاهدات (Supabase فقط — بدون Firebase) ──
  const [watchData, setWatchData] = useState(null);
  const [watchLoading, setWatchLoading] = useState(true);

  // ── 📅 تاريخ بداية احتساب "إجمالي الأرباح" (يختاره المدرس ويبقى محفوظاً) ──
  const [earningsStartDate, setEarningsStartDate] = useState(''); // '' = كل الوقت
  const [savingEarningsDate, setSavingEarningsDate] = useState(false);
  const earningsDateInputRef = useRef(null);

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
          // ✅ تهيئة قيمة تاريخ بداية الأرباح من القيمة المحفوظة في قاعدة البيانات
          setEarningsStartDate(json.summary?.earningsStartDate || '');
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
  const watchChart = watchData?.chart || [];

  // 4. ✅ بيانات الطلاب النشطين اليوم (خاصة بطلاب هذا المدرس فقط)
  const activeUsersToday = stats.activeUsersToday || 0;
  const activeUsersChart = data?.activeUsersChartData || [];

  // 5. ✅ دمج مخطط المشاهدات ومخطط النشاط في مصفوفة واحدة (نفس الأيام السبعة
  //    مبنية بنفس منطق توقيت القاهرة في الـ API، فبنربطهم بمفتاح date)
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

  const chartLoading = watchLoading || loading;

  // ============================================================
  // 📅 حفظ/تغيير تاريخ بداية احتساب الأرباح
  // ============================================================

  const handleEarningsDateChange = async (e) => {
    const newDate = e.target.value; // 'YYYY-MM-DD' أو '' لو تم المسح
    const previousDate = earningsStartDate;
    setEarningsStartDate(newDate); // تحديث فوري للواجهة
    setSavingEarningsDate(true);
    try {
      const res = await fetch('/api/dashboard/teacher/earnings-start-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate || null })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل الحفظ');

      // ✅ إعادة جلب الإحصائيات فوراً حتى تنعكس قيمة الأرباح الجديدة على البطاقة
      const statsRes = await fetch('/api/dashboard/teacher/stats');
      const statsJson = await statsRes.json();
      if (statsJson.success) setData(statsJson);
    } catch (err) {
      console.error('فشل حفظ تاريخ بداية الأرباح:', err.message);
      setEarningsStartDate(previousDate); // تراجع عند الفشل
      alert('تعذر حفظ التاريخ، حاول مرة أخرى');
    } finally {
      setSavingEarningsDate(false);
    }
  };

  // ألوان الرسم البياني حسب الوضع الليلي/النهاري
  const goldColor  = isDark ? '#c9a84c' : '#b8903a';
  const usersColor = isDark ? '#38bdf8' : '#0ea5e9';
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
              <div className="stat-card earnings-card">
                <div className="stat-icon highlight-icon">{Icons.earnings}</div>
                <div className="stat-info">
                  <div className="stat-label-row">
                    <div className="stat-label">إجمالي الأرباح</div>
                    {/* ✅ نمط متوافق مع كل المتصفحات (بما فيها Safari على iPhone):
                        input[type=date] حقيقي بحجم كامل فوق الأيقونة مباشرة
                        وشفاف (opacity:0) — فاللمسة نفسها تفتح منتقي التاريخ
                        الأصلي بدل الاعتماد على showPicker()/click() المُصطنعة
                        التي لا تعمل على iOS إذا كان العنصر مخفياً/بلا أبعاد. */}
                    <div className="calendar-btn-wrap" title={earningsStartDate ? `تُحتسب من ${earningsStartDate}` : 'اختر تاريخ بداية احتساب الأرباح'}>
                      <div className="calendar-btn" aria-hidden="true">{Icons.calendar}</div>
                      <input
                        ref={earningsDateInputRef}
                        type="date"
                        className="calendar-overlay-input"
                        value={earningsStartDate || ''}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={handleEarningsDateChange}
                        disabled={savingEarningsDate}
                        aria-label="اختر تاريخ بداية احتساب الأرباح"
                      />
                    </div>
                  </div>
                  <div className="stat-value">{`${stats.earnings.toLocaleString()} ج.م`}</div>
                  <div className="stat-desc">
                    {savingEarningsDate
                      ? 'جاري الحفظ...'
                      : earningsStartDate
                        ? `منذ ${earningsStartDate}`
                        : 'أرباحك المباشرة (كل الوقت)'}
                  </div>
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
                <div className="stat-icon pulse-icon">{Icons.pulse}</div>
                <div className="stat-info">
                  <div className="stat-label">الطلاب النشطون اليوم</div>
                  <div className="stat-value">{loading ? '…' : activeUsersToday.toLocaleString()}</div>
                  <div className="stat-desc">من إجمالي طلابك</div>
                </div>
                <div className="stat-glow" />
              </div>

            </div>

            {/* ── مخطط المشاهدات ونشاط الطلاب لآخر 7 أيام (مخطط واحد مدمج) ── */}
            <div className="panel chart-panel">
              <div className="panel-head">
                <h3>👁️ المشاهدات ونشاط الطلاب لآخر 7 أيام</h3>
              </div>
              <div className="chart-body">
                {chartLoading ? (
                  <div className="chart-loading">جاري تحميل البيانات...</div>
                ) : combinedChart.length === 0 ? (
                  <div className="chart-loading">لا توجد بيانات كافية بعد</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="watchGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={goldColor} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={goldColor} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={usersColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={usersColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                      <XAxis dataKey="name" stroke={chartAxis} tick={{ fontSize: 11 }} />
                      <YAxis stroke={chartAxis} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: '10px', color: isDark ? '#f5f0e0' : '#1a1508' }}
                        cursor={{ stroke: goldColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                        formatter={(value, name) => [
                          name === 'watches' ? `${value.toLocaleString()} مشاهدة` : `${value.toLocaleString()} طالب`,
                          name === 'watches' ? 'المشاهدات' : 'الطلاب النشطون'
                        ]}
                      />
                      <Legend
                        formatter={(value) => value === 'watches' ? 'المشاهدات' : 'الطلاب النشطون'}
                        wrapperStyle={{ fontSize: '12px', color: chartAxis }}
                      />
                      <Area type="monotone" dataKey="watches" name="watches" stroke={goldColor} strokeWidth={2.5} fill="url(#watchGradient)" />
                      <Area type="monotone" dataKey="users" name="users" stroke={usersColor} strokeWidth={2.5} fill="url(#usersGradient)" />
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
        .stat-icon.pulse-icon { color: #a78bfa; border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.1); }

        .stat-info { flex: 1; min-width: 0; }
        .stat-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; }
        .stat-value { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
        .stat-desc { font-size: 0.75rem; color: var(--text-secondary); }

        /* ── بطاقة الأرباح: زر التقويم لاختيار تاريخ البداية ── */
        .earnings-card { overflow: visible; }
        .stat-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
        .stat-label-row .stat-label { margin-bottom: 0; }
        /* الأيقونة المرئية فقط — لا تستقبل أي أحداث لمس/نقر بنفسها */
        .calendar-btn-wrap { position: relative; width: 26px; height: 26px; flex-shrink: 0; }
        .calendar-btn {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--gold-dim);
          border: 1px solid var(--border-accent);
          border-radius: 7px;
          color: var(--gold);
          pointer-events: none; /* كل اللمس/النقر يذهب لحقل التاريخ الشفاف فوقها */
        }
        /* ✅ input[type=date] حقيقي بنفس حجم الأيقونة تماماً وموضوع فوقها
           مباشرة، شفاف بالكامل — هذا هو النمط المتوافق مع كل الأجهزة:
           اللمسة/النقرة تقع فعلياً على عنصر الفورم نفسه فيفتح المتصفح
           منتقي التاريخ الأصلي تلقائياً (يشمل Safari على iPhone/iPad،
           وكل متصفحات Android وسطح المكتب) بدل الاعتماد على استدعاء
           showPicker()/click() برمجياً على عنصر مخفي بلا أبعاد، وهو ما
           لا يعمل بشكل موثوق على iOS. */
        .calendar-overlay-input {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          margin: 0; padding: 0; border: 0;
          opacity: 0;
          cursor: pointer;
          -webkit-appearance: none; appearance: none;
        }
        .calendar-overlay-input:disabled { cursor: default; }
        
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
