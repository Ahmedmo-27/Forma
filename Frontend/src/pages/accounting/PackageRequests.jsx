import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Table, Badge, Btn, ConfirmDialog, EmptyState, Modal, fmtDate, fmtDateTime, Pagination } from '../../components/ui';
import { getPackageExceptions, updatePackageExceptionStatus } from '../../api/endpoints';
import SalesManagerSection from '../../components/accounting/SalesManagerSection';
import PackageAcceptModal from '../../components/accounting/PackageAcceptModal';

const PAGE_SIZE = 10;

function ExceptionFlag() {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.4px', background: 'var(--amber-bg)', color: 'var(--amber)',
      border: '1px solid var(--amber-bd)', padding: '2px 7px', borderRadius: 4,
    }}>
      Exception
    </span>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{value ?? '—'}</div>
    </div>
  );
}

function RequestDetailModal({ request, open, onClose, isReviewer, onApprove, onReject }) {
  if (!open || !request) return null;

  const isPending = request.status === 'pending';
  const memberId = request.member?.systemId ?? request.member?._id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={request.hasException ? 'Package Exception Request' : 'Package Request'}
      size="lg"
      footer={
        isPending && isReviewer ? (
          <>
            <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
            <Btn variant="danger" size="sm" onClick={() => onReject(request)}>Reject</Btn>
            <Btn variant="success" size="sm" onClick={() => onApprove(request)}>Approve</Btn>
          </>
        ) : (
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        )
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Badge status={request.status} />
        {request.hasException && <ExceptionFlag />}
        {!request.hasException && (
          <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600 }}>Standard catalog request</span>
        )}
      </div>

      {request.notificationMessage && (
        <p style={{ fontSize: 13, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 16, lineHeight: 1.5 }}>
          {request.notificationMessage}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
        <DetailRow label="Member" value={
          memberId
            ? <Link to={`/members/${memberId}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{request.member?.name ?? '—'}</Link>
            : (request.member?.name ?? '—')
        } />
        <DetailRow label="Submitted" value={fmtDateTime(request.createdAt)} />
        <DetailRow label="Based On" value={request.basePackage?.name} />
        {request.reviewedBy && <DetailRow label="Reviewed By" value={request.reviewedBy.name} />}
      </div>

      {isPending && request.proposedBy && (
        <SalesManagerSection salesManager={request.proposedBy} />
      )}

      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        {request.hasException ? 'Proposed Terms (Exception)' : 'Package Terms'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: request.reason || request.reviewNote ? 16 : 0 }}>
        <DetailRow label="Package Name" value={request.name} />
        <DetailRow label="Activity" value={request.activityType} />
        <DetailRow label="Duration" value={request.duration} />
        <DetailRow label="Price (EGP)" value={request.price?.toLocaleString?.() ?? request.price} />
        <DetailRow label="Price Paid (EGP)" value={request.pricePaid?.toLocaleString?.() ?? request.pricePaid} />
        <DetailRow label="Discount %" value={request.discountPercent ? `${request.discountPercent}%` : '0%'} />
        <DetailRow label="Freeze Limit" value={`${request.freezeLimitDays ?? 0} days`} />
        <DetailRow label="Invitation Slots" value={request.invitationLimit ?? 0} />
        <DetailRow label="Renewal Discount" value={request.renewalDiscountPercent ? `${request.renewalDiscountPercent}%` : 'None'} />
        <DetailRow label="Start Date" value={request.startDate ? fmtDate(request.startDate) : 'Today'} />
      </div>

      {request.description && (
        <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--t3)' }}>Description:</strong> {request.description}
        </p>
      )}

      {request.reason && (
        <div style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: request.reviewNote ? 12 : 0 }}>
          <span style={{ fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>Reason: </span>
          {request.reason}
        </div>
      )}

      {request.reviewNote && (
        <div style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
          <span style={{ fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>Review Note: </span>
          {request.reviewNote}
        </div>
      )}
    </Modal>
  );
}

export default function PackageRequests() {
  usePageTitle('Package Requests');
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [pendingPagination, setPendingPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [resolvedPagination, setResolvedPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [pendingPage, setPendingPage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingResolved, setLoadingResolved] = useState(true);
  const [selected, setSelected] = useState(null);
  const [acceptRequest, setAcceptRequest] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isReviewer = user?.role === 'Accountant';

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await getPackageExceptions({ status: 'pending', page: pendingPage, limit: PAGE_SIZE });
      setPending(res.data.requests ?? []);
      setPendingPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      toast.error('Failed to load package requests.');
    } finally {
      setLoadingPending(false);
    }
  }, [pendingPage]);

  const fetchResolved = useCallback(async () => {
    setLoadingResolved(true);
    try {
      const res = await getPackageExceptions({ status: 'resolved', page: resolvedPage, limit: PAGE_SIZE });
      setResolved(res.data.requests ?? []);
      setResolvedPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      toast.error('Failed to load request history.');
    } finally {
      setLoadingResolved(false);
    }
  }, [resolvedPage]);

  const fetchRequests = useCallback(() => {
    fetchPending();
    fetchResolved();
  }, [fetchPending, fetchResolved]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { fetchResolved(); }, [fetchResolved]);

  const handleAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(confirm.id, confirm.status);
      toast.success(`Request ${confirm.status}.`);
      setConfirm(null);
      setSelected(null);
      setAcceptRequest(null);
      fetchRequests();
    } catch (e) {
      if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || e.response?.data?.message || 'Action failed.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!acceptRequest) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(acceptRequest._id, 'accepted');
      toast.success('Request accepted.');
      setAcceptRequest(null);
      setSelected(null);
      fetchRequests();
    } catch (e) {
      if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || e.response?.data?.message || 'Action failed.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const openRequest = (request) => setSelected(request);

  const rowStyle = {
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
  };

  const headers = ['Member', 'Package', 'Type', 'Proposed By', 'Price Paid', 'Submitted', 'Status'];

  const renderRow = (r) => (
    <tr
      key={r._id}
      className="tbl-row"
      style={rowStyle}
      onClick={() => openRequest(r)}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.member?.name ?? '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
        {r.name}
        <div style={{ fontSize: 10, color: 'var(--t4)' }}>Based on: {r.basePackage?.name ?? '—'}</div>
      </td>
      <td style={{ padding: '10px 14px' }}>
        {r.hasException ? <ExceptionFlag /> : <span style={{ fontSize: 12, color: 'var(--t4)' }}>Standard</span>}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.proposedBy?.name ?? '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>EGP {r.pricePaid}</td>
      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(r.createdAt)}</td>
      <td style={{ padding: '10px 14px' }}><Badge status={r.status} /></td>
    </tr>
  );

  return (
    <Layout>
      <PageHeader title="Package Requests" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <Card noPad style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Pending ({pendingPagination.total})</span>
            {pendingPagination.total > 0 && isReviewer && (
              <span style={{ fontSize: 11, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Needs Review</span>
            )}
          </div>
          {!pending.length && !loadingPending
            ? <EmptyState message="No pending package requests" />
            : <>
            <Table loading={loadingPending} skeletonRows={3} headers={headers}>
              {pending.map(renderRow)}
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

        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>History ({resolvedPagination.total})</span>
          </div>
          {!resolved.length && !loadingResolved
            ? <EmptyState message="No resolved requests" />
            : <>
            <Table loading={loadingResolved} headers={[...headers.slice(0, 4), 'Reviewed By', ...headers.slice(4)]}>
              {resolved.map(r => (
                <tr
                  key={r._id}
                  className="tbl-row"
                  style={rowStyle}
                  onClick={() => openRequest(r)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.member?.name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.hasException ? <ExceptionFlag /> : <span style={{ fontSize: 12, color: 'var(--t4)' }}>Standard</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.proposedBy?.name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.reviewedBy?.name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>EGP {r.pricePaid}</td>
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

      <RequestDetailModal
        request={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        isReviewer={isReviewer}
        onApprove={(r) => { setSelected(null); setAcceptRequest(r); }}
        onReject={(r) => setConfirm({ id: r._id, status: 'rejected' })}
      />

      <PackageAcceptModal
        request={acceptRequest}
        open={!!acceptRequest}
        onClose={() => setAcceptRequest(null)}
        onConfirm={handleAccept}
        loading={actionLoading}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleAction}
        title="Reject Package Request"
        message="Are you sure you want to reject this package request?"
        confirmLabel="Reject"
        danger
        loading={actionLoading}
      />
    </Layout>
  );
}
