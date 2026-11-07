import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { checkTeacherPermission } from '../../../../lib/teacherPermissions';
import { parseApkg, AnkiImportError } from '../../../../lib/ankiImport';

// ============================================================
// 📦 [Teacher Dashboard] استيراد ملف Anki / AnkiDroid (.apkg) إلى بطاقات فلاش كاردس
// ------------------------------------------------------------
// POST multipart: file (.apkg) + maxCards (المتبقي من حد المجموعة)
// - يقرأ البطاقات (الأسئلة والإجابات + الصور) فقط ويتجاهل أي إعدادات أخرى في الملف
// - الصور (PNG/JPG) تُحفظ في storage/exam_images بنفس طريقة نقطة الرفع العادية
// - لا يكتب في قاعدة البيانات: يُرجع البطاقات للمحرر، والمعلم يضغط «حفظ» لتثبيتها
// - صلاحية can_manage_flashcards (السوبر أدمن يتخطى) — مثل رفع صور الفلاش كاردس
// ============================================================

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

const MAX_APKG_BYTES = 300 * 1024 * 1024; // ملفات Anki بالوسائط قد تكون كبيرة
const MAX_CARDS = 500;
const MAX_CARD_TEXT = 5000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // نفس حد نقطة الرفع

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir: os.tmpdir(),
      keepExtensions: false,
      maxFileSize: MAX_APKG_BYTES,
      maxFiles: 1,
    });
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });

const first = (v) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return; // الرد أُرسل داخل requireTeacherOrAdmin

  if (user.role !== 'super_admin') {
    const perm = await checkTeacherPermission(user.teacherId, 'can_manage_flashcards');
    if (!perm.allowed) return res.status(403).json({ error: perm.error });
  }

  let tmpPath = null;
  const savedFiles = []; // أسماء الصور المحفوظة (للتنظيف عند الفشل)
  const imagesDir = path.join(process.cwd(), 'storage', 'exam_images');

  try {
    const { fields, files } = await parseForm(req);
    const file = first(files.file);
    if (!file) return res.status(400).json({ error: 'لم يتم اختيار ملف.' });
    tmpPath = file.filepath;

    if (!/\.apkg$/i.test(file.originalFilename || '')) {
      return res.status(400).json({ error: 'الملف يجب أن يكون بصيغة .apkg (تصدير من Anki / AnkiDroid).' });
    }

    const requested = parseInt(first(fields.maxCards), 10);
    const maxCards = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), MAX_CARDS) : MAX_CARDS;
    if (maxCards === 0) return res.status(400).json({ error: `وصلت للحد الأقصى (${MAX_CARDS} بطاقة) في هذه المجموعة.` });

    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    let seq = 0;
    const saveImage = (buffer, ext) => {
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}${seq++}.${ext}`;
      fs.writeFileSync(path.join(imagesDir, name), buffer);
      savedFiles.push(name);
      return name;
    };

    const { cards, stats } = parseApkg(fs.readFileSync(tmpPath), {
      maxCards,
      maxCardText: MAX_CARD_TEXT,
      maxImageBytes: MAX_IMAGE_BYTES,
      saveImage,
    });

    // 🧹 حذف الصور التي حُفظت لكن لم تدخل أي بطاقة (بطاقات تم تخطيها)
    const used = new Set();
    cards.forEach((c) => { if (c.front_image_file_id) used.add(c.front_image_file_id); if (c.back_image_file_id) used.add(c.back_image_file_id); });
    savedFiles.forEach((n) => { if (!used.has(n)) { try { fs.unlinkSync(path.join(imagesDir, n)); } catch (e) { /* ignore */ } } });

    if (cards.length === 0) {
      return res.status(422).json({ error: 'لم نجد بطاقات صالحة داخل الملف (كل البطاقات فارغة الوجه أو الظهر).', stats });
    }
    return res.status(200).json({ success: true, cards, stats });
  } catch (err) {
    savedFiles.forEach((n) => { try { fs.unlinkSync(path.join(imagesDir, n)); } catch (e) { /* ignore */ } });
    if (err instanceof AnkiImportError) return res.status(422).json({ error: err.message });
    if (err && (err.code === 1009 || /maxFileSize/i.test(err.message || ''))) {
      return res.status(413).json({ error: `حجم الملف أكبر من ${MAX_APKG_BYTES / 1024 / 1024} ميجا.` });
    }
    console.error('⚠️ [Flashcards Anki Import]', err);
    return res.status(500).json({ error: 'تعذر قراءة الملف. تأكد أنه ملف Anki سليم وأعد المحاولة.' });
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ } }
  }
}
