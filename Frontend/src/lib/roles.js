/** Roles each actor can assign. The Owner role stays assigned only at account creation. */
export const ASSIGNABLE_ROLES = {
  Owner: ['General Manager', 'Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant'],
  'General Manager': ['Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant'],
  'Sales Manager': ['Sales', 'Receptionist'],
  'Head Coach': ['Coach'],
};

export function assignableRolesFor(actor) {
  const actorRole = typeof actor === 'string' ? actor : actor?.role;
  if (!actorRole) return [];
  if (actorRole === 'Owner') {
    return ['General Manager', 'Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant'];
  }
  const hasStaff = typeof actor === 'object' && Boolean(
    actor?.accessOverrides?.add?.includes('staff') ||
    actor?.access?.includes('access_control')
  );
  if (actorRole === 'General Manager' || hasStaff) {
    return ['Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant'];
  }
  return ASSIGNABLE_ROLES[actorRole] ? [...ASSIGNABLE_ROLES[actorRole]] : [];
}

export function canChangeUserRole(actor, targetRole) {
  const actorRole = typeof actor === 'string' ? actor : actor?.role;
  if (!assignableRolesFor(actor).length) return false;
  if (targetRole === 'Owner') return false;
  const hasStaff = typeof actor === 'object' && Boolean(
    actor?.accessOverrides?.add?.includes('staff') ||
    actor?.access?.includes('access_control')
  );
  if ((actorRole === 'General Manager' || hasStaff) && (targetRole === 'Owner' || (targetRole === 'General Manager' && actorRole !== 'Owner'))) return false;
  if (actorRole === 'Sales Manager' && !hasStaff && !['Sales', 'Receptionist'].includes(targetRole)) return false;
  if (actorRole === 'Head Coach' && !hasStaff && targetRole !== 'Coach') return false;
  return Boolean(targetRole);
}

/** Keep the person's current role visible only when the actor has authority over that role. */
export function roleChoicesFor(actor, currentRole) {
  const options = assignableRolesFor(actor);
  if (currentRole && !options.includes(currentRole) && canChangeUserRole(actor, currentRole)) {
    return [currentRole, ...options];
  }
  return options;
}
