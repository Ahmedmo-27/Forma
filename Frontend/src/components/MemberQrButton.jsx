import { useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Btn, Modal } from "./ui";
import { toWhatsAppUrl } from "../utils/whatsapp";
import { memberQrPayload } from "../lib/systemId";

function qrMessage(member, code) {
  const name = member?.name || "Member";
  return `Hello ${name}, your Leap gym check-in code is ${code}. Show this code at reception to check in.\nMember: ${name}\nSystem ID: ${code}`;
}

export default function MemberQrButton({ member }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const code = memberQrPayload(member?.systemId);

  const send = async () => {
    if (!code) {
      toast.error("This member has no system id yet");
      return;
    }
    setBusy(true);
    try {
      const url = await QRCode.toDataURL(code, { width: 360, margin: 1, errorCorrectionLevel: "M" });
      setDataUrl(url);
      setOpen(true);
      const link = toWhatsAppUrl(member.phones, qrMessage(member, code));
      if (!link) {
        toast.error("This member has no phone number for WhatsApp");
        return;
      }
      window.open(link, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not build the QR code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Btn size="sm" variant="outline" onClick={send} disabled={busy || !member}>
        {busy ? "Preparing QR…" : "Send QR code to member on WhatsApp"}
      </Btn>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`QR code ${code}`}
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Btn>
            {dataUrl && (
              <a href={dataUrl} download={`${code}.png`} style={{ textDecoration: "none" }}>
                <Btn size="sm" variant="outline">Download QR image</Btn>
              </a>
            )}
          </>
        )}
      >
        <p style={{ fontSize: 13, color: "var(--t3)", marginTop: 0 }}>
          WhatsApp opens with {member?.name}&apos;s check-in code {code}. Attach the image below if you want the picture in the chat — WhatsApp links can carry the code, not the image file.
        </p>
        {dataUrl && (
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
            <img src={dataUrl} alt={`QR code for ${code}`} width={220} height={220} />
          </div>
        )}
      </Modal>
    </>
  );
}
