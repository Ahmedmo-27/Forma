export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent || "");
}

export function modifierKeyLabel() {
  return isApplePlatform() ? "Cmd" : "Ctrl";
}
