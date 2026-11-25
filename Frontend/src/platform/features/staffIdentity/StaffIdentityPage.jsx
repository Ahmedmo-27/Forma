import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetStaffIdentityRequests,
  apiApproveStaffIdentityDual,
  apiApproveStaffIdentityTransfer,
  apiRejectStaffIdentity,
} from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Input,
  Select,
  Skeleton,
  EmptyState,
  Pagination,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import { Users, Search, CheckCircle2, XCircle, ArrowRightLeft, Clock } from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";
import { usePermission } from "../../lib/auth/PermissionContext";
import { NoPermission } from "../../ui/NoPermission";

function statusVariant(status) {
  if (status === "pending") return "warning";
  if (status === "approved_dual" || status === "approved_transfer") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

function statusLabel(status) {
  if (status === "approved_dual") return "both gyms";
  if (status === "approved_transfer") return "transferred";
  return status;
}

export default function StaffIdentityPage() {
  const canManage = usePermission("tenants.staff_identity");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const [dualTarget, setDualTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["platform", "staff-identity-requests", page, search, status],
    queryFn: () =>
      apiGetStaffIdentityRequests({
        page,
        limit: 20,
        status: status || undefined,
        search: search.trim() || undefined,
      }).then((r) => r.data),
    enabled: canManage,
  });

  const requests = data?.requests || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 };
  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  if (!canManage) {
    return <NoPermission message="You need tenants.staff_identity to review cross-gym staff requests." />;
  }

  const handleDual = async () => {
    if (!dualTarget) return;
    setBusy(true);
    try {
      await apiApproveStaffIdentityDual(dualTarget.id, {});
      platformToast.success("Staff can now access both gyms");
      setDualTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Approve failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setBusy(true);
    try {
      await apiApproveStaffIdentityTransfer(transferTarget.id, {});
      platformToast.success("Staff transferred to requesting gym");
      setTransferTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Transfer failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async ({ reason }) => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await apiRejectStaffIdentity(rejectTarget.id, { note: reason });
      platformToast.success("Request rejected");
      setRejectTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Reject failed"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Staff identity
            </h1>
            <Badge variant="warning" size="sm">
              {status === "pending" ? pendingCount : pagination.total} queued
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            When a gym tries to add staff whose phone or email already belongs to another gym,
            choose keep both, transfer, or reject.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search gym, staff name, email…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        >
          <option value="pending">Pending</option>
          <option value="approved_dual">Both gyms</option>
          <option value="approved_transfer">Transferred</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </Select>
      </div>

      <div className="rounded-[var(--platform-radius-md)] border border-[var(--platform-border)] bg-[var(--platform-surface)] overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff identity requests"
            description="Cross-gym staff phone or email conflicts will appear here for review."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--platform-surface-subtle)] text-[11px] uppercase tracking-wider text-[var(--platform-text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Requesting gym</th>
                  <th className="px-4 py-3 font-semibold">Source gym</th>
                  <th className="px-4 py-3 font-semibold">Staff</th>
                  <th className="px-4 py-3 font-semibold">Proposed role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => {
                  const isPending = row.status === "pending";
                  return (
                    <tr key={row.id} className="border-t border-[var(--platform-border-subtle)]">
                      <td className="px-4 py-3">
                        <Link
                          to={`/platform/tenants/${row.requestingTenantId}`}
                          className="font-medium text-[var(--platform-text-primary)] hover:underline"
                        >
                          {row.requestingTenantName || row.requestingTenantSlug || "Gym"}
                        </Link>
                        <div className="text-[11px] text-[var(--platform-text-muted)] font-mono">
                          {row.requestingTenantSlug}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/platform/tenants/${row.sourceTenantId}`}
                          className="font-medium text-[var(--platform-text-primary)] hover:underline"
                        >
                          {row.sourceTenantName || row.sourceTenantSlug || "Gym"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium text-sm">{row.sourceUserName || row.proposedName}</div>
                        <div className="text-[var(--platform-text-muted)]">{row.proposedEmail || row.sourceUserEmail}</div>
                        <div className="text-[var(--platform-text-muted)]">{row.proposedPhone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{row.proposedRole}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(row.status)} size="sm">
                          {statusLabel(row.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--platform-text-muted)]">
                        <div>{formatRelativeTime(row.createdAt)}</div>
                        <div>{formatDate(row.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isPending ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="primary" onClick={() => setDualTarget(row)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Both
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setTransferTarget(row)}>
                              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                              Transfer
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectTarget(row)}>
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end text-[var(--platform-text-muted)]">
                            <Clock className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={Boolean(dualTarget)}
        onOpenChange={(open) => !open && !busy && setDualTarget(null)}
        onConfirm={handleDual}
        title="Allow both gyms"
        description={
          dualTarget
            ? `${dualTarget.sourceUserName || "This staff member"} will keep access at ${dualTarget.sourceTenantName || "the source gym"} and also work at ${dualTarget.requestingTenantName || "the requesting gym"} with a shared login.`
            : undefined
        }
        requireReason={false}
        confirmLabel="Allow both"
        variant="primary"
        loading={busy}
      />

      <ConfirmDialog
        open={Boolean(transferTarget)}
        onOpenChange={(open) => !open && !busy && setTransferTarget(null)}
        onConfirm={handleTransfer}
        title="Transfer to requesting gym"
        description={
          transferTarget
            ? `Move ${transferTarget.sourceUserName || "this staff member"} to ${transferTarget.requestingTenantName || "the requesting gym"}. Name, phone, email, and password stay; they lose the source gym membership.`
            : undefined
        }
        requireReason={false}
        confirmLabel="Transfer"
        variant="danger"
        loading={busy}
      />

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && !busy && setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject request"
        description="The requesting gym will keep seeing a conflict for this phone or email."
        requireReason
        confirmLabel="Reject"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
