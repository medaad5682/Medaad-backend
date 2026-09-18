import { supabase } from '../../../../lib/supabaseClient';
import { requireTeacherOrAdmin } from '../../../../lib/dashboardHelper';
import { buildGrantTimestamps, isExemptFromExpiry } from '../../../../lib/accessExpiryHelper';
import { getTeacherTeamContext, getTeamPackages } from '../../../../lib/teamHelper';
import { grantPackagesToUsers } from '../../../../lib/grantHelper';

// 🔒 سعر التقرير (report_price) بيانات مالية داخلية — لا تُرسل لمتصفح المدرس/القائد.
// نحذفه من الباقة ومن كل كورس بداخلها قبل الإرسال. (منطق المنح في السيرفر
// يجلب الباقات من getTeamPackages مباشرة ولا يتأثر بهذا الحذف.)
const stripReportPrices = (packages = []) => (packages || []).map(pkg => {
    const { report_price, ...pkgRest } = pkg;
    return {
        ...pkgRest,
        courses: (pkg.courses || []).map(c => {
            const { report_price: _rp, ...courseRest } = c;
            return courseRest;
        })
    };
});

export default async (req, res) => {
  // 1. التحقق من الصلاحية وجلب بيانات المدرس
  const { user, error } = await requireTeacherOrAdmin(req, res);
  if (error) return;

  const teacherId = user.teacherId;

  // 👥 سياق الفريق: القائد يرى ويدير كورسات كل مدرسي الفريق. مبيعات أي عضو
  // (حتى لو كانت كورسه الخاص) تُسجَّل تحت رصيد القائد في التقرير المالي.
  // مدرس بلا فريق، أو عضو عادي (غير قائد) -> يحصل بالضبط على نفس السلوك القديم.
  const teamCtx = await getTeacherTeamContext(teacherId);

  // ⚡ تحسين أداء: بدل استدعاء resolveBillingTeacherId() (استعلامين إضافيين
  // يعيدان جلب نفس صف teachers/teacher_teams اللذين جلبهما getTeacherTeamContext
  // للتو) نشتق نفس النتيجة من teamCtx مباشرة — بدون أي استعلام إضافي.
  // (نفس القاعدة القديمة تماماً: عضو غير قائد -> معرف القائد، غير ذلك -> معرفه هو)
  const billingTeacherId = (teamCtx.inTeam && !teamCtx.isLeader && teamCtx.team?.leader_teacher_id)
    ? teamCtx.team.leader_teacher_id
    : teacherId;

  // -- خطوة أ: جلب معرفات المحتوى الخاص بالمدرس (للتأكد من الملكية وللقوائم) --
  // 👑 قائد الفريق: "كورساتي/موادي" تشمل كورسات ومواد كل مدرسي الفريق (جاهزة
  // بالفعل داخل teamCtx). ⚡ تحسين أداء: لا نجلب كورسات/مواد المدرس الخاصة به
  // منفصلة في هذه الحالة (كانت تُجلب دائماً ثم تُهدر فوراً لصالح teamCtx).
  let myCourses, myCourseIds, mySubjects, mySubjectIds;

  if (teamCtx.isLeader) {
    myCourses = teamCtx.courses.map(c => ({ id: c.id, title: c.title, teacher_id: c.teacher_id }));
    myCourseIds = teamCtx.courseIds;
    mySubjects = teamCtx.subjects;
    mySubjectIds = teamCtx.subjectIds;
  } else {
    const { data: ownCourses } = await supabase
      .from('courses')
      .select('id, title, teacher_id')
      .eq('teacher_id', teacherId);

    myCourses = ownCourses || [];
    myCourseIds = myCourses.map(c => c.id);

    const { data: ownSubjects } = await supabase
      .from('subjects')
      .select('id, title, course_id')
      .in('course_id', myCourseIds);

    mySubjects = ownSubjects || [];
    mySubjectIds = mySubjects.map(s => s.id);
  }

  // اختياري: فلترة إضافية على مدرس واحد داخل الفريق (لقائمة الطلاب الافتراضية)
  if (teamCtx.isLeader && req.query?.teacher_filter) {
    const tId = req.query.teacher_filter;
    myCourseIds = myCourses.filter(c => String(c.teacher_id) === String(tId)).map(c => c.id);
    mySubjectIds = mySubjects.filter(s => myCourseIds.includes(s.course_id)).map(s => s.id);
  }

  // دالة مساعدة: جلب معرفات الطلاب المشتركين عند هذا المدرس فقط
  // ⚡ تحسين أداء: الاستعلامان (كورسات/مواد) مستقلان تماماً، فننفذهما بالتوازي
  // بدل التتابع (Promise.all) — نفس عدد الاستعلامات، لكن بنصف زمن الانتظار تقريباً.
  const getMyStudentIds = async () => {
      const [{ data: cUsers }, { data: sUsers }] = await Promise.all([
          supabase.from('user_course_access').select('user_id').in('course_id', myCourseIds),
          supabase.from('user_subject_access').select('user_id').in('subject_id', mySubjectIds)
      ]);

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
                .select('course_id, granted_at, expires_at, courses(title)')
                .eq('user_id', get_details_for_user)
                .in('course_id', myCourseIds); // 🔒 حماية: جلب كورسات هذا المدرس فقط
            
            const { data: userSubjects } = await supabase
                .from('user_subject_access')
                .select('subject_id, granted_at, expires_at, subjects(title, course_id)')
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

            // 📦 باقات الفريق المتاحة لهذا الطالب (للقائد فقط). نخفي الباقة فقط لو
            // كان الطالب يملك بالفعل كل كورساتها — نفس قاعدة grantPackagesToUsers.
            let availablePackages = [];
            if (teamCtx.isLeader && teamCtx.team) {
                const teamPackages = await getTeamPackages(teamCtx.team.id);
                availablePackages = teamPackages.filter(pkg =>
                    (pkg.courses || []).some(c => !ownedCourseIds.includes(c.id))
                );
            }

            return res.status(200).json({ 
                courses: userCourses || [], 
                subjects: userSubjects || [],
                available_courses: availableCourses,
                available_subjects: availableSubjects,
                is_leader: teamCtx.isLeader,
                team_teachers: teamCtx.isLeader ? teamCtx.teamTeachers : [],
                available_packages: stripReportPrices(availablePackages)
            });
        }

        // --- الحالة 2: الجدول والبحث ---
        let query = supabase
            .from('users')
            .select(`id, first_name, username, phone, email, created_at, is_blocked, is_admin, devices(fingerprint)`, { count: 'exact' });

        if (search && search.trim() !== '') {
            // ✅ مسار البحث العام (يبحث في جميع الطلاب بالمنصة)
            query = query.eq('role', 'student');
            
            const term = search.trim();
            // ✅ التعديل هنا: البحث الدقيق والمطابق تماماً (eq بدلاً من ilike)
            // ✅ إضافة البريد الإلكتروني كحقل بحث (يُطابق دون حساسية لحالة الأحرف)
            let orQuery = `first_name.eq.${term},username.eq.${term},phone.eq.${term},email.ilike.${term}`;
            
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
                const filterCourseIds = hasCourseFilter ? courses_filter.split(',') : [];
                const filterSubjectIds = hasSubjectFilter ? subjects_filter.split(',') : [];

                // ⚡ تحسين أداء: كان وضع "AND" ينفذ استعلاماً منفصلاً لكل معرف كورس/مادة
                // (N استعلام)؛ الآن استعلام واحد فقط لكل نوع (يجلب user_id + course_id/
                // subject_id معاً) ثم يُجمَّع محلياً حسب المعرف، مع تنفيذ استعلامي
                // الكورسات والمواد بالتوازي بدل التتابع.
                const [courseRowsRes, subjectRowsRes] = await Promise.all([
                    hasCourseFilter
                        ? supabase.from('user_course_access').select('user_id, course_id').in('course_id', filterCourseIds)
                        : Promise.resolve({ data: [] }),
                    hasSubjectFilter
                        ? supabase.from('user_subject_access').select('user_id, subject_id').in('subject_id', filterSubjectIds)
                        : Promise.resolve({ data: [] })
                ]);

                // جمع مجموعات المستخدمين لكل فلتر
                let courseUserSets = [];
                if (hasCourseFilter) {
                    const courseRows = courseRowsRes.data || [];
                    if (isAnd) {
                        // مجموعة مستقلة لكل كورس مطلوب (سيتم تقاطعها لاحقاً)
                        const byCourse = new Map(filterCourseIds.map(cid => [String(cid), []]));
                        for (const row of courseRows) {
                            const key = String(row.course_id);
                            if (byCourse.has(key)) byCourse.get(key).push(row.user_id);
                        }
                        courseUserSets = Array.from(byCourse.values());
                    } else {
                        courseUserSets = [courseRows.map(r => r.user_id)];
                    }
                }

                let subjectUserSets = [];
                if (hasSubjectFilter) {
                    const subjectRows = subjectRowsRes.data || [];
                    if (isAnd) {
                        const bySubject = new Map(filterSubjectIds.map(sid => [String(sid), []]));
                        for (const row of subjectRows) {
                            const key = String(row.subject_id);
                            if (bySubject.has(key)) bySubject.get(key).push(row.user_id);
                        }
                        subjectUserSets = Array.from(bySubject.values());
                    } else {
                        subjectUserSets = [subjectRows.map(r => r.user_id)];
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

        // 👑 للقائد فقط: شجرة كورسات الفريق كاملة (مع موادها ومدرس كل كورس)
        // ليستخدمها الفرونت إند في بناء نافذة المنح الجماعي + قائمة الباقات،
        // بدلاً من الاعتماد على /api/dashboard/teacher/content (خاص بكورسات
        // هذا المدرس فقط ولا يعرف شيئاً عن الفريق).
        let teamCourses = [];
        let teamPackages = [];
        if (teamCtx.isLeader && teamCtx.team) {
            const teacherNameById = new Map(teamCtx.teamTeachers.map(t => [t.id, t.name]));
            teamCourses = teamCtx.courses.map(c => ({
                id: c.id,
                title: c.title,
                teacher_id: c.teacher_id,
                teacher_name: teacherNameById.get(c.teacher_id) || '—',
                subjects: teamCtx.subjects
                    .filter(s => s.course_id === c.id)
                    .map(s => ({ id: s.id, title: s.title })),
            }));
            teamPackages = await getTeamPackages(teamCtx.team.id);
        }

        return res.status(200).json({ 
            students: formattedData, 
            total: count || 0,
            isMainAdmin: false,
            isLeader: teamCtx.isLeader,
            teamName: teamCtx.team?.name || null,
            teamTeachers: teamCtx.isLeader ? teamCtx.teamTeachers : [],
            teamCourses,
            teamPackages: stripReportPrices(teamPackages)
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
              const { courses = [], subjects = [], packages = [] } = grantList || {};
              
              // 🔒 فلترة البيانات القادمة من الفرونت إند لضمان أنها تخص هذا المدرس فقط
              let safeCourses = courses.filter(id => myCourseIds.includes(Number(id)) || myCourseIds.includes(String(id)));
              const safeSubjects = subjects.filter(id => mySubjectIds.includes(Number(id)) || mySubjectIds.includes(String(id)));

              // -- تجهيز الباقات المختارة أولاً (قبل معالجة الكورسات المفردة) --
              // متاحة فقط لقائد الفريق
              let chosenPackages = [];
              if (packages.length > 0) {
                  if (!teamCtx.isLeader) {
                      return res.status(403).json({ error: 'تفعيل الباقات متاح فقط لقائد الفريق.' });
                  }
                  const teamPackages = await getTeamPackages(teamCtx.team.id);
                  chosenPackages = teamPackages.filter(p => packages.map(String).includes(String(p.id)));
              }

              // 🛡️ منع ازدواجية طلب الاشتراك: لو اختار القائد باقة وكورساً منفرداً
              // موجوداً بالفعل داخل تلك الباقة، لا نُنشئ طلب اشتراك/منح صلاحية
              // مستقل لهذا الكورس — الباقة وحدها هي من تتكفل بمنحه وتسجيل طلبه.
              if (chosenPackages.length > 0) {
                  const packageCourseIds = new Set(
                      chosenPackages.flatMap(p => (p.courses || []).map(c => String(c.id)))
                  );
                  safeCourses = safeCourses.filter(id => !packageCourseIds.has(String(id)));
              }

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
                  // ✅ teacher_id هنا هو المالك الفعلي للكورس (قد يختلف عن billingTeacherId
                  // حين يمنح القائد كورس عضو آخر في الفريق) — يُخزَّن كـ owner_teacher_id
                  // في requested_data لأغراض التدقيق فقط، ولا يُستخدم في الفوترة.
                  const { data } = await supabase.from('courses').select('id, title, price, teacher_id').in('id', safeCourses);
                  courseInfos = data || [];
              }

              let subjectInfos = [];
              if (safeSubjects.length > 0) {
                  const { data } = await supabase.from('subjects').select('id, title, price, courses(title, teacher_id)').in('id', safeSubjects);
                  subjectInfos = data || [];
              }

              const { data: usersData } = await supabase.from('users').select('id, username, first_name, phone, role').in('id', targetIds);

              // ⏳ نحسب تاريخ الانتهاء مرة واحدة لكل كورس/مادة (نفس المدة لكل الطلاب المستهدفين)
              const courseGrantTimestamps = {};
              for (const cid of safeCourses) {
                  courseGrantTimestamps[cid] = await buildGrantTimestamps(cid, null);
              }
              const subjectGrantTimestamps = {};
              for (const sid of safeSubjects) {
                  subjectGrantTimestamps[sid] = await buildGrantTimestamps(null, sid);
              }

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
                              teacher_id: billingTeacherId,
                              status: 'approved',
                              total_price: cInfo.price || 0,
                              user_name: user.first_name,
                              user_username: user.username,
                              phone: user.phone,
                              course_title: cInfo.title,
                              requested_data: [{
                                  id: cid, type: 'course', title: cInfo.title, price: cInfo.price || 0,
                                  owner_teacher_id: cInfo.teacher_id ?? null
                              }],
                              user_note: 'تم التفعيل يدوياً من قائمة الطلاب'
                          });
                      }
                      const { granted_at, expires_at } = courseGrantTimestamps[cid] || {};
                      cInserts.push({ user_id: uid, course_id: cid, granted_at, expires_at: isExemptFromExpiry(user.role) ? null : expires_at });
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
                              teacher_id: billingTeacherId,
                              status: 'approved',
                              total_price: sInfo.price || 0,
                              user_name: user.first_name,
                              user_username: user.username,
                              phone: user.phone,
                              course_title: title,
                              requested_data: [{
                                  id: sid, type: 'subject', title: title, price: sInfo.price || 0,
                                  owner_teacher_id: sInfo.courses?.teacher_id ?? null
                              }],
                              user_note: 'تم التفعيل يدوياً من قائمة الطلاب'
                          });
                      }
                      const { granted_at, expires_at } = subjectGrantTimestamps[sid] || {};
                      sInserts.push({ user_id: uid, subject_id: sid, granted_at, expires_at: isExemptFromExpiry(user.role) ? null : expires_at });
                  });
              });

              // ✅ التنفيذ فقط إذا كان هناك بيانات جديدة
              if (reqInserts.length > 0) {
                  await supabase.from('subscription_requests').insert(reqInserts);
              }

              if (cInserts.length) await supabase.from('user_course_access').upsert(cInserts, { onConflict: 'user_id, course_id' });
              if (sInserts.length) await supabase.from('user_subject_access').upsert(sInserts, { onConflict: 'user_id, subject_id' });
              
              // -- ج) تفعيل باقات (Packages) — متاح فقط لقائد الفريق (تم التحقق والجلب أعلاه) --
              let packageResult = { requestsInserted: 0, coursesGranted: 0, alreadyOwnedCount: 0 };
              if (chosenPackages.length > 0) {
                  packageResult = await grantPackagesToUsers({
                      targetIds,
                      packages: chosenPackages,
                      billingTeacherId,
                      usersData: usersData || [],
                  });
              }

              const nothingHappened = reqInserts.length === 0 && cInserts.length === 0 && sInserts.length === 0
                && packageResult.requestsInserted === 0 && packageResult.coursesGranted === 0;
              const msg = nothingHappened
                ? 'جميع الطلاب المحددين يمتلكون هذه الصلاحيات بالفعل.' 
                : 'تم منح الصلاحيات وتسجيل العمليات بنجاح.';

              return res.status(200).json({ success: true, message: msg, packages: packageResult });
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
