import { supabase } from '../../../lib/supabaseClient';
import jwt from 'jsonwebtoken';
import { BASE_URL } from '../../../lib/config'; // ✅ 1. استيراد ملف الإعدادات الموحد
import admin from '../../../lib/firebaseAdmin'; // ✅ إضافة استيراد فايربيز آدمن للتحقق
import { verifyAppCheckWithWhitelist } from '../../../lib/appCheckWhitelist'; // 🆕 القائمة البيضاء

export default async (req, res) => {
  // ✅ طباعة جميع الهيدرز التي تصل من التطبيق للتحقق منها
  console.log('=== Incoming Headers from App ===');
  console.log(req.headers);
  console.log('=================================');

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. محاولة التعرف على المستخدم من التوكن (Soft Check)
  const authHeader = req.headers['authorization'];
  const deviceIdHeader = req.headers['x-device-id'];
  const fcmTokenHeader = req.headers['x-fcm-token']; // ✅ استلام توكن فايربيز من التطبيق

  // 🆕 فحص ناعم مبكر لاستخراج user_id فقط لغرض مطابقة القائمة البيضاء
  // (بدون شرط تطابق الجهاز، فقط لمعرفة هوية صاحب التوكن قبل بوابة App Check)
  let softUserIdForWhitelist = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
          const softDecoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
          softUserIdForWhitelist = softDecoded?.userId || null;
      } catch (e) {
          // توكن غير صالح/منتهي - سيُعامل كزائر لاحقاً كما كان
      }
  }

  // 🚀 =========================================================
  // 🚀 التحقق من Firebase App Check أولاً قبل أي شيء
  // 🚀 🆕 + مراعاة القائمة البيضاء اليدوية (user_id)
  // 🚀 =========================================================
  const appCheckResult = await verifyAppCheckWithWhitelist(req, [softUserIdForWhitelist], 'AppInit API');

  if (!appCheckResult.ok) {
    return res.status(appCheckResult.status).json({ message: appCheckResult.message });
  }
  // =========================================================

  let userData = null;
  let userAccess = { courses: [], subjects: [], topics: [] }; // ✅ إضافة topics هنا
  let libraryData = []; 
  let isLoggedIn = false;
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
           
          // تحقق أمني بسيط: يجب أن يطابق الجهاز المسجل في التوكن الجهاز المرسل في الهيدر
          if (decoded.deviceId === deviceIdHeader) {
              userId = decoded.userId;
          }
      } catch (e) {
          // توكن غير صالح أو منتهي -> نعتبره زائر ونكمل
          console.log("Init Data: Invalid/Expired Token or Guest Access");
      }
  }

  try {
    // 2. إذا تم التعرف على المستخدم، نجلب بياناته الخاصة
    if (userId) {
       // ✅ جلب الصلاحية ورقم بروفايل المعلم
       const { data: user } = await supabase
          .from('users')
          .select('id, first_name, username, phone, is_blocked, jwt_token, role, teacher_profile_id')
          .eq('id', userId)
          .single();

       // يجب أن يكون المستخدم موجوداً، غير محظور، والتوكن مطابق (لضمان عدم تسجيل الخروج)
       const incomingToken = authHeader.split(' ')[1];
       
       if (user && !user.is_blocked && user.jwt_token === incomingToken) {
           
          // ✅ تحديث آخر ظهور وتوكن فايربيز (FCM Token) في عملية واحدة
          let updatePayload = {
              last_active_at: new Date().toISOString()
          };

          if (fcmTokenHeader) {
              updatePayload.fcm_token = fcmTokenHeader;
          }

          await supabase
              .from('users')
              .update(updatePayload)
              .eq('id', userId);

          // ✅ منطق جديد: جلب صورة المدرس إذا كان الحساب مرتبطاً بملف مدرس
          let profileImage = null;
          if (user.teacher_profile_id) {
             const { data: teacherData } = await supabase
                .from('teachers')
                .select('profile_image')
                .eq('id', user.teacher_profile_id)
                .single();
             
             if (teacherData && teacherData.profile_image) {
                profileImage = teacherData.profile_image;
                
                // ✅ 2. معالجة الرابط باستخدام BASE_URL بدلاً من الرابط الثابت
                if (!profileImage.startsWith('http')) {
                    profileImage = `${BASE_URL}/api/public/get-avatar?file=${profileImage}`;
                }
             }
          }

          // ✅ "خداع التطبيق": توحيد الرتبة للمعلم والمشرف
          const appRole = (user.role === 'moderator' || user.role === 'teacher') ? 'teacher' : (user.role || 'student');

          // ✅ إضافة البيانات الجديدة (بما فيها الصورة المعالجة) للكائن المرسل للتطبيق
          userData = {
              id: user.id,
              first_name: user.first_name,
              username: user.username,
              phone: user.phone,
              role: appRole, 
              teacher_profile_id: user.teacher_profile_id,
              profile_image: profileImage // ✅ تم إضافة الصورة هنا
          };
          isLoggedIn = true;

          // ==========================================
          // منطق المكتبة (Library Logic) وقنوات الإشعارات
          // ==========================================
          
          let notificationTopics = ['all_users']; // ✅ القناة الأساسية لكل المستخدمين المسجلين

          // أ) جلب الكورسات الكاملة (✅ تم إضافة description و price)
          const { data: fullCourses } = await supabase
            .from('user_course_access')
            .select(`
              course_id,
              courses ( 
                id, title, code, teacher_id, description, price,
                teachers ( name )
              )
            `)
            .eq('user_id', userId);

          // ب) جلب مواد هذه الكورسات (✅ تم إضافة price)
          let courseSubjectsMap = {};
          if (fullCourses && fullCourses.length > 0) {
            const courseIds = fullCourses.map(item => item.course_id);
            
            // ✅ تسجيل الطالب في قنوات الإشعارات الخاصة بكورساته الكاملة
            courseIds.forEach(id => notificationTopics.push(`course_${id}`));

            const { data: allSubjects } = await supabase
                .from('subjects')
                .select('id, title, price, course_id, sort_order')
                .in('course_id', courseIds)
                .order('sort_order', { ascending: true }); 

            if (allSubjects) {
                allSubjects.forEach(sub => {
                    if (!courseSubjectsMap[sub.course_id]) {
                        courseSubjectsMap[sub.course_id] = [];
                    }
                    courseSubjectsMap[sub.course_id].push({ 
                        id: sub.id, 
                        title: sub.title,
                        price: sub.price // ✅
                    });
                    
                    // ✅ بما أن الطالب اشترى الكورس كاملاً، يجب إضافته لقنوات استماع مواده أيضاً
                    notificationTopics.push(`subject_${sub.id}`);
                });
            }
          }

          // ج) جلب المواد المنفصلة (✅ تم إضافة price للمادة و description للكورس)
          const { data: singleSubjects } = await supabase
            .from('user_subject_access')
            .select(`
              subject_id,
              subjects (
                id, title, price,
                courses ( 
                  id, title, code, teacher_id, description,
                  teachers ( name ) 
                )
              )
            `)
            .eq('user_id', userId);

          // هيكلة الصلاحيات (مع قنوات الإشعارات الجديدة)
          userAccess = {
            courses: fullCourses ? fullCourses.map(c => c.course_id.toString()) : [],
            subjects: singleSubjects ? singleSubjects.map(s => s.subject_id.toString()) : [],
            topics: notificationTopics // ✅ إرسال قنوات فايربيز للتطبيق
          };

          const libraryMap = new Map();

          // إضافة الكورسات للمكتبة
          fullCourses?.forEach(item => {
            if (item.courses) {
              const cId = item.courses.id;
              const subjectsList = courseSubjectsMap[cId] || [];
              libraryMap.set(cId, {
                type: 'course',
                id: cId,
                title: item.courses.title,
                description: item.courses.description, // ✅
                price: item.courses.price,             // ✅
                code: item.courses.code,
                instructor: item.courses.teachers?.name || 'Instructor',
                teacherId: item.courses.teacher_id, 
                owned_subjects: subjectsList
              });
            }
          });

          // إضافة المواد المنفصلة
          singleSubjects?.forEach(item => {
            const subject = item.subjects;
            
            // ✅ تسجيل الطالب في قناة الإشعارات الخاصة بالمادة المنفصلة التي اشتراها
            if (subject && subject.id) {
               if (!notificationTopics.includes(`subject_${subject.id}`)) {
                   notificationTopics.push(`subject_${subject.id}`);
               }
            }

            const parentCourse = subject?.courses;
            if (parentCourse) {
              const subjectData = { 
                  id: subject.id, 
                  title: subject.title, 
                  price: subject.price // ✅
              };

              if (libraryMap.has(parentCourse.id)) {
                const existingEntry = libraryMap.get(parentCourse.id);
                if (existingEntry.type === 'subject_group') { 
                   existingEntry.owned_subjects.push(subjectData);
                }
              } else {
                libraryMap.set(parentCourse.id, {
                  type: 'subject_group',
                  id: parentCourse.id,
                  title: parentCourse.title,
                  description: parentCourse.description, // ✅
                  code: parentCourse.code,
                  instructor: parentCourse.teachers?.name || 'Instructor',
                  teacherId: parentCourse.teacher_id,
                  owned_subjects: [subjectData]
                });
              }
            }
          });

          libraryData = Array.from(libraryMap.values());
       }
    }

    // 3. جلب بيانات المتجر (عام للجميع)
    const { data: courses } = await supabase
      .from('view_course_details')
      .select('*')
      .order('sort_order', { ascending: true });

    // 4. ✅ (تعديل) جلب إعدادات التواصل + إعدادات الوضع المجاني
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['support_whatsapp', 'support_telegram', 'free_mode']); // 🆕 تم إضافة free_mode

    const contactInfo = {};
    settingsData?.forEach(item => {
        contactInfo[item.key] = item.value;
    });

    return res.status(200).json({
      success: true,
      isLoggedIn: isLoggedIn,
      user: userData,          
      myAccess: userAccess, 
      library: libraryData, 
      courses: courses || [],
      // ✅ إرسال معلومات التواصل
      contactInfo: {
          whatsapp: contactInfo['support_whatsapp'] || '',
          telegram: contactInfo['support_telegram'] || ''
      },
      // ✅ إرسال حالة الوضع المجاني
      freeModeV5: contactInfo['free_mode'] === 'true'
    });

  } catch (err) {
    console.error('[Init API Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};
