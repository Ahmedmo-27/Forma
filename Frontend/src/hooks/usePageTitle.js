import { useEffect } from 'react';

const APP = 'Leap Gym';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP}` : APP;
    return () => { document.title = APP; };
  }, [title]);
}
