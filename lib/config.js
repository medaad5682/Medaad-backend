// lib/config.js

// 1. ضع الدومين الجديد هنا (بدون https://)
export const APP_DOMAIN = 'medaad.aw478260.dpdns.org'; 

// 2. البروتوكول (غيره إلى http إذا كنت على localhost)
export const PROTOCOL = 'https';

// 3. الرابط الكامل (يُستخدم في الروابط)
export const BASE_URL = `${PROTOCOL}://${APP_DOMAIN}`;
