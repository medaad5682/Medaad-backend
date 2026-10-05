import { supabase } from '../../../lib/supabaseClient';
import jwt from 'jsonwebtoken';
import { BASE_URL } from '../../../lib/config'; // ✅ 1. استيراد ملف الإعدادات الموحد
import admin from '../../../lib/firebaseAdmin'; // ✅ إضافة استيراد فايربيز آدمن للتحقق
import { verifyAppCheckWithWhitelist } from '../../../lib/appCheckWhitelist'; // 🆕 القائمة البيضاء
import { isAccessRowActive } from '../../../lib/accessExpiryHelper'; // ⏳ فحص انتهاء صلاحية الوصول (Feature B)

export default async (req, res) => {
  
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
          .select('id, first_name, username, phone, email, is_blocked, jwt_token, role, teacher_profile_id')
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
              email: user.email,
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
          // ⏳ نجلب granted_at/expires_at ونستبعد الصفوف منتهية الصلاحية فوراً —
          // طالب انتهى اشتراكه يُعامل تماماً كمن لم يشترك أبداً في كل هذا
          // الملف. نُرفق التاريخين أيضاً مع عنصر المكتبة نفسه (أسفل) حتى يقدر
          // التطبيق يعرض عدّاد "ينتهي خلال N يوم" دون طلب إضافي منفصل.
          const { data: fullCoursesRaw } = await supabase
            .from('user_course_access')
            .select(`
              course_id, granted_at, expires_at,
              courses ( 
                id, title, code, teacher_id, description, price,
                teachers ( name )
              )
            `)
            .eq('user_id', userId);

          const fullCourses = (fullCoursesRaw || []).filter(isAccessRowActive);

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
          // ⏳ نفس منطق الاستبعاد أعلاه: مادة منفصلة انتهت صلاحيتها = غير مملوكة.
          // نجلب granted_at أيضاً لنفس سبب الكورسات أعلاه (عدّاد الانتهاء في التطبيق).
          const { data: singleSubjectsRaw } = await supabase
            .from('user_subject_access')
            .select(`
              subject_id, granted_at, expires_at,
              subjects (
                id, title, price,
                courses ( 
                  id, title, code, teacher_id, description,
                  teachers ( name ) 
                )
              )
            `)
            .eq('user_id', userId);

          const singleSubjects = (singleSubjectsRaw || []).filter(isAccessRowActive);

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
                owned_subjects: subjectsList,
                // ⏳ [Feature B] تاريخ الاشتراك وانتهاؤه لهذا الكورس (null =
                // وصول مدى الحياة). راجع app_state.dart في التطبيق لمعرفة كيف
                // يُستهلك هذا الحقل لعرض عدّاد الانتهاء.
                granted_at: item.granted_at,
                expires_at: item.expires_at
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
                  price: subject.price, // ✅
                  // ⏳ [Feature B] هذه المادة اشتُريت منفردة (وليست جزءاً من
                  // اشتراك كورس كامل)، فتاريخ انتهائها الخاص بها مهم هنا —
                  // بعكس owned_subjects داخل كورس كامل، حيث لا معنى لتاريخ
                  // انتهاء لكل مادة على حدة (كلها تتبع تاريخ الكورس).
                  granted_at: item.granted_at,
                  expires_at: item.expires_at
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

          // ==========================================
          // 📦 تجميع الكورسات/المواد المملوكة التابعة لنفس الباقة في مجلد واحد
          // ==========================================
          // ينطبق على كل عنصر مكتبة يمثّل "كورساً أباً" تابعاً لباقة، سواء
          // كان الطالب يملك الكورس بالكامل (type:'course') أو يملك مواد
          // منفصلة منه فقط (type:'subject_group') — فكلاهما لهما نفس معنى
          // "هذا الكورس الأب تابع لباقة"، لذا يجب أن يظهر أيهما داخل مجلد
          // الباقة بدل منفرداً في المكتبة.
          const ownedCourseEntries = libraryData.filter(
            item => item.type === 'course' || item.type === 'subject_group'
          );

          if (ownedCourseEntries.length > 0) {
            const ownedCourseIds = ownedCourseEntries.map(c => c.id);

            const { data: pkgItems } = await supabase
              .from('course_package_items')
              .select('package_id, course_id, course_packages ( id, title, is_active )')
              .in('course_id', ownedCourseIds);

            // ✅ الكورس الواحد قد يتبع أكثر من باقة: نخزّن قائمة بكل باقاته
            // (وليس أول باقة فقط) حتى يظهر الكورس داخل مجلد كل باقة منها.
            const courseIdToPackages = new Map(); // courseId -> [{ id, title }]
            (pkgItems || []).forEach(pi => {
              const pkg = pi.course_packages;
              // نتجاهل الباقات المؤرشفة (is_active = false)؛ الكورس عندها
              // يبقى يظهر منفرداً كما كان قبل هذه الميزة.
              if (!pkg || pkg.is_active === false) return;
              if (!courseIdToPackages.has(pi.course_id)) {
                courseIdToPackages.set(pi.course_id, []);
              }
              const list = courseIdToPackages.get(pi.course_id);
              if (!list.some(p => p.id === pkg.id)) {
                list.push({ id: pkg.id, title: pkg.title });
              }
            });

            if (courseIdToPackages.size > 0) {
              const packageGroups = new Map(); // packageId -> { type:'package', id, title, courses: [] }
              const restOfLibrary = [];

              libraryData.forEach(item => {
                const isGroupable = item.type === 'course' || item.type === 'subject_group';
                if (isGroupable && courseIdToPackages.has(item.id)) {
                  // ✅ نضيف الكورس إلى كل باقة يتبعها (مجلد لكل باقة)
                  courseIdToPackages.get(item.id).forEach(pkg => {
                    if (!packageGroups.has(pkg.id)) {
                      packageGroups.set(pkg.id, {
                        type: 'package',
                        id: pkg.id,
                        title: pkg.title,
                        courses: [],
                      });
                    }
                    packageGroups.get(pkg.id).courses.push(item);
                  });
                } else {
                  restOfLibrary.push(item);
                }
              });

              // مجلدات الباقات أولاً ثم بقية عناصر المكتبة (كورسات منفردة لا
              // تتبع أي باقة + مجموعات المواد المنفصلة التي لا تتبع باقة).
              libraryData = [...Array.from(packageGroups.values()), ...restOfLibrary];
            }
          }
       }
    }

    // 3. جلب بيانات المتجر (عام للجميع)
    // ✅ التعديل: نجلب 5 كورسات عشوائية فقط بدلاً من كل الكورسات — الشاشة
    // الرئيسية تعرض هذه كـ"مقترح لك"، أما البحث الكامل فيتم عبر
    // /api/public/search-courses بشكل منفصل عند الطلب.
    const { data: allCoursesForRandom } = await supabase
      .from('view_course_details')
      .select('*');

    let courses = [];
    if (allCoursesForRandom && allCoursesForRandom.length > 0) {
      const shuffled = [...allCoursesForRandom].sort(() => Math.random() - 0.5);
      courses = shuffled.slice(0, 5);
    }

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
      courses: courses,
      // ✅ إرسال معلومات التواصل
      contactInfo: {
          whatsapp: contactInfo['support_whatsapp'] || '',
          telegram: contactInfo['support_telegram'] || ''
      },
      // ✅ إرسال حالة الوضع المجاني
      freeModeV9: contactInfo['free_mode'] === 'true'
    });

  } catch (err) {
    console.error('[Init API Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};
