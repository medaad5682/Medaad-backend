import { useState, useEffect } from 'react';
import Head from 'next/head';
import SuperLayout from '../../../components/SuperLayout';

// ─── SVG Icons ──────────────────────────────────────────
const SettingsIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>);
const UnlockIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>);
const PlayIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>);
const DownloadIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>);
const MoneyIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>);
const HeadphonesIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>);
const SmartphoneIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>);
const SaveIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>);

export default function SuperSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 1. حالة الإعدادات العامة (مضاف إليها player_settings)
  // ✅ player_settings أصبحت ديناميكية: مصفوفة "players" غير محدودة العدد
  // بدلاً من 3 خانات ثابتة، حتى يمكن للأدمن إضافة/حذف أي عدد من المشغلات.
  const [settings, setSettings] = useState({
    platform_percentage: '',
    support_telegram: '',
    support_whatsapp: '',
    free_mode: false,
    player_settings: {
      players: [
        { id: 'player_1', engine: 'explode_direct', enabled: true, name: "المشغل الأساسي", description: "سريع ومستقر (ينصح به)", order: 1 },
        { id: 'player_2', engine: 'bunny_hls', enabled: true, name: "سيرفر احتياطي", description: "استخدمه في حال التقطيع", order: 2 },
        { id: 'player_3', engine: 'youtube', enabled: true, name: "مشغل يوتيوب", description: "جودة متعددة", order: 3 },
        { id: 'player_4', engine: 'bunny_native', enabled: false, name: "مشغل بديل", description: "جرّب هذا إذا واجهت مشاكل في التشغيل مع المشغلات الأخرى", order: 4 },
      ],
      downloads: { video_enabled: true, pdf_enabled: true }
    }
  });

  // ✅ محرك (مصدر) كل مشغل: يحدد للتطبيق أي منطق جلب/تشغيل يجب استخدامه.
  // عند إضافة مشغل جديد يستخدم نفس مصدر بيانات موجود (مثلاً Bunny)، يكفي
  // اختيار نفس الـ engine هنا دون أي حاجة لتعديل كود جديد في الباك إند.
  const ENGINE_OPTIONS = [
    { value: 'explode_direct', label: 'استخراج مباشر (Direct Extraction)' },
    { value: 'bunny_hls', label: 'Bunny Stream (HLS - media_kit)' },
    { value: 'bunny_native', label: 'Bunny Stream (مشغل بديل - يعمل بدون media_kit)' },
    { value: 'youtube', label: 'مشغل يوتيوب (YouTube)' },
  ];


  // 2. حالة إصدارات التطبيق
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  // دالة عرض التنبيهات
  const showToast = (msg, type = 'success') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  // جلب البيانات عند التحميل
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await Promise.all([fetchSettings(), fetchVersions()]);
      setLoading(false);
    };
    initData();
  }, []);

  // --- دوال الإعدادات العامة ---
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/dashboard/super/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
            ...prev,
            platform_percentage: data.platform_percentage || '10',
            support_telegram: data.support_telegram || '',
            support_whatsapp: data.support_whatsapp || '',
            free_mode: data.free_mode === 'true' || data.free_mode === true,
            // ✅ السيرفر يرجع الشكل الديناميكي دائماً (مطبّعاً تلقائياً حتى
            // لو كانت البيانات القديمة محفوظة بالشكل السابق)، فنستخدمه مباشرة
            // إن وُجدت مصفوفة players صالحة، وإلا نبقي على القيمة الافتراضية.
            player_settings: (data.player_settings && Array.isArray(data.player_settings.players))
              ? data.player_settings
              : prev.player_settings
        }));
      }
    } catch (err) {
      console.error(err);
      showToast('فشل جلب الإعدادات العامة', 'error');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/super/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const result = await res.json();
      if (res.ok) {
        showToast('تم حفظ الإعدادات العامة بنجاح');
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  };

  // دالة تحديث حقل معين لمشغل موجود في المصفوفة (بحث عبر id)
  const handlePlayerChange = (playerId, field, value) => {
    setSettings(prev => ({
      ...prev,
      player_settings: {
        ...prev.player_settings,
        players: prev.player_settings.players.map(p =>
          p.id === playerId ? { ...p, [field]: value } : p
        )
      }
    }));
  };

  // ✅ إضافة مشغل جديد فارغ إلى المصفوفة (يظهر مباشرة في النموذج للتعديل)
  const handleAddPlayer = () => {
    setSettings(prev => {
      const players = prev.player_settings.players;
      const newPlayer = {
        id: `player_${Date.now()}`,
        engine: 'bunny_hls',
        enabled: true,
        name: 'مشغل جديد',
        description: '',
        order: players.length + 1,
      };
      return {
        ...prev,
        player_settings: { ...prev.player_settings, players: [...players, newPlayer] }
      };
    });
  };

  // ✅ حذف مشغل من المصفوفة
  const handleRemovePlayer = (playerId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المشغل؟')) return;
    setSettings(prev => ({
      ...prev,
      player_settings: {
        ...prev.player_settings,
        players: prev.player_settings.players.filter(p => p.id !== playerId)
      }
    }));
  };

  // دالة تحديث إعدادات التحميل
  const handleDownloadChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      player_settings: {
        ...prev.player_settings,
        downloads: {
          ...prev.player_settings.downloads,
          [field]: value
        }
      }
    }));
  };

  // --- دوال إصدارات التطبيق ---
  const fetchVersions = async () => {
    try {
      const res = await fetch('/api/dashboard/super/app-versions');
      if (res.ok) {
        const data = await res.json();
        setVersions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      showToast('فشل جلب بيانات الإصدارات', 'error');
    }
  };

  const handleVersionChange = (index, field, value) => {
    const updatedVersions = [...versions];
    updatedVersions[index] = { ...updatedVersions[index], [field]: value };
    setVersions(updatedVersions);
  };

  // 🆕 خطوة 20: أسماء المنصات (android / ios / huawei)
  const platformShortName = (platform) =>
    platform === 'android' ? 'الاندرويد' : platform === 'huawei' ? 'هواوي' : 'الايفون';
  const platformTitle = (platform) =>
    platform === 'android' ? '🤖 إعدادات Android' : platform === 'huawei' ? '🔶 إعدادات Huawei (AppGallery)' : '🍎 إعدادات iOS';

  // 🆕 إنشاء صف إصدارات هواوي من اللوحة (بدون SQL)
  const createPlatformVersion = async (platform) => {
    setLoadingVersions(true);
    try {
      const res = await fetch('/api/dashboard/super/app-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`تم إنشاء إعدادات ${platformShortName(platform)}، عدّل الحقول ثم احفظ`);
        await fetchVersions();
      } else {
        showToast(data.error || 'تعذر إنشاء الإعدادات', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطأ في الاتصال', 'error');
    } finally {
      setLoadingVersions(false);
    }
  };

  const saveVersion = async (index) => {
    const versionData = versions[index];
    setLoadingVersions(true);
    try {
      const res = await fetch('/api/dashboard/super/app-versions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versionData)
      });

      if (res.ok) {
        showToast(`تم تحديث إعدادات ${platformShortName(versionData.platform)} بنجاح`);
        fetchVersions();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'حدث خطأ أثناء التحديث', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطأ في الاتصال', 'error');
    } finally {
      setLoadingVersions(false);
    }
  };

  return (
    <SuperLayout title="إعدادات المنصة">
      <Head>
        <title>إعدادات النظام | الإدارة العليا</title>
      </Head>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>
        {toast.message}
      </div>

      <div className="settings-container">
        
        {/* Header Section */}
        <div className="page-header">
          <div className="header-title-wrap">
            <div className="header-icon"><SettingsIcon /></div>
            <div>
              <h1>إعدادات المنصة العامة</h1>
              <p>التحكم في المشغلات، التحميل، النسب المالية، وإصدارات التطبيق</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>جاري تحميل الإعدادات...</span>
          </div>
        ) : (
          <div className="settings-grid">
            
            {/* ================= قسم الإعدادات العامة ================= */}
            <form onSubmit={handleSaveSettings} className="settings-grid">
              
              {/* 1. وضع التطبيق */}
              <div className="card highlight-card">
                <div className="card-header">
                  <h3><UnlockIcon /> وضع التطبيق (App Mode)</h3>
                </div>
                <div className="card-body">
                  <label className="checkbox-label large">
                    <input 
                      type="checkbox" 
                      checked={settings.free_mode} 
                      onChange={(e) => setSettings({...settings, free_mode: e.target.checked})}
                    />
                    <span>تفعيل الوضع المجاني (Free Mode)</span>
                  </label>
                  <p className="hint mt-2">
                    عند تفعيل هذا الوضع: تختفي الأسعار من التطبيق، ويتحول زر "شراء" إلى "تفعيل مجاني". 
                    <br/><span style={{color: 'var(--text-secondary)'}}>تأكد من تفعيل هذا الوضع فقط عند الحاجة.</span>
                  </p>
                </div>
              </div>

              {/* ✅ 2. إعدادات المشغلات */}
              <div className="card">
                <div className="card-header">
                  <h3><PlayIcon /> إعدادات مشغلات الفيديو (Video Players)</h3>
                </div>
                <div className="card-body">
                  <p className="hint mb-4">
                    يمكنك هنا إضافة أو حذف أي عدد من المشغلات، تفعيلها أو إيقافها، تغيير أسمائها،
                    ترتيبها في نافذة الطالب (الرقم الأقل يظهر أولاً)، وتحديد مصدر الفيديو (Engine) الذي يعمل به كل مشغل.
                  </p>

                  {[...settings.player_settings.players]
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map((pData) => (
                      <div key={pData.id} className="player-config-box">
                        <div className="player-box-header">
                          <h4>{pData.name || 'مشغل بدون اسم'}</h4>
                          <label className="switch">
                            <input 
                              type="checkbox" 
                              checked={pData.enabled} 
                              onChange={e => handlePlayerChange(pData.id, 'enabled', e.target.checked)}
                            />
                            <span className="slider round"></span>
                          </label>
                          <span className="status-text" style={{ color: pData.enabled ? '#4ade80' : 'var(--text-muted)' }}>
                            {pData.enabled ? 'مفعل' : 'معطل'}
                          </span>
                          <button
                            type="button"
                            className="save-btn small-action"
                            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', boxShadow: 'none' }}
                            onClick={() => handleRemovePlayer(pData.id)}
                            title="حذف هذا المشغل"
                          >
                            حذف
                          </button>
                        </div>

                        <div className="grid-3 mt-3">
                          <div className="form-group">
                            <label>الاسم الذي يظهر للطلاب</label>
                            <input 
                              type="text" 
                              className="input-field" 
                              value={pData.name} 
                              onChange={e => handlePlayerChange(pData.id, 'name', e.target.value)} 
                              required 
                            />
                          </div>
                          <div className="form-group">
                            <label>الوصف أسفل الاسم</label>
                            <input 
                              type="text" 
                              className="input-field" 
                              value={pData.description} 
                              onChange={e => handlePlayerChange(pData.id, 'description', e.target.value)} 
                            />
                          </div>
                          <div className="form-group">
                            <label>الترتيب</label>
                            <input 
                              type="number" 
                              className="input-field ltr text-center" 
                              value={pData.order} 
                              onChange={e => handlePlayerChange(pData.id, 'order', Number(e.target.value))} 
                              min="1" 
                              required 
                            />
                          </div>
                        </div>

                        <div className="form-group mt-3">
                          <label>مصدر الفيديو (Engine)</label>
                          <select
                            className="input-field"
                            value={pData.engine}
                            onChange={e => handlePlayerChange(pData.id, 'engine', e.target.value)}
                          >
                            {ENGINE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <span className="hint mt-2">
                            {pData.engine === 'youtube'
                              ? 'هذا المشغل يظهر فقط للفيديوهات التي تملك رابط يوتيوب مرتبط بها.'
                              : pData.engine === 'bunny_hls'
                              ? 'يستخدم روابط Bunny Stream (HLS) القادمة من get-video-id، ويُشغَّل بواجهة media_kit.'
                              : pData.engine === 'bunny_native'
                              ? 'نفس روابط Bunny Stream (HLS)، لكن يُشغَّل بواجهة مشغل بديلة (لا تعتمد على media_kit) لحل مشاكل التوافق على بعض الأجهزة.'
                              : 'يستخدم الاستخراج المباشر لروابط الفيديو عبر get-stream-proxy.'}
                          </span>
                        </div>
                      </div>
                    ))}

                  <button
                    type="button"
                    className="save-btn small-action"
                    style={{ width: '100%', marginTop: '4px' }}
                    onClick={handleAddPlayer}
                  >
                    + إضافة مشغل جديد
                  </button>
                </div>
              </div>

              {/* ✅ 3. إعدادات التحميل */}
              <div className="card">
                <div className="card-header">
                  <h3><DownloadIcon /> إعدادات التحميل (Offline Download)</h3>
                </div>
                <div className="card-body">
                  <label className="checkbox-label mb-3">
                    <input 
                      type="checkbox" 
                      checked={settings.player_settings.downloads.video_enabled} 
                      onChange={e => handleDownloadChange('video_enabled', e.target.checked)} 
                    />
                    <span>السماح للطلاب بتحميل الفيديوهات لمشاهدتها بدون إنترنت</span>
                  </label>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={settings.player_settings.downloads.pdf_enabled} 
                      onChange={e => handleDownloadChange('pdf_enabled', e.target.checked)} 
                    />
                    <span>السماح للطلاب بتحميل وحفظ ملفات الـ PDF</span>
                  </label>
                </div>
              </div>

              {/* 4. الإعدادات المالية */}
              <div className="card">
                <div className="card-header">
                  <h3><MoneyIcon /> الإعدادات المالية</h3>
                </div>
                <div className="card-body">
                  <div className="form-group">
                    <label>نسبة المنصة من مبيعات المدرسين (%)</label>
                    <div className="input-wrapper">
                      <input 
                        type="number" 
                        className="input-field"
                        placeholder="مثال: 10"
                        value={settings.platform_percentage}
                        onChange={(e) => setSettings({...settings, platform_percentage: e.target.value})}
                        min="0"
                        max="100"
                        required
                      />
                      <span className="suffix">%</span>
                    </div>
                    <p className="hint mt-2">يتم خصم هذه النسبة تلقائياً من إجمالي مبيعات المدرس عند حساب الأرباح.</p>
                  </div>
                </div>
              </div>

              {/* 5. روابط الدعم الفني */}
              <div className="card">
                <div className="card-header">
                  <h3><HeadphonesIcon /> روابط الدعم الفني</h3>
                </div>
                <div className="card-body">
                  <div className="grid-2">
                    <div className="form-group">
                      <label>رابط قناة/جروب التليجرام (Telegram)</label>
                      <input 
                        type="url" 
                        className="input-field ltr"
                        placeholder="https://t.me/..."
                        value={settings.support_telegram}
                        onChange={(e) => setSettings({...settings, support_telegram: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>رابط التواصل واتساب (WhatsApp)</label>
                      <input 
                        type="url" 
                        className="input-field ltr"
                        placeholder="https://wa.me/201xxxxxxx"
                        value={settings.support_whatsapp}
                        onChange={(e) => setSettings({...settings, support_whatsapp: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* زر الحفظ للإعدادات العامة (Sticky Button) */}
              <div className="sticky-actions">
                <button type="submit" className="save-btn main-action" disabled={saving}>
                  {saving ? <span className="spinner small-spinner"></span> : <><SaveIcon /> حفظ جميع الإعدادات العامة</>}
                </button>
              </div>
            </form>

            <div className="section-divider">
              <span>تحديثات التطبيق</span>
            </div>

            {/* ================= قسم إصدارات التطبيق ================= */}
            <div className="page-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="header-title-wrap">
                <div className="header-icon"><SmartphoneIcon /></div>
                <div>
                  <h1>إصدارات التطبيق (Versions)</h1>
                  <p>التحكم في التحديثات الإجبارية وأرقام الإصدارات</p>
                </div>
              </div>
            </div>

            {versions.map((ver, index) => (
              <div key={ver.id || index} className="card">
                <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {platformTitle(ver.platform)}
                  </h3>
                  {ver.force_update && <span className="badge-red">إجباري مفعل</span>}
                </div>
                <div className="card-body">
                  <div className="grid-2">
                    <div className="form-group">
                      <label>الإصدار الحالي (Latest Version)</label>
                      <input 
                        type="text" 
                        className="input-field ltr text-center"
                        value={ver.latest_version}
                        onChange={(e) => handleVersionChange(index, 'latest_version', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>الحد الأدنى للإجبار (Min Version)</label>
                      <input 
                        type="text" 
                        className="input-field ltr text-center"
                        value={ver.min_version}
                        onChange={(e) => handleVersionChange(index, 'min_version', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group mt-3">
                    <label>رابط المتجر (Store URL){ver.platform === 'huawei' ? ' - رابط التطبيق في AppGallery' : ''}</label>
                    <input 
                      type="text" 
                      className="input-field ltr"
                      value={ver.store_url || ''}
                      onChange={(e) => handleVersionChange(index, 'store_url', e.target.value)}
                    />
                  </div>

                  <div className="form-group mt-3">
                    <label>رسالة التحديث للمستخدم</label>
                    <textarea 
                      className="input-field"
                      rows="2"
                      value={ver.message}
                      onChange={(e) => handleVersionChange(index, 'message', e.target.value)}
                    />
                  </div>

                  <div className="row-actions">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={ver.force_update} 
                        onChange={(e) => handleVersionChange(index, 'force_update', e.target.checked)}
                      />
                      <span>إجبار المستخدمين على التحديث</span>
                    </label>

                    <button 
                      type="button" 
                      className="save-btn small-action" 
                      disabled={loadingVersions}
                      onClick={() => saveVersion(index)}
                    >
                      {loadingVersions ? 'جاري التحديث...' : `تحديث ${platformShortName(ver.platform)}`}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* 🆕 صف هواوي غير موجود بعد: إنشاؤه بضغطة واحدة بدل تشغيل SQL */}
            {versions.length > 0 && !versions.some((v) => v.platform === 'huawei') && (
              <div className="card">
                <div className="card-header">
                  <h3 style={{ margin: 0 }}>{platformTitle('huawei')}</h3>
                </div>
                <div className="card-body">
                  <p style={{ marginTop: 0 }}>
                    لم يتم إعداد تحديثات هواوي بعد. أجهزة هواوي بدون خدمات جوجل تحدّث من AppGallery
                    ولها إصدار ورابط خاصان بها. لن يظهر تحديث لأحد حتى تضبط الإصدار والرابط وتحفظ.
                  </p>
                  <button
                    type="button"
                    className="save-btn small-action"
                    disabled={loadingVersions}
                    onClick={() => createPlatformVersion('huawei')}
                  >
                    {loadingVersions ? 'جاري الإنشاء...' : 'إنشاء إعدادات هواوي'}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      <style jsx>{`
        .settings-container { max-width: 900px; margin: 0 auto; padding-bottom: 80px; }
        
        /* ── HEADERS ── */
        .page-header { 
          margin-bottom: 30px; 
          border-bottom: 1px solid var(--border); 
          padding-bottom: 20px; 
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

        .section-divider { 
          margin: 45px 0 25px 0; 
          color: var(--text-muted); 
          font-weight: 700; 
          font-size: 0.9rem; 
          text-transform: uppercase; 
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .section-divider::before, .section-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--border);
        }

        .settings-grid { display: flex; flex-direction: column; gap: 24px; }

        /* ── CARDS ── */
        .card { 
          background: var(--bg-surface); 
          border: 1px solid var(--border); 
          border-radius: 16px; 
          overflow: hidden; 
          box-shadow: var(--shadow);
          transition: border-color 0.2s;
        }
        .card:hover { border-color: var(--gold-dim); }
        
        .highlight-card { 
          border: 1px solid var(--border-accent); 
          box-shadow: 0 4px 20px var(--gold-dimmer); 
        }
        
        .card-header { 
          background: var(--bg-elevated); 
          padding: 18px 24px; 
          border-bottom: 1px solid var(--border); 
        }
        .card-header h3 { 
          margin: 0; 
          color: var(--gold); 
          font-size: 1.1rem; 
          display: flex; 
          align-items: center; 
          gap: 10px; 
          font-weight: 700;
        }
        .card-body { padding: 24px; }

        /* ── GRIDS ── */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 120px; gap: 15px; }
        @media (max-width: 600px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

        /* ── PLAYER CONFIG BOX ── */
        .player-config-box { 
          background: var(--bg-elevated); 
          padding: 18px; 
          border-radius: 12px; 
          border: 1px solid var(--border); 
          margin-bottom: 18px; 
        }
        .player-config-box:last-child { margin-bottom: 0; }
        .player-box-header {
          display: flex;
          align-items: center;
          gap: 15px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 12px;
        }
        .player-box-header h4 { 
          margin: 0; 
          color: var(--text-primary); 
          font-size: 1rem; 
          font-weight: 700;
          flex: 1;
        }
        .status-text { font-size: 0.85rem; font-weight: 600; }

        /* ── FORMS & INPUTS ── */
        .form-group { margin-bottom: 20px; }
        .form-group:last-child { margin-bottom: 0; }
        
        label { 
          display: block; 
          color: var(--text-secondary); 
          margin-bottom: 8px; 
          font-weight: 600; 
          font-size: 0.95rem; 
        }
        
        .input-wrapper { position: relative; }
        .input-field { 
          width: 100%; 
          padding: 14px 16px; 
          background: var(--bg-base); 
          border: 1px solid var(--border); 
          border-radius: 10px; 
          color: var(--text-primary); 
          font-size: 0.95rem; 
          transition: all 0.2s; 
          font-family: inherit;
        }
        .input-field:focus { 
          border-color: var(--gold); 
          outline: none; 
          box-shadow: 0 0 0 3px var(--gold-dim); 
        }
        .input-field.ltr { direction: ltr; text-align: left; font-family: monospace; font-size: 1rem; }
        .input-field.text-center { text-align: center; }
        textarea.input-field { resize: vertical; line-height: 1.5; }
        
        .suffix { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 700; }

        .hint { display: block; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; }
        .mb-3 { margin-bottom: 15px; }
        .mb-4 { margin-bottom: 20px; }
        .mt-2 { margin-top: 8px; }
        .mt-3 { margin-top: 15px; }

        /* ── CHECKBOXES & SWITCHES ── */
        .checkbox-label { 
          display: flex; align-items: center; gap: 10px; 
          cursor: pointer; color: var(--text-primary); font-weight: 600; 
        }
        .checkbox-label.large { color: var(--gold); font-size: 1.05rem; }
        .checkbox-label input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--gold); }
        .checkbox-label.large input { width: 22px; height: 22px; }

        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border); transition: .3s; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: var(--text-primary); transition: .3s; }
        input:checked + .slider { background-color: var(--gold); }
        input:checked + .slider:before { transform: translateX(20px); background-color: #111009; }
        .slider.round { border-radius: 24px; }
        .slider.round:before { border-radius: 50%; }

        /* ── BUTTONS ── */
        .sticky-actions {
          position: sticky; 
          bottom: 20px; 
          z-index: 100;
          background: var(--bg-surface);
          padding: 16px;
          border-radius: 16px;
          border: 1px solid var(--border-accent);
          box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        }
        
        .save-btn { 
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: var(--gold); 
          color: #111009; 
          border: none; 
          border-radius: 10px; 
          font-weight: 800; 
          cursor: pointer; 
          transition: all 0.2s; 
        }
        .save-btn.main-action { width: 100%; padding: 16px; font-size: 1.1rem; }
        .save-btn.small-action { padding: 10px 20px; font-size: 0.95rem; }
        .save-btn:hover:not(:disabled) { 
          background: var(--gold-light); 
          transform: translateY(-2px); 
          box-shadow: 0 6px 20px rgba(201,168,76,0.25);
        }
        .save-btn:disabled { background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); cursor: not-allowed; box-shadow: none; }

        .row-actions { 
          display: flex; justify-content: space-between; align-items: center; 
          margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); 
        }

        .badge-red { 
          background: rgba(239, 68, 68, 0.15); 
          color: #f87171; 
          padding: 6px 12px; 
          border-radius: 20px; 
          font-size: 0.75rem; 
          font-weight: 700; 
          border: 1px solid #ef4444;
        }

        /* ── LOADING & TOAST ── */
        .loading-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--gold); font-weight: bold; }
        .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .small-spinner { width: 22px; height: 22px; border-width: 3px; border-top-color: #111009; border-color: rgba(17,16,9,0.2); }
        @keyframes spin { to { transform: rotate(360deg); } }

        .toast { 
          position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); 
          background: var(--bg-surface); 
          color: var(--text-primary); 
          padding: 14px 28px; 
          border-radius: 50px; 
          font-weight: 700; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.6); 
          z-index: 2000; 
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
          opacity: 0; 
          border: 1px solid var(--border); 
        }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.success { border-bottom: 3px solid #4ade80; }
        .toast.error { border-bottom: 3px solid #f87171; }
      `}</style>
    </SuperLayout>
  );
}
