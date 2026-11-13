import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, CardHeader, Table, Badge, Btn, Spinner, EmptyState,
  SearchInput, Avatar, Select, Input, Pagination, formatSystemId, MenuSelect,
} from '../../components/ui';
import { getAllMembers, getSalesUsers, bulkTransferSalesReps, switchSalesRep } from '../../api/endpoints';

const PAGE_SIZE = 25;

export default function Transfer() {
  usePageTitle('Transfer');

  const [members, setMembers]       = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [transferring, setTransferring] = useState(false);

  const [search, setSearch]         = useState('');
  const [repFilter, setRepFilter]   = useState('all');
  const [page, setPage]             = useState(1);
  const [_pagination, _setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [transferTo, setTransferTo] = useState('');
  const [selectCountInput, setSelectCountInput] = useState('');
  const [selectCountOrder, setSelectCountOrder] = useState('first');

  const [quickId, setQuickId]       = useState('');
  const [quickTo, setQuickTo]       = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllMembers({ all: 'true' });
      setMembers(res.data.members ?? []);
    } catch {
      toast.error('Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSalesUsers = useCallback(async () => {
    try {
      const sRes = await getSalesUsers();
      setSalesUsers(sRes.data.salesUsers ?? []);
    } catch {
      toast.error('Failed to load sales users.');
    }
  }, []);

  useEffect(() => { fetchSalesUsers(); }, [fetchSalesUsers]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [repFilter, debouncedSearch]);

  // Client-side filtering
  const filtered = members.filter(m => {
    if (repFilter === 'unassigned') {
      if (m.assignedSales) return false;
    } else if (repFilter !== 'all') {
      const repId = m.assignedSales?._id || m.assignedSales;
      if (String(repId) !== repFilter) return false;
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase().trim();
      const sId = String(m.systemId ?? '').toLowerCase();
      const fId = formatSystemId(m.systemId).toLowerCase();
      const mId = String(m.memberId ?? '').toLowerCase();
      const match =
        m.name?.toLowerCase().includes(q) ||
        m.phones?.toLowerCase().includes(q) ||
        sId.includes(q) ||
        fId.includes(q) ||
        mId.includes(q);
      if (!match) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const repName = (rep) => {
    if (!rep) return 'Unassigned';
    return typeof rep === 'object' ? rep.name : salesUsers.find((s) => s._id === rep)?.name ?? '—';
  };

  const toggleSelect = (memberId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const pageIds = paginated.map((m) => m._id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSelectByCount = (order = selectCountOrder) => {
    const count = parseInt(selectCountInput, 10);
    if (!Number.isFinite(count) || count <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }
    if (!filtered.length) {
      toast.error('No members match your filters');
      return;
    }
    const n = Math.min(count, filtered.length);
    const isLast = order === 'last';
    const slice = isLast
      ? filtered.slice(Math.max(0, filtered.length - n))
      : filtered.slice(0, n);
    setSelectedIds(new Set(slice.map((m) => m._id)));
    setSelectCountOrder(isLast ? 'last' : 'first');
    if (isLast) {
      setPage(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    } else {
      setPage(1);
    }
    toast.success(`Selected ${isLast ? 'last' : 'first'} ${slice.length} member${slice.length !== 1 ? 's' : ''}`);
  };

  const handleBulkTransfer = async () => {
    if (!transferTo) {
      toast.error('Select a destination sales rep');
      return;
    }
    if (!selectedIds.size) {
      toast.error('Select at least one member');
      return;
    }
    setTransferring(true);
    try {
      const res = await bulkTransferSalesReps({
        toSalesRepId: transferTo,
        memberIds: [...selectedIds],
      });
      toast.success(`Transferred ${res.data.transferredCount} member(s)`);
      setSelectedIds(new Set());
      fetchMembers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const handleQuickTransfer = async (e) => {
    e.preventDefault();
    const trimmedId = quickId.trim();
    if (!trimmedId) {
      toast.error('Enter a member system ID');
      return;
    }
    if (trimmedId.length > 40) {
      toast.error('Invalid member system ID length');
      return;
    }
    if (!quickTo) {
      toast.error('Select a destination sales rep');
      return;
    }
    setQuickLoading(true);
    try {
      await switchSalesRep(trimmedId, quickTo);
      toast.success('Member transferred successfully');
      setQuickId('');
      fetchMembers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Transfer failed');
    } finally {
      setQuickLoading(false);
    }
  };

  const destLabel = salesUsers.find((s) => s._id === transferTo)?.name;

  return (
    <Layout>
      <PageHeader title="Transfer">
        <Select
          value={transferTo}
          onChange={(e) => setTransferTo(e.target.value)}
          style={{ minWidth: 180 }}
        >
          <option value="">Transfer to…</option>
          {salesUsers.map((s) => (
            <option key={s._id} value={s._id}>{s.name} ({s.role})</option>
          ))}
        </Select>
        <Btn
          size="sm"
          onClick={handleBulkTransfer}
          disabled={transferring || !transferTo || !selectedIds.size}
        >
          {transferring ? <Spinner size="sm" /> : `Transfer Selected (${selectedIds.size})`}
        </Btn>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Card>
          <div style={{ padding: '16px 16px 0' }}>
            <CardHeader title="Quick Transfer" />
            <p style={{ fontSize: 12, color: 'var(--t4)', margin: '-8px 0 12px' }}>Assign one member by system ID</p>
          </div>
          <form onSubmit={handleQuickTransfer} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '0 16px 16px' }}>
            <Input
              label="System ID"
              value={quickId}
              onChange={(e) => setQuickId(e.target.value)}
              placeholder="e.g. 150"
              style={{ width: 140 }}
            />
            <Select
              label="Transfer to"
              value={quickTo}
              onChange={(e) => setQuickTo(e.target.value)}
              style={{ minWidth: 200 }}
            >
              <option value="">Select sales rep…</option>
              {salesUsers.map((s) => (
                <option key={s._id} value={s._id}>{s.name} ({s.role})</option>
              ))}
            </Select>
            <Btn type="submit" size="sm" disabled={quickLoading || !quickId.trim() || !quickTo}>
              {quickLoading ? <Spinner size="sm" /> : 'Transfer'}
            </Btn>
          </form>
        </Card>

        <Card>
          <div style={{ padding: '16px 16px 0' }}>
            <CardHeader title="Bulk Transfer" />
            <p style={{ fontSize: 12, color: 'var(--t4)', margin: '-8px 0 12px' }}>
              {destLabel ? `Selected members will be assigned to ${destLabel}` : 'Select members and a destination sales rep above'}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 16px 12px', alignItems: 'center' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={200} />

            {/* Rep filter dropdown */}
            <MenuSelect value={repFilter} onChange={(e) => setRepFilter(e.target.value)} style={{ minWidth: 220 }} aria-label="Filter by sales rep">
              <option value="all">All members</option>
              <option value="unassigned">Unassigned only</option>
              {salesUsers.map((s) => (
                <option key={s._id} value={s._id}>{s.name} ({s.role})</option>
              ))}
            </MenuSelect>

            {/* Select first/last N */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="1"
                value={selectCountInput}
                onChange={(e) => setSelectCountInput(e.target.value)}
                placeholder="How many?"
                className="no-spinners"
                aria-label="Number of members to select"
                style={{ width: 90, padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'inherit', MozAppearance: 'textfield' }}
              />
              <Btn
                variant={selectCountOrder === 'first' ? 'primary' : 'outline'}
                size="xs"
                onClick={() => handleSelectByCount('first')}
              >
                First
              </Btn>
              <Btn
                variant={selectCountOrder === 'last' ? 'primary' : 'outline'}
                size="xs"
                onClick={() => handleSelectByCount('last')}
              >
                Last
              </Btn>
            </div>

            {selectedIds.size > 0 && (
              <Btn variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>Clear selection</Btn>
            )}
            {paginated.length > 0 && (
              <Btn variant="ghost" size="xs" onClick={toggleSelectPage}>
                {paginated.every((m) => selectedIds.has(m._id)) ? 'Deselect page' : 'Select page'}
              </Btn>
            )}
          </div>

          {!loading && !paginated.length ? (
            <EmptyState message="No members match your filters" />
          ) : (
            <>
              <Table loading={loading} skeletonRows={8} headers={['', 'ID', 'Name', 'Current Sales Rep', 'Status', 'Phone']}>
                {paginated.map((m) => {
                  const selected = selectedIds.has(m._id);
                  return (
                    <tr
                      key={m._id}
                      className="tbl-row"
                      onClick={() => toggleSelect(m._id)}
                      style={{ cursor: 'pointer', background: selected ? 'var(--sky-bg)' : undefined }}
                    >
                      <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(m._id)}
                        />
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                        #{m.systemId}{m.memberId ? ` / M${m.memberId}` : ''}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size="sm" />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>
                        {repName(m.assignedSales)}
                      </td>
                      <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{m.phones ?? '—'}</td>
                    </tr>
                  );
                })}
              </Table>

              {!loading && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}
