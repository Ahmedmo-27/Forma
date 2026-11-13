import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, EmptyState, Avatar, Badge, SearchInput, Btn, Pagination, fmtDateTime, toLocalDateString, CardListSkeleton } from '../../components/ui';
import { getAllNotes } from '../../api/endpoints';
import { MessageCircle, X } from 'lucide-react';

const TODAY = toLocalDateString();
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

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
  const [pageSize,   setPageSize]   = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('sales_callcenter_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: DEFAULT_PAGE_SIZE });

  const debouncedSearch = useDebounce(search, 300);

  const fetchNotes = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      const res = await getAllNotes({
        page,
        limit: pageSize,
        createdBy: user._id,
        search:   debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      });
      setNotes(res.data.notes ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: pageSize });
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [user?._id, page, pageSize, debouncedSearch, dateFrom, dateTo]);

  useLocationEffect(() => { fetchNotes(); }, [fetchNotes]);
  useLocationEffect(() => { setPage(1); }, []);
  useEffect(() => { setPage(1); }, [debouncedSearch, dateFrom, dateTo, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('sales_callcenter_page_size', String(valid));
    } catch {
      // ignore
    }
  };

  const hasFilters = dateFrom || dateTo || search;

  return (
    <Layout>
      <PageHeader walkthrough="my-calls-header" title="Call Center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search notes or members…"
          width={220}
        />
      </PageHeader>

      <div className="page-wrap" data-walkthrough="my-calls-board" style={{ paddingTop: 20, paddingBottom: 32 }}>

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
                <X size={14} aria-hidden /> Clear
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
            <div style={{ padding: 16 }}>
              <CardListSkeleton rows={6} />
            </div>
          ) : notes.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
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
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}
