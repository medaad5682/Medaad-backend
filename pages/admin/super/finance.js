import { useState, useEffect } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';

// ─── SVG Icons ──────────────────────────────────────────
const WalletIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>);
const TagIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>);
const CashIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>);
const ChartIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>);
const TeacherIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>);
const FileTextIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>);

export default function SuperFinance() {
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(null);
  
  const [financials, setFinancials] = useState({
    total_original_revenue: 0,
    total_actual_revenue: 0,
    platform_profit: 0,
    teachers_due: 0,
    teachers_list: []
  });

  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(dateRange).toString();
      const res = await fetch(`/api/dashboard/super/finance?${query}`); 
      
      if (res.ok) {
        const data = await res.json();
        setFinancials(data);
      } else {
        setFinancials({
          total_original_revenue: 0,
          total_actual_revenue: 0,
          platform_profit: 0,
          teachers_due: 0,
          teachers_list: []
        });
      }
    } catch (err) {
      console.error("Finance Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, [dateRange]);

  // ✅ دالة الطباعة العامة
  const handleGlobalExportPDF = () => {
    if (financials.teachers_list.length === 0) return;

    const fileName = `التقرير_المالي_الشامل_${dateRange.startDate}_${dateRange.endDate}`;

    const printWindow = window.open('', '_blank');
    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>${fileName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1a1508; }
            .header-container { text-align: center; margin-bottom: 20px; }
            .logo { max-height: 80px; margin-bottom: 10px; }
            h1, h2 { text-align: center; color: #b8903a; margin: 5px 0; }
            p { text-align: center; color: #666; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
            th { background-color: #fbf8f1; color: #b8903a; -webkit-print-color-adjust: exact; font-weight: bold; }
            .summary-box { display: flex; justify-content: space-around; margin-bottom: 30px; background: #faf8f0; padding: 15px; border: 1px solid #e5daba; border-radius: 8px; -webkit-print-color-adjust: exact; }
            .stat { text-align: center; font-weight: bold; color: #333; }
            .stat-val { font-weight: bold; font-size: 18px; color: #b8903a; margin-top: 5px; }
            .stat-val.actual { color: #16a34a; }
            .stat-val.muted { color: #888; font-size: 14px; text-decoration: line-through; }
          </style>
        </head>
        <body>
          <div class="header-container">
             <img src="/logo.png" alt="Logo" class="logo" onerror="this.style.display='none'" />
             <h1>التقرير المالي الشامل</h1>
             <p>الفترة من: ${dateRange.startDate} إلى: ${dateRange.endDate}</p>
          </div>
          
          <div class="summary-box">
            <div class="stat">المبيعات الافتراضية<div class="stat-val muted">${financials.total_original_revenue.toLocaleString()} ج.م</div></div>
            <div class="stat">المبيعات الفعلية (المُحصلة)<div class="stat-val actual">${financials.total_actual_revenue.toLocaleString()} ج.م</div></div>
            <div class="stat">ربح المنصة<div class="stat-val">${financials.platform_profit.toLocaleString()} ج.م</div></div>
            <div class="stat">مستحقات المدرسين<div class="stat-val" style="color: #dc2626">${financials.teachers_due.toLocaleString()} ج.م</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>المدرس</th>
                <th>عدد العمليات</th>
                <th>المبيعات الافتراضية</th>
                <th>المبيعات الفعلية</th>
                <th>حصة المنصة</th>
                <th>صافي الربح للمدرس</th>
              </tr>
            </thead>
            <tbody>
              ${financials.teachers_list.map(t => {
                const hasCustom = t.original_sales !== t.actual_sales;
                return `
                <tr>
                  <td><strong>${t.name}</strong></td>
                  <td>${t.transaction_count}</td>
                  <td style="color:#888; ${hasCustom ? 'text-decoration:line-through;' : ''}">${t.original_sales.toLocaleString()}</td>
                  <td style="color:#16a34a; font-weight:bold;">${t.actual_sales.toLocaleString()}</td>
                  <td>${t.platform_fee.toLocaleString()}</td>
                  <td style="color:#b8903a; font-weight:bold; font-size: 1.1em;">${t.net_profit.toLocaleString()}</td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #777;">
             تم استخراج هذا التقرير بتاريخ: ${new Date().toLocaleDateString('ar-EG')}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // ✅ دالة طباعة تقرير المدرس التفصيلي
  const handleTeacherReport = async (teacherId) => {
    setReportLoading(teacherId);
    try {
        const query = new URLSearchParams({ 
            teacherId, 
            startDate: dateRange.startDate, 
            endDate: dateRange.endDate 
        }).toString();

        const res = await fetch(`/api/dashboard/super/teacher-report?${query}`);
        if (!res.ok) throw new Error('Failed to fetch report');
        
        const data = await res.json();
        
        const percentage = data.platformPercentage !== undefined ? data.platformPercentage : 0.10;
        const percentageDisplay = (percentage * 100).toFixed(0).replace(/\.0+$/, '');

        const totalOriginal = data.summary.total_original_amount || 0;
        const totalActual = data.summary.total_actual_amount || 0;
        const platformShare = totalActual * percentage; 
        const netProfit = totalActual - platformShare;

        const safeName = data.teacherName.replace(/\s+/g, '_');
        const fileName = `تقرير_${safeName}_${dateRange.startDate}_${dateRange.endDate}`;

        const printWindow = window.open('', '_blank');
        const htmlContent = `
          <html dir="rtl">
            <head>
              <title>${fileName}</title> 
              <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1a1508; }
                .header-container { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #e5daba; padding-bottom: 20px; }
                .logo { max-height: 80px; margin-bottom: 10px; }
                h2 { text-align: center; color: #333; margin-bottom: 5px; margin-top: 0; }
                p.meta { text-align: center; color: #666; margin-top: 0; font-weight: bold; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                th, td { border: 1px solid #ccc; padding: 10px; text-align: right; vertical-align: middle; }
                th { background-color: #fbf8f1; color: #b8903a; font-weight: bold; -webkit-print-color-adjust: exact; }
                
                .approved { background-color: #f0fdf4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
                .rejected { background-color: #fef2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                
                .summary { 
                    margin: 20px 0; 
                    padding: 20px; 
                    border: 1px solid #e5daba; 
                    background-color: #faf8f0;
                    display: flex;
                    justify-content: space-between;
                    -webkit-print-color-adjust: exact;
                    border-radius: 8px;
                }
                .summary-col { flex: 1; text-align: center; }
                .summary-col.border { border-left: 1px solid #e5daba; } 
                
                .val { font-weight: bold; font-size: 1.1em; display: block; margin-top: 5px; }
                .val.muted { color: #888; font-size: 0.9em; text-decoration: line-through; }
                .green { color: #16a34a; }
                .gold { color: #b8903a; }
                .red { color: #dc2626; }
                
                .info-row { margin-bottom: 5px; font-size: 14px; font-weight: bold; color: #444; }
                
                .user-info { font-weight: bold; }
                .username { font-size: 0.85em; color: #777; display: block; }
              </style>
            </head>
            <body>
              <div class="header-container">
                 <img src="/logo.png" alt="Logo" class="logo" onerror="this.style.display='none'" />
                 <h2>تقرير حسابات مدرس</h2>
                 <h3 style="margin:5px 0; color:#b8903a; font-size: 24px;">${data.teacherName}</h3>
                 <p class="meta">الفترة من ${dateRange.startDate} إلى ${dateRange.endDate}</p>
              </div>

              <div class="summary">
                <div class="summary-col border">
                    <div class="info-row">مقبول / مرفوض</div>
                    <span class="val green">${data.summary.total_approved_count} مقبول</span>
                    <span class="val red">${data.summary.total_rejected_count} مرفوض</span>
                </div>
                
                <div class="summary-col border">
                    <div class="info-row">إجمالي المبيعات (الفعلي)</div>
                    <span class="val muted">${totalOriginal.toLocaleString()} ج.م (افتراضي)</span>
                    <span class="val green">${totalActual.toLocaleString()} ج.م</span>
                </div>

                <div class="summary-col border">
                    <div class="info-row">حصة المنصة (${percentageDisplay}%)</div>
                    <span class="val red">${platformShare.toLocaleString()} ج.م</span>
                </div>

                <div class="summary-col">
                    <div class="info-row">صافي المستحق للمدرس</div>
                    <span class="val gold" style="font-size:1.4em">${netProfit.toLocaleString()} ج.م</span>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width: 80px;">التاريخ</th>
                    <th>الطالب</th>
                    <th>المحتوى</th>
                    <th>السعر المطلوب</th>
                    <th>المدفوع فعلياً</th>
                    <th>الحالة</th>
                    <th>ملاحظة الطالب</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.requests.map(req => {
                     const orig = req.total_price || 0;
                     const act = req.actual_paid_price !== null ? req.actual_paid_price : orig;
                     const hasCustomPrice = req.actual_paid_price !== null;

                     return `
                    <tr class="${req.status}">
                      <td>${new Date(req.created_at).toLocaleDateString('ar-EG')}</td>
                      <td>
                        <span class="user-info">${req.user_name || 'بدون اسم'}</span>
                        <span class="username">${req.user_username ? `(${req.user_username})` : ''}</span>
                      </td>
                      <td>${req.course_title}</td>
                      <td style="${hasCustomPrice ? 'text-decoration:line-through;color:#888;' : ''}">${orig}</td>
                      <td style="font-weight:bold; color:#16a34a;">${act}</td>
                      <td>${req.status === 'approved' ? '✅ مقبول' : '❌ مرفوض'}</td>
                      <td>${req.user_note || '-'}</td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              
              <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #777;">
                تم استخراج هذا التقرير بتاريخ: ${new Date().toLocaleDateString('ar-EG')}
              </div>

              <script>
                window.onload = function() { window.print(); }
              </script>
            </body>
          </html>
        `;
        printWindow.document.write(htmlContent);
        printWindow.document.close();

    } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء جلب التقرير');
    } finally {
        setReportLoading(null);
    }
  };

  return (
    <SuperLayout title="التقارير المالية">
      <Head>
        <title>المالية والأرباح | الإدارة العليا</title>
      </Head>

      <div className="finance-luxury-wrapper">
        
        {/* Header Section */}
        <div className="page-header">
          <div className="header-title-wrap">
            <div className="header-icon"><WalletIcon /></div>
            <div>
              <h1>التقارير المالية والأرباح</h1>
              <p>متابعة الإيرادات، نسب المنصة، ومستحقات المدرسين</p>
            </div>
          </div>
          
          <div className="actions-bar">
             <div className="date-picker-group">
                <input 
                  type="date" 
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                  className="date-input"
                />
                <span className="date-separator">إلى</span>
                <input 
                  type="date" 
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                  className="date-input"
                />
             </div>
             <button 
                onClick={handleGlobalExportPDF} 
                className="export-btn"
                disabled={financials.teachers_list.length === 0}
             >
                <FileTextIcon /> تصدير PDF للكل
             </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="cards-grid">
           <div className="stat-card default">
              <div className="icon"><TagIcon /></div>
              <div className="content">
                 <h3>المبيعات الافتراضية</h3>
                 <p>{loading ? '...' : financials.total_original_revenue.toLocaleString()} <span style={{fontSize:'1rem'}}>ج.م</span></p>
                 <span className="badge">سعر الكورسات الأصلي</span>
              </div>
           </div>

           <div className="stat-card total">
              <div className="icon"><CashIcon /></div>
              <div className="content">
                 <h3>التحصيل الفعلي</h3>
                 <p className="val-success">{loading ? '...' : financials.total_actual_revenue.toLocaleString()} <span style={{fontSize:'1rem'}}>ج.م</span></p>
                 <span className="badge success">ما تم دفعه فعلياً</span>
              </div>
           </div>

           <div className="stat-card profit">
              <div className="icon gold-icon"><ChartIcon /></div>
              <div className="content">
                 <h3>صافي ربح المنصة</h3>
                 <p className="val-gold">{loading ? '...' : financials.platform_profit.toLocaleString()} <span style={{fontSize:'1rem'}}>ج.م</span></p>
                 <span className="badge">محسوب من التحصيل الفعلي</span>
              </div>
           </div>

           <div className="stat-card due">
              <div className="icon red-icon"><TeacherIcon /></div>
              <div className="content">
                 <h3>مستحقات المدرسين</h3>
                 <p className="val-danger">{loading ? '...' : financials.teachers_due.toLocaleString()} <span style={{fontSize:'1rem'}}>ج.م</span></p>
                 <span className="badge warning">التزام مالي للمدرسين</span>
              </div>
           </div>
        </div>

        {/* Main Table */}
        <div className="table-container">
           <div className="table-header">
             <h3>تفاصيل المدرسين الماليـة</h3>
           </div>
           
           {loading ? (
             <div className="loading-wrap">
                <div className="spinner"></div>
                <p>جاري حساب الأرقام وبناء التقرير...</p>
             </div>
           ) : (
             <div className="table-responsive custom-scrollbar">
                <table>
                  <thead>
                    <tr>
                      <th>اسم المدرس</th>
                      <th style={{textAlign:'center'}}>العمليات</th>
                      <th title="المبلغ الأصلي للكورسات">المبيعات الافتراضية</th>
                      <th title="ما تم دفعه بالفعل وتم حسابه بالتقارير">التحصيل الفعلي</th>
                      <th>نسبة المنصة</th>
                      <th>صافي ربح المدرس</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financials.teachers_list.length > 0 ? (
                      financials.teachers_list.map((teacher) => (
                        <tr key={teacher.id}>
                          <td style={{fontWeight:'700', color:'var(--text-primary)'}}>{teacher.name}</td>
                          <td style={{textAlign:'center', color: 'var(--text-secondary)'}}>
                            <span className="count-badge">{teacher.transaction_count}</span>
                          </td>
                          <td style={{
                              color:'var(--text-muted)', 
                              textDecoration: teacher.original_sales !== teacher.actual_sales ? 'line-through' : 'none'
                          }}>
                              {teacher.original_sales.toLocaleString()}
                          </td>
                          <td style={{color:'#4ade80', fontWeight:'700'}}>{teacher.actual_sales.toLocaleString()} ج.م</td>
                          <td style={{color:'var(--text-secondary)'}}>{teacher.platform_fee.toLocaleString()}</td>
                          <td style={{color:'var(--gold)', fontWeight:'800', fontSize: '1.05rem'}}>{teacher.net_profit.toLocaleString()} ج.م</td>
                          <td>
                             <button 
                                 className="btn-details" 
                                 onClick={() => handleTeacherReport(teacher.id)}
                                 disabled={reportLoading === teacher.id}
                             >
                                 {reportLoading === teacher.id ? <span className="small-spinner"></span> : <><FileTextIcon /> كشف حساب PDF</>}
                             </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="7" className="empty-state">لا توجد بيانات مالية مسجلة في هذه الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
             </div>
           )}
        </div>
      </div>

      <style jsx>{`
        .finance-luxury-wrapper { 
            padding-bottom: 50px; 
            max-width: 100%;
        }
        
        /* ── HEADERS ── */
        .page-header { 
          display: flex; justify-content: space-between; align-items: flex-end; 
          margin-bottom: 30px; 
          border-bottom: 1px solid var(--border); 
          padding-bottom: 20px; 
          flex-wrap: wrap; gap: 20px; 
        }
        .header-title-wrap { 
          display: flex; align-items: center; gap: 16px; 
        }
        .header-icon {
          width: 48px; height: 48px;
          background: var(--gold-dim);
          color: var(--gold);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-accent);
        }
        .page-header h1 { margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.6rem; font-weight: 800; }
        .page-header p { color: var(--text-secondary); margin: 0; font-size: 0.95rem; }
        
        /* ── ACTIONS BAR ── */
        .actions-bar { display: flex; gap: 15px; align-items: center; }
        .date-picker-group { 
          background: var(--bg-surface); 
          padding: 6px 16px; 
          border-radius: 10px; 
          border: 1px solid var(--border); 
          display: flex; gap: 12px; align-items: center; 
        }
        .date-separator { color: var(--text-muted); font-weight: 700; font-size: 0.9rem;}
        .date-input { 
          background: transparent; border: none; color: var(--text-primary); 
          padding: 6px; outline: none; font-family: inherit; 
          color-scheme: dark; cursor: pointer; font-weight: 600; font-size: 0.95rem;
        }
        
        .export-btn { 
          background: var(--gold); color: #111009; 
          border: none; padding: 12px 22px; border-radius: 10px; 
          cursor: pointer; font-weight: 800; font-size: 0.95rem;
          transition: all 0.2s; display: flex; align-items: center; gap: 8px; 
        }
        .export-btn:hover:not(:disabled) { 
          background: var(--gold-light); 
          box-shadow: 0 4px 15px rgba(201,168,76,0.3); 
          transform: translateY(-2px); 
        }
        .export-btn:disabled { 
          background: var(--bg-elevated); border: 1px solid var(--border);
          color: var(--text-muted); cursor: not-allowed; box-shadow: none; 
        }

        /* ── CARDS GRID ── */
        .cards-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); 
          gap: 20px; 
          margin-bottom: 30px; 
        }
        .stat-card { 
          background: var(--bg-surface); border: 1px solid var(--border); 
          padding: 22px; border-radius: 16px; display: flex; gap: 16px; 
          align-items: center; transition: all 0.2s; box-shadow: var(--shadow);
        }
        .stat-card:hover { transform: translateY(-4px); border-color: var(--border-accent); }
        
        .stat-card .icon { 
          width: 52px; height: 52px; border-radius: 14px; 
          display: flex; justify-content: center; align-items: center; 
          flex-shrink: 0; background: var(--bg-elevated); border: 1px solid var(--border); 
        }
        .default .icon { color: var(--text-secondary); }
        .total .icon { background: rgba(74, 222, 128, 0.1); color: #4ade80; border-color: rgba(74, 222, 128, 0.2); }
        .profit .icon.gold-icon { background: var(--gold-dim); color: var(--gold); border-color: var(--border-accent); }
        .due .icon.red-icon { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }

        .stat-card .content { min-width: 0; }
        .stat-card .content h3 { margin: 0 0 6px 0; color: var(--text-secondary); font-size: 0.88rem; font-weight: 700; }
        .stat-card .content p { margin: 0; font-size: 1.4rem; font-weight: 800; color: var(--text-primary); }
        .val-success { color: #4ade80 !important; }
        .val-gold { color: var(--gold) !important; }
        .val-danger { color: #f87171 !important; }
        
        .badge { 
          font-size: 0.75rem; background: var(--bg-elevated); 
          padding: 4px 10px; border-radius: 6px; color: var(--text-muted); 
          margin-top: 10px; display: inline-block; border: 1px solid var(--border); font-weight: 600; 
        }
        .badge.warning { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
        .badge.success { background: rgba(74, 222, 128, 0.1); color: #4ade80; border-color: rgba(74, 222, 128, 0.2); }

        /* ── TABLE CONTAINER ── */
        .table-container { 
          background: var(--bg-surface); border-radius: 16px; 
          border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); 
        }
        .table-header { padding: 22px 24px; border-bottom: 1px solid var(--border); background: var(--bg-elevated); }
        .table-header h3 { margin: 0; color: var(--gold); font-size: 1.15rem; font-weight: 700; }

        /* Important to allow horizontal scroll */
        .table-responsive { 
          width: 100%; 
          overflow-x: auto; 
          -webkit-overflow-scrolling: touch; 
        }
        
        table { width: 100%; min-width: 950px; border-collapse: collapse; }
        th { 
          text-align: right; padding: 16px 20px; color: var(--text-secondary); 
          font-size: 0.85rem; background: var(--bg-base); font-weight: 700; 
          white-space: nowrap; text-transform: uppercase; border-bottom: 1px solid var(--border); 
        }
        td { 
          padding: 16px 20px; border-bottom: 1px solid var(--border); 
          color: var(--text-secondary); vertical-align: middle; white-space: nowrap; font-size: 0.95rem;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--gold-dimmer); }

        .count-badge {
          background: var(--bg-elevated); border: 1px solid var(--border);
          padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85rem;
        }

        .btn-details { 
          background: var(--bg-elevated); border: 1px solid var(--border); 
          color: var(--text-secondary); padding: 8px 14px; border-radius: 8px; 
          cursor: pointer; font-size: 0.85rem; transition: all 0.2s; 
          white-space: nowrap; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-details:hover:not(:disabled) { 
          border-color: var(--gold); color: var(--gold); 
          background: var(--gold-dim); transform: translateY(-2px); 
        }
        .btn-details:disabled { opacity: 0.6; cursor: not-allowed; }

        .empty-state { text-align: center; padding: 60px; color: var(--text-muted); font-size: 1.05rem; }

        /* ── LOADING & SCROLLBAR ── */
        .loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 0; color: var(--gold); font-weight: bold; }
        .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top: 4px solid var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 15px;}
        .small-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top: 2px solid var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: var(--bg-base); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-accent); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--gold); }

        @media (max-width: 900px) {
            .header-section { flex-direction: column; align-items: flex-start; }
            .actions-bar { width: 100%; flex-direction: column; align-items: stretch; }
            .date-picker-group { width: 100%; justify-content: space-between; }
            .export-btn { width: 100%; justify-content: center; }
            .cards-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 500px) {
            .cards-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </SuperLayout>
  );
}
