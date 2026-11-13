import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Modal, Pagination, Table,
} from '../../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam,
  bulkTransferSalesReps, bulkTransferCoach,
} from '../../api/endpoints';
import {
  CircleDot, Dumbbell, MessageCircle, RefreshCw, Search, UserRound, Users,
} from 'lucide-react';
import {
  filterMembersAdvanced, packageName, columnValue,
  taskPermissions, toggleId, toggleIds,
} from './taskMembers';
import { formatSystemId } from '../../lib/systemId';
import BulkWhatsAppSendModal from '../../components/BulkWhatsAppSendModal';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

async function loadAllMembers() {
  const members = [];
  let page = 1;
  for (;;) {
    const params = { page, limit: 100, sortBy: 'name', sortDir: 1 };
    const res = await getAllMembers(params);
    members.push(...(res.data.members ?? []));
    const totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
    if (page > totalPages || page > 40) break;
  }
  return members;
}

export default function TaskFilterResultsPage() {
  usePageTitle('Filter Results');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const { canSalesman, canCoach, canWhatsApp } = taskPermissions(user, hasFeature);

  // ── Read filters from location state ──
  const filters = location.state?.filters;

  // ── Redirect if no filters ──
  useEffect(() => {
    if (!filters) {
      navigate('/tasks/filter', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!filters) return null;

  const {
    search = '',
    statusFilter = 'all',
    kind = 'all',
    personId = '',
    packageFilter = 'all',
    genderFilter = 'all',
    transferTypeFilter = 'all',
    dateField = 'endDate',
    dateFrom = '',
    dateTo = '',
    selectCount: filterSelectCount = '',
    selectOrder: filterSelectOrder = 'first',
    pageSize: filterPageSize = DEFAULT_PAGE_SIZE,
  } = filters;

  // ── Reference Data ──
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);

  // ── Members Data ──
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Selection ──
  const [selected, setSelected] = useState(() => new Set());
  const selectedSet = useMemo(() => {
    return selected instanceof Set ? selected : new Set(selected || []);
  }, [selected]);
  const [selectCountInput, setSelectCountInput] = useState(
    filterSelectCount ? String(filterSelectCount) : ''
  );
  const [selectCountOrder, setSelectCountOrder] = useState(
    filterSelectOrder === 'last' ? 'last' : 'first'
  );
  const [initialSelectApplied, setInitialSelectApplied] = useState(false);

  // ── Pagination ──
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const n = parseInt(filterPageSize, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(500, Math.max(1, n)) : DEFAULT_PAGE_SIZE;
  });

  // ── Bulk Transfer Modal ──
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [busy, setBusy] = useState(false);

  // ── WhatsApp Modal ──
  const [waOpen, setWaOpen] = useState(false);

  // ── Load reference data (re-fetch when branch changes) ──
  useLocationEffect(() => {
    getSalesUsers()
      .then((res) => setSalesUsers(res.data.salesUsers ?? []))
      .catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((p) => ['Coach', 'Head Coach'].includes(p.role)));
      })
      .catch(() => {});
  }, []);

  // ── Load all members ──
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    try {
      const list = await loadAllMembers();
      setMembers(list);
      setLoaded(true);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useLocationEffect(() => { fetchMembers(); }, [fetchMembers]);
  useLocationEffect(() => {
    setPage(1);
    setSelected(new Set());
    setInitialSelectApplied(false);
  }, []);

  // ── Filtered members ──
  const filtered = useMemo(() => {
    return filterMembersAdvanced(members, {
      search,
      status: statusFilter,
      kind,
      personId,
      dateField,
      dateFrom,
      dateTo,
      transferType: transferTypeFilter,
      packageId: packageFilter,
      gender: genderFilter,
    });
  }, [members, search, statusFilter, kind, personId, dateField, dateFrom, dateTo, transferTypeFilter, packageFilter, genderFilter]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // ── Filter summary for header ──
  const filterSummaryParts = useMemo(() => {
    const parts = [];
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    if (statusFilter !== 'all') parts.push(`Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`);
    if (kind === 'sales') parts.push(personId ? `Sales Rep: (selected)` : 'By Sales Rep');
    else if (kind === 'coach') parts.push(personId ? `Coach: (selected)` : 'By Coach');
    else if (kind === 'unassigned_sales') parts.push('Unassigned Sales');
    else if (kind === 'unassigned_coach') parts.push('Unassigned Coach');
    if (packageFilter !== 'all') parts.push('Package: (selected)');
    if (genderFilter !== 'all') parts.push(`Gender: ${genderFilter.charAt(0).toUpperCase() + genderFilter.slice(1)}`);
    if (transferTypeFilter !== 'all') {
      const labels = { transferred: 'Transferred', never: 'Never Transferred', bulk: 'Bulk Transferred' };
      parts.push(`Transfer: ${labels[transferTypeFilter] || transferTypeFilter}`);
    }
    if (dateFrom || dateTo) {
      const fieldLabels = { endDate: 'End Date', startDate: 'Start Date', createdAt: 'Join Date', transferDate: 'Transfer Date' };
      parts.push(`${fieldLabels[dateField] || dateField}: ${dateFrom || '?'} → ${dateTo || '?'}`);
    }
    return parts;
  }, [search, statusFilter, kind, personId, packageFilter, genderFilter, transferTypeFilter, dateField, dateFrom, dateTo]);

  // ── Handlers ──
  const isAllFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedSet.has(m._id));

  const handleSelectAllFiltered = () => {
    const ids = filtered.map((m) => m._id);
    setSelected((prev) => toggleIds(prev, ids));
  };

  const applySelectByCount = useCallback((count, order, { silent = false } = {}) => {
    const parsed = parseInt(count, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      if (!silent) toast.error('Please enter a valid positive number');
      return false;
    }
    if (!filtered.length) {
      if (!silent) toast.error('No members match the current filters');
      return false;
    }
    const n = Math.min(parsed, filtered.length);
    const isLast = order === 'last';
    const slice = isLast
      ? filtered.slice(Math.max(0, filtered.length - n))
      : filtered.slice(0, n);
    setSelected(new Set(slice.map((m) => m._id)));
    setSelectCountOrder(isLast ? 'last' : 'first');
    if (isLast) {
      setPage(Math.max(1, Math.ceil(filtered.length / pageSize)));
    } else {
      setPage(1);
    }
    if (!silent) {
      toast.success(`Selected ${isLast ? 'last' : 'first'} ${slice.length} member${slice.length !== 1 ? 's' : ''}`);
    }
    return true;
  }, [filtered, pageSize]);

  const handleSelectByCount = (order = selectCountOrder) => {
    applySelectByCount(selectCountInput, order);
  };

  // Auto-select from filter form settings once members are loaded
  useEffect(() => {
    if (!loaded || initialSelectApplied || !filtered.length) return;
    const count = parseInt(filterSelectCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setInitialSelectApplied(true);
      return;
    }
    applySelectByCount(count, filterSelectOrder === 'last' ? 'last' : 'first', { silent: true });
    setInitialSelectApplied(true);
  }, [loaded, filtered, filterSelectCount, filterSelectOrder, initialSelectApplied, applySelectByCount]);

  const handleModifyFilters = () => {
    navigate('/tasks/filter', {
      state: {
        filters: {
          ...filters,
          selectCount: selectCountInput,
          selectOrder: selectCountOrder,
          pageSize,
        },
      },
    });
  };

  // ── Bulk Transfer ──
  const openTransferModal = (targetKind) => {
    if (!selectedSet.size) { toast.error('Select at least one member'); return; }
    setDestKind(targetKind);
    setDestId('');
    setTransferOpen(true);
  };

  const executeBulkTransfer = async () => {
    if (!destId) {
      toast.error(destKind === 'sales' ? 'Choose a sales rep' : 'Choose a coach');
      return;
    }
    const ids = Array.from(selectedSet);
    if (!ids.length) return;
    setBusy(true);
    try {
      if (destKind === 'sales') {
        await bulkTransferSalesReps({ memberIds: ids, newSalesRepId: destId, source: 'filter' });
      } else {
        await bulkTransferCoach({ memberIds: ids, coachId: destId, source: 'filter' });
      }
      toast.success(`Successfully assigned ${ids.length} members!`);
      setSelected(new Set());
      setTransferOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  // ── WhatsApp Bulk Send ──
  const openWaModal = () => {
    if (!selectedSet.size) { toast.error('Select at least one member'); return; }
    setWaOpen(true);
  };

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedSet.has(m._id)),
    [members, selectedSet]
  );

  return (
    <Layout>
      <PageHeader title="Filter Results">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" size="sm" onClick={handleModifyFilters}>
            ← Modify Filters
          </Btn>
          <Btn variant="outline" size="sm" onClick={fetchMembers} disabled={loading}>
            {loading ? <Spinner size="sm" /> : <><RefreshCw size={14} aria-hidden /> Reload</>}
          </Btn>
        </div>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Filter Summary Card ── */}
        <Card style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                {loaded ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'Loading…'}
              </span>
              {filterSummaryParts.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  for: {filterSummaryParts.join(' · ')}
                </span>
              )}
              {filterSummaryParts.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--t4)' }}>No filters applied — showing all members</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleModifyFilters}
              style={{
                height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--navy, var(--navy))', background: 'color-mix(in srgb, var(--navy) 6%, transparent)',
                color: 'var(--navy, var(--navy))', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              ← Modify Filters
            </button>
          </div>
        </Card>

        {/* ── RESULTS TABLE ── */}
        <Card noPad>
          {/* Toolbar */}
          <div data-walkthrough="filter-results-select" style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  disabled={!filtered.length || loading}
                />
                <span>Select All Filtered ({filtered.length})</span>
              </label>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="1"
                  value={selectCountInput}
                  onChange={(e) => setSelectCountInput(e.target.value)}
                  placeholder="How many?"
                  aria-label="Number of members to select"
                  disabled={!filtered.length || loading}
                  className="no-spinners"
                  style={{
                    width: 90, height: 32, padding: '0 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                    outline: 'none', MozAppearance: 'textfield',
                  }}
                />
                <button
                  type="button"
                  disabled={!filtered.length || loading}
                  onClick={() => handleSelectByCount('first')}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 6,
                    border: `1px solid ${selectCountOrder === 'first' ? 'var(--navy)' : 'var(--border)'}`,
                    background: selectCountOrder === 'first' ? 'var(--navy)' : 'var(--card)',
                    color: selectCountOrder === 'first' ? '#fff' : 'var(--t1)',
                    fontSize: 12, fontWeight: 600, cursor: filtered.length && !loading ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  First
                </button>
                <button
                  type="button"
                  disabled={!filtered.length || loading}
                  onClick={() => handleSelectByCount('last')}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 6,
                    border: `1px solid ${selectCountOrder === 'last' ? 'var(--navy)' : 'var(--border)'}`,
                    background: selectCountOrder === 'last' ? 'var(--navy)' : 'var(--card)',
                    color: selectCountOrder === 'last' ? '#fff' : 'var(--t1)',
                    fontSize: 12, fontWeight: 600, cursor: filtered.length && !loading ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  Last
                </button>
              </div>
              {selectedSet.size > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  borderRadius: 6, background: 'color-mix(in srgb, var(--navy) 8%, transparent)', color: 'var(--navy, var(--navy))',
                  fontSize: 12, fontWeight: 700,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CircleDot size={12} aria-hidden /> {selectedSet.size} selected</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    style={{ background: 'none', border: 'none', color: 'var(--red, #dc2626)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '0 2px' }}
                  >(Clear)</button>
                </div>
              )}
            </div>

            <div data-walkthrough="filter-results-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canSalesman && (
                <Btn size="sm" variant="primary" disabled={!selectedSet.size} onClick={() => openTransferModal('sales')}>
                  <UserRound size={14} aria-hidden /> Assign Sales Rep ({selectedSet.size})
                </Btn>
              )}
              {canCoach && (
                <Btn size="sm" variant="outline" disabled={!selectedSet.size} onClick={() => openTransferModal('coach')}>
                  <Dumbbell size={14} aria-hidden /> Assign Coach ({selectedSet.size})
                </Btn>
              )}
              {canWhatsApp && (
                <span data-walkthrough="filter-results-wa">
                  <Btn size="sm" variant="outline" disabled={!selectedSet.size} onClick={openWaModal}>
                    <MessageCircle size={14} aria-hidden /> WhatsApp ({selectedSet.size})
                  </Btn>
                </span>
              )}
            </div>
          </div>

          {/* Table Body */}
          {loading || !loaded ? (
            <Table loading skeletonRows={8} headers={['#', 'Member', 'System ID', 'Phone', 'Sales Rep', 'Coach', 'Status', 'Package']} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} message="No members found" sub="Go back and adjust your filters to see results." />
          ) : (
            <>
              <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ width: 40, padding: '10px 14px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Sales Rep</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Coach</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Package</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>End Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMembers.map((member) => {
                      const isSelected = selectedSet.has(member._id);
                      return (
                        <tr
                          key={member._id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent',
                          }}
                        >
                          <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelected((prev) => toggleId(prev, member._id))}
                            />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: 'pointer' }}
                              onClick={() => navigate(`/members/${member.systemId}`)}
                            >
                              <Avatar name={member.name} size="sm" photo={member.photo} />
                              <span>{member.name}</span>
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 12 }}>
                            {formatSystemId(member.systemId)}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                            {member.phones || '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                            {member.assignedSales?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                            {member.current_couch?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                            {packageName(member) || '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                            {columnValue(member, 'endDate') || '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <Badge status={member.isBlocked ? 'blocked' : member.status || 'active'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(newSize) => { setPageSize(Math.max(1, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE)); setPage(1); }}
              />
            </>
          )}
        </Card>
      </div>

      {/* ── BULK TRANSFER MODAL ── */}
      {transferOpen && (
        <Modal
          open={transferOpen}
          title={`Assign to ${destKind === 'sales' ? 'Sales Rep' : 'Coach'}`}
          onClose={() => setTransferOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
              You are assigning <strong>{selectedSet.size} member(s)</strong> to a{' '}
              {destKind === 'sales' ? 'sales rep' : 'coach'}.
            </p>
            <Select
              label={destKind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
            >
              <option value="">Choose recipient…</option>
              {(destKind === 'sales' ? salesUsers.filter((u) => u.role === 'Sales') : coaches).map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="outline" onClick={() => setTransferOpen(false)} disabled={busy}>Cancel</Btn>
              <Btn variant="primary" onClick={executeBulkTransfer} disabled={busy || !destId}>
                {busy ? <Spinner size="sm" /> : `Confirm & Assign (${selectedSet.size})`}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── WHATSAPP MODAL ── */}
      <BulkWhatsAppSendModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        members={selectedMembers}
      />
    </Layout>
  );
}
