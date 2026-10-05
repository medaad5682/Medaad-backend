import { verifyTeacher } from '../../../lib/teacherAuth';
import { checkTeacherPermission } from '../../../lib/teacherPermissions'; // ✅ التحقق من صلاحيات المعلم
import { supabase } from '../../../lib/supabaseClient'; // ✅ استيراد قاعدة البيانات
import admin from '../../../lib/firebaseAdmin'; // ✅ استيراد فايربيز للإشعارات
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto'; // ✅ استدعاء مكتبة التشفير لحساب بصمة الملف
import { postProcessUploadedPdf } from '../../../lib/ilovepdf'; // 🧾 iLoveAPI: ضغط الـ PDF

// إعدادات الكونفج الخاصة بـ Next.js
export const config = {
  api: {
    bodyParser: false, // يجب أن يكون false لكي يعمل multer
    responseLimit: false,
  },
};

// ---------------------------------------------------------
// 1. إعداد Multer مع سجلات تتبع (Logging)
// ---------------------------------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log(`[Upload Step 3] Multer is determining destination for: ${file.originalname}`);
    
    // تحديد المجلد بناءً على الامتداد
    const ext = path.extname(file.originalname).toLowerCase();
    let folder = 'others';
    
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        folder = 'exam_images'; 
    } else if (ext === '.pdf') {
        folder = 'pdfs';        
    }

    const uploadDir = path.join(process.cwd(), 'storage', folder);
    console.log(`[Upload Step 4] Target Folder: ${folder} | Path: ${uploadDir}`);

    // إنشاء المجلد إذا لم يكن موجوداً
    if (!fs.existsSync(uploadDir)) {
      console.log(`[Upload Step 4.1] Directory created: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
    
    console.log(`[Upload Step 5] Generated Filename: ${uniqueName}`);
    cb(null, uniqueName);
  }
});

// إعداد خيارات الرفع (حجم الملف 500 ميجا)
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } 
});

// دالة مساعدة لتشغيل الـ Middleware
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

// ---------------------------------------------------------
// 2. معالج الطلب الرئيسي (Handler)
// ---------------------------------------------------------
export default async (req, res) => {
  console.log("---------------------------------------------------------");
  console.log(`[Upload Step 0] New Request Received: ${req.method}`);
  
  if (req.method !== 'POST') {
      console.log("[Error] Method Not Allowed");
      return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. التحقق من صلاحية المعلم
    console.log("[Upload Step 1] Verifying Teacher Auth...");
    const auth = await verifyTeacher(req);
    
    if (auth.error) {
        console.error(`[Error] Auth Failed: ${auth.error}`);
        return res.status(auth.status).json({ error: auth.error });
    }
    console.log(`[Upload Step 2] Auth Success. Teacher ID: ${auth.user?.id}`);

    // 2. بدء عملية الرفع
    console.log("[Upload Step 3] Starting Multer Middleware...");
    
    // تشغيل Multer (سيقوم بالقفز إلى دوال destination و filename بالأعلى)
    await runMiddleware(req, res, upload.single('file'));

    // 3. التحقق من نجاح الرفع
    if (!req.file) {
        console.error("[Error] Middleware finished but No file found in req.file");
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // ============================================================
    // 🛡️ [صلاحيات المعلم] التحقق بناءً على نوع الملف المرفوع
    // ملفات PDF ⇐ صلاحية "رفع PDF" — صور أسئلة الامتحان ⇐ صلاحية "إنشاء امتحانات"
    // ============================================================
    const uploadedExt = path.extname(req.file.originalname).toLowerCase();
    let requiredPermission = null;
    if (uploadedExt === '.pdf') requiredPermission = 'can_upload_pdf';
    else if (['.png', '.jpg', '.jpeg'].includes(uploadedExt)) requiredPermission = 'can_create_exam';

    if (requiredPermission) {
        const perm = await checkTeacherPermission(auth.teacherId, requiredPermission);
        if (!perm.allowed) {
            console.warn(`[Permission Denied] Teacher ${auth.teacherId} blocked from uploading (${requiredPermission})`);
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(403).json({ error: perm.error });
        }
    }

    console.log(`[Upload Step 6] File Saved Successfully on Disk!`);
    console.log(`   -> Original Name: ${req.file.originalname}`);
    console.log(`   -> Saved Name:    ${req.file.filename}`);
    console.log(`   -> Size:          ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // ============================================================
    // 🧾 [iLoveAPI] ضغط الـ PDF قبل حساب البصمة
    // مهم: لازم يتم قبل SHA-256 عشان content_hash يطابق الملف النهائي
    // (آمن: لو فشل iLovePDF يفضل الملف الأصلي كما هو)
    // ============================================================
    if (uploadedExt === '.pdf') {
        await postProcessUploadedPdf(req.file.path);
    }

    // ============================================================
    // ✅ [FIX F-13] توليد البصمة (SHA-256) للملف المرفوع
    // ============================================================
    let contentHash = null;
    try {
        console.log(`[Upload Step 6.1] Calculating SHA-256 hash for file integrity...`);
        const fileBuffer = fs.readFileSync(req.file.path);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        contentHash = hashSum.digest('hex'); // استخراج البصمة
        console.log(`[Upload Step 6.2] File Hash Generated: ${contentHash}`);
    } catch (hashErr) {
        console.error("[Error] Failed to calculate file hash:", hashErr.message);
    }

    // ============================================================
    // ✅🚀 إرسال الإشعارات إذا تم طلب ذلك عبر الـ FormData (خاص بملفات الـ PDF)
    // ============================================================
    const { notifyStudents, chapterId, title } = req.body || {};
    
    if (notifyStudents === 'true' && chapterId) {
        try {
            // جلب معرف المادة واسم الكورس للتمكن من إرسال الإشعار للطلاب المشتركين
            const { data: chapter } = await supabase
                .from('chapters')
                .select('subject_id, subjects!inner(courses!inner(title))')
                .eq('id', chapterId)
                .single();
            
            if (chapter && chapter.subject_id) {
                const subjectId = chapter.subject_id;
                const courseTitle = chapter.subjects?.courses?.title || 'تحديث جديد';
                const itemTitle = title || 'ملف PDF جديد';
                
                const message = {
                    notification: { title: courseTitle, body: `تم رفع ملف جديد: ${itemTitle}` },
                    topic: `subject_${subjectId}`,
                    android: { priority: 'high', notification: { sound: 'default' } },
                    apns: { payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
                    data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', type: 'subject', id: subjectId.toString() }
                };

                await admin.messaging().send(message);

                await supabase.from('notifications').insert({
                    title: courseTitle,
                    body: `تم رفع ملف جديد: ${itemTitle}`,
                    target_type: 'subject',
                    target_id: subjectId.toString(),
                    sender_role: 'teacher'
                });
                console.log(`✅ Notification sent for uploaded file: ${itemTitle}`);
            }
        } catch (notifyErr) {
            console.error("⚠️ FCM Notify Error (Upload):", notifyErr.message);
        }
    }

    // 4. إرسال الرد
    return res.status(200).json({ 
        success: true, 
        url: req.file.filename,
        fileId: req.file.filename,
        contentHash: contentHash // ✅ يتم إرسال البصمة في الرد للوحة التحكم لحفظها في الداتا بيز
    });

  } catch (err) {
    console.error("❌ [CRITICAL UPLOAD ERROR]:");
    console.error(err);

    // محاولة تنظيف الملف التالف إذا وجد
    if (req.file && req.file.path) {
        console.log(`[Cleanup] Removing corrupted file: ${req.file.path}`);
        try { fs.unlinkSync(req.file.path); } catch (e) { console.error("[Cleanup Error]", e.message); }
    }

    return res.status(500).json({ error: `Upload Failed: ${err.message}` });
  }
};
