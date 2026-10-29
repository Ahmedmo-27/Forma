import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

const NAV = {
  Receptionist:  [{ to: '/checkin', label: 'Check In' }, { to: '/members', label: 'Members' }, { to: '/contacts', label: 'Contacts' }],
  Sales:         [{ to: '/sales/dashboard', label: 'Dashboard' }, { to: '/sales/members', label: 'Members' }, { to: '/sales/requests', label: 'Requests' }, { to: '/sales/subscriptions', label: 'Subscriptions' }, { to: '/sales/my-callcenter', label: 'Call Center' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],

  'Sales Manager': [{ to: '/sales/dashboard', label: 'Dashboard' }, { to: '/members', label: 'All Members' }, { to: '/sales/requests', label: 'Requests' }, { to: '/sales/team', label: 'Team' }, { to: '/sales/targets', label: 'Targets' }, { to: '/sales/transfer', label: 'Transfer' }, { to: '/sales/staff', label: 'Staff' }, { to: '/sales/packages', label: 'Packages' }, { to: '/sales/whatsapp-templates', label: 'WA Messages' }, { to: '/sales/callcenter', label: 'Call Center' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],
  Owner:         [{ to: '/owner/dashboard', label: 'Dashboard' }, { to: '/members', label: 'Members' }, { to: '/owner/teams', label: 'Teams' }, { to: '/sales/requests', label: 'Requests' }, { to: '/accounting/contract-history', label: 'Contracts' }, { to: '/sales/targets', label: 'Revenue' }, { to: '/sales/transfer', label: 'Transfer' }, { to: '/sales/packages', label: 'Packages' }, { to: '/sales/whatsapp-templates', label: 'WA Messages' }, { to: '/sales/callcenter', label: 'Call Center' }, { to: '/checkin', label: 'Check In' }, { to: '/contacts', label: 'Contacts' }],
  Accountant:    [
    { to: '/accounting/dashboard', label: 'Dashboard' },
    { to: '/accounting/package-requests', label: 'Requests' },
    { to: '/accounting/contract-history', label: 'Contracts' },
    { to: '/sales/targets', label: 'Revenue' },
    { to: '/sales/whatsapp-templates', label: 'WA Messages' },
    { to: '/members', label: 'Members' },
    { to: '/sales/team', label: 'Team' },
    { to: '/contacts', label: 'Contacts' },
  ],
  Coach:           [{ to: '/coach/dashboard', label: 'Dashboard' }, { to: '/coach/members', label: 'Members' }, { to: '/coach/checkin', label: 'Session Check-In' }, { to: '/coach/my-transfers', label: 'Transfers' }, { to: '/contacts', label: 'Contacts' }],
  'Coach Manager': [{ to: '/coach/dashboard', label: 'Dashboard' }, { to: '/coach/members', label: 'All Members' }, { to: '/coach/checkin', label: 'Session Check-In' }, { to: '/coach/transfer', label: 'Transfer' }, { to: '/coach/my-transfers', label: 'Transfers Log' }, { to: '/coach/team', label: 'Team' }, { to: '/coach/staff', label: 'Staff' }, { to: '/coach/whatsapp-templates', label: 'WA Messages' }, { to: '/contacts', label: 'Contacts' }],
};

function ini(name = '') { return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'; }

function NavItem({ item, compact, variant = 'bar', onNavigate }) {
  if (variant === 'drawer') {
    return (
      <NavLink to={item.to} onClick={onNavigate} style={{ textDecoration: 'none', display: 'block' }}>
        {({ isActive }) => (
          <div style={{
            padding: '10px 12px', borderRadius: 6, margin: '2px 0',
            background: isActive ? 'rgba(68,41,140,0.45)' : 'transparent',
            borderLeft: `2px solid ${isActive ? '#00F0FF' : 'transparent'}`,
            color: isActive ? '#fff' : 'rgba(255,255,255,0.50)',
            fontSize: 13, fontWeight: isActive ? 600 : 400,
          }}>
            {item.label}
          </div>
        )}
      </NavLink>
    );
  }

  return (
    <NavLink to={item.to} onClick={onNavigate} style={{ textDecoration: 'none', flexShrink: 0 }}>
      {({ isActive }) => (
        <span style={{
          display: 'inline-block',
          padding: compact ? '5px 9px' : '5px 11px',
          borderRadius: 5,
          fontSize: compact ? 12 : 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.50)',
          background: isActive ? 'rgba(68,41,140,0.45)' : 'transparent',
          cursor: 'pointer',
          transition: 'all 0.12s',
          borderBottom: `2px solid ${isActive ? '#00F0FF' : 'transparent'}`,
          whiteSpace: 'nowrap',
        }}
          onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; e.currentTarget.style.background = 'rgba(68,41,140,0.25)'; } }}
          onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'transparent'; } }}
        >
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mob, setMob]         = useState(false);
  const [drop, setDrop]       = useState(false);
  const dropRef               = useRef(null);
  const items                 = NAV[user?.role] ?? NAV.Receptionist;
  const compactNav            = items.length > 6;
  const showNotifications     = ['Sales', 'Sales Manager', 'Accountant'].includes(user?.role);

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

      {/* ── NAV BAR ──────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--navy)',
        borderBottom: '1px solid rgba(0,240,255,0.10)',
      }}>
        <div className="nav-bar-inner" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 52, padding: '0 16px', maxWidth: '100%',
        }}>

          {/* ── LEFT: Logo ───────────────────────────────────────── */}
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
            <img src="/leap-logo.svg" alt="LEAP" style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0 }} />
            <span className="nav-logo-text" style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '1.5px', textTransform: 'uppercase' }}>LEAP</span>
            <span className="nav-logo-badge" style={{ fontSize: 10, color: 'rgba(0,240,255,0.70)', background: 'rgba(0,240,255,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', border: '1px solid rgba(0,240,255,0.15)' }}>GYM</span>
          </div>

          {/* ── CENTER: Nav links (desktop) ──────────────────────── */}
          <nav id="desk-nav" className="desk-nav">
            {items.map((item) => (
              <NavItem key={item.to} item={item} compact={compactNav} />
            ))}
          </nav>

          {/* ── RIGHT: Search + Notifications + User ───────────── */}
          <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>

            <div id="desk-search">
              <GlobalSearch />
            </div>

            <div id="desk-notif" className="desk-notif">
              {showNotifications && <NotificationBell />}
            </div>

            {/* Profile */}
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button onClick={() => setDrop(p => !p)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(68,41,140,0.40)', border: '1px solid rgba(0,240,255,0.18)',
                borderRadius: 6, padding: '5px 10px 5px 6px', cursor: 'pointer', transition: 'background 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(68,41,140,0.65)'}
                onMouseLeave={e => { if (!drop) e.currentTarget.style.background = 'rgba(68,41,140,0.40)'; }}
              >
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,240,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#00F0FF', flexShrink: 0 }}>
                  {ini(user?.name)}
                </div>
                <div id="prof-text" style={{ textAlign: 'left', lineHeight: 1.25 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{user?.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{user?.role}</div>
                </div>
                <svg id="prof-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'rgba(255,255,255,0.35)', transition: 'transform 0.15s', transform: drop ? 'rotate(180deg)' : 'none' }}>
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {drop && (
                <div className="fade-up" style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 7, width: 196, padding: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.40)',
                  zIndex: 100,
                }}>
                  <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{user?.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 1 }}>{user?.role}</p>
                  </div>
                  <button onClick={logout} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 5, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--red)', fontFamily: 'inherit',
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
            <button id="mob-btn" onClick={() => setMob(true)} style={{ display: 'none', background: 'rgba(68,41,140,0.40)', border: '1px solid rgba(0,240,255,0.18)', borderRadius: 6, width: 34, height: 34, cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }} aria-label="Menu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── MOBILE DRAWER ────────────────────────────────────────── */}
      {mob && <div onClick={() => setMob(false)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(11,8,23,0.75)', backdropFilter: 'blur(3px)' }} />}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 100,
        background: 'var(--navy)',
        borderRight: '1px solid rgba(0,240,255,0.10)',
        transform: mob ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.24s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 14px', borderBottom: '1px solid rgba(0,240,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/leap-logo.svg" alt="LEAP" style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '1.5px', textTransform: 'uppercase' }}>LEAP</span>
          </div>
          <button onClick={() => setMob(false)} style={{ background: 'rgba(68,41,140,0.40)', border: '1px solid rgba(0,240,255,0.14)', borderRadius: 5, width: 28, height: 28, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        {/* Mobile search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0,240,255,0.08)' }}>
          <GlobalSearch />
        </div>
        {showNotifications && (
          <div className="mob-drawer-notif" style={{ padding: '0 12px 10px', borderBottom: '1px solid rgba(0,240,255,0.08)' }}>
            <NotificationBell variant="drawer" />
          </div>
        )}
        <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
          {items.map((item) => (
            <NavItem key={item.to} item={item} variant="drawer" onNavigate={() => setMob(false)} />
          ))}
        </nav>
        <div style={{ padding: '12px 14px 18px', borderTop: '1px solid rgba(0,240,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,240,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#00F0FF', flexShrink: 0 }}>{ini(user?.name)}</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{user?.role}</p>
            </div>
          </div>
          <button onClick={logout} style={{ width: '100%', padding: '9px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── CONTENT ──────────────────────────────────────────────── */}
      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 40 }}>{children}</main>

      <style>{`
        .desk-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
          flex: 1;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 0 4px;
        }
        .desk-nav::-webkit-scrollbar { display: none; }

        #desk-search {
          flex: 0 1 240px;
          min-width: 140px;
          max-width: 240px;
        }
        #desk-search > * {
          width: 100% !important;
          max-width: 100% !important;
          flex: none !important;
        }

        @media (max-width: 1280px) {
          #desk-search { flex: 0 1 180px; min-width: 120px; }
          #prof-text, #prof-arrow { display: none !important; }
        }

        @media (max-width: 1024px) {
          .desk-nav, #desk-search, .desk-notif { display: none !important; }
          #mob-btn { display: flex !important; }
        }

        @media (max-width: 480px) {
          .nav-logo-text, .nav-logo-badge { display: none !important; }
          .nav-bar-inner { padding: 0 12px !important; gap: 8px !important; }
        }
      `}</style>
    </div>
  );
}
