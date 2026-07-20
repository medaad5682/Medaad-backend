import { supabase } from '../../../lib/supabaseClient';
import axios from 'axios';
import { checkUserAccess } from '../../../lib/authHelper';
import crypto from 'crypto'; // ✅ استيراد مكتبة التشفير

// ✅ 1. استيراد مكتبات Firebase
import { db } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

// تم تغيير اسم المتغير الاحتياطي لتجنب التعارض
const PYTHON_PROXY_BASE_URL = process.env.PYTHON_PROXY_BASE_URL;
const PYTHON_HLS_BACKUP_URL = process.env.PYTHON_HLS_BACKUP_URL;

// ===================================================================
// ✅ [جديد] دوال تحليل Master Playlist (m3u8) الخاص بـ Bunny Stream
// واستخراج روابط الجودات المختلفة منه (240p/360p/480p/720p...)
// نفعل هذا في السيرفر بدلاً من التطبيق حتى يصل التطبيق على نفس شكل
// الرد (availableQualities) سواء كان المصدر Bunny أو البروكسي الاحتياطي.
// ===================================================================

// يحوّل ارتفاع الفيديو (height) إلى أقرب تصنيف جودة متعارف عليه في التطبيق
function labelForHeight(height) {
    const buckets = [144, 240, 360, 480, 720, 1080, 1440, 2160];
    let closest = buckets[0];
    let bestDiff = Math.abs(height - closest);
    for (const b of buckets) {
        const diff = Math.abs(height - b);
        if (diff < bestDiff) {
            bestDiff = diff;
            closest = b;
        }
    }
    return closest; // رقم فقط، الـ "p" تُضاف لاحقاً لتطابق شكل availableQualities الحالي
}

// يحوّل رابط (قد يكون نسبيًا) إلى رابط مطلق بناءً على رابط الـ master playlist،
// مع الحفاظ على query string الخاص بالـ master (توكن bcdn_token الخاص بالحماية)
// لأن روابط الـ variant عادة لا تحمل توكنها الخاص وتحتاج توكن الماستر نفسه.
function resolveVariantUrl(masterUrl, variantUri) {
    if (variantUri.startsWith('http://') || variantUri.startsWith('https://')) {
        return variantUri;
    }

    const masterUrlObj = new URL(masterUrl);

    let resolvedPath;
    if (variantUri.startsWith('/')) {
        resolvedPath = variantUri;
    } else {
        const basePath = masterUrlObj.pathname.substring(
            0,
            masterUrlObj.pathname.lastIndexOf('/') + 1
        );
        resolvedPath = basePath + variantUri;
    }

    const resolved = new URL(resolvedPath, `${masterUrlObj.protocol}//${masterUrlObj.host}`);
    // ✅ نحافظ على نفس query string (التوكن) الموجود في رابط الماستر
    resolved.search = masterUrlObj.search;
    return resolved.toString();
}

