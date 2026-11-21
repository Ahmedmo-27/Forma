/** Roles each actor can assign. The Owner role stays assigned only at account creation. */
export const ASSIGNABLE_ROLES = {
  Owner: ['General Manager', 'Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant', 'Retail'],
  'General Manager': ['Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant', 'Retail'],
  'Sales Manager': ['Sales', 'Receptionist'],
  'Head Coach': ['Coach'],
};

/** Display labels for create/change role dropdowns (values stay as role keys). */
export const ROLE_LABELS = {
  Sales: 'Sales Representative',
};

function hasStaffDelegation(actor) {
  if (!actor || typeof actor !== 'object') return false;
  return Boolean(
    actor?.accessOverrides?.add?.includes('staff') ||
    actor?.access?.includes('staff') ||
    actor?.access?.includes('access_control')
  );
}

export function assignableRolesFor(actor) {
  const actorRole = typeof actor === 'string' ? actor : actor?.role;
  if (!actorRole) return [];
  if (actorRole === 'Owner') {
    return ['General Manager', 'Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant', 'Retail'];
  }
  if (actorRole === 'General Manager' || hasStaffDelegation(actor)) {
    return ['Sales Manager', 'Sales', 'Head Coach', 'Coach', 'Receptionist', 'Accountant', 'Retail'];
  }
  return ASSIGNABLE_ROLES[actorRole] ? [...ASSIGNABLE_ROLES[actorRole]] : [];
}

export function canChangeUserRole(actor, targetRole) {
  const actorRole = typeof actor === 'string' ? actor : actor?.role;
  if (!assignableRolesFor(actor).length) return false;
  if (targetRole === 'Owner') return false;
  const hasStaff = hasStaffDelegation(actor);
  if ((actorRole === 'General Manager' || hasStaff) && (targetRole === 'Owner' || (targetRole === 'General Manager' && actorRole !== 'Owner'))) return false;
  if (actorRole === 'Sales Manager' && !hasStaff && !['Sales', 'Receptionist'].includes(targetRole)) return false;
  if (actorRole === 'Head Coach' && !hasStaff && targetRole !== 'Coach') return false;
  return Boolean(targetRole);
}

function rolesOnPlan(roles, effectiveRoles) {
  if (!Array.isArray(effectiveRoles)) return roles;
  const allowed = new Set(effectiveRoles);
  return roles.filter((role) => allowed.has(role));
}

/**
 * Roles the actor may create accounts for, intersected with the tenant plan.
 * Used by Manage Staff (create) — not for changing an existing person's role.
 */
export function creatableRolesFor(actor, effectiveRoles) {
  return rolesOnPlan(assignableRolesFor(actor), effectiveRoles);
}

/** Keep the person's current role visible only when the actor has authority over that role. */
export function roleChoicesFor(actor, currentRole, effectiveRoles) {
  const options = rolesOnPlan(assignableRolesFor(actor), effectiveRoles);
  if (currentRole && !options.includes(currentRole) && canChangeUserRole(actor, currentRole)) {
    return [currentRole, ...options];
  }
  return options;
}
