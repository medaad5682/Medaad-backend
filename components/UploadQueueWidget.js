import { useState } from 'react';

// ===================================================================
// 🎯 UploadQueueWidget
// نافذة عائمة صغيرة تظهر أسفل الشاشة وتعرض كل عمليات رفع الفيديو
// الجارية/المنتهية إلى Bunny Stream — تسمح للمعلم بمتابعة عدة رفعات
// في نفس الوقت دون أن تمنعه من فتح نافذة "إضافة فيديو" لفصل آخر.
// ===================================================================

const STATUS_LABELS = {
  requesting: 'جاري إعداد جلسة الرفع...',
  uploading: 'جاري الرفع...',
  confirming: 'جاري حفظ البيانات...',
  reconnecting: 'انقطع الاتصال، جاري إعادة المحاولة تلقائياً...',
  done: 'اكتمل الرفع',
  error: 'حدث خطأ',
  cancelled: 'تم الإلغاء',
};

// --- أيقونات SVG (بنفس أسلوب الأيقونات المستخدمة في باقي لوحة التحكم) ---
const Icons = {
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>,
  chevronUp: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>,
  chevronDown: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>,
  folder: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  checkCircle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
  xCircle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
  stopCircle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>,
};

function StatusIcon({ status }) {
  if (status === 'done') return <span style={{ color: 'var(--success, #22c55e)', display: 'inline-flex' }}>{Icons.checkCircle}</span>;
  if (status === 'error') return <span style={{ color: 'var(--danger, #ef4444)', display: 'inline-flex' }}>{Icons.xCircle}</span>;
  if (status === 'cancelled') return <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{Icons.stopCircle}</span>;
  return <span className="spinner" />;
}

export default function UploadQueueWidget({ uploads, onCancel, onResume, onDismiss }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!uploads || uploads.length === 0) return null;

  const activeCount = uploads.filter((u) =>
    ['requesting', 'uploading', 'confirming', 'reconnecting'].includes(u.status)
  ).length;

  return (
    <div className={`upload-queue-widget ${collapsed ? 'collapsed' : ''}`}>
      <div className="uqw-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="uqw-title">
          <span className="uqw-title-icon">{Icons.upload}</span>
          رفع الفيديوهات {activeCount > 0 ? `(${activeCount} جارٍ)` : ''}
        </span>
        <button
          type="button"
          className="uqw-toggle"
          onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
          aria-label={collapsed ? 'توسيع' : 'تصغير'}
        >
          {collapsed ? Icons.chevronUp : Icons.chevronDown}
        </button>
      </div>

      {!collapsed && (
        <div className="uqw-list">
          {uploads.map((u) => (
            <div key={u.id} className="uqw-item">
              <div className="uqw-item-top">
                <StatusIcon status={u.status} />
                <div className="uqw-item-text">
                  <div className="uqw-item-title" title={u.title}>{u.title}</div>
                  {(u.chapterTitle || u.subjectTitle || u.courseTitle) && (
                    <div className="uqw-item-sub" title={[u.title, u.chapterTitle, u.subjectTitle, u.courseTitle].filter(Boolean).join(' - ')}>
                      <span className="uqw-sub-icon">{Icons.folder}</span>
                      <span className="uqw-sub-path">
                        {[u.chapterTitle, u.subjectTitle, u.courseTitle].filter(Boolean).join(' - ')}
                      </span>
                    </div>
                  )}
                </div>
                {['done', 'error', 'cancelled'].includes(u.status) && (
                  <button
                    type="button"
                    className="uqw-dismiss"
                    onClick={() => onDismiss?.(u.id)}
                    aria-label="إغلاق"
                  >
                    {Icons.close}
                  </button>
                )}
              </div>

              {['requesting', 'uploading', 'confirming', 'reconnecting'].includes(u.status) && (
                <div className="uqw-progress-track">
                  <div className="uqw-progress-fill" style={{ width: `${u.progress}%` }} />
                </div>
              )}

              <div className="uqw-item-status">
                {(u.status === 'error' || u.status === 'reconnecting' || u.status === 'confirming') && u.error ? u.error : STATUS_LABELS[u.status]}
                {u.status === 'uploading' && ` ${u.progress}%`}
              </div>

              <div className="uqw-item-acts">
                {(u.status === 'uploading' || u.status === 'reconnecting') && (
                  <button type="button" className="uqw-btn cancel" onClick={() => onCancel?.(u.id)}>
                    إلغاء
                  </button>
                )}
                {u.status === 'error' && (
                  <>
                    <button type="button" className="uqw-btn resume" onClick={() => onResume?.(u.id)}>
                      استكمال
                    </button>
                    <button type="button" className="uqw-btn cancel" onClick={() => onDismiss?.(u.id)}>
                      تجاهل
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .upload-queue-widget {
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 320px;
          max-width: calc(100vw - 40px);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
          z-index: 9999;
          overflow: hidden;
          direction: rtl;
        }

        .uqw-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: var(--gold-dimmer);
          cursor: pointer;
          user-select: none;
        }

        .uqw-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--gold);
        }

        .uqw-title-icon {
          display: inline-flex;
          flex-shrink: 0;
        }

        .uqw-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--gold);
          cursor: pointer;
          padding: 4px;
        }

        .uqw-list {
          max-height: 320px;
          overflow-y: auto;
          padding: 8px;
        }

        .uqw-item {
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 8px;
        }
        .uqw-item:last-child { margin-bottom: 0; }

        .uqw-item-top {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .uqw-item-text {
          flex: 1;
          min-width: 0;
        }

        .uqw-item-title {
          font-size: 0.85rem;
          color: var(--text-primary);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .uqw-item-sub {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
          min-width: 0;
        }

        .uqw-sub-icon {
          display: inline-flex;
          flex-shrink: 0;
        }

        .uqw-sub-path {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .uqw-dismiss {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px 4px;
        }
        .uqw-dismiss:hover { color: var(--danger, #ef4444); }

        .uqw-progress-track {
          width: 100%;
          height: 6px;
          background: var(--bg-elevated);
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          margin-top: 8px;
        }

        .uqw-progress-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.2s ease;
        }

        .uqw-item-status {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 6px;
        }

        .uqw-item-acts {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .uqw-btn {
          flex: 1;
          font-size: 0.75rem;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .uqw-btn.resume { border-color: var(--gold); color: var(--gold); }
        .uqw-btn.resume:hover { background: var(--gold-dim); }
        .uqw-btn.cancel:hover { border-color: var(--danger, #ef4444); color: var(--danger, #ef4444); }

        .spinner {
          width: 14px;
          height: 14px;
          margin-top: 2px;
          border: 2px solid var(--border);
          border-top-color: var(--gold);
          border-radius: 50%;
          display: inline-block;
          animation: uqw-spin 0.8s linear infinite;
        }

        @keyframes uqw-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .upload-queue-widget { left: 10px; bottom: 10px; width: calc(100vw - 20px); }
        }
      `}</style>
    </div>
  );
}
