import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Table, Badge, Btn, Modal, Input, Spinner, EmptyState, ConfirmDialog, fmtDateTime, Pagination } from '../../components/ui';
import { getRequests, createRequest, updateRequestStatus, getSalesTeam } from '../../api/endpoints';

const PAGE_SIZE = 10;

export default function SalesRequests() {
  usePageTitle('Requests');
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [pendingPagination, setPendingPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [resolvedPagination, setResolvedPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [pendingPage, setPendingPage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingResolved, setLoadingResolved] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [repFilter, setRepFilter] = useState('all');
  const [salesReps, setSalesReps] = useState([]);
  const isManager = ['Sales Manager', 'Owner'].includes(user?.role);

  const repParams = repFilter !== 'all' ? { requestedBy: repFilter } : {};

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await getRequests({ status: 'pending', page: pendingPage, limit: PAGE_SIZE, ...repParams });
      setPending(res.data.requests ?? []);
      setPendingPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch { toast.error('Failed to load pending requests.'); }
    finally { setLoadingPending(false); }
  }, [pendingPage, repFilter]);

  const fetchResolved = useCallback(async () => {
    setLoadingResolved(true);
    try {
      const res = await getRequests({ status: 'resolved', page: resolvedPage, limit: PAGE_SIZE, ...repParams });
      setResolved(res.data.requests ?? []);
      setResolvedPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch { toast.error('Failed to load request history.'); }
    finally { setLoadingResolved(false); }
  }, [resolvedPage, repFilter]);

  const fetchRequests = useCallback(() => {
    fetchPending();
    fetchResolved();
  }, [fetchPending, fetchResolved]);

  // Load all sales reps for the filter (manager only)
  useEffect(() => {
    if (!isManager) return;
    getSalesTeam()
      .then(res => {
        const reps = (res.data.team ?? []).filter(u => u.role === 'Sales');
        setSalesReps(reps);
      })
      .catch(() => {});
  }, [isManager]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { fetchResolved(); }, [fetchResolved]);
  useEffect(() => { setPendingPage(1); setResolvedPage(1); }, [repFilter]);

  const handleAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await updateRequestStatus(confirm.id, confirm.status);
      toast.success(`Request ${confirm.status}.`);
      setConfirm(null);
      fetchRequests();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Action failed.'); }
    finally { setActionLoading(false); }
  };

  // Apply rep filter handled server-side via repParams

  const RowCols = isManager
    ? ['Member', 'Requested By', 'Submitted', 'Status', 'Actions']
    : ['Member', 'Requested By', 'Submitted', 'Status'];

  return (
    <Layout>
      <PageHeader title="Requests">
        {user?.role === 'Sales' && <Btn size="sm" onClick={() => setShowNew(true)}>+ New Request</Btn>}
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Sales rep filter (manager only) ──────────────────── */}
        {isManager && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>
              Filter by Rep:
            </label>
            <div style={{ position: 'relative', minWidth: 200 }}>
              <select
                value={repFilter}
                onChange={e => setRepFilter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 32px 8px 12px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--card)', color: 'var(--t1)',
                  outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  appearance: 'none', WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
              >
                <option value="all">All Reps</option>
                {salesReps.map(rep => (
                  <option key={rep._id} value={rep._id}>{rep.name}</option>
                ))}
              </select>
            </div>
            {repFilter !== 'all' && (
              <button
                onClick={() => setRepFilter('all')}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {/* ── Pending ──────────────────────────────────────────── */}
        <Card noPad style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Pending ({pendingPagination.total})</span>
            {pendingPagination.total > 0 && (
              <span style={{ fontSize: 11, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                Needs Review
              </span>
            )}
          </div>
          {!pending.length && !loadingPending
            ? <EmptyState message="No pending requests" />
            : <>
            <Table loading={loadingPending} skeletonRows={3} headers={RowCols}>
                {pending.map(r => (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.member?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.requestedBy?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(r.createdAt)}</td>
                    <td style={{ padding: '10px 14px' }}><Badge status={r.status} /></td>
                    {isManager && (
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Btn variant="success" size="xs" onClick={() => setConfirm({ id: r._id, status: 'accepted' })}>Accept</Btn>
                          <Btn variant="danger"  size="xs" onClick={() => setConfirm({ id: r._id, status: 'rejected' })}>Reject</Btn>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </Table>
            <Pagination
              page={pendingPagination.page}
              totalPages={pendingPagination.totalPages}
              total={pendingPagination.total}
              pageSize={pendingPagination.limit ?? PAGE_SIZE}
              onPageChange={setPendingPage}
            />
            </>
          }
        </Card>

        {/* ── History ──────────────────────────────────────────── */}
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>History ({resolvedPagination.total})</span>
          </div>
          {!resolved.length && !loadingResolved
            ? <EmptyState message="No resolved requests" />
            : <>
            <Table loading={loadingResolved} headers={['Member', 'Requested By', 'Submitted', 'Status']}>
                {resolved.map(r => (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.member?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.requestedBy?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(r.createdAt)}</td>
                    <td style={{ padding: '10px 14px' }}><Badge status={r.status} /></td>
                  </tr>
                ))}
              </Table>
            <Pagination
              page={resolvedPagination.page}
              totalPages={resolvedPagination.totalPages}
              total={resolvedPagination.total}
              pageSize={resolvedPagination.limit ?? PAGE_SIZE}
              onPageChange={setResolvedPage}
            />
            </>
          }
        </Card>
      </div>

      {user?.role === 'Sales' && (
        <NewRequestModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); fetchRequests(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleAction}
        title={confirm?.status === 'accepted' ? 'Accept Request' : 'Reject Request'}
        message={`Are you sure you want to ${confirm?.status} this assignment request?`}
        confirmLabel={confirm?.status === 'accepted' ? 'Accept' : 'Reject'}
        danger={confirm?.status === 'rejected'} loading={actionLoading}
      />
    </Layout>
  );
}

function NewRequestModal({ open, onClose, onSuccess }) {
  const [memberId, setMemberId] = useState('');
  const [loading,  setLoading]  = useState(false);
  const handleSubmit = async () => {
    if (!memberId.trim()) { toast.error('Member ID required.'); return; }
    setLoading(true);
    try {
      await createRequest(memberId.trim());
      toast.success('Request submitted.');
      setMemberId('');
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Failed.'); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Request Member Assignment" size="sm"
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        <Btn size="sm" onClick={handleSubmit} disabled={loading}>{loading ? <Spinner size="sm" /> : 'Send'}</Btn>
      </>}
    >
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
        Enter the System ID or Member ID of the member you want assigned to you. The request will go to your Sales Manager.
      </p>
      <Input
        label="Member System ID *"
        value={memberId}
        onChange={e => setMemberId(e.target.value)}
        placeholder="e.g. 100"
        hint="Found on the member's profile page."
      />
    </Modal>
  );
}
