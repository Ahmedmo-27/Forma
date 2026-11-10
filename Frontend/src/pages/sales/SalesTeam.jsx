import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Avatar, Badge, Pagination } from '../../components/ui';
import { getSalesTeam, getReceptionistTeam } from '../../api/endpoints';

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48];

export default function SalesTeam() {
  usePageTitle('Team');
  const navigate = useNavigate();
  const [tab, setTab] = useState('sales'); // 'sales' | 'receptionists'

  const [salesTeam,    setSalesTeam]    = useState([]);
  const [receptionists, setReceptionists] = useState([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingRecp, setLoadingRecp]  = useState(true);

  // Pagination
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('team_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab]);

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

  const currentTotal = tab === 'sales' ? salesTeam.length : receptionists.length;
  const totalPages = Math.max(1, Math.ceil(currentTotal / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedSales = useMemo(() => {
    const start = (page - 1) * pageSize;
    return salesTeam.slice(start, start + pageSize);
  }, [salesTeam, page, pageSize]);

  const paginatedReceptionists = useMemo(() => {
    const start = (page - 1) * pageSize;
    return receptionists.slice(start, start + pageSize);
  }, [receptionists, page, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('team_page_size', String(valid));
    } catch {}
  };

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
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                  {paginatedSales.map(member => (
                    <SalesCard key={member._id} member={member} onClick={() => navigate(`/sales/team/${member._id}`)} />
                  ))}
                </div>

                <div style={{ marginTop: 16, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={salesTeam.length}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                  />
                </div>
              </>
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
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                  {paginatedReceptionists.map(member => (
                    <ReceptionistCard key={member._id} member={member} onClick={() => navigate(`/sales/team/receptionist/${member._id}`)} />
                  ))}
                </div>

                <div style={{ marginTop: 16, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={receptionists.length}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                  />
                </div>
              </>
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
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'rgba(68, 41, 140, 0.35)';
        e.currentTarget.style.boxShadow = '0 10px 24px -4px rgba(68, 41, 140, 0.10), 0 4px 8px -2px rgba(0, 0, 0, 0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = 'translateX(2px)';
          arrow.style.color = 'var(--navy)';
          arrow.style.background = 'rgba(68, 41, 140, 0.08)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = 'translateX(0)';
          arrow.style.color = 'var(--t4)';
          arrow.style.background = 'var(--bg)';
        }
      }}
    >
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar name={member.name} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: 'var(--t1)',
              marginBottom: 4,
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {member.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--navy)',
                background: 'rgba(68, 41, 140, 0.07)',
                border: '1px solid rgba(68, 41, 140, 0.16)',
                padding: '2px 8px',
                borderRadius: 999,
                letterSpacing: '0.2px',
              }}>
                {member.role}
              </span>
            </div>
          </div>

          <div
            className="card-chevron"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--t4)',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>

        {/* Stats panel */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: 'var(--bg)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {[
            { l: 'Active',  v: stats.active,  c: 'var(--green)' },
            { l: 'Frozen',  v: stats.frozen,  c: 'var(--sky)' },
            { l: 'Expired', v: stats.expired, c: 'var(--red)' },
            { l: 'Guests',  v: stats.guests,  c: 'var(--slate)' },
          ].map((s, idx) => (
            <div
              key={s.l}
              style={{
                padding: '8px 2px',
                textAlign: 'center',
                borderRight: idx < 3 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                fontSize: 15.5,
                fontWeight: 800,
                color: s.c,
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {s.v ?? 0}
              </div>
              <div style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: 'var(--t4)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginTop: 3,
              }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly target progress */}
      {pct !== null && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Monthly Target
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>
                EGP {stats.monthlyRevenue.toLocaleString()}
                <span style={{ color: 'var(--t4)', fontWeight: 500, fontSize: 10.5 }}> / {member.monthlyTarget.toLocaleString()}</span>
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 999,
                background: pct >= 100 ? 'var(--green-bg)' : pct >= 50 ? 'rgba(68,41,140,0.08)' : 'var(--amber-bg)',
                color: pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--navy)' : 'var(--amber)',
                border: `1px solid ${pct >= 100 ? 'var(--green-bd)' : pct >= 50 ? 'rgba(68,41,140,0.2)' : 'var(--amber-bd)'}`,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {pct}%
              </span>
            </div>
          </div>

          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, pct))}%`,
              background: pct >= 100
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : pct >= 50
                  ? 'linear-gradient(90deg, #6366f1, var(--navy))'
                  : 'linear-gradient(90deg, #f59e0b, #d97706)',
              borderRadius: 999,
              transition: 'width 0.4s ease',
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
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'rgba(22, 163, 74, 0.35)';
        e.currentTarget.style.boxShadow = '0 10px 24px -4px rgba(22, 163, 74, 0.10), 0 4px 8px -2px rgba(0, 0, 0, 0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = 'translateX(2px)';
          arrow.style.color = 'var(--green)';
          arrow.style.background = 'var(--green-bg)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = 'translateX(0)';
          arrow.style.color = 'var(--t4)';
          arrow.style.background = 'var(--bg)';
        }
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Avatar name={member.name} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: 'var(--t1)',
              marginBottom: 4,
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {member.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--green)',
                background: 'var(--green-bg)',
                border: '1px solid var(--green-bd)',
                padding: '2px 8px',
                borderRadius: 999,
                letterSpacing: '0.2px',
              }}>
                Receptionist
              </span>
            </div>
          </div>

          <div
            className="card-chevron"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--t4)',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>

        {/* Contact details */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 6,
        }}>
          {member.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email}</span>
            </div>
          )}
          {member.mobile_number && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--navy)', fontWeight: 600 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span style={{ fontFamily: 'monospace' }}>{member.mobile_number}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
