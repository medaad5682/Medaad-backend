import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { BASE_URL } from '../../../../lib/config'; // ✅ استيراد ملف الإعدادات
import { getTeacherTeamContext } from '../../../../lib/teamHelper'; // 👥 شارة الفريق/القائد في لوحة المدرس
import bcrypt from 'bcryptjs';

export default async (req, res) => {
  // 1. التحقق من الصلاحية (Authentication) باستخدام نظام الداشبورد
  const { user, error } = await requireTeacherOrAdmin(req, res);
  
  if (error) {
      // الرد بالخطأ تم إرساله مسبقاً بواسطة dashboardHelper
      return; 
  }

  const auth = {
      teacherId: user.teacherId,
      userId: user.id,
      role: user.role // نحتاج الدور للتحقق
  };

  // التحقق من الصلاحية (Authorization) - المدرس الرئيسي فقط
  if (auth.role !== 'teacher' && auth.role !== 'super_admin') {
       return res.status(403).json({ error: 'Only teachers can edit profile details' });
  }

  // ==========================================================
  // ✅ 1. معالجة طلب GET: لجلب البيانات الحالية
  // ==========================================================
  if (req.method === 'GET') {
    try {
      // أ) جلب بيانات المدرس من جدول teachers
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select('*') // نجلب الكل لضمان وجود payment_details
        .eq('id', auth.teacherId)
        .single();

      if (error) throw error;

      // ب) جلب بيانات المستخدم من جدول users
      const { data: userData } = await supabase
        .from('users')
        .select('username, phone, first_name')
        .eq('id', auth.userId)
        .single();

      // ج) معالجة رابط الصورة
      let processedImage = teacher.profile_image || teacher.image; // دعم الاسمين
      
      // استخدام BASE_URL بدلاً من الرابط الثابت لعرض الصورة عبر البروكسي
      if (processedImage && !processedImage.startsWith('http')) {
         processedImage = `${BASE_URL}/api/public/get-avatar?file=${processedImage}`;
      }

      // د) تجهيز هيكل بيانات الدفع
      const paymentDetails = teacher.payment_details || {};

      // 👥 شارة الفريق (اسم الفريق + هل هذا المدرس قائده) — تُستخدم في TeacherLayout
      // لعرض شارة بجانب اسم المدرس. مدرس بلا فريق يحصل على null/false كما كان تماماً.
      const teamCtx = await getTeacherTeamContext(auth.teacherId);

      return res.status(200).json({
        success: true,
        data: {
          name: teacher.name, 
          bio: teacher.bio || "",
          specialty: teacher.specialty || teacher.subject || "", // دعم الاسمين
          whatsapp_number: teacher.whatsapp_number || "",
          profile_image: processedImage,
          username: userData?.username || "",
          phone: userData?.phone || "",
          user_first_name: userData?.first_name || "",
          // إرجاع بيانات الدفع مفصلة للواجهة الأمامية
          payment_details: {
            cash_numbers: paymentDetails.cash_numbers || [],
            instapay_numbers: paymentDetails.instapay_numbers || [],
            instapay_links: paymentDetails.instapay_links || [] 
          },
          team_name: teamCtx.team?.name || null,
          is_team_leader: teamCtx.isLeader
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
    // استقبال البيانات (نفس الحقول التي ترسلها الواجهة الأمامية الحديثة)
    const { 
      name, 
      firstName, // دعم firstName
      bio, 
      specialty, 
      whatsappNumber, 
      cashNumbersList, 
      instapayNumbersList, 
      instapayLinksList,
      profileImage, 
      username,      
      phone,
      password, // كلمة المرور الجديدة
      oldPassword // ✅ كلمة المرور القديمة (مطلوبة للتحقق)
    } = req.body;

    // تحديد الاسم الجديد
    const newName = name || firstName;

    try {
      // التحقق من صحة اسم المستخدم
      if (username) {
          const usernameRegex = /^[a-zA-Z0-9]+$/;
          if (!usernameRegex.test(username)) {
              return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط' });
          }
      }

      // تجهيز بيانات الدفع ككائن JSON
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
          // سنحاول التحديث بهذا الاسم (specialty) أولاً
          specialty: specialty, 
          whatsapp_number: whatsappNumber,
          payment_details: paymentData
      };
      
      if (newName) teacherUpdates.name = newName;
      
      // التعامل مع الصورة (يتم إرسال اسم الملف فقط من الواجهة بعد الرفع)
      if (profileImage) {
          teacherUpdates.profile_image = profileImage;
      }

      // محاولة التحديث (مع معالجة خطأ اختلاف أسماء الأعمدة في القاعدة)
      try {
          const { error: teacherError } = await supabase
            .from('teachers')
            .update(teacherUpdates)
            .eq('id', auth.teacherId);
            
          if (teacherError) throw teacherError;
      } catch (tErr) {
          // إذا فشل بسبب اسم العمود، نحاول البدائل الشائعة
          if (tErr.message.includes('column "specialty" does not exist')) {
              delete teacherUpdates.specialty;
              teacherUpdates.subject = specialty;
          }
          if (tErr.message.includes('column "profile_image" does not exist')) {
              delete teacherUpdates.profile_image;
              teacherUpdates.image = profileImage;
          }
          // إعادة المحاولة بالأسماء البديلة
          const { error: retryError } = await supabase.from('teachers').update(teacherUpdates).eq('id', auth.teacherId);
          if (retryError) throw retryError;
      }

      // -------------------------------------------------------
      // 2. تحديث جدول users (البيانات الحساسة)
      // -------------------------------------------------------
      const userUpdates = {};
      if (username) userUpdates.username = username;
      if (phone) userUpdates.phone = phone;

      // تحديث first_name
      if (newName) {
          userUpdates.first_name = newName;
      }

      // ✅ منطق تغيير كلمة المرور الجديد مع التحقق
      if (password && password.trim() !== '') {
          // 1. التأكد من إرسال كلمة المرور القديمة
          if (!oldPassword) {
              return res.status(400).json({ error: 'يرجى إدخال كلمة المرور القديمة لتأكيد التغيير.' });
          }

          // 2. جلب كلمة المرور الحالية (المشفرة) من قاعدة البيانات
          const { data: currentUserData, error: passFetchError } = await supabase
              .from('users')
              .select('password')
              .eq('id', auth.userId)
              .single();

          if (passFetchError || !currentUserData) {
              throw new Error('فشل في استرجاع بيانات المستخدم للتحقق.');
          }

          // 3. مقارنة كلمة المرور القديمة المدخلة مع الموجودة في القاعدة
          const isMatch = await bcrypt.compare(oldPassword, currentUserData.password);
          
          if (!isMatch) {
              return res.status(400).json({ error: 'كلمة المرور القديمة غير صحيحة.' });
          }

          // 4. إذا كانت صحيحة، نقوم بتشفير الجديدة وإضافتها للتحديث
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);
          userUpdates.password = hashedPassword;
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
