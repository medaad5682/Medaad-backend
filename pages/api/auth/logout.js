import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper'; // 1. الحارس الأساسي (الذي يحتوي الآن على فحص App Check)
import { serialize } from 'cookie';
import { CLEAR_PUSH_TOKENS } from '../../../lib/pushRegistration';

export default async (req, res) => {
  // 1. السماح فقط بطلبات POST (ممارسة أمنية أفضل لتسجيل الخروج)
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 2. التحقق من App Check وباقي الصلاحيات (المصدر، التوكن، بصمة الجهاز)
  // الدالة ستتولى التحقق من توكن فايربيز تلقائياً لأننا حدثناها مسبقاً في authHelper
  const isAuthorized = await checkUserAccess(req); 
  
  if (!isAuthorized) {
      // إذا فشل فحص App Check أو التوكن، نرفض الطلب فوراً
      return res.status(401).json({ success: false, message: "Unauthorized access or Invalid App Check" });
  }

  // 3. نستقبل المعرف (الذي تم حقنه بأمان بواسطة checkUserAccess بعد نجاح كل الفحوصات)
  const userId = req.headers['x-user-id'];

  if (userId) {
      try {
          // 4. حذف التوكن من قاعدة البيانات (إبطال الجلسة تماماً)
          await supabase
              .from('users')
              .update({ jwt_token: null }) // تصفير التوكن
              .eq('id', userId);
              
          console.log(`✅ User ${userId} logged out and token revoked.`);

          // 4.1 إيقاف الإشعارات على هذا الجهاز بعد تسجيل الخروج (FCM + HMS).
          // في طلب منفصل عمداً: إبطال الجلسة أعلاه هو الأهم ولا يجب أن يتأثر بهذا.
          const { error: pushClearErr } = await supabase
              .from('users')
              .update(CLEAR_PUSH_TOKENS)
              .eq('id', userId);
          if (pushClearErr) {
              console.error("⚠️ Logout: failed to clear push tokens:", pushClearErr.message);
          }
      } catch (err) {
          console.error("❌ Logout DB Error:", err.message);
      }
  }

  // 5. مسح الكوكيز (إن وجدت، مثل الخاصة بلوحة التحكم Admin)
  const cookie = serialize('admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    expires: new Date(0), // تاريخ قديم للحذف فوراً
    sameSite: 'strict',
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  
  return res.status(200).json({ success: true, message: "Logged out successfully" });
};
