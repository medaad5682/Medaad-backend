import { useState, useEffect } from 'react';
import SuperLayout from '../../../components/SuperLayout';

export default function AppCheckWhitelistManager() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  const [confirmData, setConfirmData] = useState({ show: false, msg: '', action: null });

  const [formData, setFormData] = useState({ value: '', label: '', note: '' });

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg, type }), 3000);
  };

  const showConfirm = (msg, action) => {
    setConfirmData({ show: true, msg, action });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/appcheck-whitelist');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      showToast('خطأ في جلب البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const executeAction = async (action, payload = {}) => {
    setConfirmData({ show: false, msg: '', action: null });
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/super/appcheck-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        fetchData();
      } else {
        showToast(data.error || data.message, 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!formData.value.trim()) {
      showToast('يجب إدخال معرّف الجهاز أو اسم المستخدم أو رقم الهاتف', 'error');
      return;
    }
    executeAction('add', formData);
    setFormData({ value: '', label: '', note: '' });
  };

  return (
    <SuperLayout title="القائمة البيضاء لفحص App Check">
      <div className="whitelist-wrapper">
        <div className="page-header">
          <div>
            <h1>🛡️ القائمة البيضاء لفحص App Check</h1>
            <p>
              أضف مستخدماً متأثراً بمشكلة عدم توليد توكن Firebase App Check (مثل بعض هواتف هواوي)
              بكتابة <strong>اسم المستخدم</strong> أو <strong>رقم الهاتف</strong> أو
              <strong> معرّف المستخدم (user_id)</strong> مباشرة - سيبحث النظام تلقائياً عن الحساب
              في قاعدة البيانات ويستخرج user_id الحقيقي ويخزّنه، دون الحاجة للبحث عنه يدوياً. أي
              طلب مُصادَق يحمل توكن هذا المستخدم سيتم قبوله حتى بدون توكن App Check صالح.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>➕ إضافة عنصر جديد</h2>
          </div>
          <div className="panel-body">
            <form onSubmit={handleAdd} className="add-form">
              <div className="form-group">
                <label>اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني أو user_id (سيتم استخراج user_id تلقائياً) *</label>
                <input
                  className="input"
                  type="text"
                  placeholder="مثال: username123 أو 01012345678 أو example@mail.com أو 42"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>اسم المستخدم (للتوضيح فقط)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="مثال: أحمد محمد"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>ملاحظة</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="مثال: هاتف هواوي - لا يدعم App Check"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>
              </div>
              <button type="submit" className="btn primary" disabled={loading}>
                إضافة إلى القائمة البيضاء
              </button>
            </form>
          </div>
        </div>

        <div className="panel mt-panel">
          <div className="panel-header">
            <h2>📋 العناصر الحالية ({items.length})</h2>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>المعرّف</th>
                  <th>الاسم</th>
                  <th>ملاحظة</th>
                  <th>الحالة</th>
                  <th>تاريخ الإضافة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="empty-msg">
                      لا توجد عناصر في القائمة البيضاء حتى الآن
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.value}</td>
                    <td>{item.label || '-'}</td>
                    <td className="sub-txt">{item.note || '-'}</td>
                    <td>
                      <span className={`status-tag ${item.is_active ? 'active' : 'inactive'}`}>
                        {item.is_active ? 'مفعّل' : 'معطّل'}
                      </span>
                    </td>
                    <td className="sub-txt">{new Date(item.created_at).toLocaleString('ar-EG')}</td>
                    <td className="actions-cell">
                      <button
                        className="icon-btn"
                        title={item.is_active ? 'تعطيل' : 'تفعيل'}
                        onClick={() =>
                          showConfirm(
                            item.is_active ? 'هل تريد تعطيل هذا العنصر؟' : 'هل تريد تفعيل هذا العنصر؟',
                            () => executeAction('toggle', { id: item.id, is_active: !item.is_active })
                          )
                        }
                      >
                        {item.is_active ? '⏸️' : '▶️'}
                      </button>
                      <button
                        className="icon-btn delete"
                        title="حذف"
                        onClick={() =>
                          showConfirm('هل أنت متأكد من حذف هذا العنصر نهائياً؟', () =>
                            executeAction('delete', { id: item.id })
                          )
                        }
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {confirmData.show && (
          <div className="modal-overlay blur-bg">
            <div className="modal-box confirm-box">
              <h3>⚠️ تأكيد الإجراء</h3>
              <p>{confirmData.msg}</p>
              <div className="modal-footer centered">
                <button className="btn cancel" onClick={() => setConfirmData({ show: false })}>
                  تراجع
                </button>
                <button className="btn success-btn" onClick={confirmData.action}>
                  نعم، تأكيد
                </button>
              </div>
            </div>
          </div>
        )}

        {toast.show && <div className={`toast show ${toast.type}`}>{toast.msg}</div>}

        <style jsx>{`
          .whitelist-wrapper {
            padding-bottom: 50px;
            color: var(--text-primary);
          }
          .page-header {
            margin-bottom: 25px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 20px;
          }
          .page-header h1 {
            margin: 0 0 8px 0;
            color: var(--text-primary);
            font-size: 1.8rem;
            font-weight: 800;
          }
          .page-header p {
            margin: 0;
            color: var(--text-secondary);
            line-height: 1.7;
            max-width: 800px;
          }

          .panel {
            background: var(--bg-surface);
            border-radius: 16px;
            border: 1px solid var(--border);
            overflow: hidden;
            box-shadow: var(--shadow);
          }
          .mt-panel {
            margin-top: 25px;
          }
          .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-elevated);
          }
          .panel-header h2 {
            margin: 0;
            font-size: 1.15rem;
            color: var(--text-primary);
            font-weight: bold;
          }
          .panel-body {
            padding: 20px;
          }

          .add-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .form-group label {
            display: block;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-size: 0.9rem;
            font-weight: bold;
          }
          .input {
            width: 100%;
            padding: 12px 15px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 1rem;
            transition: 0.2s;
          }
          .input:focus {
            border-color: var(--gold);
            outline: none;
            box-shadow: 0 0 0 2px var(--gold-dimmer);
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }

          .btn {
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
            font-size: 0.95rem;
            align-self: flex-start;
          }
          .btn.primary {
            background: var(--gold);
            color: #111009;
          }
          .btn.primary:hover {
            background: var(--gold-light);
            transform: translateY(-2px);
          }
          .success-btn {
            background: #22c55e;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            font-weight: bold;
            cursor: pointer;
          }
          .btn.cancel {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
          }

          .table-responsive {
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: right;
          }
          th {
            padding: 15px 20px;
            color: var(--text-muted);
            font-size: 0.85rem;
            text-transform: uppercase;
            background: var(--bg-elevated);
            border-bottom: 1px solid var(--border);
            font-weight: bold;
          }
          td {
            padding: 15px 20px;
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
            vertical-align: middle;
          }
          tr:last-child td {
            border-bottom: none;
          }
          tr:hover td {
            background: var(--bg-hover);
          }
          .mono {
            font-family: monospace;
            color: var(--text-primary);
            font-weight: bold;
          }
          .sub-txt {
            font-size: 0.85em;
            color: var(--text-muted);
          }
          .empty-msg {
            text-align: center;
            color: var(--text-muted);
            padding: 30px;
            font-style: italic;
          }

          .status-tag {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: bold;
            border: 1px solid var(--border);
          }
          .status-tag.active {
            color: #4ade80;
            background: rgba(74, 222, 128, 0.1);
            border-color: rgba(74, 222, 128, 0.3);
          }
          .status-tag.inactive {
            color: #f87171;
            background: rgba(248, 113, 113, 0.1);
            border-color: rgba(248, 113, 113, 0.3);
          }

          .actions-cell {
            display: flex;
            gap: 8px;
          }
          .icon-btn {
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            width: 35px;
            height: 35px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.2s;
          }
          .icon-btn:hover {
            filter: brightness(1.2);
            transform: scale(1.05);
          }
          .icon-btn.delete {
            color: #ef4444;
          }
          .icon-btn.delete:hover {
            background: rgba(239, 68, 68, 0.1);
            border-color: #ef4444;
          }

          .blur-bg {
            backdrop-filter: blur(5px);
          }
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1200;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .modal-box {
            background: var(--bg-surface);
            width: 95%;
            max-width: 400px;
            border-radius: 16px;
            border: 1px solid var(--border-accent);
            padding: 25px;
            text-align: center;
          }
          .modal-box h3 {
            color: var(--gold);
            margin-top: 0;
          }
          .modal-footer.centered {
            display: flex;
            justify-content: center;
            gap: 10px;
            padding-top: 10px;
          }

          .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-elevated);
            color: var(--text-primary);
            padding: 12px 25px;
            border-radius: 50px;
            font-weight: bold;
            box-shadow: var(--shadow);
            z-index: 20000;
            border: 1px solid var(--border);
          }
          .toast.success {
            border-bottom: 3px solid #22c55e;
          }
          .toast.error {
            border-bottom: 3px solid #ef4444;
          }

          @media (max-width: 600px) {
            .grid-2 {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </SuperLayout>
  );
}
