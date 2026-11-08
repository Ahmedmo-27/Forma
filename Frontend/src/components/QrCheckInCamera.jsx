import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Modal } from "./ui";

const REGION_ID = "checkin-qr-reader";

export default function QrCheckInCamera({ open, onClose, onScan }) {
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    let active = true;
    let scanner;
    const timer = setTimeout(async () => {
      const region = document.getElementById(REGION_ID);
      if (!active || !region) return;
      region.replaceChildren();
      scanner = new Html5Qrcode(REGION_ID, false);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            const code = String(decoded || "").trim();
            if (!active || !code) return;
            active = false;
            scanner.stop()
              .catch(() => {})
              .finally(() => onScanRef.current(code));
          },
          () => {},
        );
        if (!active && scanner.isScanning) {
          await scanner.stop().catch(() => {});
        }
      } catch {
        if (active) {
          setError("Camera access was blocked. Allow the camera, or scan with a USB scanner into the search box.");
        }
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Scan check-in QR">
      <p style={{ fontSize: 13, color: "var(--t3)", marginTop: 0 }}>
        Point the camera at the member’s QR. A successful scan checks them in.
      </p>
      {error && (
        <p style={{ fontSize: 13, color: "var(--red)", marginTop: 0 }}>{error}</p>
      )}
      <div id={REGION_ID} style={{ width: "100%", minHeight: error ? 0 : 280 }} />
    </Modal>
  );
}
