import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, StatCard, Spinner, Avatar, Badge, EmptyState } from '../../components/ui';
import { getAllMembers } from '../../api/endpoints';

export default function CoachDashboard() {
  usePageTitle('Coach Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Coach Manager';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    try {
      const res = await getAllMembers();
      setMembers(res.data.members ?? []);
    } catch (err) {
      // Retry once on transient Atlas connection failures
      if (attempt === 0) {
        await new Promise(res => setTimeout(res, 3000));
        return load(1);
      }
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter members that have coach subscription
  const coachMembers = isManager
    ? members.filter(m => m.current_couch || m.couch_subscription_status)
    : members.filter(m => {
        const coachId = m.current_couch?._id || m.current_couch;
        return String(coachId) === String(user?._id);
      });

  const activeCount = coachMembers.filter(m => m.couch_subscription_status === 'active').length;
  const interestedCount = coachMembers.filter(m => m.couch_subscription_status === 'interested').length;
  const totalSessions = coachMembers.reduce((s, m) => s + (m.PT_sessions || 0), 0);
  const usedSessions = coachMembers.reduce((s, m) => s + (m.used_PT_sessions || 0), 0);

  return (
    <Layout>
      <PageHeader title="Dashboard">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label="My Members" value={coachMembers.length} color="brand" onClick={() => navigate('/coach/members')} />
              <StatCard label="Active" value={activeCount} color="success" />
              <StatCard label="Interested" value={interestedCount} color="warning" />
              <StatCard label="Total Sessions" value={totalSessions} color="blue" />
              <StatCard label="Used Sessions" value={usedSessions} color="info" />
              <StatCard label="Remaining" value={totalSessions - usedSessions} color="danger" />
            </div>

            {/* Recent members */}
            <Card noPad>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>My Members ({coachMembers.length})</span>
                <span onClick={() => navigate('/coach/members')} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>View all →</span>
              </div>
              {coachMembers.length === 0 ? (
                <EmptyState icon="🏋️" message="No members assigned" sub="Members will appear here once assigned" />
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {coachMembers.slice(0, 10).map(m => (
                    <div key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar name={m.name} size="sm" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{m.systemId} · {m.PT_sessions - m.used_PT_sessions} sessions left</div>
                      </div>
                      <Badge status={m.couch_subscription_status || 'guest'} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 16 }}>
              {[
                { label: 'Session Check-in', icon: '✓', to: '/coach/checkin', access: 'coach_checkin' },
                { label: 'My Members', icon: '👥', to: '/coach/members', access: 'coach_members' },
              ].filter((c) => hasAccess(user, c.access)).map(c => (
                <button key={c.to} onClick={() => navigate(c.to)} style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '16px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{c.label}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
