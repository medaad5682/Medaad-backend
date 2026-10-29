import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper';
import { sendToUser, hasPushToken, PUSH_USER_COLUMNS } from '../../../lib/pushService';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: false },
};

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 2. التحقق الأمني
  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) {
      return res.status(401).json({ error: 'Unauthorized Access' });
  }

  // 3. معرف المستخدم
  const userId = req.headers['x-user-id'];

  // جلب بيانات المستخدم
  const { data: user } = await supabase
      .from('users')
      .select('id, username, first_name, phone')
      .eq('id', userId)
      .single();

  if (!user) {
      return res.status(404).json({ error: 'User data not found' });
  }

  // 4. إعداد مجلد الحفظ
  const uploadDir = path.join(process.cwd(), 'storage', 'receipts');
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (err) {
    return res.status(500).json({ error: 'فشل في إنشاء مجلد التخزين' });
  }

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 30 * 1024 * 1024,
    filename: (name, ext, part) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      return `receipt_${uniqueSuffix}${ext}`;
    }
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
        console.error("Formidable Error:", err);
        return res.status(500).json({ error: 'فشل معالجة الملف المرفوع' });
    }

    try {
      const getValue = (key) => {
          const val = fields[key];
          return Array.isArray(val) ? val[0] : val;
      };
      
      const getFile = (key) => {
          const file = files[key];
          return Array.isArray(file) ? file[0] : file;
      };

      // استقبال البيانات
      const selectedItemsStr = getValue('selectedItems');
      let userNote = getValue('user_note') || ''; 
      const appliedCode = getValue('discount_code'); 
      const receiptFile = getFile('receiptFile');
      
      if (!selectedItemsStr) return res.status(400).json({ error: 'لا توجد عناصر مختارة' });
      if (!receiptFile) return res.status(400).json({ error: 'صورة الإيصال مطلوبة' });

      const selectedItems = JSON.parse(selectedItemsStr);
      if (selectedItems.length === 0) return res.status(400).json({ error: 'السلة فارغة' });

      // =========================================================
      // 🛡️ 1. التحقق من عدم وجود طلبات مكررة قيد الانتظار (Pending)
      // =========================================================
      const selectedItemKeys = selectedItems.map(item => `${item.type}_${item.id}`);
      
      const { data: pendingRequests } = await supabase
        .from('subscription_requests')
        .select('requested_data')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (pendingRequests && pendingRequests.length > 0) {
        let isDuplicate = false;
        
        for (const reqData of pendingRequests) {
          const items = reqData.requested_data || [];
          for (const item of items) {
            const currentKey = `${item.type}_${item.id}`;
            if (selectedItemKeys.includes(currentKey)) {
              isDuplicate = true;
              break;
            }
          }
          if (isDuplicate) break;
        }

        if (isDuplicate) {
          try { fs.unlinkSync(receiptFile.filepath); } catch (e) {}
          return res.status(400).json({ error: 'لديك طلب قيد المراجعة بالفعل يحتوي على هذا المحتوى تحديداً.' });
        }
      }
      // =========================================================

      const fileName = path.basename(receiptFile.filepath);

      // المتغيرات النهائية
      let originalTotalPrice = 0;
      let finalTotalPrice = null; 
      let titleList = [];
      const requestedData = [];
      let detectedTeacherId = null; 
      let discountCodeId = null;  

      // ---------------------------------------------------------
      // حلقة التكرار لدعم العمليات غير المتزامنة وتجهيز سلة المشتريات
      // ---------------------------------------------------------
      for (const [index, item] of selectedItems.entries()) {
          const price = parseInt(item.price) || 0;
          originalTotalPrice += price; 
          
          let parentCourseName = null;
          let formattedTitle = '';

          if (item.type === 'course') {
              formattedTitle = `📦 كورس شامل: ${item.title}`;
              parentCourseName = item.title;
              
              if (index === 0 && !detectedTeacherId) {
                  const { data: courseData } = await supabase.from('courses').select('teacher_id').eq('id', item.id).single();
                  if (courseData) detectedTeacherId = courseData.teacher_id;
              }
          } 
          else if (item.type === 'subject') {
              try {
                  const { data: subjectData } = await supabase.from('subjects').select('course_id, courses(title, teacher_id)').eq('id', item.id).single();
                  if (subjectData && subjectData.courses) {
                      parentCourseName = subjectData.courses.title;
                      if (index === 0 && !detectedTeacherId) {
                          detectedTeacherId = subjectData.courses.teacher_id;
                      }
                  }
              } catch (fetchErr) {
                  console.error('Error fetching parent info:', fetchErr);
              }

              formattedTitle = `📚 مادة: ${item.title}`;
              if (parentCourseName) {
                  formattedTitle += `\n   ⬅️ تابع لكورس: ${parentCourseName}`;
              }
          } 
          else {
              formattedTitle = `🔖 عنصر: ${item.title}`;
          }

          titleList.push(formattedTitle);

          requestedData.push({
              id: item.id,
              type: item.type,
              title: item.title,
              price: price,
              parent_course: parentCourseName || 'Unknown'
          });
      }

      // =========================================================
      // 🎁 2. معالجة كود الخصم والتأكد من صحته قبل الحفظ
      // =========================================================
      if (appliedCode && appliedCode.trim() !== '') {
         const { data: discountData } = await supabase
            .from('discount_codes')
            .select('*')
            .eq('code', appliedCode.trim().toUpperCase())
            .eq('is_used', false)
            .single();

         if (!discountData) {
            try { fs.unlinkSync(receiptFile.filepath); } catch (e) {}
            return res.status(400).json({ error: 'كود الخصم المدخل غير صحيح أو تم استخدامه مسبقاً.' });
         }

         // التحقق النهائي من الصلاحية (التاريخ)
         if (discountData.expires_at) {
             const now = new Date();
             const expiryDate = new Date(discountData.expires_at);
             if (now > expiryDate) {
                 try { fs.unlinkSync(receiptFile.filepath); } catch (e) {}
                 return res.status(400).json({ error: 'عذراً، كود الخصم المدخل منتهي الصلاحية.' });
             }
         }

         // ✅ التحقق من نطاق (الهدف من) الكوبون ومطابقته لسلة المشتريات
         const linkType = discountData.link_type || 'teacher';
         let isValidForCart = false;

         if (linkType === 'teacher') {
             // يجب أن يكون الكوبون تابعاً لمدرس أول عنصر في السلة
             if (discountData.teacher_id == detectedTeacherId) isValidForCart = true;
         } else if (linkType === 'course') {
             // يجب أن تحتوي السلة على الكورس المربوط به الكوبون
             isValidForCart = requestedData.some(item => item.type === 'course' && item.id == discountData.course_id);
         } else if (linkType === 'subject') {
             // يجب أن تحتوي السلة على المادة المربوط بها الكوبون
             isValidForCart = requestedData.some(item => item.type === 'subject' && item.id == discountData.subject_id);
         }

         if (!isValidForCart) {
             try { fs.unlinkSync(receiptFile.filepath); } catch (e) {}
             return res.status(400).json({ error: 'عذراً، كود الخصم غير صالح للعناصر الموجودة في سلة مشترياتك.' });
         }

         discountCodeId = discountData.id;

         // إضافة الجملة داخل الملاحظة
         const usedCouponText = `(تم استخدام الكوبون: ${appliedCode.trim().toUpperCase()})`;
         userNote = userNote.trim() !== '' ? `${userNote}\n${usedCouponText}` : usedCouponText;

         // حساب السعر النهائي
         if (discountData.discount_type === 'percentage') {
            finalTotalPrice = originalTotalPrice - (originalTotalPrice * (discountData.discount_value / 100));
         } else if (discountData.discount_type === 'fixed') {
            finalTotalPrice = originalTotalPrice - discountData.discount_value;
         }
         
         if (finalTotalPrice !== null && finalTotalPrice < 0) {
             finalTotalPrice = 0;
         }
      }
      // =========================================================

      const finalTitle = titleList.join('\n──────────────────────\n');
      
      // 3. الحفظ في القاعدة
      const { data: newRequest, error: dbError } = await supabase
        .from('subscription_requests')
        .insert({
          user_id: user.id,
          user_name: user.first_name,
          user_username: user.username,
          phone: user.phone,

          course_title: finalTitle,
          total_price: originalTotalPrice,
          actual_paid_price: finalTotalPrice,
          discount_code_id: discountCodeId,

          user_note: userNote,
          payment_file_path: fileName,
          status: 'pending',
          requested_data: requestedData,

          teacher_id: detectedTeacherId
        })
        .select('id')
        .single();

      if (dbError) {
         try { fs.unlinkSync(receiptFile.filepath); } catch (e) {}
         throw dbError;
      }

      // 4. حرق الكود (تحديث حالته لمستخدَم) بعد التأكد من حفظ الطلب بنجاح
      if (discountCodeId) {
         await supabase.from('discount_codes').update({ is_used: true }).eq('id', discountCodeId);
      }

      // =========================================================
      // 🔔 5. إشعار المدرس (صاحب الكورس) بوجود طلب اشتراك جديد
      // =========================================================
      if (detectedTeacherId) {
        try {
          const { data: teacherUser } = await supabase
            .from('users')
            .select(PUSH_USER_COLUMNS)
            .eq('teacher_profile_id', detectedTeacherId)
            .eq('role', 'teacher')
            .maybeSingle();

          if (hasPushToken(teacherUser)) {
            const notifTitle = '🔔 طلب اشتراك جديد';
            const notifBody = `${user.first_name} طلب الاشتراك في: ${titleList.join(' | ')}`;

            const pushResult = await sendToUser(teacherUser, {
              title: notifTitle,
              body: notifBody,
              type: 'subscription_request',
              data: { id: newRequest.id.toString() }
            });

            // نفس السلوك السابق: لا نسجّل الإشعار في السجل إذا فشل الإرسال
            if (pushResult.sent) {
              await supabase.from('notifications').insert({
                title: notifTitle,
                body: notifBody,
                target_type: 'subscription_request',
                target_id: newRequest.id.toString(),
                sender_role: 'student'
              });
            }
          }
        } catch (notifyErr) {
          // لا نفشل الطلب الأساسي بسبب فشل الإشعار فقط
          console.error('⚠️ Push Teacher Notify Error:', notifyErr.message);
        }
      }

      return res.status(200).json({ success: true, message: 'تم إرسال طلب الاشتراك بنجاح! سيتم مراجعته.' });

    } catch (error) {
      console.error("Server Error:", error);
      return res.status(500).json({ error: error.message });
    }
  });
};
