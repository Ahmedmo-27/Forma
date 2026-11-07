import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  apiGetCostInsights,
  apiGetAnalyticsSnapshots,
  apiTriggerSnapshotCompute,
} from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  CopyChip,
  Skeleton,
  Callout,
  EmptyState,
  UsageMeter,
  platformToast,
} from "../../ui";
import {
  HardDrive,
  MessageSquare,
  AlertTriangle,
  Download,
  RefreshCw,
  TrendingUp,
  Server,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { formatBytes, formatNumber, formatDate } from "../../lib/utils/formatters";

export default function UsagePage() {
  const [recomputing, setRecomputing] = useState(false);

  const {
    data: costData,
    isLoading: costLoading,
    refetch: refetchCost,
  } = useQuery({
    queryKey: ["platform", "cost-insights"],
    queryFn: () => apiGetCostInsights().then((r) => r.data),
  });

  const {
    data: snapshotsData,
    isLoading: snapshotsLoading,
  } = useQuery({
    queryKey: ["platform", "analytics-snapshots"],
    queryFn: () => apiGetAnalyticsSnapshots({ limit: 14 }).then((r) => r.data || []),
  });

  const topStorage = costData?.topStorage || [];
  const topWhatsApp = costData?.topWhatsApp || [];
  const fairUseOverages = costData?.fairUseOverages || [];
  const snapshots = snapshotsData || [];

  const totalStorageBytes = topStorage.reduce((acc, t) => acc + (t.storageBytes || 0), 0);
  const totalWhatsAppMessages = topWhatsApp.reduce((acc, t) => acc + (t.whatsappMonthly || 0), 0);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await apiTriggerSnapshotCompute();
      platformToast.success("Infrastructure telemetry snapshot recomputed");
      refetchCost();
    } catch (err) {
      platformToast.error(err?.message || "Failed to recompute telemetry");
    } finally {
      setRecomputing(false);
    }
  };

  const handleExportCsv = () => {
    window.open("/api/platform/analytics/export", "_blank");
    platformToast.success("Exporting telemetry snapshots to CSV...");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Usage & Infrastructure Telemetry
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              Fair-Use Policy
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Real-time multi-tenant resource consumption, WhatsApp gateway volume, and S3 asset storage.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecompute}
            loading={recomputing}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Recalculate Telemetry
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExportCsv}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export Telemetry CSV
          </Button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Cloud Storage Tracked</span>
            <HardDrive className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {formatBytes(totalStorageBytes)}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Gym media, avatars, attachments</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>WhatsApp Dispatches (Mo)</span>
            <MessageSquare className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {formatNumber(totalWhatsAppMessages)}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Automated reminders & OTPs</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Fair-Use Violations</span>
            <AlertTriangle className="w-4 h-4 text-[var(--platform-danger)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-danger)]">
            {fairUseOverages.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Exceeding 25 GB cap</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Telemetry Health</span>
            <Server className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-success)]">
            Active
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Deterministic ledger sync</span>
        </div>
      </div>

      {/* Fair Use Overage Warning if any */}
      {fairUseOverages.length > 0 && (
        <Callout variant="danger">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="w-4 h-4" />
            <span>Fair-Use Storage Cap Exceeded</span>
          </div>
          <p className="mt-1 text-xs">
            {fairUseOverages.length} lifetime subscriber(s) have exceeded their contractual fair-use storage boundary.
            Automated notifications or quota expansion is recommended.
          </p>
        </Callout>
      )}

      {/* Top Consumers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Storage Consumers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[var(--platform-accent)]" />
              <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                Top S3 Storage Consumers
              </h2>
            </div>
            <span className="text-xs text-[var(--platform-text-muted)] font-mono">
              Top 10 Gyms
            </span>
          </div>

          {costLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : topStorage.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="No storage metrics"
              description="No gym storage telemetry has been recorded yet."
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Gym Subscriber</th>
                    <th className="py-2.5 px-3">Billing Cadence</th>
                    <th className="py-2.5 px-3 text-right">Storage Volume</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {topStorage.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--platform-surface-hover)] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[var(--platform-text-primary)]">{t.name}</div>
                        <CopyChip text={t.slug} />
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={t.isLifetime ? "info" : "neutral"}
                          size="xs"
                          className="capitalize"
                        >
                          {t.cycle}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        <span className={t.isStorageOverCap ? "text-[var(--platform-danger)]" : "text-[var(--platform-text-primary)]"}>
                          {t.storageMb} MB
                        </span>
                        {t.isStorageOverCap && (
                          <span className="block text-[10px] text-[var(--platform-danger)]">
                            Over Cap
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link to={`/platform/tenants/${t.id}`}>
                          <Button variant="ghost" size="xs">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top WhatsApp Automation Senders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--platform-success)]" />
              <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                High-Volume WhatsApp Senders
              </h2>
            </div>
            <span className="text-xs text-[var(--platform-text-muted)] font-mono">
              Current Month
            </span>
          </div>

          {costLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : topWhatsApp.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messaging volume"
              description="No WhatsApp dispatches recorded during the current billing cycle."
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Gym Subscriber</th>
                    <th className="py-2.5 px-3">Billing Cadence</th>
                    <th className="py-2.5 px-3 text-right">Monthly Messages</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {topWhatsApp.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--platform-surface-hover)] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[var(--platform-text-primary)]">{t.name}</div>
                        <CopyChip text={t.slug} />
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={t.isLifetime ? "info" : "neutral"}
                          size="xs"
                          className="capitalize"
                        >
                          {t.cycle}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--platform-success)]">
                        {formatNumber(t.whatsappMonthly || 0)} msgs
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link to={`/platform/tenants/${t.id}`}>
                          <Button variant="ghost" size="xs">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
