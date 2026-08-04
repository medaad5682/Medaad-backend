import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';

export default async (req, res) => {
  // 1. التحقق من الصلاحية وجلب بيانات المدرس
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const teacherId = user.teacherId;

  // -- خطوة أ: جلب معرفات المحتوى الخاص بالمدرس (للتأكد من الملكية وللقوائم) --
  // 1. جلب كورسات المدرس
  const { data: myCourses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('teacher_id', teacherId);
    
  const myCourseIds = myCourses?.map(c => c.id) || [];

  // 2. جلب المواد التابعة لكورسات المدرس
  const { data: mySubjects } = await supabase
    .from('subjects')
    .select('id, title, course_id')
    .in('course_id', myCourseIds);
    
  const mySubjectIds = mySubjects?.map(s => s.id) || [];

  // دالة مساعدة: جلب معرفات الطلاب المشتركين عند هذا المدرس فقط
  const getMyStudentIds = async () => {
      // المشتركين في الكورسات
      const { data: cUsers } = await supabase
          .from('user_course_access')
          .select('user_id')
          .in('course_id', myCourseIds);
          
      // المشتركين في المواد
      const { data: sUsers } = await supabase
          .from('user_subject_access')
          .select('user_id')
          .in('subject_id', mySubjectIds);

      // دمج المعرفات وحذف التكرار
      const ids = new Set([
          ...(cUsers?.map(x => x.user_id) || []),
          ...(sUsers?.map(x => x.user_id) || [])
      ]);
      
      return Array.from(ids);
  };

  // ---------------------------------------------------------
  // 2. معالجة طلبات GET (جلب البيانات)
  // ---------------------------------------------------------
  if (req.method === 'GET') {
    const { 
        page = 1, 
        limit = 30, 
        search, 
        get_details_for_user,
        courses_filter,
        subjects_filter,
        filter_mode = 'or'
    } = req.query;

    try {
        // --- الحالة 1: طلب تفاصيل طالب معين (للمودال) ---
        if (get_details_for_user) {
            // ✅ تم إزالة قيد (validStudentIds) للسماح للمدرس بفتح بروفايل أي طالب للبحث عنه وإضافته
            // لا تقلق، البيانات المجلوبة محمية وتخص هذا المدرس فقط بسبب (.in('course_id', myCourseIds))

            const { data: userCourses } = await supabase
                .from('user_course_access')
                .select('course_id, courses(title)')
                .eq('user_id', get_details_for_user)
                .in('course_id', myCourseIds); // 🔒 حماية: جلب كورسات هذا المدرس فقط
            
            const { data: userSubjects } = await supabase
                .from('user_subject_access')
                .select('subject_id, subjects(title, course_id)')
                .eq('user_id', get_details_for_user)
                .in('subject_id', mySubjectIds); // 🔒 حماية: جلب مواد هذا المدرس فقط

            const ownedCourseIds = userCourses?.map(uc => uc.course_id) || [];
            const ownedSubjectIds = userSubjects?.map(us => us.subject_id) || [];

            const availableCourses = myCourses.filter(c => !ownedCourseIds.includes(c.id));

            const availableSubjects = mySubjects.filter(s => {
                const isOwned = ownedSubjectIds.includes(s.id);
                const isParentCourseOwned = ownedCourseIds.includes(s.course_id);
                return !isOwned && !isParentCourseOwned;
            });

            return res.status(200).json({ 
                courses: userCourses || [], 
                subjects: userSubjects || [],
                available_courses: availableCourses,
                available_subjects: availableSubjects
            });
        }

        // --- الحالة 2: الجدول والبحث ---
        let query = supabase
            .from('users')
            .select(`id, first_name, username, phone, created_at, is_blocked, is_admin, devices(fingerprint)`, { count: 'exact' });

        if (search && search.trim() !== '') {
            // ✅ مسار البحث العام (يبحث في جميع الطلاب بالمنصة)
            query = query.eq('role', 'student');
            
            const term = search.trim();
            // ✅ التعديل هنا: البحث الدقيق والمطابق تماماً (eq بدلاً من ilike)
            let orQuery = `first_name.eq.${term},username.eq.${term},phone.eq.${term}`;
            
            if (/^\d+$/.test(term)) {
                orQuery += `,id.eq.${term}`;
            }
            
            query = query.or(orQuery);
            
        } else {
            // ✅ المسار الافتراضي (بدون بحث): يجلب طلاب هذا المدرس فقط لتجنب الزحام
            let targetStudentIds = await getMyStudentIds();

            const hasCourseFilter = !!courses_filter;
            const hasSubjectFilter = !!subjects_filter;

            if (hasCourseFilter || hasSubjectFilter) {
                const isAnd = filter_mode === 'and';

                // جمع مجموعات المستخدمين لكل فلتر
                let courseUserSets = [];
                if (hasCourseFilter) {
                    const filterCourseIds = courses_filter.split(',');
                    if (isAnd) {
                        for (const cid of filterCourseIds) {
                            const { data } = await supabase.from('user_course_access').select('user_id').eq('course_id', cid);
                            courseUserSets.push(data?.map(x => x.user_id) || []);
                        }
                    } else {
                        const { data } = await supabase.from('user_course_access').select('user_id').in('course_id', filterCourseIds);
                        courseUserSets.push(data?.map(x => x.user_id) || []);
                    }
                }

                let subjectUserSets = [];
                if (hasSubjectFilter) {
                    const filterSubjectIds = subjects_filter.split(',');
                    if (isAnd) {
                        for (const sid of filterSubjectIds) {
                            const { data } = await supabase.from('user_subject_access').select('user_id').eq('subject_id', sid);
                            subjectUserSets.push(data?.map(x => x.user_id) || []);
                        }
                    } else {
                        const { data } = await supabase.from('user_subject_access').select('user_id').in('subject_id', filterSubjectIds);
                        subjectUserSets.push(data?.map(x => x.user_id) || []);
                    }
                }

                const allSets = [...courseUserSets, ...subjectUserSets];

                let filteredIds;
                if (isAnd) {
                    // AND: تقاطع — الطالب يجب أن يكون في كل مجموعة
                    filteredIds = allSets.length === 0
                        ? []
                        : allSets.reduce((acc, set) => acc.filter(id => set.includes(id)));
                } else {
                    // OR: اتحاد — الطالب في أي مجموعة
                    filteredIds = [...new Set(allSets.flat())];
                }

                targetStudentIds = targetStudentIds.filter(id => filteredIds.includes(id));
            }

            if (targetStudentIds.length === 0) {
                return res.status(200).json({ students: [], total: 0 });
            }

            query = query.in('id', targetStudentIds);
        }

        // ✅ إصلاح: تحويل page و limit إلى أرقام صريحة (نفس مشكلة داشبورد السوبر أدمن)
        // بدون التحويل، "from + limit - 1" ينفذ جمع نصوص بدل جمع أرقام بداية من الصفحة الثانية
        // مما يجعل "to" رقماً خاطئاً وضخماً فتُرجع الاستعلامات كل الصفوف تقريباً بدل 30 فقط
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 30;
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const formattedData = data.map(u => ({
            ...u,
            device_linked: u.devices && u.devices.length > 0
        }));

        return res.status(200).json({ 
            students: formattedData, 
            total: count || 0,
            isMainAdmin: false 
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
  }

  // ---------------------------------------------------------
  // 3. معالجة طلبات POST (الإجراءات)
  // ---------------------------------------------------------
  if (req.method === 'POST') {
      const { action, userIds, userId, grantList } = req.body;
      const targetIds = userIds || (userId ? [userId] : []);

      const myStudentIds = await getMyStudentIds();
      const safeMyIds = myStudentIds.map(String);
      
      // ✅ 🔒 الحماية الصارمة: المدرس يمكنه فقط منح الصلاحيات للطلاب (حتى لو لم يكونوا طلابه بعد)
      // أما الإجراءات الأخرى فلا تتم إلا على الطلاب الذين يمتلكون كورساته بالفعل (safeMyIds)
      const isAuthorized = targetIds.every(id => safeMyIds.includes(String(id)) || action === 'grant_access'); 

      if (!isAuthorized && action !== 'grant_access') {
          return res.status(403).json({ error: 'عذراً، هذا الإجراء مسموح فقط على طلابك.' });
      }

      if (action !== 'grant_access' && action !== 'revoke_access') {
          return res.status(403).json({ error: 'عذراً، غير مصرح لك بتعديل بيانات الطلاب الأساسية أو حظرهم.' });
      }

      try {
          // -- أ) منح صلاحيات (Grant) مع التحقق من التكرار --
          if (action === 'grant_access') {
              const { courses = [], subjects = [] } = grantList || {};
              
              // 🔒 فلترة البيانات القادمة من الفرونت إند لضمان أنها تخص هذا المدرس فقط
              const safeCourses = courses.filter(id => myCourseIds.includes(Number(id)) || myCourseIds.includes(String(id)));
              const safeSubjects = subjects.filter(id => mySubjectIds.includes(Number(id)) || mySubjectIds.includes(String(id)));

              // 🛑 1. جلب الصلاحيات الموجودة مسبقاً لمنع التكرار
              const existingCourseMap = new Set();
              const existingSubjectMap = new Set();

              if (targetIds.length > 0) {
                  // فحص الكورسات المملوكة
                  if (safeCourses.length > 0) {
                      const { data: existingC } = await supabase
                          .from('user_course_access')
                          .select('user_id, course_id')
                          .in('user_id', targetIds)
                          .in('course_id', safeCourses);
                      existingC?.forEach(r => existingCourseMap.add(`${r.user_id}-${r.course_id}`));
                  }
                  // فحص المواد المملوكة
                  if (safeSubjects.length > 0) {
                      const { data: existingS } = await supabase
                          .from('user_subject_access')
                          .select('user_id, subject_id')
                          .in('user_id', targetIds)
                          .in('subject_id', safeSubjects);
                      existingS?.forEach(r => existingSubjectMap.add(`${r.user_id}-${r.subject_id}`));
                  }
              }

              // 2. جلب تفاصيل المحتوى (للسعر والعنوان)
              let courseInfos = [];
              if (safeCourses.length > 0) {
                  const { data } = await supabase.from('courses').select('id, title, price').in('id', safeCourses);
                  courseInfos = data || [];
              }

              let subjectInfos = [];
              if (safeSubjects.length > 0) {
                  const { data } = await supabase.from('subjects').select('id, title, price, courses(title)').in('id', safeSubjects);
                  subjectInfos = data || [];
              }

              const { data: usersData } = await supabase.from('users').select('id, username, first_name, phone').in('id', targetIds);

              const reqInserts = []; 
              const cInserts = [];   
              const sInserts = [];   
              
              targetIds.forEach(uid => {
                  const user = usersData?.find(u => u.id == uid);
                  if (!user) return;

                  // معالجة الكورسات
                  safeCourses.forEach(cid => {
                      // 🛑 التحقق: هل يملك الطالب الكورس بالفعل؟
                      if (existingCourseMap.has(`${uid}-${cid}`)) return; // تخطي

                      const cInfo = courseInfos.find(c => c.id == cid);
                      if (cInfo) {
                          reqInserts.push({
                              user_id: uid,
                              teacher_id: teacherId,
                              status: 'approved',
                              total_price: cInfo.price || 0,
                              user_name: user.first_name,
                              user_username: user.username,
                              phone: user.phone,
                              course_title: cInfo.title,
                              requested_data: [{
                                  id: cid, type: 'course', title: cInfo.title, price: cInfo.price || 0
                              }],
                              user_note: 'تم التفعيل يدوياً من قائمة الطلاب'
                          });
                      }
                      cInserts.push({ user_id: uid, course_id: cid });
                  });

                  // معالجة المواد
                  safeSubjects.forEach(sid => {
                      // 🛑 التحقق: هل يملك الطالب المادة بالفعل؟
                      if (existingSubjectMap.has(`${uid}-${sid}`)) return; // تخطي

                      const sInfo = subjectInfos.find(s => s.id == sid);
                      if (sInfo) {
                           const title = `${sInfo.title} (${sInfo.courses?.title})`;
                           reqInserts.push({
                              user_id: uid,
                              teacher_id: teacherId,
                              status: 'approved',
                              total_price: sInfo.price || 0,
                              user_name: user.first_name,
                              user_username: user.username,
                              phone: user.phone,
                              course_title: title,
                              requested_data: [{
                                  id: sid, type: 'subject', title: title, price: sInfo.price || 0
                              }],
                              user_note: 'تم التفعيل يدوياً من قائمة الطلاب'
                          });
                      }
                      sInserts.push({ user_id: uid, subject_id: sid });
                  });
              });

              // ✅ التنفيذ فقط إذا كان هناك بيانات جديدة
              if (reqInserts.length > 0) {
                  await supabase.from('subscription_requests').insert(reqInserts);
              }

              if (cInserts.length) await supabase.from('user_course_access').upsert(cInserts, { onConflict: 'user_id, course_id' });
              if (sInserts.length) await supabase.from('user_subject_access').upsert(sInserts, { onConflict: 'user_id, subject_id' });
              
              const msg = reqInserts.length === 0 && cInserts.length === 0 && sInserts.length === 0
                ? 'جميع الطلاب المحددين يمتلكون هذه الصلاحيات بالفعل.' 
                : 'تم منح الصلاحيات وتسجيل العمليات بنجاح.';

              return res.status(200).json({ success: true, message: msg });
          }

          // -- ب) سحب صلاحيات (Revoke) --
          if (action === 'revoke_access') {
              const { courseId, subjectId } = req.body;
              
              // 🔒 حماية إضافية قبل الحذف للتأكد من ملكية المدرس للكورس/المادة
              if (courseId && myCourseIds.includes(Number(courseId))) {
                  await supabase.from('user_course_access').delete().in('user_id', targetIds).eq('course_id', courseId);
              } else if (subjectId && mySubjectIds.includes(Number(subjectId))) {
                  await supabase.from('user_subject_access').delete().in('user_id', targetIds).eq('subject_id', subjectId);
              } else {
                  return res.status(403).json({ error: 'لا تملك صلاحية على هذا المحتوى.' });
              }
              
              return res.status(200).json({ success: true, message: 'تم سحب الصلاحية.' });
          }

      } catch (err) {
          console.error("Student Action Error:", err);
          return res.status(500).json({ error: err.message });
      }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
