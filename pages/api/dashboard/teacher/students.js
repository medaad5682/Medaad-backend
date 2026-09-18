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

// حدود أمان: تمنع طلب صفحات ضخمة أو إجراءات جماعية بآلاف المعرفات
const MAX_PAGE_SIZE = 100;
const MAX_BULK_TARGETS = 500;

// "1,2,x,3" -> [1,2,3]  (أرقام صحيحة موجبة فقط، بدون تكرار)
const toIntList = (raw) => [...new Set(
  String(Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map(v => Number(v.trim()))
    .filter(n => Number.isSafeInteger(n) && n > 0)
)];

// 🔒 نص البحث يُدمج داخل سلسلة .or() الخاصة بـ PostgREST. الفاصلة والأقواس وعلامات
// الاقتباس تسمح بحقن شروط إضافية (مثل  x,id.gt.0 ) فتُرجع كل طلاب المنصة بدل
// المطابقة الدقيقة المقصودة. نفس التنظيف المستخدم في pages/api/auth/login.js.
const sanitizeSearchTerm = (raw) => String(raw ?? '').replace(/[,()"\\]/g, '').trim().slice(0, 100);

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
    // ⚡ استعلام واحد (كورسات + موادها) بدل استعلامين متتابعين
    const { data: ownCourses, error: ownError } = await supabase
      .from('courses')
      .select('id, title, teacher_id, subjects(id, title, course_id)')
      .eq('teacher_id', teacherId);

    if (ownError) return res.status(500).json({ error: ownError.message });

    myCourses = (ownCourses || []).map(c => ({ id: c.id, title: c.title, teacher_id: c.teacher_id }));
    myCourseIds = myCourses.map(c => c.id);

    mySubjects = (ownCourses || []).flatMap(c => (c.subjects || []).map(sub => ({
      id: sub.id, title: sub.title, course_id: c.id
    })));
    mySubjectIds = mySubjects.map(s => s.id);
  }

  // اختياري: فلترة إضافية على مدرس واحد داخل الفريق (لقائمة الطلاب الافتراضية)
  if (teamCtx.isLeader && req.query?.teacher_filter) {
    const tId = req.query.teacher_filter;
    myCourseIds = myCourses.filter(c => String(c.teacher_id) === String(tId)).map(c => c.id);
    mySubjectIds = mySubjects.filter(s => myCourseIds.includes(s.course_id)).map(s => s.id);
  }

  // ⛔ تم حذف getMyStudentIds(): كانت تجلب *كل* صفوف user_course_access و
  // user_subject_access الخاصة بالمدرس (أو بكل الفريق للقائد) إلى ذاكرة السيرفر عند
  // كل تنقل بين الصفحات وعند كل إجراء POST، ثم تُعيد إرسال القائمة الناتجة داخل
  // .in('id', [آلاف المعرفات]) في رابط الطلب. الآن:
  //   • القائمة/الفلترة/الترقيم/العدد كلها داخل Postgres عبر الدالة
  //     get_teacher_students_page (انظر sql/teacher_students_page.sql).
  //   • إجراءات POST لا تحتاج قائمة الطلاب أصلاً (انظر التعليق في قسم POST).

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

            // ⚡ الاستعلامان مستقلان فننفذهما بالتوازي
            const [
                { data: userCourses, error: userCoursesError },
                { data: userSubjects, error: userSubjectsError }
            ] = await Promise.all([
                supabase
                    .from('user_course_access')
                    .select('course_id, granted_at, expires_at, courses(title)')
                    .eq('user_id', get_details_for_user)
                    .in('course_id', myCourseIds), // 🔒 حماية: جلب كورسات هذا المدرس فقط
                supabase
                    .from('user_subject_access')
                    .select('subject_id, granted_at, expires_at, subjects(title, course_id)')
                    .eq('user_id', get_details_for_user)
                    .in('subject_id', mySubjectIds) // 🔒 حماية: جلب مواد هذا المدرس فقط
            ]);
            // لو فشل الاستعلام لا نُظهر "لا يملك شيئاً" بالخطأ (كان سيدفع المدرس لمنح مكرر)
            if (userCoursesError || userSubjectsError) throw (userCoursesError || userSubjectsError);

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
        // ✅ تحويل page و limit إلى أرقام صريحة + سقف للحجم (الحد الأقصى MAX_PAGE_SIZE)
        // بدون التحويل، "from + limit - 1" ينفذ جمع نصوص بدل جمع أرقام من الصفحة الثانية.
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 30, 1), MAX_PAGE_SIZE);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;

        let students = [];
        let total = 0;

        if (search && search.trim() !== '') {
            // ✅ مسار البحث العام (يبحث في جميع الطلاب بالمنصة — مطابقة دقيقة فقط)
            const term = sanitizeSearchTerm(search);

            if (term) {
                // الإيميل يُحفظ دائماً بحروف صغيرة (signup/verify-otp/...)، فالمطابقة بـ eq على
                // النص الصغير تكفي وتغني عن ilike الذي كان يعامل % و _ و * كرموز بحث شاملة
                // (فكان البحث بـ "%" يُرجع كل طلاب المنصة).
                let orQuery = `first_name.eq.${term},username.eq.${term},phone.eq.${term},email.eq.${term.toLowerCase()}`;
                if (/^\d+$/.test(term) && term.length <= 15) {
                    orQuery += `,id.eq.${term}`;
                }

                // devices(id) فقط لمعرفة هل الجهاز مربوط — لا نجلب/نُرسل بصمات الأجهزة للمتصفح
                const { data, count, error: fetchError } = await supabase
                    .from('users')
                    .select('id, first_name, username, phone, email, created_at, is_blocked, is_admin, devices(id)', { count: 'exact' })
                    .eq('role', 'student')
                    .or(orQuery)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to);
                if (fetchError) throw fetchError;

                students = (data || []).map(({ devices, ...u }) => ({
                    ...u,
                    device_linked: !!(devices && devices.length > 0)
                }));
                total = count || 0;
            }
        } else {
            // ✅ المسار الافتراضي (بدون بحث): طلاب هذا المدرس فقط (أو كل الفريق للقائد)
            const filterCourseIds = toIntList(courses_filter);
            const filterSubjectIds = toIntList(subjects_filter);
            const filterRequested = !!courses_filter || !!subjects_filter;

            // طُلبت فلترة لكن كل المعرفات غير صالحة -> لا نتائج (بدل إرجاع القائمة بلا فلتر)
            if (!(filterRequested && filterCourseIds.length === 0 && filterSubjectIds.length === 0)) {
                // ⚡ استعلام واحد داخل Postgres: يحدد الطلاب + يطبق الفلاتر (AND/OR) + يرتب
                // + يقتطع الصفحة + يحسب الإجمالي. يُستدعى عبر POST body فلا توجد حدود لطول الرابط.
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_teacher_students_page', {
                    p_course_ids: myCourseIds,
                    p_subject_ids: mySubjectIds,
                    p_filter_course_ids: filterCourseIds,
                    p_filter_subject_ids: filterSubjectIds,
                    p_filter_mode: filter_mode === 'and' ? 'and' : 'or',
                    p_limit: limitNum,
                    p_offset: from
                });
                if (rpcError) throw rpcError;

                students = rpcData?.students || [];
                total = Number(rpcData?.total) || 0;
            }
        }

        const payload = {
            students,
            total,
            isMainAdmin: false,
            isLeader: teamCtx.isLeader,
            teamName: teamCtx.team?.name || null,
            teamTeachers: teamCtx.isLeader ? teamCtx.teamTeachers : []
        };

        // 👑 للقائد فقط: شجرة كورسات الفريق كاملة + الباقات (لنافذة المنح الجماعي والفلترة).
        // ⚡ هذه البيانات لا تتغير بين الصفحات، فالفرونت إند يطلبها مرة واحدة فقط ثم يرسل
        // skip_team_meta=1 في باقي الطلبات لتوفير استعلامات getTeamPackages عند كل تنقل.
        // (بدون الباراميتر يبقى السلوك القديم: تُرسل دائماً)
        if (req.query.skip_team_meta !== '1') {
            let teamCourses = [];
            let teamPackages = [];
            if (teamCtx.isLeader && teamCtx.team) {
                const teacherNameById = new Map(teamCtx.teamTeachers.map(t => [t.id, t.name]));
                const subjectsByCourse = new Map();
                for (const sub of teamCtx.subjects) {
                    if (!subjectsByCourse.has(sub.course_id)) subjectsByCourse.set(sub.course_id, []);
                    subjectsByCourse.get(sub.course_id).push({ id: sub.id, title: sub.title });
                }
                teamCourses = teamCtx.courses.map(c => ({
                    id: c.id,
                    title: c.title,
                    teacher_id: c.teacher_id,
                    teacher_name: teacherNameById.get(c.teacher_id) || '—',
                    subjects: subjectsByCourse.get(c.id) || [],
                }));
                teamPackages = await getTeamPackages(teamCtx.team.id);
            }
            payload.teamCourses = teamCourses;
            payload.teamPackages = stripReportPrices(teamPackages);
        }

        return res.status(200).json(payload);

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
  }

  // ---------------------------------------------------------
  // 3. معالجة طلبات POST (الإجراءات)
  // ---------------------------------------------------------
  if (req.method === 'POST') {
      const { action, userIds, userId, grantList } = req.body || {};

      // 🔒 المسموح فقط: منح الصلاحيات وسحبها (لا تعديل لبيانات الطلاب ولا حظر)
      if (action !== 'grant_access' && action !== 'revoke_access') {
          return res.status(403).json({ error: 'عذراً، غير مصرح لك بتعديل بيانات الطلاب الأساسية أو حظرهم.' });
      }

      const rawTargets = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      const targetIds = [...new Set(rawTargets.filter(id => id !== null && id !== undefined && id !== ''))];
      if (targetIds.length === 0) {
          return res.status(400).json({ error: 'لم يتم تحديد أي طالب.' });
      }
      if (targetIds.length > MAX_BULK_TARGETS) {
          return res.status(400).json({ error: `الحد الأقصى ${MAX_BULK_TARGETS} طالب في العملية الواحدة.` });
      }

      // ⚡ لا نجلب قائمة "طلابي" هنا إطلاقاً (كانت getMyStudentIds تُنفَّذ مع كل POST):
      //   • grant_access: كان الفحص يُتجاوز أصلاً (سماح للمدرس بمنح أي طالب) فكانت النتيجة تُهدر.
      //   • revoke_access: الحذف نفسه مقيّد بـ course_id/subject_id يملكها المدرس (يُتحقق منها
      //     أدناه)، فلا يمكنه المساس بصلاحيات أي مدرس آخر حتى لو أرسل معرفات طلاب عشوائية.

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
              // يدعم عنصراً واحداً (courseId/subjectId — السلوك القديم) أو مصفوفات
              // (courseIds/subjectIds) ليُنفَّذ السحب الجماعي بطلب واحد بدل طلب لكل كورس.
              const { courseId, subjectId, courseIds, subjectIds } = req.body;
              const wantedCourses = toIntList([...(Array.isArray(courseIds) ? courseIds : []), ...(courseId ? [courseId] : [])]);
              const wantedSubjects = toIntList([...(Array.isArray(subjectIds) ? subjectIds : []), ...(subjectId ? [subjectId] : [])]);

              // 🔒 حماية قبل الحذف: كل كورس/مادة مطلوبة يجب أن تكون ضمن محتوى هذا المدرس
              const myCourseSet = new Set(myCourseIds.map(Number));
              const mySubjectSet = new Set(mySubjectIds.map(Number));
              const nothingRequested = wantedCourses.length === 0 && wantedSubjects.length === 0;
              if (nothingRequested
                  || wantedCourses.some(id => !myCourseSet.has(id))
                  || wantedSubjects.some(id => !mySubjectSet.has(id))) {
                  return res.status(403).json({ error: 'لا تملك صلاحية على هذا المحتوى.' });
              }

              const [courseDel, subjectDel] = await Promise.all([
                  wantedCourses.length
                      ? supabase.from('user_course_access').delete().in('user_id', targetIds).in('course_id', wantedCourses)
                      : Promise.resolve({ error: null }),
                  wantedSubjects.length
                      ? supabase.from('user_subject_access').delete().in('user_id', targetIds).in('subject_id', wantedSubjects)
                      : Promise.resolve({ error: null })
              ]);
              if (courseDel.error || subjectDel.error) throw (courseDel.error || subjectDel.error);

              return res.status(200).json({ success: true, message: 'تم سحب الصلاحية.' });
          }

      } catch (err) {
          console.error("Student Action Error:", err);
          return res.status(500).json({ error: err.message });
      }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
