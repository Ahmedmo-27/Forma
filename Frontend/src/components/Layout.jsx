import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

const NAV = {
  Receptionist:  [{ to: '/checkin', label: 'Check In' }, { to: '/members', label: 'Members' }, { to: '/contacts', label: 'Contacts' }],
  Sales:         [{ to: '/sales/dashboard', label: 'Dashboard' }, { to: '/sales/members', label: 'Members' }, { to: '/sales/requests', label: 'Requests' }, { to: '/sales/subscriptions', label: 'Subscriptions' }, { to: '/sales/my-callcenter', label: 'Call Center' }, { to: '/reports', label: 'Reports' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],
  'Sales Manager': [{ to: '/sales/dashboard', label: 'Dashboard' }, { to: '/members', label: 'Members' }, { to: '/sales/requests', label: 'Requests' }, { to: '/sales/team', label: 'Team' }, { to: '/sales/targets', label: 'Targets' }, { to: '/sales/transfer', label: 'Transfer' }, { to: '/sales/staff', label: 'Staff' }, { to: '/sales/packages', label: 'Packages' }, { to: '/sales/whatsapp-templates', label: 'WA' }, { to: '/sales/callcenter', label: 'Call Center' }, { to: '/reports', label: 'Reports' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],
  Owner:         [{ to: '/owner/dashboard', label: 'Dashboard' }, { to: '/members', label: 'Members' }, { to: '/owner/teams', label: 'Teams' }, { to: '/sales/requests', label: 'Requests' }, { to: '/accounting/contract-history', label: 'Contracts' }, { to: '/sales/targets', label: 'Revenue' }, { to: '/sales/transfer', label: 'Transfer' }, { to: '/sales/packages', label: 'Packages' }, { to: '/sales/whatsapp-templates', label: 'WA' }, { to: '/sales/callcenter', label: 'Call Center' }, { to: '/reports', label: 'Reports' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],
  Accountant:    [{ to: '/accounting/dashboard', label: 'Dashboard' }, { to: '/accounting/package-requests', label: 'Requests' }, { to: '/accounting/contract-history', label: 'Contracts' }, { to: '/sales/targets', label: 'Revenue' }, { to: '/sales/whatsapp-templates', label: 'WA' }, { to: '/members', label: 'Members' }, { to: '/sales/team', label: 'Team' }, { to: '/reports', label: 'Reports' }, { to: '/contacts', label: 'Contacts' }],
  Coach:           [{ to: '/coach/dashboard', label: 'Dashboard' }, { to: '/coach/members', label: 'Members' }, { to: '/coach/checkin', label: 'Check In' }, { to: '/coach/my-transfers', label: 'Transfers' }, { to: '/contacts', label: 'Contacts' }],
  'Coach Manager': [{ to: '/coach/dashboard', label: 'Dashboard' }, { to: '/coach/members', label: 'Members' }, { to: '/coach/checkin', label: 'Check In' }, { to: '/coach/transfer', label: 'Transfer' }, { to: '/coach/my-transfers', label: 'Log' }, { to: '/coach/team', label: 'Team' }, { to: '/coach/staff', label: 'Staff' }, { to: '/coach/whatsapp-templates', label: 'WA' }, { to: '/contacts', label: 'Contacts' }],
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
            padding: '6px 18px', borderRadius: 7,
            fontSize: 13, fontWeight: isActive ? 700 : 500,
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
  const navigate = useNavigate();
  const [mob, setMob]   = useState(false);
  const [drop, setDrop] = useState(false);
  const dropRef         = useRef(null);
  const items           = NAV[user?.role] ?? NAV.Receptionist;
  const showNotif       = ['Sales', 'Sales Manager', 'Accountant'].includes(user?.role);

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

      {/* ── ROW 1 — sticky top bar ─────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: NAVBAR_BG,
        boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 72, padding: '0 24px' }}>

          {/* Logo */}
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0, marginRight: 8 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              background: 'linear-gradient(135deg, #44298C 0%, #5B38BA 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 3px 12px rgba(68,41,140,0.6)',
            }}>
              <img src="/leap-logo.svg" alt="LEAP" style={{ width: 34, height: 34 }} />
            </div>
            <span className="nav-logo-text" style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '2.5px', textTransform: 'uppercase' }}>LEAP</span>
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
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#44298C,#5B38BA)',
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
        padding: '0 24px 0 60px',
        height: 48,
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
