import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, EmptyState, Badge, fmtDate, Avatar } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { getAllMembers, getSalesUsers, getCoachTeam, getPackages } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';

const TODAY       = new Date().toISOString().slice(0, 10);
const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

// ── Reusable filter row ───────────────────────────────────────────────────────
function FilterRow({ label, required, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <label style={{ width: 120, flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      <div style={{ flex: 1, maxWidth: 380 }}>{children}</div>
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

export default function ExpiredMembers() {
  usePageTitle('Members');
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── filters ───────────────────────────────────────────────────────────────
  const [fromDate,    setFromDate]    = useState(MONTH_START);
  const [toDate,      setToDate]      = useState(TODAY);
  const [salesMan,    setSalesMan]    = useState('All');
  const [trainerName, setTrainerName] = useState('All');
  const [packageId,   setPackageId]   = useState('All');
  const [type,        setType]        = useState('All');
  const [status,      setStatus]      = useState('All');
  const [categories,  setCategories]  = useState('All');
  const [gender,      setGender]      = useState('All');

  // ── dropdown data ─────────────────────────────────────────────────────────
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches,    setCoaches]    = useState([]);
  const [packages,   setPackages]   = useState([]);

  // ── results ───────────────────────────────────────────────────────────────
  const [results,   setResults]   = useState([]);
  const [searched,  setSearched]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  // ── load dropdowns ────────────────────────────────────────────────────────
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
      .then(r => setCoaches((r.data.team ?? []).filter(u => ['Coach', 'Coach Manager'].includes(u.role))))
      .catch(() => {});
    getPackages({ limit: 200 })
      .then(r => setPackages(r.data.packages ?? []))
      .catch(() => {});
  }, [user]);

  // ── search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      // Fetch expired members (and frozen/active if status filter changes)
      const statusParam = status === 'All' ? 'expired' : status;
      const params = { status: statusParam, limit: 2000, page: 1 };
      if (salesMan !== 'All') params.assignedSales = salesMan;

      const res  = await getAllMembers(params);
      let members = res.data.members ?? [];

      const from = fromDate ? new Date(fromDate) : null;
      const to   = toDate   ? new Date(toDate + 'T23:59:59') : null;

      members = members.filter(m => {
        // Date filter — on subscription end date (for expired)
        const lastSub = m.subscriptions?.at(-1);
        const endDate = lastSub?.endDate ? new Date(lastSub.endDate) : null;
        if (from && endDate && endDate < from) return false;
        if (to   && endDate && endDate > to)   return false;

        // Trainer filter
        if (trainerName !== 'All') {
          const coachId = m.current_couch?._id ?? m.current_couch;
          if (String(coachId) !== trainerName) return false;
        }

        // Package filter
        if (packageId !== 'All') {
          const pkg = lastSub?.package?._id ?? lastSub?.package;
          if (String(pkg) !== packageId) return false;
        }

        // Type filter (activityType)
        if (type !== 'All') {
          const snap = lastSub?.packageSnapshot ?? lastSub?.package;
          if (snap?.activityType !== type) return false;
        }

        // Gender filter
        if (gender !== 'All' && m.gender !== gender) return false;

        return true;
      });

      setResults(members);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, salesMan, trainerName, packageId, type, status, categories, gender]);

  const ACTIVITY_TYPES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];

  return (
    <Layout>
      <PageHeader title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            ← Reports
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>Members</span>
        </div>
      } />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter card ──────────────────────────────────────── */}
        <Card>
          {/* Heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Members</span>
          </div>

          <div style={{ maxWidth: 540 }}>

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

            {/* Sales Man */}
            <FilterRow label="Sales Man">
              <select value={salesMan} onChange={e => setSalesMan(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </FilterRow>

            {/* Trainer Name */}
            <FilterRow label="Trainer Name">
              <select value={trainerName} onChange={e => setTrainerName(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                {coaches.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </FilterRow>

            {/* Package */}
            <FilterRow label="Package">
              <select value={packageId} onChange={e => setPackageId(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                {packages.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </FilterRow>

            {/* Type (activity type) */}
            <FilterRow label="Type">
              <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </FilterRow>

            {/* Status */}
            <FilterRow label="Status">
              <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                <option value="expired">Expired</option>
                <option value="active">Active</option>
                <option value="frozen">Frozen</option>
              </select>
            </FilterRow>

            {/* Categories */}
            <FilterRow label="Categories">
              <select value={categories} onChange={e => setCategories(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                <option value="Primary Membership">Primary Membership</option>
                <option value="PT">PT Sessions</option>
              </select>
            </FilterRow>

            {/* Male / Female */}
            <FilterRow label="Male / Female">
              <select value={gender} onChange={e => setGender(e.target.value)} style={selectStyle}>
                <option value="All">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </FilterRow>

          </div>

          {/* Search */}
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
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Results</span>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>
                {loading ? '…' : `${results.length} member${results.length !== 1 ? 's' : ''} found`}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
                <Spinner size="lg" />
              </div>
            ) : results.length === 0 ? (
              <EmptyState icon="📅" message="No members found" sub="Try adjusting your filters." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Name', 'Phone', 'Package', 'Expired', 'Sales Rep', 'Trainer', 'Renewal', 'Gender'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(m => {
                      const lastSub = m.subscriptions?.at(-1);
                      const pkg = lastSub?.packageSnapshot ?? lastSub?.package;
                      return (
                        <tr key={m._id} className="tbl-row"
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => navigate(`/members/${m.systemId}`)}>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={m.name} size="sm" photo={m.photo} />
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                                {m.memberId && <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>M{m.memberId}</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 12 }}>{m.phones || '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{pkg?.name ?? '—'}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {lastSub?.endDate
                              ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtDate(lastSub.endDate)}</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.current_couch?.name ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {lastSub?.isRenewal
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-bd)', padding: '2px 8px', borderRadius: 5 }}>ON</span>
                              : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 5 }}>OFF</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t3)', textTransform: 'capitalize' }}>{m.gender ?? '—'}</td>
                        </tr>
                      );
                    })}
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
