import { useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Btn } from "./ui";
import { toWhatsAppUrl } from "../utils/whatsapp";
import { sendWhatsAppImage } from "../api/endpoints";
import { memberQrPayload } from "../lib/systemId";

function qrMessage(member, code) {
  const name = member?.name || "Member";
  return `Hello ${name}, your Leap gym check-in code is ${code}. Show this QR at reception to check in.`;
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

async function buildCheckInCard(member, code) {
  const qrUrl = await QRCode.toDataURL(code, {
    width: 640,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1E1535", light: "#ffffff" },
  });
  const qr = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("QR image failed"));
    image.src = qrUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 920;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#44298C";
  ctx.fillRect(0, 0, canvas.width, 108);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px system-ui, Segoe UI, sans-serif";
  ctx.fillText("Leap check-in", 40, 66);

  ctx.fillStyle = "#111827";
  ctx.font = "700 32px system-ui, Segoe UI, sans-serif";
  wrapLines(ctx, member?.name || "Member", 640).forEach((line, index) => {
    ctx.fillText(line, 40, 176 + index * 40);
  });

  const qrSize = 520;
  ctx.drawImage(qr, (canvas.width - qrSize) / 2, 270, qrSize, qrSize);

  ctx.fillStyle = "#4B5563";
  ctx.font = "600 22px system-ui, Segoe UI, sans-serif";
  ctx.fillText("Show this QR at reception", 40, 840);
  ctx.font = "500 20px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#6B7280";
  ctx.fillText(code, 40, 878);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("QR image failed");
  return blob;
}

function WhatsAppMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.8 11.8 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.59 5.93L0 24l6.4-1.67a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.45zM12.05 21.3h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.8.99 1.01-3.7-.23-.38a9.78 9.78 0 0 1-1.5-5.2c0-5.4 4.4-9.8 9.82-9.8 2.62 0 5.08 1.02 6.93 2.88a9.74 9.74 0 0 1 2.87 6.93c0 5.41-4.4 9.86-9.73 9.86zm5.38-7.35c-.29-.15-1.74-.86-2.01-.96-.27-.1-.47-.15-.66.15-.2.29-.76.95-.93 1.15-.17.2-.34.22-.63.07-.29-.14-1.23-.45-2.34-1.44-.86-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.48.1-.2.05-.36-.02-.51-.08-.15-.66-1.6-.91-2.19-.24-.58-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.44s1.05 2.83 1.19 3.03c.15.2 2.06 3.15 5 4.42.7.3 1.24.48 1.67.62.7.22 1.34.19 1.84.12.56-.08 1.74-.71 1.98-1.4.25-.68.25-1.27.17-1.4-.07-.12-.27-.2-.56-.34z" />
    </svg>
  );
}

export default function MemberQrButton({ member }) {
  const [busy, setBusy] = useState(false);
  const isMember = Boolean(member?.memberId != null || member?.isMember);
  const code = memberQrPayload(member);

  const send = async () => {
    if (!code) {
      toast.error(isMember ? "This member has no member id yet" : "This person has no system id yet");
      return;
    }
    if (!toWhatsAppUrl(member?.phones)) {
      toast.error("This member has no phone number for WhatsApp");
      return;
    }
    setBusy(true);
    try {
      const blob = await buildCheckInCard(member, code);
      const body = new FormData();
      body.append("image", blob, "check-in.png");
      body.append("phone", member.phones);
      body.append("caption", qrMessage(member, code));
      const targetId = (isMember && member.memberId) || member.systemId || member._id;
      if (targetId) body.append("memberId", String(targetId));
      if (member.name) body.append("memberName", member.name);
      await sendWhatsAppImage(body);
      toast.success("QR code sent on WhatsApp");
    } catch (err) {
      if (!err?.normalized) toast.error("Could not send the QR code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Btn size="sm" variant="success" onClick={send} disabled={busy || !member}>
      <WhatsAppMark />
      {busy ? "Sending QR…" : (isMember ? "Send QR code to member on WhatsApp" : "Send QR code on WhatsApp")}
    </Btn>
  );
}
