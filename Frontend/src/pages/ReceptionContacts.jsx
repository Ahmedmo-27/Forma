import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, SearchInput } from '../components/ui';
import { getReceptionists } from '../api/endpoints';
import { WhatsAppBtn } from '../utils/whatsapp';
import useDebounce from '../hooks/useDebounce';

const ROLE_META = {
  'Receptionist':  { icon: '🖥️', color: '#0284c7', bg: '#f0f9ff', group: 'staff' },
  'Sales':         { icon: '💼', color: '#16a34a', bg: '#f0fdf4', group: 'staff' },
  'Coach':         { icon: '🏋️', color: '#d97706', bg: '#fffbeb', group: 'staff' },
  'Accountant':    { icon: '🧾', color: '#7c3aed', bg: '#f5f3ff', group: 'staff' },
  'Sales Manager': { icon: '👔', color: '#44298C', bg: 'rgba(68,41,140,0.08)', group: 'managers' },
  'Coach Manager': { icon: '🏅', color: '#b45309', bg: '#fef9c3', group: 'managers' },
  'Owner':         { icon: '👑', color: '#dc2626', bg: '#fef2f2', group: 'managers' },
};

const STAFF_ROLES   = ['Receptionist', 'Sales', 'Coach', 'Accountant'];
const MANAGER_ROLES = ['Sales Manager', 'Coach Manager', 'Owner'];
const ALL_ROLES     = [...STAFF_ROLES, ...MANAGER_ROLES];

function ContactCard({ person }) {
  const meta = ROLE_META[person.role] ?? { icon: '👤', color: 'var(--t3)', bg: 'var(--bg)', group: 'staff' };

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.boxShadow = `0 4px 16px ${meta.color}22`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Avatar with role color ring */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={person.name} size="lg" />
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 22, height: 22, borderRadius: '50%',
          background: meta.bg, border: `2px solid var(--card)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11,
        }}>
          {meta.icon}
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{person.name}</div>
        <span style={{
          display: 'inline-block', fontSize: 11, fontWeight: 600,
          background: meta.bg, color: meta.color,
          border: `1px solid ${meta.color}33`,
          padding: '2px 8px', borderRadius: 20, letterSpacing: '0.3px',
        }}>
          {person.role}
        </span>
      </div>

      {/* Contact actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        {person.mobile_number ? (
          <>
            <a
              href={`tel:${person.mobile_number}`}
              style={{
                fontSize: 13, fontWeight: 700, color: 'var(--t1)',
                textDecoration: 'none', fontFamily: 'monospace',
                background: 'var(--bg)', border: '1px solid var(--border)',
                padding: '8px 12px', minHeight: 44, boxSizing: 'border-box', borderRadius: 7,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.color = meta.color; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t1)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 11.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 5.99 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {person.mobile_number}
            </a>
            <WhatsAppBtn phone={person.mobile_number} size="xs" />
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--t4)', fontStyle: 'italic' }}>No number</span>
        )}
      </div>
    </div>
  );
}

export default function ReceptionContacts() {
  usePageTitle('Contacts');

  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all'); // 'all' | 'staff' | 'managers'

  const debouncedSearch = useDebounce(search, 200);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReceptionists();
      setStaff(res.data.receptionists ?? []);
    } catch {
      toast.error('Failed to load contacts');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter + search
  const filtered = staff.filter(s => {
    const meta = ROLE_META[s.role];
    if (filter === 'staff'    && meta?.group !== 'staff')    return false;
    if (filter === 'managers' && meta?.group !== 'managers') return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.mobile_number || '').includes(q)) return false;
    }
    return true;
  });

  // Sort by role order then name
  const sorted = [...filtered].sort((a, b) => {
    const ai = ALL_ROLES.indexOf(a.role);
    const bi = ALL_ROLES.indexOf(b.role);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });

  const staffCount   = staff.filter(s => ROLE_META[s.role]?.group === 'staff').length;
  const managerCount = staff.filter(s => ROLE_META[s.role]?.group === 'managers').length;

  const FilterBtn = ({ value, label, count }) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: `1px solid ${filter === value ? '#44298C' : 'var(--border)'}`,
        background: filter === value ? '#44298C' : 'transparent',
        color: filter === value ? '#fff' : 'var(--t3)',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {label}
      <span style={{
        fontSize: 11, fontWeight: 700,
        background: filter === value ? 'rgba(255,255,255,0.20)' : 'var(--bg)',
        color: filter === value ? '#fff' : 'var(--t4)',
        padding: '1px 7px', borderRadius: 10,
      }}>{count}</span>
    </button>
  );

  return (
    <Layout>
      <PageHeader title="Contacts">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or number…" width={220} />
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FilterBtn value="all"      label="All Staff"  count={staff.length} />
          <FilterBtn value="staff"    label="Staff"      count={staffCount} />
          <FilterBtn value="managers" label="Managers"   count={managerCount} />
          {(search || filter !== 'all') && (
            <button onClick={() => { setSearch(''); setFilter('all'); }} style={{
              fontSize: 12, fontWeight: 600, color: 'var(--red)',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>✕ Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t4)' }}>
            {loading ? '…' : `${sorted.length} contact${sorted.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* ── Grid ────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
        ) : sorted.length === 0 ? (
          <EmptyState icon="📞" message="No contacts found" sub="Try adjusting your search or filter." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {sorted.map(person => <ContactCard key={person._id} person={person} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}
