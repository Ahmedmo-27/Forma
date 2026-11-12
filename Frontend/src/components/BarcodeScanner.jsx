import { useEffect, useRef } from 'react';
import { ScanBarcode } from 'lucide-react';

/**
 * USB Barcode Scanner support.
 * A hardware scanner acts like a keyboard — it types the barcode value
 * into whichever input is focused, then sends Enter.
 * This component just keeps the provided input ref focused so the scanner
 * always has somewhere to type.
 */
export default function BarcodeScanner({ inputRef }) {
  const intervalRef = useRef(null);

  useEffect(() => {
    // Re-focus the input every 2s in case the user clicked elsewhere
    intervalRef.current = setInterval(() => {
      if (document.activeElement !== inputRef?.current) {
        inputRef?.current?.focus();
      }
    }, 2000);

    return () => clearInterval(intervalRef.current);
  }, [inputRef]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      <ScanBarcode size={22} color="var(--navy)" aria-hidden />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
          Barcode Scanner Ready
        </div>
        <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 1 }}>
          Point the scanner at a member barcode to check in instantly.
        </div>
      </div>
      <div style={{
        marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
        background: 'var(--green)', flexShrink: 0,
        boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
      }} />
    </div>
  );
}
