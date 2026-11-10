import { apiOrigin } from '../api/axios';
import { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import { updateMyProfile } from '../api/endpoints';
import { hasAccess } from '../lib/access';

const NAV = {
  Receptionist:  [{ to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/contacts', label: 'Contacts' }],
  Sales:         [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/sales/members', label: 'Members', access: 'sales_members' }, { to: '/tasks', label: 'Tasks', access: 'sales_members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/sales/my-callcenter', label: 'Call Center', access: 'my_call_center' }, { to: '/contacts', label: 'Contacts' }],
  'Sales Manager': [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/contacts', label: 'Contacts' }],
  Owner:         [{ to: '/owner/dashboard', label: 'Dashboard', access: 'owner_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/owner/access', label: 'Access', access: 'access_control' }, { to: '/contacts', label: 'Contacts' }, { to: '/owner/settings', label: 'Settings', access: 'settings' }],
  'General Manager': [{ to: '/owner/dashboard', label: 'Dashboard', access: 'owner_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/owner/access', label: 'Access', access: 'access_control' }, { to: '/contacts', label: 'Contacts' }],
  Accountant:    [{ to: '/accounting/dashboard', label: 'Dashboard', access: 'accounting_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/accounting/contract-history', label: 'Contracts', access: 'contracts' }, { to: '/sales/targets', label: 'Targets', access: 'targets' }, { to: '/accounting/package-requests', label: 'Requests', access: 'package_approvals' }, { to: '/contacts', label: 'Contacts' }],
  Coach:           [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/tasks', label: 'Tasks', access: 'coach_members' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/coach/my-transfers', label: 'Transfers', access: 'my_transfers' }, { to: '/contacts', label: 'Contacts' }],
  'Coach Manager': [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/tasks', label: 'Tasks', access: 'members' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/contacts', label: 'Contacts' }],
};

const BOTTOM_NAV_CONFIG = {
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
    { to: '/coach/my-transfers', label: 'Transfers', icon: 'transfer' },
  ],
  'Coach Manager': [
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

const NAVBAR_BG = 'var(--nav-bg, #1E1535)';   /* complements the logo */
const TAB_BG    = 'var(--nav-tab-bg, #160F2A)';   /* slightly darker/cooler for the tab row */

function ini(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function NavIcon({ name, size = 20 }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
        </svg>
      );
    case 'members':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      );
    case 'checkin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      );
    case 'tasks':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>
        </svg>
      );
    case 'contacts':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      );
    case 'contracts':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>
        </svg>
      );
    case 'callcenter':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a9 9 0 0 1 18 0v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
        </svg>
      );
    case 'transfer':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
      );
  }
}

