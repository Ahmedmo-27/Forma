import { Modal } from "./ui";
import CheckInScanner from "./CheckInScanner";
import { useI18n } from "../i18n/useI18n";

export default function QrCheckInCamera({ open, onClose, onScan, lastScannedResult }) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={t('Scanner — Camera Check In')}>
      <p style={{ fontSize: 13, color: "var(--t3)", marginTop: 0, marginBottom: 14 }}>
        {t('Point the camera at the member or non-member QR code or barcode to check them in (System ID or Member ID).')}
      </p>
      <CheckInScanner
        autoStart={true}
        onScan={onScan}
        lastScannedResult={lastScannedResult}
        embedded={false}
        onClose={onClose}
      />
    </Modal>
  );
}
