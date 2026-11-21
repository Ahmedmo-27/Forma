import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetFeatureTrials,
  apiApproveFeatureTrial,
  apiRejectFeatureTrial,
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
import { Dialog } from "../../ui/Dialog";
import { Sparkles, Search, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";
import { usePermission } from "../../lib/auth/PermissionContext";
import { NoPermission } from "../../ui/NoPermission";

function statusVariant(status) {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

export default function FeatureTrialsPage() {
  const canManage = usePermission("tenants.feature_trials");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [durationValue, setDurationValue] = useState(14);
  const [durationUnit, setDurationUnit] = useState("days");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["platform", "feature-trials", page, search, status],
    queryFn: () =>
      apiGetFeatureTrials({
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
    return <NoPermission message="You need tenants.feature_trials to review feature trial requests." />;
  }

  const openApprove = (row) => {
    setApproveTarget(row);
    setDurationValue(row.requestedDurationValue || 14);
    setDurationUnit(row.requestedDurationUnit || "days");
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await apiApproveFeatureTrial(approveTarget.id, {
        durationValue: Number(durationValue),
        durationUnit,
      });
      platformToast.success("Feature trial approved");
      setApproveTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Approve failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async ({ reason }) => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await apiRejectFeatureTrial(rejectTarget.id, { note: reason });
      platformToast.success("Feature trial rejected");
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
              Feature trials
            </h1>
            <Badge variant="warning" size="sm">
              {status === "pending" ? pendingCount : pagination.total} queued
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Review gym requests to trial modules outside their current plan. Approve as-requested or adjust the period.
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
            placeholder="Search gym, feature, requester…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
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
            icon={Sparkles}
            title="No trial requests"
            description="When gym owners request a feature trial, they will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--platform-surface-subtle)] text-[11px] uppercase tracking-wider text-[var(--platform-text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gym</th>
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold">Requested</th>
                  <th className="px-4 py-3 font-semibold">Requester</th>
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
                          to={`/platform/tenants/${row.tenantId}`}
                          className="font-medium text-[var(--platform-text-primary)] hover:underline"
                        >
                          {row.tenantName || row.tenantSlug || "Gym"}
                        </Link>
                        <div className="text-[11px] text-[var(--platform-text-muted)] font-mono">
                          {row.tenantSlug}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.featureName || row.featureKey}</div>
                        <div className="text-[11px] font-mono text-[var(--platform-text-muted)]">
                          {row.featureKey}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.requestedDurationValue} {row.requestedDurationUnit}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{row.requestedByName || "—"}</div>
                        <div className="text-[var(--platform-text-muted)]">{row.requestedByRole}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(row.status)} size="sm">
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--platform-text-muted)]">
                        <div>{formatRelativeTime(row.createdAt)}</div>
                        <div>{formatDate(row.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isPending ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="primary" onClick={() => openApprove(row)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve
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

      <Dialog
        isOpen={Boolean(approveTarget)}
        onClose={() => !busy && setApproveTarget(null)}
        title="Approve feature trial"
        description={
          approveTarget
            ? `${approveTarget.tenantName} · ${approveTarget.featureName || approveTarget.featureKey}`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={handleApprove}>
              Approve trial
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--platform-text-muted)]">
            Requested {approveTarget?.requestedDurationValue} {approveTarget?.requestedDurationUnit}. You can keep
            that period or set a different one.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                Duration
              </label>
              <Input
                type="number"
                min={1}
                max={durationUnit === "weeks" ? 12 : 90}
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
              />
            </div>
            <div className="w-36">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                Unit
              </label>
              <Select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </Select>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="Reject feature trial"
        description={
          rejectTarget
            ? `Reject ${rejectTarget.featureName || rejectTarget.featureKey} for ${rejectTarget.tenantName}?`
            : undefined
        }
        requireReason
        reasonPlaceholder="Optional context for the gym owner / audit log…"
        confirmLabel="Reject request"
        variant="danger"
        loading={busy}
        onConfirm={handleReject}
      />
    </div>
  );
}
