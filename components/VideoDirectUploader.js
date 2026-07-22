// components/VideoDirectUploader.js
// ===================================================================
// 📱 مكوّن رفع الفيديو المباشر (يستخدم useBunnyDirectUpload)
// استبدل عنصر رفع الفيديو الحالي في content.js بهذا المكوّن
// ===================================================================

import { useRef, useState } from 'react';
import { useBunnyDirectUpload } from '../hooks/useBunnyDirectUpload';

const STATUS_LABELS = {
  idle:         '',
  requesting:   'جاري إعداد جلسة الرفع...',
  uploading:    'جاري رفع الفيديو مباشرة إلى Bunny...',
  confirming:   'جاري حفظ البيانات...',
  reconnecting: 'انقطع الاتصال، جاري إعادة المحاولة تلقائياً...',
  done:         '✅ تم رفع الفيديو بنجاح',
  error:        '❌ حدث خطأ أو انقطع الاتصال',
  cancelled:    'تم إلغاء الرفع',
};

/**
 * @param {Object} props
 * @param {string}   props.chapterId       - معرف الفصل
 * @param {string}   [props.videoTitle]    - عنوان الفيديو (اختياري)
 * @param {boolean}  [props.notifyStudents]
 * @param {Function} [props.onUploadDone]  - callback (videoId, bunnyVideoId)
 */
export default function VideoDirectUploader({
  chapterId,
  videoTitle,
  notifyStudents = false,
  onUploadDone,
}) {
  const fileInputRef = useRef(null);
  
  // ✅ الاحتفاظ بملف الفيديو في الـ State لاستخدامه عند الاستكمال أو إعادة الضبط
  const [selectedFile, setSelectedFile] = useState(null);

  // ✅ استخراج دالة resume من الـ Hook
  const { startUpload, cancel, reset, resume, progress, status, error } = useBunnyDirectUpload();

  const isActive = ['requesting', 'uploading', 'confirming', 'reconnecting'].includes(status);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file); // حفظ الملف في الـ State

    await startUpload({
      file,
      chapterId,
      title: videoTitle || file.name,
      notifyStudents,
      onComplete: (data) => {
        onUploadDone?.(data.videoId, data.bunnyVideoId);
      },
      onError: (err) => {
        console.error('Direct upload error:', err);
      },
    });

    // إعادة تعيين الـ input حتى يمكن اختيار نفس الملف مرة أخرى
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="video-uploader">
      {/* زر اختيار الملف */}
      {!isActive && status !== 'done' && status !== 'error' && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-upload"
          >
            📹 رفع فيديو
          </button>
        </>
      )}

      {/* شريط التقدم */}
      {isActive && (
        <div className="upload-progress">
          <p className="status-label">{status === 'reconnecting' && error ? error : STATUS_LABELS[status]}</p>

          {(status === 'uploading' || status === 'reconnecting') && (
            <>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="progress-text">{progress}%</p>
            </>
          )}

          <button onClick={cancel} className="btn-cancel">
            إلغاء
          </button>
        </div>
      )}

      {/* حالة الاكتمال */}
      {status === 'done' && (
        <div className="upload-done">
          <p>{STATUS_LABELS.done}</p>
          <p className="note">
            سيظل الفيديو في طور المعالجة على Bunny لبضع دقائق قبل أن يصبح
            قابلاً للمشاهدة. يمكنك متابعة الحالة من قائمة الفيديوهات.
          </p>
          {/* تمرير الملف لعمل تنظيف للجلسة بشكل صحيح */}
          <button onClick={() => reset(selectedFile)} className="btn-reset">
            رفع فيديو آخر
          </button>
        </div>
      )}

      {/* رسالة الخطأ أو انقطاع الإنترنت */}
      {status === 'error' && (
        <div className="upload-error">
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'center' }}>
            {/* ✅ زر الاستكمال الجديد: يستدعي الكائن الحالي ويكمل من حيث توقف مباشرة */}
            <button onClick={resume} className="btn-upload">
              ▶️ استكمال الرفع
            </button>
            
            {/* ✅ زر الإلغاء: يمرر الملف الفعلي لتنظيف الـ localStorage وإنهاء الجلسة المعلقة */}
            <button onClick={() => reset(selectedFile)} className="btn-cancel">
              إلغاء ورفع من جديد
            </button>
          </div>
        </div>
      )}

      {/* حالة الإلغاء */}
      {status === 'cancelled' && (
        <div>
          <p>{STATUS_LABELS.cancelled}</p>
          <button onClick={() => reset(selectedFile)} className="btn-reset">رفع من جديد</button>
        </div>
      )}
    </div>
  );
}
