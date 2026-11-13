export const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];

export const ROLE_HOME = {
  Owner: { key: 'owner_dashboard', to: '/owner/dashboard' },
  'General Manager': { key: 'owner_dashboard', to: '/owner/dashboard' },
  Sales: { key: 'sales_dashboard', to: '/sales/dashboard' },
  'Sales Manager': { key: 'sales_dashboard', to: '/sales/dashboard' },
  Coach: { key: 'coach_dashboard', to: '/coach/dashboard' },
  'Head Coach': { key: 'coach_dashboard', to: '/coach/dashboard' },
  Accountant: { key: 'accounting_dashboard', to: '/accounting/dashboard' },
  Receptionist: { key: 'check_in', to: '/checkin' },
};

export const ACCESS_FALLBACKS = [
  { key: 'owner_dashboard', to: '/owner/dashboard' },
  { key: 'sales_dashboard', to: '/sales/dashboard' },
  { key: 'coach_dashboard', to: '/coach/dashboard' },
  { key: 'accounting_dashboard', to: '/accounting/dashboard' },
  { key: 'check_in', to: '/checkin' },
  { key: 'members', to: '/members' },
  { key: 'sales_members', to: '/sales/members' },
  { key: 'coach_members', to: '/coach/members' },
  { key: 'management', to: '/management' },
  { key: 'reports', to: '/reports' },
];

function accessList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** True when PrivateRoute would render the page. Plan features stay on FeatureGate. */
export function canEnterRoute(user, { roles, access } = {}) {
  if (!user) return false;
  const needed = accessList(access);
  const known = Array.isArray(user.access);
  if (needed.length && known) {
    return needed.some((key) => user.access.includes(key));
  }
  if (roles && !roles.includes(user.role)) return false;
  return true;
}

/** Landing path for a signed-in user. Null when nobody is signed in. */
export function homePath(user) {
  if (!user) return null;
  const home = ROLE_HOME[user.role] || { key: 'members', to: '/members' };
  const keys = Array.isArray(user.access) ? user.access : null;
  if (!keys || keys.includes(home.key)) return home.to;
  const extra = (user.navExtras || []).find((item) => item?.to);
  if (extra) return extra.to;
  const next = ACCESS_FALLBACKS.find((item) => keys.includes(item.key));
  return next?.to || '/contacts';
}
