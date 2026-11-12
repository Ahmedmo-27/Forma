import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, SearchInput, Pagination } from '../components/ui';
import { getReceptionists } from '../api/endpoints';
import { WhatsAppBtn } from '../utils/whatsapp';
import useDebounce from '../hooks/useDebounce';

const ROLE_META = {
  'Receptionist':    { icon: '🖥️', color: '#0284c7', bg: '#f0f9ff', group: 'staff' },
  'Sales':           { icon: '💼', color: '#16a34a', bg: '#f0fdf4', group: 'staff' },
  'Coach':           { icon: '🏋️', color: '#d97706', bg: '#fffbeb', group: 'staff' },
  'Accountant':      { icon: '🧾', color: '#7c3aed', bg: '#f5f3ff', group: 'staff' },
  'Sales Manager':   { icon: '👔', color: 'var(--navy)', bg: 'color-mix(in srgb, var(--navy) 8%, transparent)', group: 'managers' },
  'Coach Manager':   { icon: '🏅', color: '#b45309', bg: '#fef9c3', group: 'managers' },
  'General Manager': { icon: '🏢', color: '#0f766e', bg: '#f0fdfa', group: 'managers' },
  'Owner':           { icon: '👑', color: '#dc2626', bg: '#fef2f2', group: 'managers' },
};

const STAFF_ROLES   = ['Receptionist', 'Sales', 'Coach', 'Accountant'];
const MANAGER_ROLES = ['General Manager', 'Sales Manager', 'Coach Manager', 'Owner'];
const ALL_ROLES     = [...STAFF_ROLES, ...MANAGER_ROLES];

function ContactCard({ person }) {
  const meta = ROLE_META[person.role] ?? { icon: '👤', color: 'var(--t3)', bg: 'var(--bg)', group: 'staff' };

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = meta.color;
        e.currentTarget.style.boxShadow = `0 4px 16px ${meta.color}22`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Top Header: Avatar + Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={person.name} size="lg" />
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: meta.bg,
              border: '2px solid var(--card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            {meta.icon}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--t1)',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={person.name}
          >
            {person.name}
          </div>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 600,
              background: meta.bg,
              color: meta.color,
              border: `1px solid ${meta.color}33`,
              padding: '2px 8px',
              borderRadius: 20,
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            {person.role}
          </span>
        </div>
      </div>

      {/* Bottom Action Row: Phone & WhatsApp */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {person.mobile_number ? (
          <>
            <a
              href={`tel:${person.mobile_number}`}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--t1)',
                textDecoration: 'none',
                fontFamily: 'monospace',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                padding: '0 10px',
                height: 34,
                boxSizing: 'border-box',
                borderRadius: 7,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.12s',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = meta.color;
                e.currentTarget.style.color = meta.color;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--t1)';
              }}
              title={`Call ${person.mobile_number}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 11.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 5.99 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.mobile_number}</span>
            </a>
            <WhatsAppBtn phone={person.mobile_number} size="xs" />
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--t4)', fontStyle: 'italic', padding: '6px 0' }}>
            No contact number
          </span>
        )}
      </div>
    </div>
  );
}

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48];

export default function ReceptionContacts() {
  usePageTitle('Contacts');

  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all'); // 'all' | 'staff' | 'managers'

  // Pagination state
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('contacts_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

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

  // Reset page to 1 whenever search or filter changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

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
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ai = ALL_ROLES.indexOf(a.role);
      const bi = ALL_ROLES.indexOf(b.role);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  // Paginated contacts slice
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedStaff = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('contacts_page_size', String(valid));
    } catch {
      // ignore
    }
  };

  const staffCount   = staff.filter(s => ROLE_META[s.role]?.group === 'staff').length;
  const managerCount = staff.filter(s => ROLE_META[s.role]?.group === 'managers').length;

  const FilterBtn = ({ value, label, count }) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: `1px solid ${filter === value ? 'var(--navy)' : 'var(--border)'}`,
        background: filter === value ? 'var(--navy)' : 'transparent',
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
      <PageHeader walkthrough="contacts-header" title="Contacts">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or number…" width={220} />
      </PageHeader>

      <div className="page-wrap" data-walkthrough="contacts-board" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>

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
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              {paginatedStaff.map(person => <ContactCard key={person._id} person={person} />)}
            </div>

            {/* ── Pagination ── */}
            <div style={{ marginTop: 8, background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Pagination
                page={page}
                totalPages={totalPages}
                total={sorted.length}
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
