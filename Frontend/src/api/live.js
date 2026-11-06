import { apiBaseURL } from './axios';

/**
 * Keep a gym screen in sync with check-ins and package changes.
 * Calls onEvent for each server push, and onStatus('live' | 'reconnecting').
 * Returns a stop function.
 */
export function subscribeLiveEvents(onEvent, onStatus) {
  let stopped = false;
  let retryMs = 1000;
  const controller = new AbortController();

  const wait = (ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

  async function connect() {
    while (!stopped) {
      try {
        const token = localStorage.getItem('ff_token');
        const tenantSlug = localStorage.getItem('ff_tenant_slug');
        const res = await fetch(`${apiBaseURL}/members/live`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
          },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Live stream ${res.status}`);

        retryMs = 1000;
        onStatus?.('live');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            try {
              onEvent(JSON.parse(dataLine.slice(5).trim()));
            } catch { /* ignore a malformed frame */ }
          }
        }
      } catch (err) {
        if (stopped || err?.name === 'AbortError') return;
      }
      if (stopped) return;
      onStatus?.('reconnecting');
      await wait(retryMs);
      retryMs = Math.min(retryMs * 2, 10000);
    }
  }

  connect();
  return () => {
    stopped = true;
    controller.abort();
  };
}