// يجلب نص الـ master playlist ويستخرج منه كل الجودات المتاحة
async function extractBunnyQualities(masterUrl, log, errLog, videoInfo = '') {
    try {
        const response = await axios.get(masterUrl, {
            responseType: 'text',
            timeout: 10000,
        });
        const body = typeof response.data === 'string' ? response.data : String(response.data);

        if (!body.includes('#EXT-X-STREAM-INF')) {
            log('⚠️ Bunny playlist has no #EXT-X-STREAM-INF lines (not a master playlist).');
            return [];
        }

        const lines = body.split('\n').map((l) => l.trim());
        const qualitiesMap = new Map(); // quality(number) -> url
        const byBandwidth = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

            // أول سطر تالٍ غير فارغ وغير تعليق هو رابط الـ variant
            let variantUri = null;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j] === '' || lines[j].startsWith('#')) continue;
                variantUri = lines[j];
                break;
            }
            if (!variantUri) continue;

            const fullUrl = resolveVariantUrl(masterUrl, variantUri);

            const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resMatch) {
                const height = parseInt(resMatch[2], 10);
                const quality = labelForHeight(height);
                // لو فيه أكثر من variant لنفس الجودة التقريبية، نحتفظ بآخر واحد
                qualitiesMap.set(quality, fullUrl);
            } else {
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);
                const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                byBandwidth.push({ bandwidth, url: fullUrl });
            }
        }

        // لو ما وجدنا RESOLUTION أبدًا في أي سطر، نرتب حسب bandwidth ونعطي تسميات تقريبية
        // نوزّع التسميات بالتناسب على كامل المدى المتاح حسب عدد الـ variants
        // الموجودة فعليًا (مثلاً: variant واحد فقط -> "Auto"، اثنان -> أدنى وأعلى تسمية، إلخ)
        // بدلاً من ترقيمها بالتسلسل بغض النظر عن المسافة الحقيقية بين البيتريت.
        if (qualitiesMap.size === 0 && byBandwidth.length > 0) {
            byBandwidth.sort((a, b) => a.bandwidth - b.bandwidth);
            const fallbackScale = [240, 360, 480, 720, 1080, 1440];
            const n = byBandwidth.length;

            if (n === 1) {
                qualitiesMap.set(fallbackScale[0], byBandwidth[0].url);
            } else {
                byBandwidth.forEach((item, idx) => {
                    // نوزّع idx (0..n-1) بالتناسب على مدى fallbackScale (0..scale.length-1)
                    const scaledIdx = Math.round(
                        (idx / (n - 1)) * (fallbackScale.length - 1)
                    );
                    const quality = fallbackScale[scaledIdx];
                    qualitiesMap.set(quality, item.url);
                });
            }
        }

        const availableQualities = Array.from(qualitiesMap.entries())
            .map(([quality, url]) => ({ quality, url }))
            .sort((a, b) => a.quality - b.quality);

        log(`✅ Bunny master playlist parsed: ${availableQualities.length} qualities found.`);
        return availableQualities;
    } catch (parseErr) {
        errLog(`⚠️ Bunny m3u8 parsing failed: ${parseErr.message}${videoInfo ? ` | ${videoInfo}` : ''}`);
        return [];
    }
}

