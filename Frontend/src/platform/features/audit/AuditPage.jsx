import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGetAuditLogs } from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Input,
  Select,
  CopyChip,
  Skeleton,
  EmptyState,
  Pagination,
  Dialog,
} from "../../ui";
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Eye,
  FileCode,
  Calendar,
  Lock,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [inspectLog, setInspectLog] = useState(null);

  const {
    data: auditResponse,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["platform", "audit", page, actionFilter, targetTypeFilter, search],
    queryFn: () =>
      apiGetAuditLogs({
        page,
        limit: 25,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        search: search || undefined,
      }).then((r) => r.data),
  });

  const logs = auditResponse?.logs || [];
  const pagination = auditResponse?.pagination || { total: 0, page: 1, totalPages: 1 };

  const getActionBadge = (action) => {
    if (action.includes("purge") || action.includes("suspend") || action.includes("delete")) {
      return <Badge variant="danger" size="xs">{action}</Badge>;
    }
    if (action.includes("impersonation") || action.includes("override")) {
      return <Badge variant="warning" size="xs">{action}</Badge>;
    }
    if (action.includes("create") || action.includes("activate") || action.includes("confirm")) {
      return <Badge variant="success" size="xs">{action}</Badge>;
    }
    return <Badge variant="neutral" size="xs">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Platform Audit & Forensic Trails
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              <Lock className="w-3 h-3 mr-1" />
              Tamper-Evident
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Immutable log of every administrative mutation, life-cycle transition, manual grant, and impersonation.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          loading={isFetching}
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Stream
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
            <Input
              placeholder="Search action or target ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 text-xs"
            />
          </div>

          <Select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="w-48 text-xs"
          >
            <option value="">All Operation Actions</option>
            <option value="platform_impersonation">Impersonation</option>
            <option value="tenant_status_updated">Tenant status</option>
            <option value="plan_updated">Plan updated</option>
            <option value="staff_created">Staff or operator created</option>
            <option value="sales_abilities_updated">Operator access updated</option>
            <option value="lifetime_purchased">Lifetime purchased</option>
            <option value="lifetime_upgraded">Lifetime upgraded</option>
            <option value="lifetime_granted">Lifetime granted</option>
            <option value="lifetime_revoked">Lifetime revoked</option>
            <option value="lifetime_price_changed">Lifetime price changed</option>
            <option value="entitlement_policy_updated">Entitlement policy</option>
            <option value="package_assigned">Package assigned</option>
            <option value="member_created">Member created</option>
            <option value="member_frozen">Member frozen</option>
          </Select>

          <Select
            value={targetTypeFilter}
            onChange={(e) => {
              setTargetTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-40 text-xs"
          >
            <option value="">All Targets</option>
            <option value="tenant">Tenant</option>
            <option value="plan">Plan</option>
            <option value="user">User</option>
            <option value="member">Member</option>
            <option value="package_exception">Package exception</option>
            <option value="upload">Upload</option>
            <option value="other">Other</option>
          </Select>

          {(actionFilter || targetTypeFilter || search) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setActionFilter("");
                setTargetTypeFilter("");
                setSearch("");
                setPage(1);
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>

        <span className="text-xs text-[var(--platform-text-muted)] self-end md:self-center font-mono">
          {pagination.total} Recorded Events
        </span>
      </div>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No audit logs matched"
          description="Try broadening your filter criteria or search keyword."
        />
      ) : (
        <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Operator / Actor</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Mandatory Audit Reason / Context</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border-subtle)]">
              {logs.map((log) => (
                <tr
                  key={log._id}
                  className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                >
                  <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                    <div>{formatDate(log.createdAt)}</div>
                    <span className="text-[10px] text-[var(--platform-text-muted)]">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono">
                    {getActionBadge(log.action)}
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-medium text-[var(--platform-text-primary)]">
                      {log.meta?.actorEmail || log.meta?.platformAdminEmail || log.actor || "Platform Admin"}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--platform-text-muted)]">
                      {log.actorRole || "PlatformUser"}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="neutral" size="xs" className="uppercase">
                        {log.targetType || "entity"}
                      </Badge>
                      <CopyChip text={log.targetId || "—"} />
                    </div>
                  </td>

                  <td className="py-3 px-4 max-w-xs">
                    <div className="text-[11px] text-[var(--platform-text-primary)] truncate font-medium">
                      {log.meta?.reason || log.meta?.action || "—"}
                    </div>
                    {log.ip && (
                      <span className="text-[10px] font-mono text-[var(--platform-text-muted)] block">
                        IP: {log.ip}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setInspectLog(log)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Payload
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-end pt-2">
          <Pagination
            page={pagination.page}
            total={pagination.total}
            limit={pagination.limit || 25}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Forensic Payload Inspection Modal */}
      {inspectLog && (
        <Dialog
          isOpen={Boolean(inspectLog)}
          onClose={() => setInspectLog(null)}
          title={`Forensic Audit Record: ${inspectLog.action}`}
          description={`Logged at ${formatDate(inspectLog.createdAt)} by ${inspectLog.actor}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-lg bg-[var(--platform-canvas)] border border-[var(--platform-border-subtle)]">
              <div>
                <span className="text-[10px] text-[var(--platform-text-muted)] uppercase tracking-wider block">
                  Event ID
                </span>
                <span className="font-mono text-[var(--platform-text-primary)]">
                  {inspectLog._id}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--platform-text-muted)] uppercase tracking-wider block">
                  Target Identifier
                </span>
                <span className="font-mono text-[var(--platform-text-primary)]">
                  {inspectLog.targetType}: {inspectLog.targetId}
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5 block">
                Raw Metadata Payload (JSON)
              </span>
              <pre className="p-4 rounded-lg bg-[var(--platform-canvas)] border border-[var(--platform-border-subtle)] text-[11px] font-mono text-[var(--platform-text-secondary)] overflow-x-auto max-h-80">
                {JSON.stringify(inspectLog.meta || inspectLog, null, 2)}
              </pre>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
