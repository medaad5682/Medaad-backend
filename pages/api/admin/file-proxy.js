import fs from 'fs';
import path from 'path';
import { supabase } from '../../../lib/supabaseClient';
import { parse } from 'cookie';
import { checkUserAccess } from '../../../lib/authHelper';
import { checkFlashcardImageAccess } from '../../../lib/flashcardAccess'; // 🗂️ حماية صور الفلاش كاردس

export default async (req, res) => {
  const { type, filename } = req.query;

  let isAuthorized = false;
  let viaDashboard = false; // 🗂️ true إذا كان الطلب من لوحة التحكم (كوكي أدمن/معلم)

  // قراءة الكوكيز
  const cookies = parse(req.headers.cookie || '');
  
  // ✅ 1. التحقق عبر الكوكيز (للوحة التحكم - أدمن ومدرسين)
  // بما أن كود الدخول يحفظ الجميع تحت اسم 'admin_session'
  const sessionToken = cookies.admin_session;

  if (sessionToken) {
      const { data: user } = await supabase
          .from('users')
          // ✅ قمنا بإضافة role و teacher_profile_id للتحقق
          .select('is_admin, role, teacher_profile_id') 
          .eq('session_token', sessionToken)
          .single();
      
      if (user) {
          // ✅ السماح بالدخول إذا كان أدمن أوعندما يكون دوره مدرس
          const isSuperAdmin = user.is_admin === true;
          const isTeacher = user.role === 'teacher' || user.teacher_profile_id !== null;

          if (isSuperAdmin || isTeacher) {
              isAuthorized = true;
              viaDashboard = true;
          }
      }
  }

  // 2. المحاولة الثانية: التحقق عبر التوكن (لتطبيقات الموبايل)
  if (!isAuthorized) {
      // نستخدم الحارس الأمني للتحقق من التوكن وبصمة الجهاز
      const hasAppAccess = await checkUserAccess(req);
      if (hasAppAccess) {
          isAuthorized = true;
      }
  }

  // إذا فشلت الطريقتين، نرفض الطلب
  if (!isAuthorized) {
      return res.status(403).send('Forbidden: Access Denied');
  }

  // 3. التحقق من المسار والملف
  const validTypes = ['receipts', 'pdfs', 'exam_images'];
  if (!validTypes.includes(type) || !filename) {
    return res.status(400).send('Invalid request');
  }

  // 🗂️ طلاب التطبيق (غير الداشبورد): صور الفلاش كاردس لا تُخدم إلا لمن يملك المادة،
  // حتى لا يُتجاوز فحص get-image عبر هذا المسار بتخمين اسم الملف
  if (type === 'exam_images' && !viaDashboard) {
    const fc = await checkFlashcardImageAccess(req, filename);
    if (fc.referenced && !fc.allowed) {
      return res.status(403).send('Forbidden: Access Denied');
    }
  }

  const filePath = path.join(process.cwd(), 'storage', type, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  // 4. إرسال الملف
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
  else if (ext === '.pdf') contentType = 'application/pdf';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
};
