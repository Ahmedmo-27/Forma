/** Roles each actor can assign. The Owner role stays assigned only at account creation. */
export const ASSIGNABLE_ROLES = {
  Owner: ['General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'General Manager': ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'Sales Manager': ['Sales', 'Coach Manager', 'Coach', 'Receptionist'],
};

export function assignableRolesFor(actorRole) {
  return ASSIGNABLE_ROLES[actorRole] ? [...ASSIGNABLE_ROLES[actorRole]] : [];
}

export function canChangeUserRole(actorRole, targetRole) {
  if (!assignableRolesFor(actorRole).length) return false;
  if (actorRole === 'General Manager' && (targetRole === 'Owner' || targetRole === 'General Manager')) return false;
  return Boolean(targetRole);
}

/** Keep the person's current role visible even when it cannot be assigned again. */
export function roleChoicesFor(actorRole, currentRole) {
  const options = assignableRolesFor(actorRole);
  if (currentRole && !options.includes(currentRole)) return [currentRole, ...options];
  return options;
}
