/** Member lock vs timed suspend — both set isBlocked on the API. */

export function isMemberRestricted(member) {
  return Boolean(member?.isBlocked);
}

export function isMemberSuspended(member) {
  return member?.restrictionType === 'suspend' && isMemberRestricted(member);
}

export function memberStatusBadge(member) {
  if (!isMemberRestricted(member)) return member?.status;
  return isMemberSuspended(member) ? 'suspended' : 'blocked';
}

export function checkInRestrictionMessage(member, t) {
  if (!isMemberRestricted(member)) return null;
  if (isMemberSuspended(member)) {
    return t('Cannot check in — member is suspended');
  }
  return t('Cannot check in — member is blocked');
}