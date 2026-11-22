import { supabase } from '../../../lib/supabaseClient';
import { checkUserAccess } from '../../../lib/authHelper';
import { invalidateUserCaches } from '../../../lib/accessCache'; // 🗄️ إبطال الكاش (cacheConfig.js)

export default async (req, res) => {
  // 1. التحقق من نوع الطلب (DELETE)
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 2. التحقق من الصلاحية (هل المستخدم مسجل دخول؟)
  const isAuthorized = await checkUserAccess(req);
  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized Access' });
  }

  // 3. استخراج معرف المستخدم من الهيدر (الذي وضعه authHelper)
  const userId = req.headers['x-user-id'];

  try {
    // 4. تنفيذ عملية الحذف
    // ملاحظة: تأكد من أن قواعد البيانات لديك مفعلة فيها خيار ON DELETE CASCADE
    // للجداول المرتبطة (مثل user_course_access) وإلا قد تحتاج لحذفها يدوياً أولاً.
    
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error("Supabase Delete Error:", error);
      return res.status(500).json({ error: 'Failed to delete account' });
    }

    invalidateUserCaches(userId); // 🗄️ الحساب اتحذف: نشيله من الكاش فوراً

    return res.status(200).json({ success: true, message: 'Account deleted successfully' });

  } catch (err) {
    console.error("Delete Account API Error:", err);
    return res.status(500).json({ error: 'Server Error' });
  }
};
