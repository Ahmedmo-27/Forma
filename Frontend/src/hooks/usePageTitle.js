import { useEffect } from 'react';

const APP = import.meta.env.VITE_APP_NAME || 'LEAP';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP}` : APP;
    return () => { document.title = APP; };
  }, [title]);
}
