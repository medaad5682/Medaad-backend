import { useState, useEffect } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';
import medaadLogo from '../../../styles/medaad-logo.png';

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

  // ✅ دالة طباعة تقرير المدرس التفصيلي (تصميم فاخر أسود/ذهبي)
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

        const approvedCount = data.summary.total_approved_count || 0;
        const rejectedCount = data.summary.total_rejected_count || 0;
        const totalRequestsCount = approvedCount + rejectedCount;

        const acceptedPct = totalRequestsCount > 0 ? (approvedCount / totalRequestsCount) * 100 : 0;
        const rejectedPct = totalRequestsCount > 0 ? (rejectedCount / totalRequestsCount) * 100 : 0;

        const avgRequestValue = approvedCount > 0 ? Math.round(totalActual / approvedCount) : 0;

        // ── استخراج عناصر كل طلب (مواد/كورسات) من requested_data الهيكلية
        //    مع رجوع احتياطي لتقسيم النص القديم course_title إن لم توجد بيانات هيكلية
        const getItems = (req) => {
          if (Array.isArray(req.requested_data) && req.requested_data.length) {
            return req.requested_data.map(it => ({ title: it.title || 'بدون عنوان' }));
          }
          return (req.course_title || '')
            .split(/\n──────────────────────\n|\n/)
            .map(t => t.replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*/gu, '').replace(/^(كورس شامل|مادة|عنصر):\s*/, '').trim())
            .filter(Boolean)
            .map(title => ({ title }));
        };

        // ── حساب أعلى عنصر مبيعاً (من الطلبات المقبولة فقط)
        const itemCounts = {};
        data.requests.filter(r => r.status === 'approved').forEach(r => {
          getItems(r).forEach(it => {
            itemCounts[it.title] = (itemCounts[it.title] || 0) + 1;
          });
        });
        let topCourseName = '—', topCourseCount = 0;
        Object.entries(itemCounts).forEach(([title, count]) => {
          if (count > topCourseCount) { topCourseName = title; topCourseCount = count; }
        });

        // ── تنسيق التاريخ بصيغة DD-MM-YYYY
        const formatDMY = (iso) => {
          if (!iso) return '';
          const [y, m, d] = iso.split('-');
          return `${d}-${m}-${y}`;
        };

        const reportCreatedDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        const reportCreatedTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

        // ── أيقونات دورية بسيطة لعناصر الجدول (شكل بصري فقط، ثلاث ألوان متناوبة)
        const itemIconPalette = [
          { color: '#3b82f6', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' },
          { color: '#16a34a', svg: '<path d="M9 2v6.5L4 20a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.5L15 8.5V2"></path><path d="M9 2h6"></path><path d="M8.5 13h7"></path>' },
          { color: '#dc2626', svg: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"></path>' },
        ];
        const renderItemIcon = (i) => {
          const ic = itemIconPalette[i % itemIconPalette.length];
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${ic.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic.svg}</svg>`;
        };

        const safeName = data.teacherName.replace(/\s+/g, '_');
        const fileName = `تقرير_${safeName}_${dateRange.startDate}_${dateRange.endDate}`;

        const printWindow = window.open('', '_blank');
        const htmlContent = `
          <html dir="rtl">
            <head>
              <meta charset="utf-8" />
              <title>${fileName}</title>
              <style>
                :root {
                  --gold: #c9a84c;
                  --gold-light: #e6cd85;
                  --dark: #15130f;
                  --dark2: #1c1912;
                  --green: #22c55e;
                  --red: #ef4444;
                }
                * { box-sizing: border-box; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 24px; color: #1a1508; background: #f4f1e8; }

                /* ── Header banner ── */
                .trep-header {
                  background: linear-gradient(160deg, #0d0c09 0%, #1c1912 55%, #0d0c09 100%);
                  border: 2px solid var(--gold);
                  border-radius: 20px;
                  padding: 30px 20px 24px;
                  text-align: center;
                  position: relative;
                  overflow: hidden;
                  -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .trep-header::before, .trep-header::after {
                  content: '';
                  position: absolute; top: 10px; width: 60px; height: 60px;
                  border-top: 3px solid var(--gold); border-radius: 20px 0 0 0;
                }
                .trep-header::before { left: 10px; border-right: none; }
                .trep-header::after { right: 10px; border-left: 3px solid var(--gold); border-top-right-radius: 20px; border-top-left-radius: 0; transform: scaleX(-1); }
                .trep-logo { max-height: 70px; margin-bottom: 8px; }
                .trep-title { color: #fff; font-size: 26px; font-weight: 800; margin: 6px 0 4px; }
                .trep-subtitle { color: var(--gold-light); font-size: 15px; font-weight: 700; margin: 0 0 16px; letter-spacing: 0.5px; }
                .trep-subtitle .dot { color: var(--gold); margin: 0 8px; }
                .trep-daterange {
                  display: inline-flex; align-items: center; gap: 8px;
                  background: rgba(255,255,255,0.06); border: 1px solid rgba(201,168,76,0.4);
                  color: #f0e9d2; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 700;
                }

                /* ── Stat cards ── */
                .trep-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 22px 0; }
                .trep-card {
                  background: #fff; border: 1px solid #e5daba; border-radius: 16px;
                  padding: 18px 10px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .trep-card .icn {
                  width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 10px;
                  display: flex; align-items: center; justify-content: center;
                  background: #b8903a; color: #fff;
                }
                .trep-card .lbl { font-size: 12.5px; color: #6b6248; font-weight: 700; margin-bottom: 6px; }
                .trep-card .val { font-size: 20px; font-weight: 800; color: #1a1508; }
                .trep-card .val.gold { color: #b8903a; }
                .trep-card .val.red { color: var(--red); }
                .trep-card .sub-icn { margin-top: 8px; color: #b8903a; }
                .trep-reqline { display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 800; font-size: 14px; margin: 3px 0; }
                .trep-reqline.ok { color: #16a34a; }
                .trep-reqline.bad { color: var(--red); }

                /* ── Summary + Donut ── */
                .trep-grid2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 22px; }
                .trep-panel { background: #fff; border: 1px solid #e5daba; border-radius: 16px; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .trep-panel h4 { margin: 0 0 16px; text-align: center; color: #b8903a; font-size: 15px; border-bottom: 2px solid #f0e9d2; padding-bottom: 10px; }
                .trep-bar-row { margin-bottom: 16px; }
                .trep-bar-row:last-child { margin-bottom: 0; }
                .trep-bar-top { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #333; margin-bottom: 6px; }
                .trep-bar-track { height: 8px; background: #f0ece0; border-radius: 6px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .trep-bar-fill { height: 100%; border-radius: 6px; }
                .trep-bar-pct { text-align: left; font-size: 11px; color: #888; margin-top: 3px; }

                .trep-donut-wrap { display: flex; align-items: center; justify-content: center; gap: 18px; }
                .trep-donut {
                  width: 110px; height: 110px; border-radius: 50%; position: relative;
                  background: conic-gradient(var(--green) 0% ${acceptedPct}%, var(--red) ${acceptedPct}% 100%);
                  -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .trep-donut::after {
                  content: ''; position: absolute; inset: 22px; background: #fff; border-radius: 50%;
                }
                .trep-donut-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #b8903a; }
                .trep-legend { font-size: 12.5px; font-weight: 700; }
                .trep-legend-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
                .trep-legend-dot { width: 10px; height: 10px; border-radius: 50%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

                /* ── Table ── */
                table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; background: #fff; }
                th, td { border: 1px solid #e5daba; padding: 10px; text-align: right; vertical-align: middle; }
                th { background-color: #15130f; color: var(--gold-light); font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .trep-table-wrap { border-radius: 16px; overflow: hidden; border: 1px solid #e5daba; }

                .status-pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 11.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .status-pill.ok { background: #ecfdf3; color: #16a34a; }
                .status-pill.bad { background: #fef2f2; color: var(--red); }

                .item-line { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; }
                .item-line:last-child { margin-bottom: 0; }

                .user-info { font-weight: bold; display: flex; align-items: center; gap: 6px; }
                .username { font-size: 0.85em; color: #777; display: block; font-weight: 400; }
                .user-avatar { width: 20px; height: 20px; border-radius: 50%; background: #f0e9d2; display: flex; align-items: center; justify-content: center; color: #b8903a; flex-shrink: 0; }

                .note-bad { color: var(--red); font-weight: 700; font-size: 11px; }
                .price-strike { text-decoration: line-through; color: #999; }
                .price-paid { font-weight: bold; color: #16a34a; }

                /* ── Footer ── */
                .trep-footer {
                  margin-top: 22px; background: linear-gradient(160deg, #0d0c09 0%, #1c1912 100%);
                  border: 1px solid var(--gold); border-radius: 16px; padding: 18px;
                  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;
                  -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .trep-footer .f-item { color: #eee; }
                .trep-footer .f-icn { color: var(--gold); margin-bottom: 6px; display: flex; justify-content: center; }
                .trep-footer .f-lbl { font-size: 11px; color: #b7b09a; font-weight: 700; margin-bottom: 4px; }
                .trep-footer .f-val { font-size: 13px; font-weight: 800; color: #fff; }
                .trep-footer .f-sub { font-size: 10.5px; color: #999; margin-top: 2px; }

                @media print {
                  body { background: #fff; padding: 0; }
                }
              </style>
            </head>
            <body>

              <div class="trep-header">
                 <img src="${medaadLogo?.src || '/medaad-logo.png'}" alt="مداد" class="trep-logo" onerror="this.style.display='none'" />
                 <div class="trep-title">تقرير حسابات مدرس</div>
                 <div class="trep-subtitle"><span class="dot">✦</span>${data.teacherName}<span class="dot">✦</span></div>
                 <div class="trep-daterange">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    الفترة من ${formatDMY(dateRange.startDate)} إلى ${formatDMY(dateRange.endDate)}
                 </div>
              </div>

              <div class="trep-cards">
                <div class="trep-card">
                  <div class="icn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg></div>
                  <div class="lbl">صافي المستحق للمدرس</div>
                  <div class="val">${netProfit.toLocaleString()} ج.م</div>
                </div>
                <div class="trep-card">
                  <div class="icn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg></div>
                  <div class="lbl">عمولة منصة مداد (${percentageDisplay}%)</div>
                  <div class="val red">${platformShare.toLocaleString()} ج.م</div>
                </div>
                <div class="trep-card">
                  <div class="icn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
                  <div class="lbl">إجمالي المبيعات (الفعلية)</div>
                  <div class="val gold">${totalActual.toLocaleString()} ج.م</div>
                </div>
                <div class="trep-card">
                  <div class="icn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></div>
                  <div class="lbl">إجمالي الطلبات</div>
                  <div class="trep-reqline ok">${approvedCount} مقبول</div>
                  <div class="trep-reqline bad">${rejectedCount} مرفوض</div>
                </div>
              </div>

              <div class="trep-grid2">
                <div class="trep-panel">
                  <h4>ملخص الفترة</h4>
                  <div class="trep-bar-row">
                    <div class="trep-bar-top"><span>إجمالي المبيعات</span><span>${totalActual.toLocaleString()} ج.م</span></div>
                    <div class="trep-bar-track"><div class="trep-bar-fill" style="width:100%; background:var(--green);"></div></div>
                    <div class="trep-bar-pct">100%</div>
                  </div>
                  <div class="trep-bar-row">
                    <div class="trep-bar-top"><span>الطلبات المقبولة</span><span>${approvedCount} طلب</span></div>
                    <div class="trep-bar-track"><div class="trep-bar-fill" style="width:${acceptedPct}%; background:var(--green);"></div></div>
                    <div class="trep-bar-pct">${acceptedPct.toFixed(1)}%</div>
                  </div>
                  <div class="trep-bar-row">
                    <div class="trep-bar-top"><span>الطلبات المرفوضة</span><span>${rejectedCount} طلب</span></div>
                    <div class="trep-bar-track"><div class="trep-bar-fill" style="width:${rejectedPct}%; background:var(--red);"></div></div>
                    <div class="trep-bar-pct">${rejectedPct.toFixed(1)}%</div>
                  </div>
                </div>

                <div class="trep-panel">
                  <h4>توزيع الطلبات</h4>
                  <div class="trep-donut-wrap">
                    <div class="trep-donut">
                      <div class="trep-donut-center">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"></rect><path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"></path></svg>
                      </div>
                    </div>
                    <div class="trep-legend">
                      <div class="trep-legend-row"><span class="trep-legend-dot" style="background:var(--green)"></span>مقبول<br/>${acceptedPct.toFixed(1)}% (${approvedCount})</div>
                      <div class="trep-legend-row"><span class="trep-legend-dot" style="background:var(--red)"></span>مرفوض<br/>${rejectedPct.toFixed(1)}% (${rejectedCount})</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="trep-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 80px;">التاريخ</th>
                    <th>الطالب</th>
                    <th>الكورس / المواد</th>
                    <th>السعر الأصلي</th>
                    <th>المدفوع فعلياً</th>
                    <th>الحالة</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.requests.map(req => {
                     const orig = req.total_price || 0;
                     const act = req.actual_paid_price !== null ? req.actual_paid_price : orig;
                     const hasCustomPrice = req.actual_paid_price !== null;
                     const isApproved = req.status === 'approved';
                     const items = getItems(req);

                     return `
                    <tr>
                      <td>${new Date(req.created_at).toLocaleDateString('ar-EG')}</td>
                      <td>
                        <span class="user-info">
                          <span class="user-avatar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></span>
                          ${req.user_name || 'بدون اسم'}
                        </span>
                        <span class="username">${req.user_username ? `(${req.user_username})` : ''}</span>
                      </td>
                      <td>${items.map((it, idx) => `<div class="item-line">${renderItemIcon(idx)}<span>${it.title}</span></div>`).join('')}</td>
                      <td style="${hasCustomPrice ? 'text-decoration:line-through;color:#888;' : ''}">${orig.toLocaleString()} ج.م</td>
                      <td class="price-paid">${act.toLocaleString()} ج.م</td>
                      <td>
                        ${isApproved
                          ? `<span class="status-pill ok"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> مقبول</span>`
                          : `<span class="status-pill bad"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> مرفوض</span>`}
                      </td>
                      <td>${!isApproved && req.rejection_reason ? `<span class="note-bad">${req.rejection_reason}</span>` : (req.user_note || '—')}</td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              </div>

              <div class="trep-footer">
                <div class="f-item">
                  <div class="f-icn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"></path></svg></div>
                  <div class="f-lbl">أعلى كورس مبيعاً</div>
                  <div class="f-val">${topCourseName}</div>
                  <div class="f-sub">${topCourseCount} طلبات</div>
                </div>
                <div class="f-item">
                  <div class="f-icn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg></div>
                  <div class="f-lbl">متوسط قيمة الطلب</div>
                  <div class="f-val">${avgRequestValue.toLocaleString()} ج.م</div>
                </div>
                <div class="f-item">
                  <div class="f-icn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                  <div class="f-lbl">تاريخ إنشاء التقرير</div>
                  <div class="f-val">${reportCreatedDate}</div>
                  <div class="f-sub">${reportCreatedTime}</div>
                </div>
                <div class="f-item">
                  <div class="f-icn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg></div>
                  <div class="f-lbl">شكراً لثقتك في مداد</div>
                  <div class="f-val" style="font-size:11px;">نسعى دائماً لنجاحك</div>
                </div>
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
