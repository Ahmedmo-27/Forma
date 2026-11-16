import { hasAccess } from './access.js';

export const NAV = {
  Receptionist:  [{ to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/contacts', label: 'Contacts' }],
  Sales:         [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/sales/members', label: 'Members', access: 'sales_members' }, { to: '/tasks', label: 'Tasks', access: 'sales_members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/sales/my-callcenter', label: 'Call Center', access: 'my_call_center' }, { to: '/contacts', label: 'Contacts' }],
  'Sales Manager': [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/contacts', label: 'Contacts' }],
  Owner:         [{ to: '/owner/dashboard', label: 'Dashboard', access: 'owner_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/owner/access', label: 'Access', access: 'access_control' }, { to: '/contacts', label: 'Contacts' }, { to: '/owner/settings', label: 'Settings', access: 'settings' }],
  'General Manager': [{ to: '/owner/dashboard', label: 'Dashboard', access: 'owner_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/owner/access', label: 'Access', access: 'access_control' }, { to: '/contacts', label: 'Contacts' }],
  Accountant:    [{ to: '/accounting/dashboard', label: 'Dashboard', access: 'accounting_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/accounting/contract-history', label: 'Contracts', access: 'contracts' }, { to: '/sales/targets', label: 'Targets', access: 'targets' }, { to: '/accounting/package-requests', label: 'Requests', access: 'package_approvals' }, { to: '/contacts', label: 'Contacts' }],
  Coach:           [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/tasks', label: 'Tasks', access: 'coach_members' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/coach/my-transfers', label: 'Transfers', access: 'my_transfers' }, { to: '/contacts', label: 'Contacts' }],
  'Head Coach': [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/tasks', label: 'Tasks', access: 'coach_transfer' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/coach/attendance', label: 'Attendance', access: 'coach_attendance' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/contacts', label: 'Contacts' }],
};

export const BOTTOM_NAV_CONFIG = {
  Receptionist: [
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/members', label: 'Members', icon: 'members' },
    { to: '/contacts', label: 'Contacts', icon: 'contacts' },
  ],
  Sales: [
    { to: '/sales/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/sales/members', label: 'Members', icon: 'members' },
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/sales/my-callcenter', label: 'Calls', icon: 'callcenter' },
  ],
  'Sales Manager': [
    { to: '/sales/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/members', label: 'Members', icon: 'members' },
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  ],
  Coach: [
    { to: '/coach/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/coach/members', label: 'Trainees', icon: 'members' },
    { to: '/coach/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  ],
  'Head Coach': [
    { to: '/coach/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/coach/members', label: 'Trainees', icon: 'members' },
    { to: '/coach/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  ],
  Accountant: [
    { to: '/accounting/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/members', label: 'Members', icon: 'members' },
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/accounting/contract-history', label: 'Contracts', icon: 'contracts' },
  ],
  Owner: [
    { to: '/owner/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/members', label: 'Members', icon: 'members' },
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  ],
  'General Manager': [
    { to: '/owner/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/members', label: 'Members', icon: 'members' },
    { to: '/checkin', label: 'Check In', icon: 'checkin' },
    { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  ],
};

const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];

export function bottomNavFor(role) {
  const roleNav = BOTTOM_NAV_CONFIG[role] || BOTTOM_NAV_CONFIG.Receptionist;
  return roleNav.slice(0, 4);
}

/** Same visibility rules the sidebar used inline. */
export function visibleNavItems(user, hasFeature = () => true) {
  const rawItems = NAV[user?.role] ?? NAV.Receptionist;
  const keys = Array.isArray(user?.access) ? user.access : null;
  const visible = rawItems.filter((item) => {
    if (keys && item.access && !keys.includes(item.access)) return false;
    if (item.to.startsWith('/accounting') && !hasFeature('accounting') && !hasFeature('exception_approvals')) return false;
    if (item.to === '/sales/targets' && !hasFeature('accounting')) return false;
    if ((item.to === '/sales/callcenter' || item.to === '/sales/my-callcenter') && !hasFeature('sales_crm')) return false;
    if (
      item.to === '/reports'
      && !hasFeature('exec_analytics')
      && !hasFeature('sales_crm')
      && !hasFeature('funnels')
      && !hasFeature('business_intelligence')
    ) return false;
    return true;
  });
  const seenPaths = new Set(visible.map((item) => item.to));
  const seenLabels = new Set(visible.map((item) => navLabelKey(item.label)));
  const markSeen = (item) => {
    seenPaths.add(item.to);
    seenLabels.add(navLabelKey(item.label));
  };
  const canSeeAnalytics = ANALYTICS_ROLES.includes(user?.role) && hasAccess(user, ['reports', 'owner_dashboard', 'accounting_dashboard', 'sales_dashboard']);
  if (canSeeAnalytics && hasFeature('members') && !seenPaths.has('/analytics')) {
    const analytics = { to: '/analytics', label: 'Analytics' };
    markSeen(analytics);
    const contactsAt = visible.findIndex((item) => item.to === '/contacts');
    if (contactsAt >= 0) visible.splice(contactsAt, 0, analytics);
    else visible.push(analytics);
  }
  const platinumAnalytics = hasFeature('exec_analytics') || hasFeature('funnels') || hasFeature('business_intelligence');
  if (user?.role === 'Accountant' && platinumAnalytics && !seenPaths.has('/reports')) {
    const reports = { to: '/reports', label: 'Reports', access: 'reports' };
    markSeen(reports);
    visible.push(reports);
  }
  if (['Owner', 'General Manager', 'Sales Manager'].includes(user?.role) && hasAccess(user, 'access_control') && !seenPaths.has('/owner/access') && !seenPaths.has('/management/access')) {
    const accessNav = { to: '/owner/access', label: 'Access', access: 'access_control' };
    markSeen(accessNav);
    seenPaths.add('/management/access');
    const contactsAt = visible.findIndex((item) => item.to === '/contacts');
    if (contactsAt >= 0) visible.splice(contactsAt, 0, accessNav);
    else visible.push(accessNav);
  }
  const extras = Array.isArray(user?.navExtras) ? user.navExtras : [];
  for (const extra of extras) {
    if (!extra?.to) continue;
    const label = extra.label || 'Feature';
    // Non-default grants often add alternate role paths (coach/accounting dashboards,
    // my-callcenter, management access) that collide with the role's existing tabs.
    if (seenPaths.has(extra.to) || seenLabels.has(navLabelKey(label))) continue;
    const item = { to: extra.to, label, access: extra.key };
    markSeen(item);
    if (extra.to === '/owner/access' || extra.to === '/management/access') {
      seenPaths.add('/owner/access');
      seenPaths.add('/management/access');
    }
    visible.push(item);
  }
  return visible;
}

function navLabelKey(label) {
  return String(label || '').trim().toLowerCase();
}
