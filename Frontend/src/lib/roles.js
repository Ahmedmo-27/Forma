/** Roles each actor can assign. The Owner role stays assigned only at account creation. */
export const ASSIGNABLE_ROLES = {
  Owner: ['General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'General Manager': ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'Sales Manager': ['Sales', 'Receptionist'],
  'Coach Manager': ['Coach'],
};

export function assignableRolesFor(actorRole) {
  return ASSIGNABLE_ROLES[actorRole] ? [...ASSIGNABLE_ROLES[actorRole]] : [];
}

export function canChangeUserRole(actorRole, targetRole) {
  if (!assignableRolesFor(actorRole).length) return false;
  if (targetRole === 'Owner') return false;
  if (actorRole === 'General Manager' && (targetRole === 'Owner' || targetRole === 'General Manager')) return false;
  if (actorRole === 'Sales Manager' && !['Sales', 'Receptionist'].includes(targetRole)) return false;
  if (actorRole === 'Coach Manager' && targetRole !== 'Coach') return false;
  return Boolean(targetRole);
}

/** Keep the person's current role visible only when the actor has authority over that role. */
export function roleChoicesFor(actorRole, currentRole) {
  const options = assignableRolesFor(actorRole);
  if (currentRole && !options.includes(currentRole) && canChangeUserRole(actorRole, currentRole)) {
    return [currentRole, ...options];
  }
  return options;
}
