import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/endpoints';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell({ variant = 'bar' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      setCount(res.data.count ?? 0);
    } catch { /* silent */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications({ limit: 30, page: 1 });
      setNotifications(res.data.notifications ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      fetchNotifications();
      fetchCount();
    }
  };

  const handleClick = async (n) => {
    if (!n.read) {
      try {
        await markNotificationRead(n._id);
        setCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((item) => (item._id === n._id ? { ...item, read: true } : item))
        );
      } catch { /* silent */ }
    }
    setOpen(false);
    if (n.type === 'sales_rep_request_pending') {
      navigate('/sales/requests');
      return;
    }
    if (n.type === 'task_assigned' || n.title?.toLowerCase() === 'tasks') {
      navigate('/tasks');
      return;
    }
    const memberId = n.member?.systemId || n.member?._id;
    if (!memberId) return;
    const tab = n.type === 'package_exception_pending' ? '?tab=packages' : '';
    navigate(`/members/${memberId}${tab}`);
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* silent */ }
  };

  const isDrawer = variant === 'drawer';

  return (
    <div ref={ref} style={{ position: 'relative', width: isDrawer ? '100%' : 'auto' }}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{
          position: 'relative',
          background: isDrawer ? 'color-mix(in srgb, var(--navy) 7%, transparent)' : 'color-mix(in srgb, var(--navy) 7%, transparent)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          width: isDrawer ? '100%' : 42,
          height: 42,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isDrawer ? 'flex-start' : 'center',
          gap: isDrawer ? 10 : 0,
          padding: isDrawer ? '0 12px' : 0,
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--navy) 10%, transparent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--navy) 7%, transparent)'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {isDrawer && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Notifications</span>
        )}
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fade-up notif-panel dropdown-panel" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: isDrawer ? 'auto' : 0, left: isDrawer ? 0 : 'auto',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, width: 320, maxHeight: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 100, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Notifications</span>
            {count > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: 'var(--blue)', fontFamily: 'inherit',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--t4)' }}>Loading…</div>
            ) : !notifications.length ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--t4)' }}>No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n._id}
                  onClick={() => handleClick(n)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    background: n.read ? 'var(--card)' : 'color-mix(in srgb, var(--navy) 6%, transparent)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--navy) 25%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'var(--card)' : 'color-mix(in srgb, var(--navy) 6%, transparent)'}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: 'var(--t4)' }}>{timeAgo(n.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
