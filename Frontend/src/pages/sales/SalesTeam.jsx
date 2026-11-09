import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Avatar, Badge } from '../../components/ui';
import { getSalesTeam, getReceptionistTeam } from '../../api/endpoints';

export default function SalesTeam() {
  usePageTitle('Team');
  const navigate = useNavigate();
  const [tab, setTab] = useState('sales'); // 'sales' | 'receptionists'

  const [salesTeam,    setSalesTeam]    = useState([]);
  const [receptionists, setReceptionists] = useState([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingRecp, setLoadingRecp]  = useState(true);

  const fetchSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      const res = await getSalesTeam();
      setSalesTeam(res.data.team ?? []);
    } catch { toast.error('Failed to load sales team.'); }
    finally { setLoadingSales(false); }
  }, []);

  const fetchReceptionists = useCallback(async () => {
    setLoadingRecp(true);
    try {
      const res = await getReceptionistTeam();
      setReceptionists(res.data.team ?? []);
    } catch { toast.error('Failed to load receptionists.'); }
    finally { setLoadingRecp(false); }
  }, []);

  useEffect(() => { fetchSales(); }, [fetchSales]);
  useEffect(() => { fetchReceptionists(); }, [fetchReceptionists]);

  const loading = tab === 'sales' ? loadingSales : loadingRecp;
  const team = tab === 'sales' ? salesTeam : receptionists;

  return (
    <Layout>
      <PageHeader title="Team" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {[
            { id: 'sales', label: `Sales (${salesTeam.length})` },
            { id: 'receptionists', label: `Receptionists (${receptionists.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 18px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--navy)' : 'transparent'}`,
              marginBottom: -1,
              color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t3)'; }}
            >{t.label}</button>
          ))}
        </div>

        {/* ── Sales Tab ────────────────────────────────────────── */}
        {tab === 'sales' && (
          <>
            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              {[
                { label: 'Total Members',  value: loadingSales ? '—' : salesTeam.reduce((s, u) => s + u.stats.total, 0) },
                { label: 'Sales Reps',     value: loadingSales ? '—' : salesTeam.filter(u => u.role === 'Sales').length },
                { label: 'Sales Managers', value: loadingSales ? '—' : salesTeam.filter(u => u.role === 'Sales Manager').length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--card)', padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {loadingSales ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
            ) : !salesTeam.length ? (
              <EmptyState message="No sales team members found" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                {salesTeam.map(member => (
                  <SalesCard key={member._id} member={member} onClick={() => navigate(`/sales/team/${member._id}`)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Receptionists Tab ────────────────────────────────── */}
        {tab === 'receptionists' && (
          <>
            {loadingRecp ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
            ) : !receptionists.length ? (
              <EmptyState message="No receptionists found" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                {receptionists.map(member => (
                  <ReceptionistCard key={member._id} member={member} onClick={() => navigate(`/sales/team/receptionist/${member._id}`)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Sales Card ────────────────────────────────────────────────────────────────
function SalesCard({ member, onClick }) {
  const { stats } = member;
  const pct = member.monthlyTarget > 0
    ? Math.min(100, Math.round((stats.monthlyRevenue / member.monthlyTarget) * 100))
    : null;

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
        <Avatar name={member.name} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>{member.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 4 }}>
              {member.role}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--t4)' }}>→</span>
      </div>

      {/* Stats grid */}
      <div className="grid-stats-4" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: pct !== null ? 12 : 0 }}>
        {[
          { l: 'Active',  v: stats.active,  c: 'var(--green)' },
          { l: 'Frozen',  v: stats.frozen,  c: 'var(--sky)' },
          { l: 'Expired', v: stats.expired, c: 'var(--red)' },
          { l: 'Guests',  v: stats.guests,  c: 'var(--t3)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--card)', padding: '8px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Monthly target progress */}
      {pct !== null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600 }}>MONTHLY TARGET</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pct >= 100 ? 'var(--green)' : 'var(--t2)' }}>
              EGP {stats.monthlyRevenue.toLocaleString()} / {member.monthlyTarget.toLocaleString()} ({pct}%)
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--amber)',
              borderRadius: 3, transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Receptionist Card ─────────────────────────────────────────────────────────
function ReceptionistCard({ member, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '16px 18px',
      cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={member.name} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>{member.name}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{member.email}</div>
          {member.mobile_number && (
            <div style={{ fontSize: 12, color: 'var(--blue)', fontFamily: 'monospace', marginTop: 4 }}>
              📞 {member.mobile_number}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 4 }}>
            🖥️ Receptionist
          </span>
        </div>
      </div>
    </div>
  );
}
