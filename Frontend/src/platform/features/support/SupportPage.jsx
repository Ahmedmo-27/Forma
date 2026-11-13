import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetTenants,
  apiGetAuditLogs,
} from "../../lib/api/endpoints";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { usePlatformRole } from "../../lib/auth/PermissionContext";
import {
  Button,
  Badge,
  Input,
  Select,
  Callout,
  CopyChip,
  Skeleton,
  platformToast,
} from "../../ui";
import {
  UserCheck,
  LogOut,
  Download,
  History,
  FileJson,
  KeyRound,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function SupportPage() {
  const { user: _user, impersonationSession, startImpersonation, exitImpersonation } = usePlatformAuth();
  const { role } = usePlatformRole();
  const isSuperAdmin = role === "super_admin";

  // Form State for Impersonation
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [mode, setMode] = useState("read_only");
  const [reason, setReason] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [error, setError] = useState(null);

  // Export State
  const [exportTenantId, setExportTenantId] = useState("");
  const [exporting, setExporting] = useState(false);

  // Queries
  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ["platform", "tenants-select"],
    queryFn: () => apiGetTenants({ limit: 100 }).then((r) => r.data?.tenants || []),
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["platform", "impersonation-audit"],
    queryFn: () =>
      apiGetAuditLogs({ action: "platform_impersonation", limit: 10 }).then((r) => r.data?.logs || []),
  });

  const tenants = tenantsData || [];
  const auditLogs = auditData || [];

  const handleStartImpersonation = async (e) => {
    e.preventDefault();
    if (!selectedTenantId) {
      setError("Please select a target gym subscriber");
      return;
    }
    if (mode === "read_write" && (!reason || reason.trim().length < 5)) {
      setError("A documented audit reason is strictly mandatory for read-write session grants");
      return;
    }

    setInitiating(true);
    setError(null);

    try {
      await startImpersonation(selectedTenantId, mode, reason.trim());
      platformToast.success("Secure impersonation session activated (30m countdown)");
      setReason("");
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err.response?.data?.message || err?.message || "Failed to initiate impersonation session");
    } finally {
      setInitiating(false);
    }
  };

  const handleExportData = (e) => {
    e.preventDefault();
    if (!exportTenantId) return;
    setExporting(true);
    window.open(`/api/platform/support/tenants/${exportTenantId}/export`, "_blank");
    platformToast.success("Sanitized tenant JSON archive export dispatched");
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
            Support Desk & Operator Impersonation
          </h1>
          <Badge variant="neutral" size="sm" className="font-mono">
            Audited SLA
          </Badge>
        </div>
        <p className="text-xs text-[var(--platform-text-muted)] mt-1">
          Safely inspect tenant gym workspaces, diagnose configuration issues, and export sanitized backups.
        </p>
      </div>

      {/* Active Impersonation Warning Banner */}
      {impersonationSession && (
        <div className="p-4 rounded-xl border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-[var(--platform-warning)]/20 text-[var(--platform-warning)]">
              <UserCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--platform-text-primary)]">
                  Active Impersonation Session
                </span>
                <Badge variant="warning" size="xs" className="uppercase font-mono">
                  {impersonationSession.mode || "read_only"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
                Acting as gym owner for <strong>{impersonationSession.tenant?.name}</strong> ({impersonationSession.tenant?.slug}).
                Session automatically revokes after 30 minutes.
              </p>
            </div>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={exitImpersonation}
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Terminate Session
          </Button>
        </div>
      )}

      {/* Two Column Workspace: Launcher & Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Launcher Card */}
        <div className="rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--platform-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
              Launch Audited Tenant Session
            </h2>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)]">
            Issues a strictly scoped 30-minute JWT with audit logging.
          </p>

          <form onSubmit={handleStartImpersonation} className="space-y-4">
            {error && <Callout variant="danger">{error}</Callout>}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Target Gym Subscriber <span className="text-[var(--platform-danger)]">*</span>
              </label>
              <Select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                disabled={Boolean(impersonationSession) || tenantsLoading}
                required
              >
                <option value="">Select gym subscriber...</option>
                {tenants.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Session Permission Mode
              </label>
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={Boolean(impersonationSession)}
              >
                <option value="read_only">Read-Only Observer (Safe / Support)</option>
                <option value="read_write" disabled={!isSuperAdmin}>
                  Read-Write Full Access {!isSuperAdmin && "(Super Admin Only)"}
                </option>
              </Select>
            </div>

            {mode === "read_write" && (
              <div className="p-3 rounded-lg border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--platform-warning)]">
                  Mandatory Audit Reason for Write Mode *
                </label>
                <Input
                  placeholder="e.g. Fixing corrupted member subscription state ref Ticket #884"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-[var(--platform-surface)]"
                  required
                />
                <span className="text-[10px] text-[var(--platform-text-muted)] block">
                  Logged permanently. Read-write actions will be attributed to your platform identity.
                </span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={initiating}
              disabled={Boolean(impersonationSession) || !selectedTenantId}
            >
              <UserCheck className="w-4 h-4 mr-1.5" />
              {impersonationSession ? "Session Already Active" : "Initiate 30-Minute Session"}
            </Button>
          </form>
        </div>

        {/* Sanitized Data Dump Tool */}
        <div className="rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-[var(--platform-info)]" />
              <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                Sanitized Tenant Data Export
              </h2>
            </div>
            <p className="text-xs text-[var(--platform-text-muted)] mt-1">
              Exports a complete JSON archive of members, packages, staff, and notes with passwords and WhatsApp API keys sanitized.
            </p>

            <form onSubmit={handleExportData} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Target Gym Subscriber
                </label>
                <Select
                  value={exportTenantId}
                  onChange={(e) => setExportTenantId(e.target.value)}
                  disabled={tenantsLoading}
                  required
                >
                  <option value="">Select gym subscriber...</option>
                  {tenants.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] space-y-1 text-xs text-[var(--platform-text-secondary)]">
                <div className="font-semibold text-[var(--platform-text-primary)]">
                  Data Governance & Redaction:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--platform-text-muted)]">
                  <li>Member passwords and salted hashes omitted</li>
                  <li>WhatsApp Cloud API credentials omitted</li>
                  <li>Includes up to 500 recent tenant audit log entries</li>
                </ul>
              </div>

              <Button
                type="submit"
                variant="outline"
                className="w-full"
                loading={exporting}
                disabled={!exportTenantId}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download Sanitized JSON Archive
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Impersonation Audit Trail */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[var(--platform-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
            Recent Impersonation Audit Logs
          </h2>
        </div>

        {auditLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-6 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] text-center text-xs text-[var(--platform-text-muted)]">
            No recent platform operator impersonation events recorded.
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Platform Operator</th>
                  <th className="py-2.5 px-3">Target Gym</th>
                  <th className="py-2.5 px-3 text-center">Mode</th>
                  <th className="py-2.5 px-3">Documented Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                {auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-[var(--platform-surface-hover)] transition-colors">
                    <td className="py-2.5 px-3 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                      {formatDate(log.createdAt)} ({formatRelativeTime(log.createdAt)})
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[var(--platform-text-primary)]">
                      {log.meta?.platformAdminEmail || log.actor || "Operator"}
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyChip text={log.targetId || "tenant"} />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge
                        variant={log.meta?.mode === "read_write" ? "warning" : "neutral"}
                        size="xs"
                        className="uppercase font-mono"
                      >
                        {log.meta?.mode || "read_only"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--platform-text-secondary)] max-w-xs truncate">
                      {log.meta?.reason || "Support inspection"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
