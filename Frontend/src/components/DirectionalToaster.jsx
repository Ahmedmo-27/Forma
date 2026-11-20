import { useSyncExternalStore } from 'react';
import { Toaster } from 'react-hot-toast';

function subscribe(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
  return () => observer.disconnect();
}

const getDir = () => document.documentElement.getAttribute('dir') || 'ltr';
const getServerDir = () => 'ltr';

/**
 * react-hot-toast only knows physical positions. Toasts belong on the
 * inline-end side of the screen, so mirror them when the page is RTL.
 * The language providers set `<html dir>`, which is the single source of truth.
 */
export default function DirectionalToaster({ toastOptions }) {
  const dir = useSyncExternalStore(subscribe, getDir, getServerDir);
  return (
    <Toaster
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      toastOptions={toastOptions}
      containerStyle={{ direction: dir }}
    />
  );
}
