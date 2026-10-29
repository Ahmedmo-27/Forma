import { useEffect } from 'react';

const APP = 'Leap Gym';

export default function usePageTitle() {
  useEffect(() => {
    document.title = APP;
  }, []);
}