// ── Tab button (second row on desktop) ─────────────────────────────────────────
function TabItem({ item }) {
  return (
    <NavLink to={item.to} style={{ textDecoration: 'none', flexShrink: 0 }}>
      {({ isActive }) => (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '10px 22px', borderRadius: 8,
            fontSize: 14, fontWeight: isActive ? 700 : 500,
            color: isActive ? '#fff' : 'rgba(255,255,255,0.62)',
            background: isActive ? 'linear-gradient(135deg, var(--navy-2), var(--navy-3, var(--navy-2)))' : 'rgba(0,0,0,0.22)',
            border: `1px solid ${isActive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            whiteSpace: 'nowrap', letterSpacing: '0.25px',
            boxShadow: isActive ? '0 2px 10px rgba(0,0,0,0.30),inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              e.currentTarget.style.color = 'rgba(255,255,255,0.62)';
              e.currentTarget.style.background = 'rgba(0,0,0,0.22)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }
          }}
        >
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

// ── Drawer nav item ───────────────────────────────────────────────────────────
function DrawerItem({ item, onNavigate }) {
  return (
    <NavLink to={item.to} onClick={onNavigate} style={{ textDecoration: 'none', display: 'block' }}>
      {({ isActive }) => (
        <div style={{
          padding: '11px 14px', borderRadius: 8, margin: '3px 0',
          background: isActive ? 'rgba(91,56,186,0.5)' : 'transparent',
          border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
          fontSize: 14, fontWeight: isActive ? 600 : 400,
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.12s',
          minHeight: 44,
        }}>
          {item.label}
        </div>
      )}
    </NavLink>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const { tenant, branding, hasFeature } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [mob, setMob]         = useState(false);
  const [drop, setDrop]       = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);
  const dropRef         = useRef(null);

  const rawItems        = NAV[user?.role] ?? NAV.Receptionist;
  const items           = useMemo(() => {
    const keys = Array.isArray(user?.access) ? user.access : null;
    const visible = rawItems.filter(item => {
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
    const seen = new Set(visible.map(item => item.to));
    const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];
    const canSeeAnalytics = ANALYTICS_ROLES.includes(user?.role) && hasAccess(user, ['reports', 'owner_dashboard', 'accounting_dashboard', 'sales_dashboard']);
    if (canSeeAnalytics && hasFeature('members') && !seen.has('/analytics')) {
      seen.add('/analytics');
      const contactsAt = visible.findIndex((item) => item.to === '/contacts');
      const analytics = { to: '/analytics', label: 'Analytics' };
      if (contactsAt >= 0) visible.splice(contactsAt, 0, analytics);
      else visible.push(analytics);
    }
    const platinumAnalytics = hasFeature('exec_analytics') || hasFeature('funnels') || hasFeature('business_intelligence');
    if (user?.role === 'Accountant' && platinumAnalytics && !seen.has('/reports')) {
      seen.add('/reports');
      visible.push({ to: '/reports', label: 'Reports', access: 'reports' });
    }
    if (['Owner', 'General Manager', 'Sales Manager'].includes(user?.role) && hasAccess(user, 'access_control') && !seen.has('/owner/access') && !seen.has('/management/access')) {
      seen.add('/owner/access');
      const contactsAt = visible.findIndex((item) => item.to === '/contacts');
      const accessNav = { to: '/owner/access', label: 'Access', access: 'access_control' };
      if (contactsAt >= 0) visible.splice(contactsAt, 0, accessNav);
      else visible.push(accessNav);
    }
    const extras = Array.isArray(user?.navExtras) ? user.navExtras : [];
    for (const extra of extras) {
      if (!extra?.to || seen.has(extra.to)) continue;
      seen.add(extra.to);
      visible.push({ to: extra.to, label: extra.label || 'Feature', access: extra.key });
    }
    return visible;
  }, [rawItems, hasFeature, user]);

  const bottomNavItems = useMemo(() => {
    const roleNav = BOTTOM_NAV_CONFIG[user?.role] || BOTTOM_NAV_CONFIG.Receptionist;
    return roleNav.slice(0, 4);
  }, [user?.role]);

  const showNotif = ['Sales', 'Sales Manager', 'Accountant'].includes(user?.role);

  const logoKey = branding?.logoKey;
  const logoFile = logoKey ? String(logoKey).split(/[\/\\]/).pop() : null;
  const logoUrl = logoFile ? `${apiOrigin}/uploads/${encodeURIComponent(logoFile)}` : '/leap-logo.svg';
  const displayName = branding?.displayName || tenant?.name || 'LEAP';

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mob ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mob]);

  // Close mobile search when route changes
  useEffect(() => {
    setShowMobileSearch(false);
  }, [location.pathname]);

  const logout = () => { signOut(); navigate('/'); };

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Platform Impersonation Session Banner ─────────────────── */}
      {user?.isImpersonation && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'linear-gradient(90deg, #d97706, #b45309)',
          color: '#ffffff',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Support Mode ({user?.readOnly ? 'READ-ONLY' : 'READ-WRITE'})
            </span>
          </div>
          <button
            onClick={() => {
              signOut();
              window.close();
            }}
            style={{
              background: '#111827',
              color: '#f9fafb',
              border: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Exit
          </button>
        </div>
      )}

      {/* ── ROW 1 — sticky top bar ─────────────────────────────── */}
      <header className="app-topbar" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: NAVBAR_BG,
        boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div className="topbar-inner" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 72, padding: '0 24px',
        }}>

          {/* Logo */}
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}>
            <div className="nav-logo-box" style={{
              width: 44, height: 44, borderRadius: 12,
              flexShrink: 0,
              lineHeight: 0,
              boxShadow: '0 3px 12px color-mix(in srgb, var(--navy) 50%, transparent)',
              overflow: 'hidden',
              background: 'color-mix(in srgb, var(--nav-bg, #1E1535) 75%, #ffffff)',
            }}>
              <img key={logoUrl} src={logoUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <span className="nav-logo-text" style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '2px', textTransform: 'uppercase' }}>{displayName}</span>
          </div>

          {/* Desktop Search */}
          <div id="desk-search" style={{ flex: '1 1 auto', maxWidth: 460, minWidth: 0, marginLeft: 8 }}>
            <GlobalSearch />
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
            {/* Mobile Search Toggle Button */}
            <button
              id="mob-search-btn"
              onClick={() => setShowMobileSearch(p => !p)}
              aria-label="Search members"
              style={{
                display: 'none',
                background: showMobileSearch ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8, width: 40, height: 40, cursor: 'pointer',
                alignItems: 'center', justifyContent: 'center',
                color: '#fff',
                transition: 'background 0.15s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>

            {/* Notification Bell (Visible on both desktop & mobile) */}
            {showNotif && (
              <div className="topbar-notif" style={{ display: 'flex', alignItems: 'center' }}>
                <NotificationBell />
              </div>
            )}

            {/* Profile Menu */}
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button onClick={() => setDrop(p => !p)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8, padding: '5px 10px 5px 5px',
                cursor: 'pointer', transition: 'background 0.12s',
                minHeight: 40,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                onMouseLeave={e => { if (!drop) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                aria-label="User Profile Menu"
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--navy), var(--navy-2))',
                  border: '2px solid rgba(255,255,255,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {ini(user?.name)}
                </div>
                <div id="prof-text" style={{ textAlign: 'left', lineHeight: 1.25 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>{user?.role}</div>
                </div>
                <svg id="prof-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'rgba(255,255,255,0.40)', transition: 'transform 0.15s', transform: drop ? 'rotate(180deg)' : 'none' }}>
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {drop && (
                <div className="fade-up" style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, width: 200, padding: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
                }}>
                  <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{user?.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{user?.role}</p>
                  </div>
                  {user?.role === 'Owner' && (
                    <button onClick={() => { setDrop(false); navigate('/owner/settings'); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 6, border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, color: 'var(--t2)', fontFamily: 'inherit',
                      transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      Gym Settings
                    </button>
                  )}
                  <button onClick={() => { setDrop(false); navigate('/account/whatsapp'); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 6, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--t2)', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.8 11.8 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.59 5.93L0 24l6.4-1.67a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.45z"/></svg>
                    Connect WhatsApp
                  </button>
                  <button onClick={() => { setDrop(false); setProfileForm({ name: user?.name || '', currentPassword: '', newPassword: '', confirmPassword: '' }); setProfileErrors({}); setEditProfile(true); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 6, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--t2)', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Profile
                  </button>
                  <button onClick={logout} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 6, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--red)', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--red-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile burger button */}
            <button id="mob-btn" onClick={() => setMob(true)} style={{
              display: 'none', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8, width: 40, height: 40, cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
            }} aria-label="Open Navigation Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Search Dropdown Bar */}
        {showMobileSearch && (
          <div className="fade-up" style={{
            padding: '10px 16px 14px',
            background: '#160F2A',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <GlobalSearch />
          </div>
        )}
      </header>
      {/* END sticky row 1 */}

      {/* ── ROW 2 — tab nav (scrolls away with page on desktop) ── */}
      <div id="tab-nav-bar" style={{
        background: TAB_BG,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px',
        height: 56,
        display: 'flex', alignItems: 'center',
        gap: 6,
        overflowX: 'auto', scrollbarWidth: 'none',
        boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
      }}>
        {items.map(item => <TabItem key={item.to} item={item} />)}
      </div>

      {/* ── MOBILE DRAWER ──────────────────────────────────────── */}
      {mob && <div onClick={() => setMob(false)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }} />}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, maxWidth: '85vw', zIndex: 100,
        background: NAVBAR_BG,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        transform: mob ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.24s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 32px rgba(0,0,0,0.4)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={logoUrl} alt="LEAP" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '2px', textTransform: 'uppercase' }}>{displayName}</span>
          </div>
          <button onClick={() => setMob(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <GlobalSearch />
        </div>
        <nav style={{ flex: 1, padding: '10px 12px', overflowY: 'auto' }}>
          {items.map(item => <DrawerItem key={item.to} item={item} onNavigate={() => setMob(false)} />)}
        </nav>
        <div style={{ padding: '14px 16px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {ini(user?.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{user?.role}</p>
            </div>
          </div>
          <button onClick={() => { setMob(false); navigate('/account/whatsapp'); }} style={{ width: '100%', minHeight: 42, padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            Connect WhatsApp
          </button>
          <button onClick={logout} style={{ width: '100%', minHeight: 42, padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── PAGE CONTENT ───────────────────────────────────────── */}
      <main className="app-main-content">{children}</main>

      {/* ── MOBILE BOTTOM NAVIGATION BAR (1-Thumb Ergonomics) ────── */}
      <nav className="mobile-bottom-nav" aria-label="Quick Navigation" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'color-mix(in srgb, var(--nav-bg, #1a1230) 96%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        zIndex: 45,
        display: 'none',
        alignItems: 'center',
        justifyContent: 'space-around',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
      }}>
        {bottomNavItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}
          >
            {({ isActive }) => (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: 56, gap: 3,
                color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.60)',
                transition: 'color 0.12s, transform 0.12s',
                position: 'relative',
              }}>
                <NavIcon name={item.icon} size={20} />
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: '0.2px' }}>
                  {item.label}
                </span>
                {isActive && (
                  <span style={{
                    position: 'absolute', bottom: 2, width: 14, height: 2.5,
                    borderRadius: 2, background: '#a78bfa',
                    boxShadow: '0 0 8px rgba(167,139,250,0.8)',
                  }} />
                )}
              </div>
            )}
          </NavLink>
        ))}

        {/* Quick Menu Button to open Drawer */}
        <button
          type="button"
          onClick={() => setMob(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            flex: 1, minWidth: 0, height: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            color: 'rgba(255,255,255,0.60)',
            fontFamily: 'inherit',
          }}
          aria-label="More Options"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2px' }}>More</span>
        </button>
      </nav>

      {/* ── Edit Profile Modal ───────────────────────────────── */}
      {editProfile && (
        <div onClick={() => !profileSaving && setEditProfile(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} className="fade-up modal-panel" style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, width: '100%', maxWidth: 440,
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Edit Profile</h2>
              <button onClick={() => setEditProfile(false)} disabled={profileSaving} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg)'; e.currentTarget.style.color = 'var(--red)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)'; }}
              >✕</button>
            </div>

            <div style={{ padding: '20px' }}>
              <form onSubmit={async e => {
                e.preventDefault();
                const errs = {};
                if (!profileForm.name.trim()) errs.name = 'Name is required';
                if (profileForm.newPassword) {
                  if (!profileForm.currentPassword) errs.currentPassword = 'Required to change password';
                  if (profileForm.newPassword.length < 6) errs.newPassword = 'At least 6 characters';
                  if (profileForm.newPassword !== profileForm.confirmPassword) errs.confirmPassword = 'Passwords do not match';
                }
                setProfileErrors(errs);
                if (Object.keys(errs).length) return;
                setProfileSaving(true);
                try {
                  const payload = { name: profileForm.name.trim() };
                  if (profileForm.newPassword) {
                    payload.currentPassword = profileForm.currentPassword;
                    payload.newPassword = profileForm.newPassword;
                  }
                  await updateMyProfile(payload);
                  toast.success('Profile updated! Please sign in again to see your new name.');
                  setEditProfile(false);
                } catch (err) {
                  const msg = err.response?.data?.message || 'Failed to update profile';
                  if (msg.toLowerCase().includes('password')) setProfileErrors({ currentPassword: msg });
                  else toast.error(msg);
                } finally {
                  setProfileSaving(false);
                }
              }} noValidate>

                {/* Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Display Name</label>
                  <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.name ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.name ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.name && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.name}</p>}
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '18px 0 14px' }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 14 }}>
                  Change Password <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </p>

                {/* Current Password */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Current Password</label>
                  <input type="password" value={profileForm.currentPassword} onChange={e => setProfileForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Enter current password"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.currentPassword ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.currentPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.currentPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.currentPassword}</p>}
                </div>

                {/* New Password */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={profileForm.newPassword} onChange={e => setProfileForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min 6 characters"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.newPassword ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.newPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.newPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.newPassword}</p>}
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Confirm New Password</label>
                  <input type="password" value={profileForm.confirmPassword} onChange={e => setProfileForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat new password"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.confirmPassword ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.confirmPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.confirmPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.confirmPassword}</p>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setEditProfile(false)} disabled={profileSaving}
                    style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={profileSaving}
                    style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--navy-2))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: profileSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: profileSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {profileSaving
                      ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />Saving…</>
                      : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        #tab-nav-bar::-webkit-scrollbar { display: none; }
        #desk-search > * { width: 100% !important; max-width: 100% !important; flex: none !important; }
        @media (max-width: 1280px) { #prof-text, #prof-arrow { display: none !important; } }
        @media (max-width: 1024px) {
          .topbar-inner { height: 56px !important; padding: 0 14px !important; }
          .nav-logo-box { width: 34px !important; height: 34px !important; border-radius: 8px !important; }
          #tab-nav-bar, #desk-search { display: none !important; }
          #mob-btn, #mob-search-btn, .mobile-bottom-nav { display: flex !important; }
        }
        @media (max-width: 480px) {
          .nav-logo-text { display: none !important; }
        }
      `}</style>
    </div>
  );
}
