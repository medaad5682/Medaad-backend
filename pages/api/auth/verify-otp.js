// pages/api/auth/verify-otp.js
import { verifyOtp } from '../../../lib/otpHelper';

const ALLOWED_PURPOSES = ['signup', 'reset_password', 'change_email'];

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  const appSecret = req.headers['x-app-secret'];
  if (appSecret !== process.env.APP_SECRET) {
    return res.status(403).json({ success: false, message: 'غير مصرح لك باستخدام هذا الرابط' });
  }

  let { email, code, purpose } = req.body;
  purpose = ALLOWED_PURPOSES.includes(purpose) ? purpose : 'signup';

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني والرمز مطلوبان' });
  }
  email = email.trim().toLowerCase();

  try {
    const result = await verifyOtp({ email, code, purpose });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    // The client stores this token and sends it back with the signup /
    // reset-password request to prove the email was actually confirmed.
    return res.status(200).json({
      success: true,
      message: 'تم التحقق من البريد الإلكتروني بنجاح',
      verifyToken: result.verifyToken,
    });
  } catch (error) {
    console.error('verify-otp error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
