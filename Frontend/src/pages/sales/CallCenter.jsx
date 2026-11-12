import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, SearchInput, EmptyState, Avatar, Badge, Spinner, fmtDateTime, Pagination } from '../../components/ui';
import { getAllNotes, getSalesUsers } from '../../api/endpoints';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function CallCenter() {
  usePageTitle('Call Center');
  const navigate = useNavigate();

  const [notes,      setNotes]      = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [salesFilter, setSalesFilter] = useState('all');
  const [authorSearch, setAuthorSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('callcenter_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: DEFAULT_PAGE_SIZE });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const debouncedSearch = useDebounce(search, 300);

  const fetchSalesUsers = useCallback(async () => {
    try {
      const salesRes = await getSalesUsers();
      setSalesUsers(salesRes.data.salesUsers ?? []);
    } catch {
      toast.error('Failed to load sales users.');
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllNotes({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        createdBy: salesFilter !== 'all' ? salesFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      });
      setNotes(res.data.notes ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: pageSize });
    } catch {
      toast.error('Failed to load notes.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, salesFilter, dateFrom, dateTo]);

  useEffect(() => { fetchSalesUsers(); }, [fetchSalesUsers]);
  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => { setPage(1); }, [debouncedSearch, salesFilter, dateFrom, dateTo, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('callcenter_page_size', String(valid));
    } catch {
      // ignore
    }
  };

  const filteredAuthors = useMemo(() => {
    if (!authorSearch.trim()) return salesUsers;
    const q = authorSearch.toLowerCase();
    return salesUsers.filter(u => u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
  }, [salesUsers, authorSearch]);

  return (
    <Layout>
      <PageHeader walkthrough="manager-calls-header" title="Call Center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search notes, members, authors…"
          width={260}
        />
      </PageHeader>

      <div className="page-wrap" data-walkthrough="manager-calls-board" style={{ paddingTop: 20, paddingBottom: 32 }}>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {[
            { label: 'Total Notes', value: pagination.total },
            { label: 'On This Page', value: notes.length },
            { label: 'Contributors', value: salesUsers.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{loading && s.label !== 'Contributors' ? '—' : s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid-sidebar">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 16 }}>

            {/* Date range filter */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Filter by Date
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={e => setDateFrom(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 10px', fontSize: 12,
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--bg)', color: 'var(--t1)',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>To</label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={e => setDateTo(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 10px', fontSize: 12,
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--bg)', color: 'var(--t1)',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                    style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--red)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit', padding: 0,
                    }}
                  >
                    ✕ Clear dates
                  </button>
                )}
              </div>
            </div>

            {/* Author filter */}
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid var(--border)',
                fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)',
              }}>
                <span>Filter by Author ({salesUsers.length})</span>
                {salesFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSalesFilter('all')}
                    style={{
                      background: 'none', border: 'none', color: 'var(--blue)', fontSize: 11,
                      fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>

              {salesUsers.length > 5 && (
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                  <input
                    type="text"
                    placeholder="Search author…"
                    value={authorSearch}
                    onChange={e => setAuthorSearch(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px', fontSize: 11,
                      border: '1px solid var(--border)', borderRadius: 5,
                      background: 'var(--bg)', color: 'var(--t1)', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <button
                  onClick={() => setSalesFilter('all')}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                    borderLeft: salesFilter === 'all' ? '3px solid var(--navy)' : '3px solid transparent',
                    background: salesFilter === 'all' ? 'color-mix(in srgb, var(--navy) 10%, transparent)' : 'var(--card)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (salesFilter !== 'all') e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (salesFilter !== 'all') e.currentTarget.style.background = 'var(--card)'; }}
                >
                  <span style={{ fontSize: 12, fontWeight: salesFilter === 'all' ? 700 : 500, color: salesFilter === 'all' ? 'var(--navy)' : 'var(--t1)' }}>All Authors</span>
                  {salesFilter === 'all' && <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 800 }}>✓</span>}
                </button>

                {filteredAuthors.map((u, idx) => {
                  const isActive = salesFilter === String(u._id);
                  const isLast = idx === filteredAuthors.length - 1;
                  return (
                    <button
                      key={u._id}
                      onClick={() => setSalesFilter(String(u._id))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', border: 'none',
                        borderBottom: isLast ? 'none' : '1px solid var(--border)',
                        borderLeft: isActive ? '3px solid var(--navy)' : '3px solid transparent',
                        background: isActive ? 'color-mix(in srgb, var(--navy) 10%, transparent)' : 'var(--card)',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--card)'; }}
                    >
                      <Avatar name={u.name} size="sm" />
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 600,
                          color: isActive ? 'var(--navy)' : 'var(--t1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {u.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t4)' }}>{u.role}</div>
                      </div>
                      {isActive && <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 800 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            {loading ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Spinner size="lg" />
              </div>
            ) : !notes.length ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <EmptyState message="No notes match your filters" sub="Try a different search term or select a different sales rep." />
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                    {pagination.total} note{pagination.total !== 1 ? 's' : ''}
                    {salesFilter !== 'all' && ` by ${salesUsers.find(u => String(u._id) === salesFilter)?.name ?? ''}`}
                    {debouncedSearch && ` matching "${debouncedSearch}"`}
                  </span>
                  {(salesFilter !== 'all' || search || dateFrom || dateTo) && (
                    <Btn variant="ghost" size="xs" onClick={() => { setSalesFilter('all'); setSearch(''); setDateFrom(''); setDateTo(''); }}>
                      Clear filters
                    </Btn>
                  )}
                </div>

                <div>
                  {notes.map((note, i) => (
                    <NoteRow
                      key={`${note.member?._id ?? "member"}-${note._id ?? "note"}-${i}`}
                      note={note}
                      onMemberClick={() => navigate(`/members/${note.member?.systemId}`)}
                      isLast={i === notes.length - 1}
                    />
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
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function NoteRow({ note, onMemberClick, isLast }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={note.createdBy?.name ?? '?'} size="sm" />
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>
              {note.createdBy?.name ?? '—'}
            </span>
            <span style={{
              marginLeft: 7, fontSize: 10, fontWeight: 600,
              color: 'var(--t3)', background: 'var(--bg)',
              border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 3,
            }}>
              {note.createdBy?.role ?? '—'}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(note.createdAt)}</span>
      </div>

      <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>
        {note.text}
      </p>

      {note.member && (
        <button
          onClick={onMemberClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 5,
            background: 'var(--bg)', border: '1px solid var(--border)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', fontFamily: 'monospace' }}>
            #{note.member.systemId}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>
            {note.member.name}
          </span>
          <Badge status={note.member.status} />
          <span style={{ fontSize: 10, color: 'var(--t4)' }}>View →</span>
        </button>
      )}
    </div>
  );
}
