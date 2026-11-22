/**
 * Bridge for SessionExpiredModal → Auth/Tenant providers.
 *
 * GlobalErrorContainer mounts outside AuthProvider, so the modal cannot call
 * signIn/refreshTenant via hooks. After a successful password re-entry it emits
 * this event; providers adopt the session and re-bootstrap gym branding/features.
 */

const EVENT = "forma:session-resume";
const bus = new EventTarget();

/**
 * @param {{ surface?: 'tenant' | 'platform', user?: object, tokens?: object }} detail
 */
export function emitSessionResume(detail = {}) {
  bus.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

/**
 * @param {(detail: { surface?: string, user?: object, tokens?: object }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeSessionResume(handler) {
  const listener = (event) => {
    handler(event.detail || {});
  };
  bus.addEventListener(EVENT, listener);
  return () => bus.removeEventListener(EVENT, listener);
}
