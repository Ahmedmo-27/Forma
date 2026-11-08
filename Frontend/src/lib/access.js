/** True when this person can open a feature. Missing access lists keep the old behavior. */
export function hasAccess(user, key) {
  if (!key) return true;
  const needed = Array.isArray(key) ? key : [key];
  if (!needed.length) return true;
  if (!Array.isArray(user?.access)) return true;
  return needed.some((item) => user.access.includes(item));
}
