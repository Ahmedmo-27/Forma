import { useEffect, useRef } from 'react';

/**
 * Global hardware scanner hook.
 * Listens for hardware barcode & QR scanners (USB/Bluetooth HID keyboard emulation).
 * Captures fast keystroke bursts and invokes onScan regardless of which element is focused.
 */
export default function useHardwareScanner({ onScan, enabled = true }) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const stateRef = useRef({
    buffer: [],
    timestamps: [],
    lastTime: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const now = performance.now();
      const state = stateRef.current;
      const gap = now - state.lastTime;
      state.lastTime = now;

      // If gap since last key is large (> 120ms), a human paused; start fresh buffer
      if (gap > 120) {
        state.buffer = [];
        state.timestamps = [];
      }

      // Enter key indicates end of hardware scanner payload
      if (e.key === 'Enter') {
        const chars = state.buffer.join('').trim();
        const count = state.buffer.length;

        if (count >= 2) {
          const totalTime = state.timestamps[count - 1] - state.timestamps[0];
          const averageGap = count > 1 ? totalTime / (count - 1) : 0;
          const isKnownFormat = /^(?:FF\d+|[SM]\d+|\d{3,})$/i.test(chars);

          // Fast burst (< 65ms avg gap) or known member code format typed under 100ms avg gap
          if (averageGap < 65 || (isKnownFormat && averageGap < 100)) {
            e.preventDefault();
            e.stopPropagation();

            // If an input received the scanner's keys, clear it
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
              active.value = '';
              active.dispatchEvent(new Event('input', { bubbles: true }));
            }

            state.buffer = [];
            state.timestamps = [];

            if (onScanRef.current) {
              onScanRef.current(chars);
            }
            return;
          }
        }

        state.buffer = [];
        state.timestamps = [];
        return;
      }

      // Collect single printable characters
      if (e.key.length === 1) {
        state.buffer.push(e.key);
        state.timestamps.push(now);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);
}
