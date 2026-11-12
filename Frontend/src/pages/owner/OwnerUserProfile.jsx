import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Spinner, Avatar, Badge,
  EmptyState, Table, fmtDate, Btn, Skeleton, Modal,
} from '../../components/ui';
import { getUserById, getSalesProfile, getCoachProfile, resetUserPassword } from '../../api/endpoints';
import UserAreaAccess from '../../components/UserAreaAccess';
import ChangeRoleField from '../../components/ChangeRoleField';
import { KeyRound, Mail, Phone } from 'lucide-react';

// ── Role badge colour map ─────────────────────────────────────────────────────
const ROLE_COLOUR = {
  'Sales':          { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Sales Manager':  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Coach':          { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  'Coach Manager':  { bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff' },
  'Accountant':     { bg: '#f0fdf4', color: '#0f766e', border: '#99f6e4' },
  'Receptionist': { bg: 'var(--slate-bg)', color: 'var(--slate)', border: 'var(--slate-bd)' },
  'General Manager': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
};

export default function OwnerUserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState(null);   // { user, stats, members }
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('members');
  const [filter, setFilter]     = useState('all');

  // Reset Password
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [newPwd,       setNewPwd]       = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [resettingPwd, setResettingPwd] = useState(false);

  usePageTitle(profile?.user?.name ?? 'User Profile');

  // ── Fetch profile ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // First get the base user to know their role
      const baseRes = await getUserById(id);
      const user = baseRes.data;

      // Then get enriched profile if available
      let enriched = { user, stats: null, members: [] };
      try {
        if (['Sales', 'Sales Manager'].includes(user.role)) {
          const r = await getSalesProfile(id);
          enriched = r.data;
        } else if (['Coach', 'Coach Manager'].includes(user.role)) {
          const r = await getCoachProfile(id);
          enriched = r.data;
        }
      } catch {
        // enriched profile not available for this role — use base user
      }

      setProfile(enriched);
    } catch {
      toast.error('Failed to load user profile.');
      navigate('/owner/teams');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  // ── Derived values ────────────────────────────────────────────────────────
  const user    = profile?.user;
  const stats   = profile?.stats;
  const members = profile?.members ?? [];

  const isSales = ['Sales', 'Sales Manager'].includes(user?.role);
  const isCoach = ['Coach', 'Coach Manager'].includes(user?.role);

  const filtered = (() => {
    if (filter === 'all') return members;
    if (isSales) return members.filter(m => m.status === filter);
    if (isCoach) return members.filter(m => m.couch_subscription_status === filter);
    return members;
  })();

  const statusFilters = isSales
    ? ['all', 'active', 'frozen', 'expired', 'guest']
    : isCoach
    ? ['all', 'active', 'transferred', 'expired', 'interested', 'not interested']
    : ['all'];

  const roleColor = ROLE_COLOUR[user?.role] ?? { bg: 'var(--bg)', color: 'var(--t2)', border: 'var(--border)' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <PageHeader walkthrough="roster-profile-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/owner/teams')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}
          >
            ← Teams
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{loading ? 'Loading…' : (user?.name ?? 'Profile')}</span>
        </div>
      }>
        {!loading && profile?.user && (
          <Btn variant="outline" size="sm" onClick={() => { setNewPwd(''); setConfirmPwd(''); setShowResetPwd(true); }}>
            <KeyRound size={14} aria-hidden /> Reset Password
          </Btn>
        )}
      </PageHeader>

      <div className="page-wrap" data-walkthrough="staff-body" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* ── Profile header ──────────────────────────────────── */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, marginBottom: stats ? 20 : 0 }}>
                <Avatar name={user?.name} size="lg" />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>
                      {user?.name}
                    </h2>

                    {/* Role badge */}
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      background: roleColor.bg, color: roleColor.color,
                      border: `1px solid ${roleColor.border}`,
                      padding: '2px 10px', borderRadius: 4,
                    }}>
                      {user?.role}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
                    {user?.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} aria-hidden /> {user.email}</span>}
                    {user?.mobile_number && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} aria-hidden /> {user.mobile_number}</span>}
                    <span>Joined {fmtDate(user?.createdAt)}</span>
                  </div>
                  <div style={{ maxWidth: 420, marginTop: 4 }}>
                    <ChangeRoleField
                      userId={id}
                      currentRole={user?.role}
                      label="Change role"
                      onChanged={() => load()}
                    />
                  </div>
                </div>
              </div>

              {/* ── Stats strip ─────────────────────────────────────── */}
              {stats && isSales && (
                <div className="grid-stats-5" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {[
                    { l: 'Total',   v: stats.total,   c: 'var(--navy)' },
                    { l: 'Active',  v: stats.active,  c: 'var(--green)' },
                    { l: 'Frozen',  v: stats.frozen,  c: 'var(--sky)' },
                    { l: 'Expired', v: stats.expired, c: 'var(--red)' },
                    { l: 'Guests',  v: stats.guests,  c: 'var(--t3)' },
                  ].map(s => (
                    <div key={s.l} style={{ background: 'var(--card)', padding: '10px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
                      <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {stats && isCoach && (
                <div className="grid-stats-5" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {[
                    { l: 'Total',       v: stats.total,            c: 'var(--navy)' },
                    { l: 'Active',      v: stats.active,           c: 'var(--green)' },
                    { l: 'Transferred', v: stats.transferred,      c: 'var(--sky)' },
                    { l: 'PT Total',    v: stats.totalPTSessions,  c: 'var(--blue)' },
                    { l: 'PT Used',     v: stats.usedPTSessions,   c: 'var(--amber)' },
                  ].map(s => (
                    <div key={s.l} style={{ background: 'var(--card)', padding: '10px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
                      <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div data-walkthrough="roster-access">
              <UserAreaAccess target={user} />
            </div>

            {/* ── Members tab (only for Sales & Coach roles) ──────── */}
            {(isSales || isCoach) && (
              <>
                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                  <button onClick={() => setTab('members')} style={{
                    padding: '8px 18px', background: 'none', border: 'none',
                    borderBottom: `2px solid ${tab === 'members' ? 'var(--navy)' : 'transparent'}`,
                    marginBottom: -1,
                    color: tab === 'members' ? 'var(--t1)' : 'var(--t3)',
                    fontSize: 13, fontWeight: tab === 'members' ? 700 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Members ({members.length})
                  </button>
                </div>

                {/* Members list */}
                <div data-walkthrough="roster-members" style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  {/* Filter + header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                      Assigned Members ({filtered.length}{filter !== 'all' ? ` of ${members.length}` : ''})
                    </span>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {statusFilters.map(s => (
                        <button key={s} onClick={() => setFilter(s)} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: filter === s ? 'var(--navy)' : '#fff',
                          border: `1px solid ${filter === s ? 'var(--navy)' : 'var(--border-md)'}`,
                          color: filter === s ? '#fff' : 'var(--t3)',
                          cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <EmptyState message="No members match this filter" />
                  ) : isSales ? (
                    <Table headers={['ID', 'Name', 'Phone', 'Status', 'Package', 'Expires']}>
                      {filtered.map(m => {
                        const sub = m.subscriptions?.at(-1);
                        return (
                          <tr key={m._id}
                            onClick={() => navigate(`/members/${m.systemId}`)}
                            style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar name={m.name} size="sm" />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{m.phones}</td>
                            <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                              {sub?.package ? `${sub.package.name} · ${sub.package.duration}` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{fmtDate(sub?.endDate)}</td>
                          </tr>
                        );
                      })}
                    </Table>
                  ) : (
                    <Table headers={['ID', 'Name', 'Coach Status', 'PT Sessions', 'PT Used']}>
                      {filtered.map(m => (
                        <tr key={m._id}
                          onClick={() => navigate(`/members/${m.systemId}`)}
                          style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={m.name} size="sm" />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge status={m.couch_subscription_status || 'guest'} />
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{m.PT_sessions || 0}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--t2)' }}>{m.used_PT_sessions || 0}</td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </div>
              </>
            )}

            {/* For roles with no member list (Receptionist, Accountant, Managers) show info */}
            {!isSales && !isCoach && (
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Name',          value: user?.name },
                    { label: 'Email',         value: user?.email },
                    { label: 'Mobile',        value: user?.mobile_number },
                    { label: 'Role',          value: user?.role },
                    { label: 'Joined',        value: fmtDate(user?.createdAt) },
                  ].map(row => (
                    <div key={row.label} style={{
                      display: 'grid', gridTemplateColumns: '140px 1fr',
                      padding: '10px 0', borderBottom: '1px solid var(--bg)', gap: 16, alignItems: 'start',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t4)' }}>{row.label}</span>
                      <span style={{ fontSize: 13, color: 'var(--t1)' }}>{row.value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      {/* ── Reset Password modal ─────────────────────────────────────── */}
      <Modal
        open={showResetPwd}
        onClose={() => !resettingPwd && setShowResetPwd(false)}
        title={`Reset Password — ${profile?.user?.name ?? ''}`}
        size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowResetPwd(false)} disabled={resettingPwd}>Cancel</Btn>
          <Btn size="sm" disabled={resettingPwd} onClick={async () => {
            if (!newPwd || newPwd.length < 6) { toast.error('Password must be at least 6 characters'); return; }
            if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return; }
            setResettingPwd(true);
            try {
              const res = await resetUserPassword(id, newPwd);
              toast.success(res.data.message);
              setShowResetPwd(false);
            } catch (e) { toast.error(e.response?.data?.message ?? 'Failed to reset password'); }
            finally { setResettingPwd(false); }
          }}>
            {resettingPwd ? <Spinner size="sm" /> : <><KeyRound size={14} aria-hidden /> Reset Password</>}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          Set a new password for <strong>{profile?.user?.name}</strong>. They will need to use this new password on their next login.
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>New Password</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 6 characters"
            style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Confirm Password</label>
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat new password"
            style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      </Modal>
    </Layout>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 14 }}>
        <Skeleton h="48px" w="48px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Skeleton h="14px" w="160px" />
          <Skeleton h="11px" w="220px" />
          <Skeleton h="11px" w="180px" />
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, height: 200 }} />
    </div>
  );
}
