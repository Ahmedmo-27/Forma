import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Pagination } from '../../components/ui';
import { getSalesTeam, getCoachTeam } from '../../api/endpoints';
import api from '../../api/axios';

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48];

const TABS = [
  { id: 'sales',        label: 'Sales' },
  { id: 'coach',        label: 'Coach' },
  { id: 'accountant',   label: 'Accountant' },
  { id: 'receptionist', label: 'Receptionist' },
];

export default function OwnerTeams() {
  usePageTitle('All Teams');
  const navigate = useNavigate();

  const [tab, setTab]               = useState('sales');
  const [salesTeam, setSalesTeam]   = useState([]);
  const [coachTeam, setCoachTeam]   = useState([]);
  const [accountants, setAccountants] = useState([]);
  const [receptionists, setReceptionists] = useState([]);
  const [loading, setLoading]       = useState(true);

  // Pagination
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('owner_teams_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stRes, ctRes, staffRes] = await Promise.allSettled([
        getSalesTeam(),
        getCoachTeam(),
        api.get('/users/receptionists'),
      ]);

      if (stRes.status === 'fulfilled') setSalesTeam(stRes.value.data.team ?? []);
      if (ctRes.status === 'fulfilled') setCoachTeam(ctRes.value.data.team ?? []);

      if (staffRes.status === 'fulfilled') {
        const all = staffRes.value.data.receptionists ?? [];
        setReceptionists(all.filter(u => u.role === 'Receptionist'));
        setAccountants(all.filter(u => u.role === 'Accountant'));
      }
    } catch {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentList = {
    sales:        salesTeam,
    coach:        coachTeam,
    accountant:   accountants,
    receptionist: receptionists,
  }[tab] ?? [];

  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return currentList.slice(start, start + pageSize);
  }, [currentList, page, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('owner_teams_page_size', String(valid));
    } catch {}
  };

  const counts = {
    sales:        salesTeam.length,
    coach:        coachTeam.length,
    accountant:   accountants.length,
    receptionist: receptionists.length,
  };

  const tabLabel = (id) => {
    const base = TABS.find(t => t.id === id)?.label ?? id;
    return `${base} (${counts[id] ?? 0})`;
  };

  return (
    <Layout>
      <PageHeader title="All Teams" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Summary strip ────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 20,
        }}>
          {TABS.map(t => (
            <div key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'var(--navy)' : 'var(--card)',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: tab === t.id ? 'rgba(255,255,255,0.6)' : 'var(--t4)', marginBottom: 4 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: tab === t.id ? '#fff' : 'var(--t1)' }}>
                {loading ? '—' : counts[t.id]}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ──────────────────────────────────────── */}
        <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(t => (
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
            >
              {tabLabel(t.id)}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spinner size="lg" />
          </div>
        ) : currentList.length === 0 ? (
          <EmptyState message={`No ${TABS.find(t => t.id === tab)?.label ?? ''} members found`} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
              {paginatedList.map(member => (
                <UserCard
                  key={member._id}
                  member={member}
                  tab={tab}
                  onClick={() => navigate(`/owner/teams/${member._id}`)}
                />
              ))}
            </div>

            <div style={{ marginTop: 16, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Pagination
                page={page}
                totalPages={totalPages}
                total={currentList.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ── User card ─────────────────────────────────────────────────────────────────
function UserCard({ member, tab, onClick }) {
  const stats = member.stats;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '16px 18px',
        cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: stats ? 14 : 0 }}>
        <Avatar name={member.name} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>{member.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--t3)',
              background: 'var(--bg)', border: '1px solid var(--border)',
              padding: '1px 7px', borderRadius: 4,
            }}>
              {member.role}
            </span>
          </div>
          {member.email && (
            <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>{member.email}</div>
          )}
          {member.mobile_number && (
            <div style={{ fontSize: 11, color: 'var(--blue)', fontFamily: 'monospace', marginTop: 2 }}>
              📞 {member.mobile_number}
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--t4)' }}>→</span>
      </div>

      {/* Sales stats */}
      {tab === 'sales' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {[
            { l: 'Active',  v: stats.active,  c: 'var(--green)' },
            { l: 'Frozen',  v: stats.frozen,  c: 'var(--sky)' },
            { l: 'Expired', v: stats.expired, c: 'var(--red)' },
            { l: 'Guests',  v: stats.guests,  c: 'var(--t3)' },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--card)', padding: '8px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
              <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coach stats */}
      {tab === 'coach' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {[
            { l: 'Members',     v: stats.total,           c: 'var(--navy)' },
            { l: 'Active',      v: stats.active,          c: 'var(--green)' },
            { l: 'PT Total',    v: stats.totalPTSessions, c: 'var(--blue)' },
            { l: 'PT Used',     v: stats.usedPTSessions,  c: 'var(--amber)' },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--card)', padding: '8px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
              <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
