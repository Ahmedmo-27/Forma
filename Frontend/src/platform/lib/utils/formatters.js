/**
 * Tabular-Numeric and Date/Time Formatters for Platform Console
 */

export const BILLING_CURRENCY = "EGP";

export function formatCurrency(amount, _currency = BILLING_CURRENCY) {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return formatEgp(0);
  }
  return formatEgp(Number(amount));
}

function formatEgp(numeric) {
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency: BILLING_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `EGP ${numeric.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
}

export function formatNumber(num) {
  if (num === undefined || num === null || isNaN(Number(num))) return "0";
  return Number(num).toLocaleString("en-US");
}

export function formatDate(dateInput, withTime = false) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  if (withTime) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function formatRelativeTime(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(date);
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0 || isNaN(Number(bytes))) return "0 B";
  const num = Number(bytes);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function truncateMiddle(str, frontChars = 6, backChars = 6) {
  if (!str) return "";
  const s = String(str);
  if (s.length <= frontChars + backChars + 3) return s;
  return `${s.slice(0, frontChars)}…${s.slice(-backChars)}`;
}
