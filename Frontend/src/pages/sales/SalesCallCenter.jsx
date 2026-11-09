import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import { PageHeader, Card, EmptyState, Avatar, Badge, Spinner, SearchInput, Btn, Pagination, fmtDateTime, toLocalDateString } from '../../components/ui';
import { getAllNotes } from '../../api/endpoints';

const TODAY    = toLocalDateString();
const PAGE_SIZE = 25;

const inputStyle = {
  padding: '7px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--t1)',
  outline: 'none', fontFamily: 'inherit', width: 155,
};

export default function SalesCallCenter() {
  usePageTitle('Call Center');
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [notes,      setNotes]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [page,       setPage]       = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });

  const debouncedSearch = useDebounce(search, 300);

  const fetchNotes = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      const res = await getAllNotes({
        page,
        limit: PAGE_SIZE,
        createdBy: user._id,
        search:   debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      });
      setNotes(res.data.notes ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [user?._id, page, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => { setPage(1); }, [debouncedSearch, dateFrom, dateTo]);

  const hasFilters = dateFrom || dateTo || search;

  return (
    <Layout>
      <PageHeader title="Call Center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search notes or members…"
          width={220}
        />
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 18px',
          display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>From Date</label>
            <input type="date" value={dateFrom} max={dateTo || TODAY}
              onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>To Date</label>
            <input type="date" value={dateTo} min={dateFrom || undefined} max={TODAY}
              onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
            {hasFilters && (
              <Btn variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); }}>
                ✕ Clear
              </Btn>
            )}
            <span style={{ fontSize: 12, color: 'var(--t4)' }}>
              {loading ? '…' : `${pagination.total} note${pagination.total !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* ── Notes list ──────────────────────────────────────── */}
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              My Notes {!loading && `(${pagination.total})`}
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spinner size="lg" />
            </div>
          ) : notes.length === 0 ? (
            <EmptyState
              icon="💬"
              message={hasFilters ? 'No notes match your filters' : 'No notes written yet'}
              sub={hasFilters ? 'Try adjusting the date range or search.' : 'Notes you add to member profiles will appear here.'}
            />
          ) : (
            <>
              <div>
                {notes.map((note, i) => (
                  <div
                    key={note._id ?? i}
                    onClick={() => navigate(`/members/${note.member?.systemId}?tab=callcenter`)}
                    style={{
                      padding: '14px 18px',
                      borderBottom: i === notes.length - 1 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Member info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <Avatar name={note.member?.name ?? '?'} size="sm" photo={note.member?.photo} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{note.member?.name ?? '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{note.member?.systemId}</span>
                      <Badge status={note.member?.status} />
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(note.createdAt)}</span>
                    </div>

                    {/* Note text */}
                    <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {note.text}
                    </p>
                  </div>
                ))}
              </div>

              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.limit ?? PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}
