import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import { PageHeader, Card, Table, Badge, Btn, Spinner, EmptyState, SearchInput, Avatar, Modal, Select, formatSystemId, MenuSelect } from '../../components/ui';
import { getAllMembers, getCoachTeam, switchCoach, assignCoach, bulkTransferCoach } from '../../api/endpoints';
import { RefreshCw } from 'lucide-react';

const PAGE_SIZE = 25;

export default function CoachTransfer() {
  usePageTitle('Coach Transfer');

  const [members, setMembers]     = useState([]);
  const [coaches, setCoaches]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all');
  const [page, setPage]           = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCoach, setBulkCoach]     = useState('');
  const [transferring, setTransferring] = useState(false);
  const [selectCountInput, setSelectCountInput] = useState('');
  const [selectCountOrder, setSelectCountOrder] = useState('first');
  const debouncedSearch = useDebounce(search, 300);

  // Single transfer modal
  const [showModal, setShowModal]         = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [targetCoach, setTargetCoach]     = useState('');
  const [singleLoading, setSingleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([getAllMembers({ all: 'true' }), getCoachTeam()]);
      setMembers(mRes.data.members ?? []);
      setCoaches(cRes.data.team ?? []);
    } catch {
      toast.error('Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  // Client-side filtering — ALL members shown
  const filtered = members.filter(m => {
    if (filter === 'unassigned-coach') {
      if (m.current_couch) return false;
    } else if (filter !== 'all') {
      const coachId = m.current_couch?._id || m.current_couch;
      if (String(coachId) !== filter) return false;
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

  // Toggle selection
  const toggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const ids = paginated.map(m => m._id);
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
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

  // Bulk assign — single API call
  const handleBulkAssign = async () => {
    if (!bulkCoach) { toast.error('Select a coach'); return; }
    if (!selectedIds.size) { toast.error('Select at least one member'); return; }
    setTransferring(true);
    try {
      const res = await bulkTransferCoach({ coachId: bulkCoach, memberIds: [...selectedIds] });
      toast.success(`Assigned ${res.data.transferredCount} member(s) to coach`);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk transfer failed');
    } finally { setTransferring(false); }
  };

  // Single transfer
  const openSingle = (member) => {
    setSelectedMember(member);
    setTargetCoach('');
    setShowModal(true);
  };

  const handleSingleTransfer = async () => {
    if (!targetCoach) { toast.error('Select a coach'); return; }
    setSingleLoading(true);
    try {
      const currentCoach = selectedMember.current_couch?._id || selectedMember.current_couch;
      if (currentCoach) {
        await switchCoach(selectedMember.systemId, targetCoach);
      } else {
        await assignCoach(selectedMember.systemId, targetCoach);
      }
      toast.success('Coach updated');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSingleLoading(false); }
  };

  return (
    <Layout>
      <PageHeader title="Coach Transfer" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* Bulk assign bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
          marginBottom: 16, padding: '12px 16px',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Bulk Assign:</span>
          <MenuSelect value={bulkCoach} onChange={e => setBulkCoach(e.target.value)} style={{ minWidth: 200 }} aria-label="Bulk assign coach">
            <option value="">— Select coach —</option>
            {coaches.map(c => <option key={c._id} value={c._id}>{c.name} ({c.role})</option>)}
          </MenuSelect>
          <Btn size="sm" onClick={handleBulkAssign} disabled={transferring || !bulkCoach || !selectedIds.size}>
            {transferring ? <Spinner size="sm" /> : `Assign Selected (${selectedIds.size})`}
          </Btn>
          {selectedIds.size > 0 && (
            <span style={{ fontSize: 11, color: 'var(--t4)', marginLeft: 'auto' }}>
              {selectedIds.size} member(s) selected
            </span>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={200} />

          <MenuSelect value={filter} onChange={e => setFilter(e.target.value)} style={{ minWidth: 200 }} aria-label="Filter members by coach">
            <option value="all">All members ({members.length})</option>
            <option value="unassigned-coach">No coach assigned</option>
            {coaches.map(c => <option key={c._id} value={c._id}>Coach: {c.name}</option>)}
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
            <Btn variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>Clear ({selectedIds.size})</Btn>
          )}
          <Btn variant="ghost" size="xs" onClick={toggleSelectPage}>
            {paginated.every(m => selectedIds.has(m._id)) ? 'Deselect page' : 'Select page'}
          </Btn>
        </div>

        {/* Table */}
        <Card noPad>
          {!loading && filtered.length === 0 ? (
            <EmptyState icon={RefreshCw} message="No members match" />
          ) : (
            <>
              <Table loading={loading} skeletonRows={8} headers={['', 'ID', 'Name', 'Coach', 'PT Status', 'Sessions Left', '']}>
                {paginated.map(m => {
                  const coachName = m.current_couch?.name || '—';
                  const remaining = (m.PT_sessions || 0) - (m.used_PT_sessions || 0);
                  const selected = selectedIds.has(m._id);
                  return (
                    <tr key={m._id} onClick={() => toggleSelect(m._id)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selected ? 'var(--sky-bg)' : undefined }}
                    >
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(m._id)} />
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size="sm" />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{coachName}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <Badge status={m.couch_subscription_status || 'guest'} />
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: remaining > 0 ? 'var(--green)' : 'var(--t4)' }}>
                        {m.PT_sessions ? remaining : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <Btn variant="outline" size="xs" onClick={() => openSingle(m)}>
                          {m.current_couch ? 'Switch' : 'Assign'}
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </Table>

              {/* Pagination */}
              {!loading && totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t4)' }}>{((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="outline" size="xs" disabled={page===1} onClick={() => setPage(p => p-1)}>Prev</Btn>
                    <span style={{ fontSize: 12, color: 'var(--t3)', padding: '0 8px', lineHeight: '28px' }}>{page}/{totalPages}</span>
                    <Btn variant="outline" size="xs" disabled={page===totalPages} onClick={() => setPage(p => p+1)}>Next</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Single Transfer Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={selectedMember?.current_couch ? `Switch Coach — ${selectedMember?.name}` : `Assign Coach — ${selectedMember?.name}`}
        size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowModal(false)} disabled={singleLoading}>Cancel</Btn>
          <Btn size="sm" onClick={handleSingleTransfer} disabled={singleLoading || !targetCoach}>
            {singleLoading ? <Spinner size="sm" /> : 'Confirm'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14 }}>
          {selectedMember?.current_couch
            ? `Transfer from ${selectedMember?.current_couch?.name || 'current coach'} to another coach.`
            : `Assign a coach to this member.`
          }
        </p>
        <Select label="Select Coach" value={targetCoach} onChange={e => setTargetCoach(e.target.value)}>
          <option value="">— Choose coach —</option>
          {coaches
            .filter(c => c._id !== (selectedMember?.current_couch?._id || selectedMember?.current_couch))
            .map(c => <option key={c._id} value={c._id}>{c.name}</option>)
          }
        </Select>
      </Modal>
    </Layout>
  );
}
