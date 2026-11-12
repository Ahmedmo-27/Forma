import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, Spinner, EmptyState, Avatar } from '../../components/ui';
import { getCoachTeam } from '../../api/endpoints';

export default function CoachTargets() {
  usePageTitle('Coach Team');
  const navigate = useNavigate();

  const [team, setTeam]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCoachTeam();
      setTeam((res.data.team ?? []).filter(u => u.role === 'Coach'));
    } catch {
      toast.error('Failed to load coach data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalMembers = team.reduce((s, c) => s + (c.stats?.total ?? 0), 0);
  const totalActive = team.reduce((s, c) => s + (c.stats?.active ?? 0), 0);
  const totalPT = team.reduce((s, c) => s + (c.stats?.totalPTSessions ?? 0), 0);
  const totalUsedPT = team.reduce((s, c) => s + (c.stats?.usedPTSessions ?? 0), 0);

  return (
    <Layout>
      <PageHeader walkthrough="coach-team-header" title="Coach Team" />

      <div className="page-wrap" data-walkthrough="coach-team-board" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Coaches', value: team.length, color: 'var(--navy)', accent: 'var(--navy)' },
            { label: 'Total Members', value: totalMembers, color: 'var(--blue)', accent: 'var(--blue)' },
            { label: 'Active Members', value: totalActive, color: 'var(--green)', accent: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Coach cards */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
        ) : team.length === 0 ? (
          <EmptyState message="No coaches found" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {team.map(coach => (
              <CoachCard key={coach._id} coach={coach} onClick={() => navigate(`/coach/team/${coach._id}`)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function CoachCard({ coach, onClick }) {
  const { stats } = coach;
  const total = stats?.total ?? 0;
  const active = stats?.active ?? 0;
  const transferred = stats?.transferred ?? 0;
  const ptTotal = stats?.totalPTSessions ?? 0;
  const ptUsed = stats?.usedPTSessions ?? 0;
  const ptRemaining = ptTotal - ptUsed;
  const ptPct = ptTotal > 0 ? Math.min(100, Math.round((ptUsed / ptTotal) * 100)) : 0;

  return (
    <div onClick={onClick} style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '16px 18px',
      cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Avatar name={coach.name} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{coach.name}</div>
          <div style={{ fontSize: 11, color: 'var(--t4)' }}>{coach.email}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
        {[
          { l: 'Members', v: total, c: 'var(--navy)' },
          { l: 'Active', v: active, c: 'var(--green)' },
          { l: 'Transferred', v: transferred, c: 'var(--sky)' },
          { l: 'PT Left', v: ptRemaining, c: ptRemaining > 0 ? 'var(--green)' : 'var(--red)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--card)', padding: '8px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* PT Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600 }}>PT SESSIONS</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: ptPct >= 100 ? 'var(--red)' : 'var(--t2)' }}>
            {ptUsed} / {ptTotal} ({ptPct}% used)
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${ptPct}%`,
            background: ptPct >= 90 ? 'var(--red)' : ptPct >= 60 ? 'var(--amber)' : 'var(--green)',
            borderRadius: 3, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    </div>
  );
}
