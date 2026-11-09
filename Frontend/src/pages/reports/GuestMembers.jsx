import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, EmptyState, Badge, fmtDate, Avatar, toLocalDateString, parseDateBoundary } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { getAllMembers, getSalesUsers, getCoachTeam } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';

const TODAY      = toLocalDateString();
const MONTH_START = toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const SOURCES = ['All', 'Social media', 'Walk in', 'Word of mouth', 'referral', 'sales call', 'data entry', 'others'];

// ── small label + control row ─────────────────────────────────────────────────
function FilterRow({ label, required, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <label style={{
        width: 110, flexShrink: 0,
        fontSize: 13, fontWeight: 600, color: 'var(--t2)',
      }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      <div style={{ flex: '1 1 220px', maxWidth: 380 }}>{children}</div>
    </div>
  );
}

const selectStyle = {
  width: '100%', padding: '9px 32px 9px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', fontFamily: 'inherit',
};

export default function GuestMembers() {
  usePageTitle('Guest Members Report');
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── filter state ──────────────────────────────────────────────────────────
  const [salesMan,     setSalesMan]     = useState('All');
  const [fromDate,     setFromDate]     = useState(MONTH_START);
  const [toDate,       setToDate]       = useState(TODAY);
  const [trainerName,  setTrainerName]  = useState('All');
  const [source,       setSource]       = useState('All');

  // ── data state ────────────────────────────────────────────────────────────
  const [salesUsers,   setSalesUsers]   = useState([]);
  const [coaches,      setCoaches]      = useState([]);
  const [results,      setResults]      = useState([]);
  const [searched,     setSearched]     = useState(false);
  const [loading,      setLoading]      = useState(false);

  // ── load sales + coach lists for dropdowns ────────────────────────────────
  useEffect(() => {
    // Sales reps only see themselves in the Sales Man dropdown
    if (user?.role === 'Sales') {
      setSalesUsers([{ _id: user._id, name: user.name }]);
      setSalesMan(user._id);
    } else {
      getSalesUsers()
        .then(r => setSalesUsers(r.data.salesUsers ?? []))
        .catch(() => {});
    }
    getCoachTeam()
      .then(r => {
        const coaches = (r.data.team ?? []).filter(u => ['Coach', 'Coach Manager'].includes(u.role));
        setCoaches(coaches);
      })
      .catch(() => {});
  }, [user]);

  // ── search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = { status: 'guest', limit: 1000, page: 1 };
      if (salesMan !== 'All') params.assignedSales = salesMan;

      const res = await getAllMembers(params);
      let members = res.data.members ?? [];

      // Client-side filters
      const from = parseDateBoundary(fromDate, false);
      const to   = parseDateBoundary(toDate, true);

      members = members.filter(m => {
        const created = new Date(m.createdAt);
        if (from && created < from) return false;
        if (to   && created > to)   return false;
        if (trainerName !== 'All') {
          const coachId = m.current_couch?._id ?? m.current_couch;
          if (String(coachId) !== trainerName) return false;
        }
        if (source !== 'All' && String(m.source).toLowerCase() !== source.toLowerCase()) return false;
        return true;
      });

      setResults(members);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [salesMan, fromDate, toDate, trainerName, source]);

  return (
    <Layout>
      <PageHeader title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            ← Reports
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>Guest Members</span>
        </div>
      } />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter card ──────────────────────────────────────── */}
        <Card>
          {/* Section heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Guest Members</span>
          </div>

          {/* Filters */}
          <div style={{ maxWidth: 520 }}>
            {/* Sales Man */}
            <FilterRow label="Sales Man">
              <div style={{ position: 'relative' }}>
                <select value={salesMan} onChange={e => setSalesMan(e.target.value)} style={selectStyle}>
                  <option value="All">All</option>
                  {salesUsers.map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </FilterRow>

            {/* From Date */}
            <FilterRow label="From Date" required>
              <input type="date" value={fromDate} max={toDate || TODAY}
                onChange={e => setFromDate(e.target.value)} style={inputStyle} />
            </FilterRow>

            {/* To Date */}
            <FilterRow label="To Date" required>
              <input type="date" value={toDate} min={fromDate} max={TODAY}
                onChange={e => setToDate(e.target.value)} style={inputStyle} />
            </FilterRow>

            {/* Trainer Name */}
            <FilterRow label="Trainer Name">
              <div style={{ position: 'relative' }}>
                <select value={trainerName} onChange={e => setTrainerName(e.target.value)} style={selectStyle}>
                  <option value="All">All</option>
                  {coaches.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </FilterRow>

            {/* Source */}
            <FilterRow label="Source">
              <div style={{ position: 'relative' }}>
                <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </FilterRow>
          </div>

          {/* Search button */}
          <div style={{ marginTop: 8 }}>
            <Btn onClick={handleSearch} disabled={loading} size="md">
              {loading ? <><Spinner size="sm" /> Searching…</> : 'Search'}
            </Btn>
          </div>
        </Card>

        {/* ── Results ─────────────────────────────────────────── */}
        {searched && (
          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                Results
              </span>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>
                {loading ? '…' : `${results.length} guest${results.length !== 1 ? 's' : ''} found`}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
                <Spinner size="lg" />
              </div>
            ) : results.length === 0 ? (
              <EmptyState icon="👥" message="No guests found" sub="Try adjusting your filters." />
            ) : (
              <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Name', 'Phone', 'Source', 'Sales Rep', 'Coach', 'Date Added'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((m, i) => (
                      <tr
                        key={m._id}
                        className="tbl-row"
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => navigate(`/members/${m.systemId}`)}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                          #{m.systemId}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={m.name} size="sm" photo={m.photo} />
                            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 12 }}>
                          {m.phones || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t3)' }}>
                          {m.source || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>
                          {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>
                          {m.current_couch?.name ?? '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {fmtDate(m.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

      </div>
    </Layout>
  );
}
