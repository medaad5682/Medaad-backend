import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { checkTeacherPermission } from '../../../../lib/teacherPermissions'; // ✅ التحقق من صلاحيات المعلم
import { supabase } from '../../../../lib/supabaseClient';
import admin from '../../../../lib/firebaseAdmin'; // ✅ استيراد فايربيز لإرسال الإشعارات
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto'; // ✅ [FIX F-13] استدعاء مكتبة التشفير المدمجة في Node.js لحساب البصمة
import { postProcessUploadedPdf } from '../../../../lib/ilovepdf'; // 🧾 iLoveAPI: ضغط الـ PDF

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
    // 1. التحقق من صلاحية المعلم (باستخدام Helper الداشبورد)
    console.log("[Upload Step 1] Verifying Dashboard Auth...");
    const { user, error } = await requireTeacherOrAdmin(req, res);
    
    if (error) {
        console.error(`[Error] Auth Failed`);
        return; // الرد تم بالفعل داخل الدالة
    }
    console.log(`[Upload Step 2] Auth Success. User ID: ${user.id}`);

    // 2. بدء عملية الرفع
    console.log("[Upload Step 3] Starting Multer Middleware...");
    
    // تشغيل Multer
    await runMiddleware(req, res, upload.single('file'));

    // 3. التحقق من نجاح الرفع
    if (!req.file) {
        console.error("[Error] Middleware finished but No file found in req.file");
        return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[Upload Step 6] File Saved Successfully on Disk!`);
    console.log(`   -> Original Name: ${req.file.originalname}`);
    console.log(`   -> Saved Name:    ${req.file.filename}`);
    console.log(`   -> Size:          ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // ============================================================
    // 🛡️ [صلاحيات المعلم] التحقق بناءً على نوع الملف المرفوع
    // ملفات PDF ⇐ صلاحية "رفع PDF" — صور أسئلة الامتحان ⇐ صلاحية "إنشاء امتحانات"
    // (السوبر أدمن يتخطى هذا التحقق دائماً)
    // ============================================================
    if (user.role !== 'super_admin') {
        const uploadedExt = path.extname(req.file.originalname).toLowerCase();
        let requiredPermission = null;
        if (uploadedExt === '.pdf') requiredPermission = 'can_upload_pdf';
        else if (['.png', '.jpg', '.jpeg'].includes(uploadedExt)) requiredPermission = 'can_create_exam';

        if (requiredPermission) {
            const perm = await checkTeacherPermission(user.teacherId, requiredPermission);
            if (!perm.allowed) {
                console.warn(`[Permission Denied] Teacher ${user.teacherId} blocked from uploading (${requiredPermission})`);
                try { fs.unlinkSync(req.file.path); } catch (e) {}
                return res.status(403).json({ error: perm.error });
            }
        }
    }

    // ---------------------------------------------------------
    // 4. (هام جداً) حفظ البيانات في قاعدة البيانات
    // ---------------------------------------------------------
    // إذا كان الملف PDF وتم إرسال معرف الفصل (chapterId)
    if (req.body.type === 'pdf' && req.body.chapterId) {
        console.log(`[Upload Step 7] Saving PDF record to DB for Chapter: ${req.body.chapterId}`);

        // أ. التحقق من الملكية (للحماية)
        if (user.role !== 'admin') { 
             const { data: chapter } = await supabase
                .from('chapters')
                .select('subjects ( courses ( teacher_id ) )')
                .eq('id', req.body.chapterId)
                .single();

             const courseTeacherId = chapter?.subjects?.courses?.teacher_id;
             
             // إذا لم يكن المدرس هو صاحب الكورس
             if (String(courseTeacherId) !== String(user.teacherId)) {
                 console.error(`[Error] Ownership mismatch! Teacher ${user.teacherId} tried to upload to Course owned by ${courseTeacherId}`);
                 // تنظيف الملف المرفوع
                 try { fs.unlinkSync(req.file.path); } catch(e) {}
                 return res.status(403).json({ error: 'غير مصرح لك بالإضافة في هذا الكورس.' });
             }
        }

        const pdfTitle = req.body.title || req.file.originalname;

        // 🧾 [iLoveAPI] ضغط الـ PDF قبل حساب البصمة
        // (آمن: لو فشل iLovePDF يفضل الملف الأصلي كما هو)
        if (path.extname(req.file.originalname).toLowerCase() === '.pdf') {
            await postProcessUploadedPdf(req.file.path);
        }

        // ✅ [FIX F-13] حساب بصمة SHA-256 للملف بعد رفعه بنجاح
        let contentHash = null;
        try {
            console.log(`[Upload Step 7.1] Calculating SHA-256 hash for integrity check...`);
            const fileBuffer = fs.readFileSync(req.file.path);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            contentHash = hashSum.digest('hex'); // استخراج البصمة كنص Hex
            console.log(`[Upload Step 7.2] File Hash Generated: ${contentHash}`);
        } catch (hashErr) {
            console.error("[Error] Failed to calculate file hash:", hashErr.message);
        }

        // ب. الإدخال في الجدول مع الهاش
        const { error: dbError } = await supabase.from('pdfs').insert({
            chapter_id: req.body.chapterId,
            title: pdfTitle,
            file_path: req.file.filename,
            sort_order: 999,
            content_hash: contentHash // ✅ حفظ البصمة في قاعدة البيانات
        });

        if (dbError) {
            console.error("[Error] DB Insert Failed:", dbError);
            throw new Error('فشل حفظ بيانات الملف في قاعدة البيانات');
        }
        console.log(`[Upload Step 8] DB Record Created Successfully!`);

        // ج. منطق إرسال الإشعار (إذا تم تفعيل الخيار من المدرس)
        if (req.body.notifyStudents === 'true') {
            console.log(`[Upload Step 9] Notifying students about new PDF...`);
            try {
                // جلب اسم الكورس ومعرف المادة لإرسال الإشعار للقناة الصحيحة
                const { data: info } = await supabase
                    .from('chapters')
                    .select('subject_id, subjects(courses(title))')
                    .eq('id', req.body.chapterId)
                    .single();

                if (info && info.subject_id) {
                    const courseTitle = info.subjects?.courses?.title || 'تحديث جديد في الكورس';
                    const subjectId = info.subject_id;

                    const message = {
                        notification: { 
                            title: courseTitle, 
                            body: `تم رفع ملف: ${pdfTitle}` 
                        },
                        topic: `subject_${subjectId}`,
                        android: { 
                            priority: 'high', 
                            notification: { sound: 'default' } 
                        },
                        apns: { 
                            payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } 
                        },
                        data: { 
                            click_action: 'FLUTTER_NOTIFICATION_CLICK', 
                            type: 'subject', 
                            id: subjectId.toString() 
                        }
                    };

                    // إرسال الإشعار عبر فايربيز
                    await admin.messaging().send(message);

                    // حفظ الإشعار في جدول الإشعارات ليظهر للطالب داخل التطبيق لاحقاً
                    await supabase.from('notifications').insert({
                        title: courseTitle,
                        body: `تم رفع ملف: ${pdfTitle}`,
                        target_type: 'subject',
                        target_id: subjectId.toString(),
                        sender_role: 'teacher'
                    });
                    console.log(`[Upload Step 10] Notification sent and saved successfully.`);
                }
            } catch (notifyErr) {
                console.error("[Error] Failed to send FCM notification:", notifyErr.message);
                // لا نقوم بعمل throw هنا لكي لا يفشل الطلب الأصلي (الرفع تم بنجاح بالفعل)
            }
        }
    }

    // 5. إرسال الرد
    return res.status(200).json({ 
        success: true, 
        url: req.file.filename,
        fileName: req.file.filename, // لتوحيد الرد
        fileId: req.file.filename
    });

  } catch (err) {
    console.error("❌ [CRITICAL UPLOAD ERROR]:");
    console.error(err);

    // محاولة تنظيف الملف التالف إذا وجد
    if (req.file && req.file.path) {
        console.log(`[Cleanup] Removing file due to error: ${req.file.path}`);
        try { fs.unlinkSync(req.file.path); } catch (e) { console.error("[Cleanup Error]", e.message); }
    }

    return res.status(500).json({ error: `Upload Failed: ${err.message}` });
  }
};
