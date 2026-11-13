/** Platform console permission check. super_admin is allowed even with an empty list. */
export function canPlatform(user, permission) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (!permission) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
}
