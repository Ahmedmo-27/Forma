/**
 * Global Error Event Bus & Deduplication Queue
 * Coordinates error modal displays, banners, and toasts across tenant & platform apps.
 */

const listeners = new Set();
const recentErrors = new Map(); // key -> timestamp
const DEDUPE_WINDOW_MS = 4000;

export function emitErrorEvent(errorView, options = {}) {
  if (!errorView || errorView.isCancelled) return;

  // Deduplication key: code + (field || "")
  const dedupeKey = `${errorView.code}_${errorView.status}_${errorView.message}`;
  const now = Date.now();
  const lastEmitted = recentErrors.get(dedupeKey);

  if (lastEmitted && now - lastEmitted < DEDUPE_WINDOW_MS && !options.force) {
    return; // Drop duplicate
  }
  recentErrors.set(dedupeKey, now);

  // Clean old entries
  for (const [key, timestamp] of recentErrors.entries()) {
    if (now - timestamp > 30000) {
      recentErrors.delete(key);
    }
  }

  listeners.forEach((listener) => {
    try {
      listener({ error: errorView, options });
    } catch (e) {
      console.error("[errorBus] Listener error:", e);
    }
  });
}

export function subscribeErrorEvents(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