export default async (req, res) => {
    const reqId = Math.random().toString(36).substring(7).toUpperCase();
    const log = (msg) => console.log(`🔍 [DEBUG-${reqId}] ${msg}`);
    const errLog = (msg) => console.error(`❌ [ERROR-${reqId}] ${msg}`);

    log("🚀 Start Request: get-video-id");

    const { lessonId } = req.query;

    if (!lessonId) {
        return res.status(400).json({ message: "Missing Lesson ID" });
    }

    // 1. التحقق الأمني
    const hasAccess = await checkUserAccess(req, lessonId, 'video');
    if (!hasAccess) {
        return res.status(403).json({ message: "Access Denied" });
    }

    try {
        // 2. جلب بيانات الفيديو من قاعدة البيانات
        // ✅ تمت إضافة جلب bunny_video_id
        const { data: videoData, error: vidErr } = await supabase
            .from('videos')
            .select(`
                youtube_video_id,
                bunny_video_id, 
                title, 
                chapters ( 
                    title, 
                    subjects ( 
                        title,
                        courses (
                            title,
                            teacher_id,
                            teachers ( name )
                        )
                    ) 
                )
            `)
            .eq('id', lessonId)
            .single();

        if (vidErr || !videoData) {
            return res.status(404).json({ message: "Video not found" });
        }

        // استخراج المتغيرات بأمان لتجنب أخطاء undefined
        const chapter = videoData.chapters;
        const subject = chapter?.subjects;
        const course = subject?.courses;

        const chapterName = chapter?.title || 'بدون فصل';
        const subjectName = subject?.title || 'بدون مادة';
        const courseName = course?.title || 'بدون كورس';
        const teacherId = course?.teacher_id || 'UNKNOWN_TEACHER';
        const teacherName = course?.teachers?.name || 'بدون مدرس';

        // ✅ [جديد] ملخص بيانات الفيديو يُستخدم في اللوجات (خصوصاً عند غياب bunny_video_id أو فشل البروكسي)
        const videoInfoLog = `[VideoID: ${lessonId} | Title: "${videoData.title || 'بدون عنوان'}" | YouTubeID: ${videoData.youtube_video_id || 'N/A'} | Chapter: "${chapterName}" | Subject: "${subjectName}" | Course: "${courseName}"]`;

        // ================================================================
        // ✅ [جديد] تسجيل المشاهدة في Firebase بصمت (Fire and Forget)
        // ================================================================
        try {
            const studentId = req.headers['x-user-id']; // مستخرج من authHelper

            if (studentId) {
                const docId = `${lessonId}_${studentId}`;

                // جلب اسم الطالب (الاعتماد على first_name ثم username)
                const { data: studentData } = await supabase
                    .from('users')
                    .select('first_name, username')
                    .eq('id', studentId)
                    .maybeSingle();

                const studentFullName = studentData
                    ? (studentData.first_name || studentData.username || 'مستخدم')
                    : 'مستخدم';

                // تسجيل البيانات في فايربيز دون انتظار (لا يوجد await)
                db.collection('video_views').doc(docId).set({
                    videoId: lessonId,
                    studentId: studentId,
                    teacherId: teacherId.toString(), // ✅ المعرف الحقيقي للمدرس
                    teacherName: teacherName,       // ✅ اسم المدرس
                    studentName: studentFullName,   // ✅ اسم الطالب الصحيح
                    videoTitle: videoData.title || 'بدون عنوان',
                    courseName: courseName,         // ✅ اسم الكورس
                    subjectName: subjectName,       // ✅ اسم المادة
                    chapterName: chapterName,       // ✅ اسم الفصل
                    lastViewedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(err => {
                    errLog(`Firebase View Log Error: ${err.message}`);
                });

                log("📝 Firebase View logging triggered.");
            }
        } catch (firebaseSetupErr) {
            errLog(`Firebase Setup Error (Ignored): ${firebaseSetupErr.message}`);
        }
        // ================================================================

        // ================================================================
        // 3. الاتصال بالسيرفرات (Bunny الأول -> Proxy احتياطي أول -> HLS احتياطي ثاني)
        // ================================================================
        let proxyResult = { url: null, availableQualities: [] };
        let isOfflineMode = true;

        try {
            const settingResult = await supabase.from('app_settings').select('value').eq('key', 'offline_mode').single();
            if (settingResult.data) {
                isOfflineMode = settingResult.data.value === 'true';
            }

            // 🟢 المحاولة الأولى: السيرفر الأساسي (Bunny Stream)
            if (videoData.bunny_video_id) {
                log("➡️ Trying Primary Server (Bunny Stream)...");
                try {
                    const bVideoId = videoData.bunny_video_id;

                    // ✅ جلب البيانات الحساسة من متغيرات البيئة فقط
                    const streamDomain = process.env.BUNNY_STREAM_DOMAIN;
                    const pullZoneKey = process.env.BUNNY_PULL_ZONE_KEY;

                    // التحقق من وجود المتغيرات لتجنب الأخطاء
                    if (!streamDomain || !pullZoneKey) {
                        throw new Error("Missing BunnyCDN environment variables (BUNNY_STREAM_DOMAIN or BUNNY_PULL_ZONE_KEY)");
                    }

                    // الخوارزمية المطابقة لبايثون
                    const expirationHours = 24;
                    const expires = Math.floor(Date.now() / 1000) + (expirationHours * 3600);
                    const tokenPath = `/${bVideoId}/`;

                    const hashableString = `${pullZoneKey}${tokenPath}${expires}token_path=${tokenPath}`;

                    const hash = crypto.createHash('sha256').update(hashableString, 'utf-8').digest();
                    let token = hash.toString('base64');
                    token = token.replace(/\n/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

                    const encodedPath = encodeURIComponent(tokenPath);
                    const fileName = "playlist.m3u8";

                    const bunnyMasterUrl = `https://${streamDomain}/bcdn_token=${token}&expires=${expires}&token_path=${encodedPath}${tokenPath}${fileName}`;
                    log("✅ Bunny Stream Master URL Generated Successfully!");

                    // ✅ [جديد] نحلل master playlist هنا في السيرفر ونستخرج
                    // الجودات المختلفة، بدل تمرير رابط الماستر فقط للتطبيق.
                    const bunnyQualities = await extractBunnyQualities(bunnyMasterUrl, log, errLog, videoInfoLog);

                    if (bunnyQualities.length > 0) {
                        proxyResult.availableQualities = bunnyQualities;
                        // نحتفظ أيضًا برابط الماستر كـ fallback في حال احتاجه التطبيق
                        proxyResult.url = bunnyMasterUrl;
                    } else {
                        // فشل التحليل (مثلاً الملف لم يكن master playlist) -> رابط واحد فقط
                        proxyResult.url = bunnyMasterUrl;
                    }
                } catch (bunnyErr) {
                    errLog(`⚠️ Bunny Stream Generation Failed: ${bunnyErr.message}`);
                }
            }

            // 🟡 إذا لم يكن هناك Bunny ID أو فشل التوليد (لا url ولا availableQualities)،
            // ننتقل للسيرفرات الاحتياطية
            const bunnySucceeded = proxyResult.url || proxyResult.availableQualities.length > 0;

            if (!videoData.bunny_video_id) {
                // ⚠️ [جديد] لا يوجد bunny_video_id لهذا الفيديو بعد - نطبع تفاصيله كاملة للمتابعة
                errLog(`⚠️ No bunny_video_id yet, falling back to YouTube proxy. ${videoInfoLog}`);
            }

            if (!bunnySucceeded && PYTHON_PROXY_BASE_URL) {
                const proxyHeaders = process.env.PYTHON_PROXY_KEY ? { 'X-API-Key': process.env.PYTHON_PROXY_KEY } : {};
                const queryParams = { youtubeId: videoData.youtube_video_id };

                try {
                    // --- المحاولة الثانية: السيرفر الاحتياطي الأول ---
                    log("➡️ Trying First Backup (Primary Proxy)...");
                    const primaryResponse = await axios.get(`${PYTHON_PROXY_BASE_URL}/api/get-hls-playlist`, {
                        params: queryParams,
                        headers: proxyHeaders
                    });

                    proxyResult = primaryResponse.data;
                    log("✅ First Backup Proxy Succeeded!");

                } catch (primaryErr) {
                    errLog(`⚠️ First Backup Proxy Failed: ${primaryErr.message}. Switching IMMEDIATELY to Second Backup... ${videoInfoLog}`);

                    // --- المحاولة الثالثة: السيرفر الاحتياطي الثاني ---
                    if (PYTHON_HLS_BACKUP_URL) {
                        try {
                            const backupResponse = await axios.get(`${PYTHON_HLS_BACKUP_URL}/api/get-hls-playlist`, {
                                params: queryParams,
                                headers: proxyHeaders
                            });

                            proxyResult = backupResponse.data;
                            log("✅ Second Backup Proxy Succeeded!");
                        } catch (backupErr) {
                            // ⚠️ [جديد] فشل حتى السيرفر الاحتياطي الثاني - نطبع تفاصيل الفيديو كاملة
                            errLog(`⚠️ Second Backup Proxy Also Failed: ${backupErr.message}. ${videoInfoLog}`);
                            throw backupErr;
                        }
                    } else {
                        errLog(`⚠️ No Second Backup URL configured. ${videoInfoLog}`);
                        throw primaryErr;
                    }
                }

                if (!proxyResult.url && proxyResult.availableQualities?.length > 0) {
                    proxyResult.url = proxyResult.availableQualities.sort((a, b) => b.quality - a.quality)[0].url;
                }
            }
        } catch (proxyErr) {
            errLog(`Proxy Failed (Ignored for Player 2): ${proxyErr.message}`);
        }

        // 4. إرسال الرد النهائي
        res.status(200).json({
            ...proxyResult,
            url: proxyResult.url || null,
            duration: "0",
            youtube_video_id: videoData.youtube_video_id,
            bunny_video_id: videoData.bunny_video_id,
            db_video_title: videoData.title,
            subject_name: subjectName, // ✅ استخدام المتغير المستخرج بأمان
            chapter_name: chapterName, // ✅ استخدام المتغير المستخرج بأمان
            offline_mode: isOfflineMode
        });

    } catch (err) {
        errLog(`Critical Error: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
};
