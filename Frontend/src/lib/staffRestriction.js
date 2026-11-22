/** Staff lock vs timed suspend — both set isBlocked on the API. */

export function isStaffRestricted(user) {
  return Boolean(user?.isBlocked);
}

export function isStaffSuspended(user) {
  return user?.restrictionType === 'suspend' && isStaffRestricted(user);
}

export function canManageStaffRestrictions(actor, target) {
  if (!actor || !target) return false;
  const actorId = String(actor._id || actor.id || '');
  const targetId = String(target._id || target.id || '');
  if (actorId && targetId && actorId === targetId) return false;
  if (actor.role === 'Owner') return true;
  if (actor.role === 'General Manager') {
    return target.role !== 'Owner' && target.role !== 'General Manager';
  }
  return false;
}
