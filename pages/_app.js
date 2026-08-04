// pages/_app.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const isSuperAdminRoute = router.pathname.startsWith('/admin/super');

  useEffect(() => {
    // لا نفعّل حماية النسخ/الفحص داخل لوحة السوبر أدمن فقط
    // حتى يعمل النسخ العادي (Ctrl+C, right-click) بشكل طبيعي للسوبر أدمن
    if (isSuperAdminRoute) return;

    const handleContextMenu = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'U')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSuperAdminRoute]);

  return <Component {...pageProps} />;
}

export default MyApp;
