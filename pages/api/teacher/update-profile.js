import { supabase } from '../../../lib/supabaseClient';
import { verifyTeacher } from '../../../lib/teacherAuth';
import { BASE_URL } from '../../../lib/config'; // ✅ 1. استيراد ملف الإعدادات الموحد

export default async (req, res) => {
  // 1. التحقق من صحة المدرس (Authentication)
  const auth = await verifyTeacher(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // التحقق من الصلاحية (Authorization) - المدرس الرئيسي فقط
  if (auth.role !== 'teacher') {
      return res.status(403).json({ error: 'Only the main teacher can edit profile details' });
  }

  // ==========================================================
  // ✅ 1. معالجة طلب GET: لجلب البيانات الحالية
  // ==========================================================
  if (req.method === 'GET') {
    try {
      // أ) جلب بيانات المدرس من جدول teachers
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select('name, bio, specialty, whatsapp_number, payment_details, profile_image')
        .eq('id', auth.teacherId)
        .single();

      if (error) throw error;

      // ب) جلب بيانات المستخدم من جدول users
      const { data: user } = await supabase
        .from('users')
        .select('username, phone, first_name, email')
        .eq('id', auth.userId)
        .single();

      // ج) معالجة رابط الصورة
      let processedImage = teacher.profile_image;
      
      // ✅ 2. استخدام BASE_URL بدلاً من الرابط الثابت
      if (processedImage && !processedImage.startsWith('http')) {
         processedImage = `${BASE_URL}/api/public/get-avatar?file=${processedImage}`;
      }

      // د) تجهيز هيكل بيانات الدفع
      const paymentDetails = teacher.payment_details || {};

      return res.status(200).json({
        success: true,
        data: {
          name: teacher.name, 
          bio: teacher.bio || "",
          specialty: teacher.specialty || "",
          whatsapp_number: teacher.whatsapp_number || "",
          profile_image: processedImage,
          username: user?.username || "",
          phone: user?.phone || "",
          email: user?.email || "",
          user_first_name: user?.first_name || "",
          payment_details: {
            cash_numbers: paymentDetails.cash_numbers || [],
            instapay_numbers: paymentDetails.instapay_numbers || [],
            instapay_links: paymentDetails.instapay_links || [] 
          }
        }
      });

    } catch (err) {
      console.error("Fetch Profile Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ==========================================================
  // ✅ 2. معالجة طلب POST: لتحديث البيانات
  // ==========================================================
  if (req.method === 'POST') {
    // استقبال البيانات
    const { 
      name, 
      firstName, // ✅ إضافة استقبال firstName لدعم ما يرسله التطبيق
      bio, 
      specialty, 
      whatsappNumber, 
      cashNumbersList, 
      instapayNumbersList, 
      instapayLinksList,
      profileImage, 
      username,     
      phone         
    } = req.body;

    // ✅ تحديد الاسم الجديد سواء وصل كـ name أو firstName
    const newName = name || firstName;

    try {
      // التحقق من صحة اسم المستخدم
      if (username) {
          const usernameRegex = /^[a-zA-Z0-9]+$/;
          if (!usernameRegex.test(username)) {
              return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط' });
          }
      }

      // تجهيز بيانات الدفع
      const paymentData = {
        cash_numbers: cashNumbersList || [],        
        instapay_numbers: instapayNumbersList || [], 
        instapay_links: instapayLinksList || []      
      };

      // -------------------------------------------------------
      // 1. تحديث جدول teachers
      // -------------------------------------------------------
      const teacherUpdates = {
          bio: bio,
          specialty: specialty,
          whatsapp_number: whatsappNumber,
          payment_details: paymentData
      };
      
      // نستخدم الاسم الموحد newName
      if (newName) teacherUpdates.name = newName;
      if (profileImage) teacherUpdates.profile_image = profileImage;

      const { error: teacherError } = await supabase
        .from('teachers')
        .update(teacherUpdates)
        .eq('id', auth.teacherId);

      if (teacherError) throw teacherError;

      // -------------------------------------------------------
      // 2. تحديث جدول users
      // -------------------------------------------------------
      const userUpdates = {};
      if (username) userUpdates.username = username;
      if (phone) userUpdates.phone = phone;

      // ✅ تحديث first_name باستخدام الاسم الجديد
      if (newName) {
          userUpdates.first_name = newName;
      }

      if (Object.keys(userUpdates).length > 0) {
          const { error: userError } = await supabase
              .from('users')
              .update(userUpdates)
              .eq('id', auth.userId);
          
          if (userError) {
              if (userError.code === '23505') { 
                  return res.status(400).json({ error: 'اسم المستخدم أو رقم الهاتف مستخدم بالفعل.' });
              }
              // تحذير فقط في حالة فشل تحديث المستخدم، لكن العملية تستمر
              console.error("User table update warning:", userError);
          }
      }

      return res.status(200).json({ success: true, message: 'Profile updated successfully' });

    } catch (err) {
      console.error("Update Profile Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // طريقة غير مدعومة
  return res.status(405).json({ message: 'Method Not Allowed' });
};
