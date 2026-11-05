/**
 * Lightweight classnames utility
 */
export function cn(...inputs) {
  return inputs
    .flatMap((x) => (typeof x === "string" ? x.split(" ") : Array.isArray(x) ? x : []))
    .filter(Boolean)
    .join(" ");
}
