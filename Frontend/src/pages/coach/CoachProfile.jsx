import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Table, Badge, Spinner,
  EmptyState, Avatar, fmtDate, Skeleton,
} from '../../components/ui';
import { getCoachProfile, updateCoachRepAbilities } from '../../api/endpoints';
import { ClipboardList, Dumbbell, MessageCircle, RefreshCw } from 'lucide-react';

// ── Abilities config ──────────────────────────────────────────────────────────
const ABILITIES = [
  { key: 'canCommentOnMembers',  label: 'Comment on Members',  desc: 'Can add notes to member profiles', icon: MessageCircle },
  { key: 'canRequestAssignment', label: 'Request Assignment',  desc: 'Can request to be assigned to members', icon: ClipboardList },
  { key: 'canRequestTakeover',   label: 'Request Takeover',    desc: 'Can request to take over members from other coaches', icon: RefreshCw },
];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--blue)' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.18s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'left 0.18s',
      }} />
    </button>
  );
}

export default function CoachProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileTab = searchParams.get('tab');
  const { user: currentUser } = useAuth();
  const isManager = currentUser?.role === 'Head Coach';

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState(profileTab === 'access' ? 'access' : 'members');
  const [filter, setFilter]   = useState('all');
  const [savingAbility, setSavingAbility] = useState(null);

  usePageTitle(data?.user?.name ?? 'Coach Profile');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCoachProfile(id);
      setData(res.data);
    } catch {
      toast.error('Failed to load profile.');
      navigate(-1);
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (profileTab !== 'members' && profileTab !== 'access') return undefined;
    const frame = requestAnimationFrame(() => setTab(profileTab));
    return () => cancelAnimationFrame(frame);
  }, [profileTab]);

  const handleToggleAbility = async (key, value) => {
    setData(prev => ({
      ...prev,
      user: { ...prev.user, abilities: { ...(prev.user.abilities ?? {}), [key]: value } },
    }));
    setSavingAbility(key);
    try {
      await updateCoachRepAbilities(id, { [key]: value });
      toast.success('Permission updated');
    } catch (e) {
      setData(prev => ({
        ...prev,
        user: { ...prev.user, abilities: { ...(prev.user.abilities ?? {}), [key]: !value } },
      }));
      toast.error(e.response?.data?.message || 'Failed to update permission');
    } finally { setSavingAbility(null); }
  };

  const user = data?.user;
  const stats = data?.stats;
  const members = data?.members ?? [];
  const filtered = filter === 'all' ? members : members.filter(m => m.couch_subscription_status === filter);

  const ptTotal = stats?.totalPTSessions ?? 0;
  const ptUsed = stats?.usedPTSessions ?? 0;

  return (
    <Layout>
      <PageHeader walkthrough="coach-profile-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/coach/team')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}>
            ← Team
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{loading ? 'Loading…' : (user?.name ?? 'Profile')}</span>
        </div>
      } />

      <div className="page-wrap" data-walkthrough="staff-body" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? <ProfileSkeleton /> : (
          <>
            {/* Profile header */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                <Avatar name={user?.name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{user?.name}</h2>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Dumbbell size={12} aria-hidden /> Coach
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                    {user?.email && <span>{user.email}</span>}
                    <span>Joined {fmtDate(user?.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid-stats-5" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {[
                  { l: 'Total',       v: stats?.total ?? 0,       c: 'var(--navy)' },
                  { l: 'Active',      v: stats?.active ?? 0,      c: 'var(--green)' },
                  { l: 'Transferred', v: stats?.transferred ?? 0, c: 'var(--sky)' },
                  { l: 'PT Used',     v: ptUsed,                  c: 'var(--amber)' },
                  { l: 'PT Total',    v: ptTotal,                 c: 'var(--blue)' },
                ].map(s => (
                  <div key={s.l} style={{ background: 'var(--card)', padding: '10px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[
                { id: 'members', label: `Members (${members.length})` },
                ...(isManager ? [{ id: 'access', label: 'Access Control' }] : []),
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '8px 18px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${tab === t.id ? 'var(--navy)' : 'transparent'}`,
                  marginBottom: -1,
                  color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
                  fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
                  onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
                  onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t3)'; }}
                >{t.label}</button>
              ))}
            </div>

            {/* Members tab */}
            {tab === 'members' && (
              <div data-walkthrough="coach-profile-members">
              <Card noPad>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                    Assigned Members ({filtered.length})
                  </span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['all', 'active', 'transferred', 'expired', 'interested', 'not interested'].map(s => (
                      <button key={s} onClick={() => setFilter(s)} style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: filter === s ? 'var(--navy)' : 'var(--card)',
                        border: `1px solid ${filter === s ? 'var(--navy)' : 'var(--border-md)'}`,
                        color: filter === s ? '#fff' : 'var(--t3)',
                        cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
                {!filtered.length ? (
                  <EmptyState message="No members match this filter" />
                ) : (
                  <Table headers={['ID', 'Name', 'Status', 'PT Sessions', 'PT Used']}>
                    {filtered.map(m => (
                      <tr key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
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
                        <td style={{ padding: '10px 14px' }}><Badge status={m.couch_subscription_status || 'guest'} /></td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{m.PT_sessions || 0}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--t2)' }}>{m.used_PT_sessions || 0}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              </div>
            )}

            {/* Access Control tab */}
            {tab === 'access' && isManager && (
              <div data-walkthrough="coach-profile-abilities">
              <Card>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                    Access Permissions
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>
                    Control what <strong>{user?.name}</strong> is allowed to do. Changes take effect immediately.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {ABILITIES.map(ability => {
                    const active = user?.abilities?.[ability.key] !== false;
                    const isSaving = savingAbility === ability.key;
                    const AbilityIcon = ability.icon;
                    return (
                      <div key={ability.key} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        background: 'var(--card)', padding: '14px 16px',
                      }}>
                        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--t2)' }}><AbilityIcon size={20} aria-hidden /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>
                            {ability.label}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--t4)' }}>{ability.desc}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--green)' : 'var(--red)' }}>
                            {active ? 'Enabled' : 'Disabled'}
                          </span>
                          {isSaving
                            ? <Spinner size="sm" />
                            : <Toggle checked={active} onChange={val => handleToggleAbility(ability.key, val)} />
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function ProfileSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 14 }}>
        <Skeleton h="48px" w="48px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Skeleton h="14px" w="160px" />
          <Skeleton h="11px" w="220px" />
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, height: 220 }} />
    </div>
  );
}
