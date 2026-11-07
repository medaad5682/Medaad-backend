import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import {
  normalizePlayerSettings,
  defaultPlayerSettings,
  validatePlayerSettingsPayload,
} from '../../../../lib/playerSettingsHelper';
import {
  AUTO_ENROLL_KEY,
  defaultAutoEnrollConfig,
  normalizeAutoEnrollConfig,
} from '../../../../lib/autoEnrollHelper';

export default async function handler(req, res) {
  // 1. التحقق من الصلاحية (سوبر أدمن فقط)
  const authResult = await requireSuperAdmin(req, res);
  if (authResult?.error) return; 

  // ✅ التعديل هنا: تمت إضافة 'player_settings' إلى القائمة
  const TARGET_KEYS = ['platform_percentage', 'support_telegram', 'support_whatsapp', 'free_mode', 'player_settings'];

  // --------------------------------------------------------
  // GET: جلب الإعدادات
  // --------------------------------------------------------
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [...TARGET_KEYS, AUTO_ENROLL_KEY]);

      if (error) throw error;

      // تحويل المصفوفة إلى كائن لسهولة الاستخدام في الواجهة
      const settings = {};
      
      // تعيين قيم افتراضية فارغة
      TARGET_KEYS.forEach(key => settings[key] = '');
      // 🎁 التفعيل التلقائي للحسابات الجديدة (قيمة افتراضية: معطّل)
      settings[AUTO_ENROLL_KEY] = defaultAutoEnrollConfig();

      // ملء القيم الموجودة في قاعدة البيانات
      if (data) {
        data.forEach(item => {
          // ✅ فك تشفير JSON إذا كان المفتاح هو player_settings، ثم تطبيع
          // الشكل (تحويل الشكل القديم player_1/2/3 تلقائياً إلى مصفوفة
          // players الديناميكية الجديدة إن لزم الأمر)
          if (item.key === AUTO_ENROLL_KEY) {
            settings[AUTO_ENROLL_KEY] = normalizeAutoEnrollConfig(item.value);
          } else if (item.key === 'player_settings' && item.value) {
            try {
              settings[item.key] = normalizePlayerSettings(JSON.parse(item.value));
            } catch (e) {
              settings[item.key] = defaultPlayerSettings();
            }
          } else {
            settings[item.key] = item.value;
          }
        });
      }

      // إذا لم يوجد أي صف player_settings بعد في قاعدة البيانات
      if (!settings.player_settings || settings.player_settings === '') {
        settings.player_settings = defaultPlayerSettings();
      }

      return res.status(200).json(settings);

    } catch (err) {
      console.error("Fetch Settings Error:", err);
      return res.status(500).json({ error: 'فشل جلب الإعدادات' });
    }
  }

  // --------------------------------------------------------
  // POST: حفظ الإعدادات
  // --------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const updates = req.body; // نتوقع كائن يحتوي على المفاتيح والقيم

      // ✅ التحقق من صحة إعدادات المشغلات الديناميكية قبل الحفظ
      // (كل مشغل يجب أن يملك id فريد، اسم، وengine صالح)
      if (updates.player_settings) {
        const validationError = validatePlayerSettingsPayload(updates.player_settings);
        if (validationError) {
          return res.status(400).json({ error: `player_settings: ${validationError}` });
        }
      }

      // 🎁 التفعيل التلقائي: نحفظه فقط إذا أُرسل في الطلب (حتى لا تمسحه نسخة
      // قديمة من الصفحة لا تعرفه). نُنقّي المعرفات ونحذف أي كورس/مادة غير موجودة.
      let autoEnrollRow = null;
      if (updates[AUTO_ENROLL_KEY] !== undefined && updates[AUTO_ENROLL_KEY] !== null) {
        const cfg = normalizeAutoEnrollConfig(updates[AUTO_ENROLL_KEY]);

        const [{ data: existingCourses, error: cErr }, { data: existingSubjects, error: sErr }] = await Promise.all([
          cfg.course_ids.length
            ? supabase.from('courses').select('id').in('id', cfg.course_ids)
            : Promise.resolve({ data: [] }),
          cfg.subject_ids.length
            ? supabase.from('subjects').select('id, course_id').in('id', cfg.subject_ids)
            : Promise.resolve({ data: [] }),
        ]);
        if (cErr) throw cErr;
        if (sErr) throw sErr;

        const validCourseIds = (existingCourses || []).map(c => c.id);
        const validCourseSet = new Set(validCourseIds.map(String));
        // المادة التابعة لكورس مختار تُهمل (الكورس يغطيها)
        const validSubjectIds = (existingSubjects || [])
          .filter(s => !validCourseSet.has(String(s.course_id)))
          .map(s => s.id);

        autoEnrollRow = {
          key: AUTO_ENROLL_KEY,
          value: JSON.stringify({
            enabled: cfg.enabled,
            course_ids: validCourseIds,
            subject_ids: validSubjectIds,
          }),
        };
      }

      // تجهيز البيانات للإدخال (Upsert)
      const rowsToUpsert = TARGET_KEYS.map(key => {
        // نأخذ القيمة، وإذا كانت غير موجودة نضع نصاً فارغاً
        const val = updates[key] !== undefined && updates[key] !== null ? updates[key] : '';
        
        // ✅ تحويل الكائن إلى نص JSON إذا كان نوعه Object (خاص بـ player_settings)
        // الدالة String() ستحول باقي الأنواع العادية مثل true/false إلى "true"/"false"
        const stringValue = typeof val === 'object' ? JSON.stringify(val) : String(val);
        
        return {
          key: key,
          value: stringValue 
        };
      });

      if (autoEnrollRow) rowsToUpsert.push(autoEnrollRow);

      const { error } = await supabase
        .from('app_settings')
        .upsert(rowsToUpsert, { onConflict: 'key' });

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });

    } catch (err) {
      console.error("Save Settings Error:", err);
      return res.status(500).json({ error: 'فشل حفظ الإعدادات' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
