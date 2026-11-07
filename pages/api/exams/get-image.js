import axios from 'axios';
import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper';
import { checkFlashcardImageAccess } from '../../../lib/flashcardAccess'; // 🗂️ صور الفلاش كاردس
import fs from 'fs';
import path from 'path';

// ✅ التعديل الهام: تعطيل حد الحجم الافتراضي (4MB) والسماح بالتعامل مع Streams خارجية
export const config = {
  api: {
    responseLimit: false, // يسمح بإرسال ملفات أكبر من 4 ميجابايت
    externalResolver: true, // يمنع تحذيرات false-positive عند استخدام streams خارجية
  },
};

export default async (req, res) => {
  const apiName = '[API: get-image]';
  const { file_id } = req.query;
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!file_id) return res.status(400).json({ error: 'Missing file_id' });

  try {
    // 1. البحث عن علاقة الصورة بالامتحان
    // يجب معرفة الامتحان التابعة له الصورة للتحقق من صلاحية الطالب لرؤيتها
    const { data: qData } = await supabase
        .from('questions')
        .select('exam_id')
        .eq('image_file_id', file_id)
        .maybeSingle();
    
    if (qData) {
        // 2. التحقق الأمني (هل يملك الطالب هذا الامتحان؟)
        const hasAccess = await checkUserAccess(req, qData.exam_id, 'exam');
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access Denied' });
        }
    } else {
        // 🗂️ هل الصورة تخص بطاقة فلاش كارد؟ (قد تطابق عدة مجموعات منسوخة ⇐ يكفي وصول لأي منها)
        const fc = await checkFlashcardImageAccess(req, file_id);
        if (fc.referenced) {
            if (!fc.allowed) {
                return res.status(403).json({ error: 'Access Denied' });
            }
        } else {
            // إذا لم نجد الصورة في الأسئلة ولا في البطاقات، نتحقق فقط من أن المستخدم مسجل دخول (توكن سليم)
            // هذا للأمان العام لمنع الوصول العشوائي
            const isUserValid = await checkUserAccess(req);
            if (!isUserValid) {
                 return res.status(401).json({ error: 'Unauthorized' });
            }
        }
    }

    // --- [إعدادات الكاش لتحسين الأداء] ---
    const cacheHeader = 'public, max-age=31536000, s-maxage=31536000, immutable';
    
    res.setHeader('Cache-Control', cacheHeader);
    res.setHeader('CDN-Cache-Control', cacheHeader);
    res.setHeader('Cloudflare-CDN-Cache-Control', cacheHeader);

    // 3. محاولة جلب الصورة من السيرفر المحلي (الأسرع والأوفر)
    const localFilePath = path.join(process.cwd(), 'storage', 'exam_images', file_id);
    
    if (fs.existsSync(localFilePath)) {
        const stat = fs.statSync(localFilePath);
        res.setHeader('Content-Type', 'image/jpeg'); 
        res.setHeader('Content-Length', stat.size);
        
        const readStream = fs.createReadStream(localFilePath);
        readStream.pipe(res);
        return;
    }

    // 4. Fallback: جلب الصورة من سيرفرات تيليجرام (للصور القديمة)
    const fileInfo = await axios.get(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${file_id}`);
    if (!fileInfo.data.ok) throw new Error('File not found on Telegram');
    
    const filePath = fileInfo.data.result.file_path;
    
    const imageRes = await axios({
        method: 'GET',
        url: `https://api.telegram.org/file/bot${TOKEN}/${filePath}`,
        responseType: 'stream'
    });

    res.setHeader('Content-Type', 'image/jpeg'); 
    imageRes.data.pipe(res);

  } catch (err) {
    console.error(`${apiName} ERROR:`, err.message);
    // في حالة الخطأ نلغي الكاش
    if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(404).json({ error: 'Image not found' });
    }
  }
};
