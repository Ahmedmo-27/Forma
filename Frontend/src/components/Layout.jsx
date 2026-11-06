import { apiOrigin } from '../api/axios';
import { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import { updateMyProfile } from '../api/endpoints';

const NAV = {
  Receptionist:  [{ to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/contacts', label: 'Contacts' }],
  Sales:         [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/sales/members', label: 'Members', access: 'sales_members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/sales/my-callcenter', label: 'Call Center', access: 'my_call_center' }, { to: '/contacts', label: 'Contacts' }],
  'Sales Manager': [{ to: '/sales/dashboard', label: 'Dashboard', access: 'sales_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/contacts', label: 'Contacts' }],
  Owner:         [{ to: '/owner/dashboard', label: 'Dashboard', access: 'owner_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/sales/callcenter', label: 'Call Center', access: 'manager_call_center' }, { to: '/contacts', label: 'Contacts' }, { to: '/owner/settings', label: 'Settings', access: 'settings' }],
  Accountant:    [{ to: '/accounting/dashboard', label: 'Dashboard', access: 'accounting_dashboard' }, { to: '/members', label: 'Members', access: 'members' }, { to: '/checkin', label: 'Check In', access: 'check_in' }, { to: '/accounting/contract-history', label: 'Contracts', access: 'contracts' }, { to: '/sales/targets', label: 'Targets', access: 'targets' }, { to: '/accounting/package-requests', label: 'Requests', access: 'package_approvals' }, { to: '/contacts', label: 'Contacts' }],
  Coach:           [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/coach/my-transfers', label: 'Transfers', access: 'my_transfers' }, { to: '/contacts', label: 'Contacts' }],
  'Coach Manager': [{ to: '/coach/dashboard', label: 'Dashboard', access: 'coach_dashboard' }, { to: '/coach/members', label: 'Members', access: 'coach_members' }, { to: '/coach/checkin', label: 'Check In', access: 'coach_checkin' }, { to: '/reports', label: 'Reports', access: 'reports' }, { to: '/management', label: 'Management', access: 'management' }, { to: '/contacts', label: 'Contacts' }],
};

const NAVBAR_BG = '#1E1535';   /* deep violet-dark — complements the logo */
const TAB_BG    = '#160F2A';   /* slightly darker/cooler for the tab row */

function ini(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ── Tab button (second row) ───────────────────────────────────────────────────
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
            background: isActive ? 'linear-gradient(135deg,#5B38BA,#6D47CC)' : 'rgba(0,0,0,0.22)',
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
          padding: '9px 12px', borderRadius: 6, margin: '2px 0',
          background: isActive ? 'rgba(91,56,186,0.5)' : 'transparent',
          border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          transition: 'all 0.12s',
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
  const [mob, setMob]         = useState(false);
  const [drop, setDrop]       = useState(false);
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
      if (item.to === '/reports' && !hasFeature('exec_analytics') && !hasFeature('sales_crm')) return false;
      return true;
    });
    const seen = new Set(visible.map(item => item.to));
    const extras = Array.isArray(user?.navExtras) ? user.navExtras : [];
    for (const extra of extras) {
      if (!extra?.to || seen.has(extra.to)) continue;
      seen.add(extra.to);
      visible.push({ to: extra.to, label: extra.label || 'Feature', access: extra.key });
    }
    return visible;
  }, [rawItems, hasFeature, user?.access, user?.navExtras]);

  const showNotif       = ['Sales', 'Sales Manager', 'Accountant'].includes(user?.role);

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

  const logout = () => { signOut(); navigate('/'); };

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Platform Impersonation Session Banner ─────────────────── */}
      {user?.isImpersonation && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'linear-gradient(90deg, #d97706, #b45309)',
          color: '#ffffff',
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              Platform Support Session Active (Admin: {user?.impersonatedBy?.name || user?.impersonatedBy?.email || 'Operator'}) — Mode: <strong>{user?.readOnly ? 'READ-ONLY' : 'READ-WRITE'}</strong>
            </span>
            {user?.readOnly && (
              <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Mutations Blocked
              </span>
            )}
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
              padding: '5px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#000'}
            onMouseLeave={e => e.currentTarget.style.background = '#111827'}
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* ── ROW 1 — sticky top bar ─────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: NAVBAR_BG,
        boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 96, padding: '0 28px' }}>

          {/* Logo */}
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flexShrink: 0, marginRight: 12 }}>
            <div style={{
              width: 68, height: 68, borderRadius: 16,
              flexShrink: 0,
              padding: 0,
              lineHeight: 0,
              boxShadow: '0 4px 16px rgba(68,41,140,0.6)',
              overflow: 'hidden',
            }}>
              <img key={logoUrl} src={logoUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <span className="nav-logo-text" style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '2.5px', textTransform: 'uppercase' }}>{displayName}</span>
          </div>

          {/* Search */}
          <div id="desk-search" style={{ flex: '1 1 auto', maxWidth: 500, minWidth: 0 }}>
            <GlobalSearch />
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
            <div id="desk-notif" className="desk-notif">
              {showNotif && <NotificationBell />}
            </div>

            {/* Profile */}
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button onClick={() => setDrop(p => !p)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8, padding: '6px 12px 6px 6px',
                cursor: 'pointer', transition: 'background 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                onMouseLeave={e => { if (!drop) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#44298C,#5B38BA)',
                  border: '2px solid rgba(255,255,255,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {ini(user?.name)}
                </div>
                <div id="prof-text" style={{ textAlign: 'left', lineHeight: 1.25 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>{user?.role}</div>
                </div>
                <svg id="prof-arrow" width="11" height="11" viewBox="0 0 10 10" fill="none" style={{ color: 'rgba(255,255,255,0.40)', transition: 'transform 0.15s', transform: drop ? 'rotate(180deg)' : 'none' }}>
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

            {/* Mobile burger */}
            <button id="mob-btn" onClick={() => setMob(true)} style={{
              display: 'none', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8, width: 44, height: 44, cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
            }} aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* END sticky row 1 */}

      {/* ── ROW 2 — tab nav (scrolls away with page) ───────────── */}
      <div id="tab-nav-bar" style={{
        background: TAB_BG,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '0 28px',
        height: 64,
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
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 100,
        background: NAVBAR_BG,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        transform: mob ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.24s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/leap-logo.svg" alt="LEAP" style={{ width: 22, height: 22 }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '2px', textTransform: 'uppercase' }}>LEAP</span>
          </div>
          <button onClick={() => setMob(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5, width: 28, height: 28, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <GlobalSearch />
        </div>
        {showNotif && (
          <div className="mob-drawer-notif" style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <NotificationBell variant="drawer" />
          </div>
        )}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {items.map(item => <DrawerItem key={item.to} item={item} onNavigate={() => setMob(false)} />)}
        </nav>
        <div style={{ padding: '12px 14px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {ini(user?.name)}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{user?.role}</p>
            </div>
          </div>
          <button onClick={logout} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── PAGE CONTENT ───────────────────────────────────────── */}
      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 40 }}>{children}</main>

      {/* ── Edit Profile Modal ───────────────────────────────── */}
      {editProfile && (
        <div onClick={() => !profileSaving && setEditProfile(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} className="fade-up" style={{
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
                    onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
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
                    onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.currentPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.currentPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.currentPassword}</p>}
                </div>

                {/* New Password */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={profileForm.newPassword} onChange={e => setProfileForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min 6 characters"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.newPassword ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.newPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.newPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.newPassword}</p>}
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Confirm New Password</label>
                  <input type="password" value={profileForm.confirmPassword} onChange={e => setProfileForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat new password"
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: `1px solid ${profileErrors.confirmPassword ? 'var(--red-bd)' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                    onBlur={e => { e.target.style.borderColor = profileErrors.confirmPassword ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                  {profileErrors.confirmPassword && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{profileErrors.confirmPassword}</p>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setEditProfile(false)} disabled={profileSaving}
                    style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={profileSaving}
                    style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#44298C,#5B38BA)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: profileSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: profileSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
        @media (max-width: 1024px) { #tab-nav-bar, #desk-search, .desk-notif { display: none !important; } #mob-btn { display: flex !important; } }
        @media (max-width: 480px) { .nav-logo-text { display: none !important; } }
      `}</style>
    </div>
  );
}
