import { useEffect } from 'react';

const APP = 'Forma';

export default function usePageTitle() {
  useEffect(() => {
    document.title = APP;
  }, []);
}