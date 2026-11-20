import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetSystemHealth,
  apiToggleMaintenanceMode,
  apiTogglePublicSite,
  apiUpdateSystemSetting,
} from "../../lib/api/endpoints";
import { usePlatformRole } from "../../lib/auth/PermissionContext";
import { isValidEmail, isNonNegativeInteger } from "../../lib/utils/validation";
import {
  Button,
  Badge,
  Input,
  Textarea,
  Callout,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import {
  
  Database,
  Cpu,
  Clock,
  ShieldAlert,
  Building,
  Save,
  RefreshCw,
  CheckCircle2,
  Globe,
  Activity,
} from "lucide-react";

const JOB_LABELS = {
  freeze_cycles: "Member freeze cycles",
  expiry_cycles: "Membership expiry",
  assign_open_members: "Assign open members to sales",
  analytics: "Analytics snapshots",
  owner_reminders: "Owner trial & renewal emails",
  dunning: "Dunning (past due and suspension)",
  maintenance_reminders: "Equipment maintenance reminders",
  owner_weekly_digest: "Owner weekly digest",
  audit_dead_letter_replay: "Audit retry queue",
};

const JOB_STATUS = { running: "Running", success: "OK", failed: "Failed" };

function jobVariant(job) {
  if (job.status === "failed") return "danger";
  if (job.overdue && job.status !== "running") return "warning";
  if (job.status === "running") return "info";
  return "success";
}

function formatInterval(ms) {
  if (!ms) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "hour" : `${hours} hours`;
}

function formatRelative(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function MiniStat({ label, value, hint, tone }) {
  return (
    <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface)]">
      <div className="text-[11px] text-[var(--platform-text-muted)]">{label}</div>
      <div
        className={`text-lg font-semibold font-mono ${
          tone === "warning" ? "text-[var(--platform-warning)]" : "text-[var(--platform-text-primary)]"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="text-[10px] text-[var(--platform-text-muted)]">{hint}</div> : null}
    </div>
  );
}

export default function HealthSettingsPage() {
  const { hasRole } = usePlatformRole();
  const isSuperAdmin = hasRole("super_admin");
  const [activeTab, setActiveTab] = useState("seller");

  // Maintenance Toggle State
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);

  const [publicSiteDialogOpen, setPublicSiteDialogOpen] = useState(false);
  const [publicSiteMessage, setPublicSiteMessage] = useState("");
  const [togglingPublicSite, setTogglingPublicSite] = useState(false);

  // Editable Settings States
  // 1. Seller Details — field names match Invoice.sellerDetails
  const [sellerName, setSellerName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [address, setAddress] = useState("");
  const [sellerSaved, setSellerSaved] = useState(true);
  const [savingSeller, setSavingSeller] = useState(false);

  // 2. Dunning Schedule
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [reminderDays, setReminderDays] = useState("3, 1");
  const [trialReminderDays, setTrialReminderDays] = useState("7, 3, 1");
  const [overdueReminderDays, setOverdueReminderDays] = useState("0, 2");
  const [savingDunning, setSavingDunning] = useState(false);

  // Query System Health
  const {
    data: healthData,
    isLoading: _isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["platform", "system-health"],
    queryFn: () => apiGetSystemHealth().then((r) => r.data),
    refetchInterval: 15000,
  });

  const maintenance = healthData?.maintenance || { enabled: false, message: "" };
  const publicSite = healthData?.publicSite || {
    published: false,
    message: "Forma’s public site is under development. Check back soon.",
  };
  const memory = healthData?.memory || { rssMb: 0, heapUsedMb: 0, heapTotalMb: 1 };
  const database = healthData?.database || { status: "unknown", name: "forma" };
  const jobs = Array.isArray(healthData?.jobs) ? healthData.jobs : [];
  const audit = healthData?.audit || null;

  // Sync settings when data arrives
  useEffect(() => {
    if (healthData?.settings) {
      const seller = healthData.settings.sellerDetails;
      if (seller) {
        setSellerName(seller.name || seller.companyName || "");
        setTaxId(seller.taxId || "");
        setSupportEmail(seller.supportEmail || seller.billingEmail || "");
        setAddress(seller.address || "");
        setSellerSaved(true);
      } else {
        setSellerName("Forma");
        setTaxId("EG-TAX-10293847");
        setSupportEmail("billing@forma.app");
        setAddress("Zamalek, Cairo, Egypt");
        setSellerSaved(false);
      }
      const schedule = healthData.settings.dunningSchedule;
      if (schedule) {
        const grace = schedule.gracePeriodDays ?? 3;
        const joinDays = (days, fallback) => (Array.isArray(days) && days.length ? days.join(", ") : fallback);
        setGracePeriodDays(grace);
        setReminderDays(joinDays(schedule.reminderDays, "3, 1"));
        setTrialReminderDays(joinDays(schedule.trialReminderDays, "7, 3, 1"));
        setOverdueReminderDays(joinDays(schedule.overdueReminderDays, `0, ${Math.max(0, grace - 1)}`));
      }
    }
  }, [healthData]);

  // Handle Maintenance Toggle
  const handleToggleMaintenance = async () => {
    setTogglingMaintenance(true);
    try {
      const nextState = !maintenance.enabled;
      await apiToggleMaintenanceMode({
        enabled: nextState,
        message: maintenanceMessage || (nextState ? "System undergoing scheduled platform upgrades." : ""),
      });
      platformToast.success(
        `Global Maintenance Mode ${nextState ? "ACTIVATED" : "DEACTIVATED"}`
      );
      setMaintenanceDialogOpen(false);
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to toggle maintenance mode");
    } finally {
      setTogglingMaintenance(false);
    }
  };

  const handleTogglePublicSite = async () => {
    setTogglingPublicSite(true);
    try {
      const nextPublished = !publicSite.published;
      await apiTogglePublicSite({
        published: nextPublished,
        message:
          publicSiteMessage ||
          (nextPublished
            ? ""
            : "Forma’s public site is under development. Check back soon."),
      });
      platformToast.success(
        nextPublished
          ? "Public www site is live for guests"
          : "Public www site marked under development (super admin preview only)"
      );
      setPublicSiteDialogOpen(false);
      refetch();
    } catch (err) {
      platformToast.error(err?.response?.data?.message || err?.message || "Failed to update public site");
    } finally {
      setTogglingPublicSite(false);
    }
  };

  // Handle Save Seller Details
  const handleSaveSeller = async (e) => {
    e.preventDefault();
    const emailTrim = supportEmail.trim();
    if (!sellerName.trim()) {
      platformToast.error("Legal company name is required");
      return;
    }
    if (!emailTrim || !isValidEmail(emailTrim)) {
      platformToast.error("Please enter a valid billing email address");
      return;
    }
    if (sellerName.trim().length > 120) {
      platformToast.error("Company name must not exceed 120 characters");
      return;
    }
    if (taxId.trim().length > 50) {
      platformToast.error("Tax ID must not exceed 50 characters");
      return;
    }
    if (address.trim().length > 300) {
      platformToast.error("Address must not exceed 300 characters");
      return;
    }

    setSavingSeller(true);
    try {
      await apiUpdateSystemSetting("seller_details", {
        value: {
          name: sellerName.trim(),
          taxId: taxId.trim(),
          supportEmail: emailTrim,
          address: address.trim(),
        },
        description: "Official seller & VAT tax invoicing identity",
      });
      platformToast.success("Seller tax & invoice details saved");
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to update seller details");
    } finally {
      setSavingSeller(false);
    }
  };

  // Handle Save Dunning Schedule
  const handleSaveDunning = async (e) => {
    e.preventDefault();
    if (!isNonNegativeInteger(gracePeriodDays)) {
      platformToast.error("Grace period days must be a whole number of at least 0");
      return;
    }
    const parseDays = (raw) =>
      String(raw)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map(Number);
    const lists = {
      reminderDays: parseDays(reminderDays),
      trialReminderDays: parseDays(trialReminderDays),
      overdueReminderDays: parseDays(overdueReminderDays),
    };
    const invalid = Object.values(lists).some(
      (days) => !days.length || days.some((value) => !Number.isInteger(value) || value < 0 || value > 60)
    );
    if (invalid) {
      platformToast.error("Each reminder list needs whole numbers from 0 to 60, separated by commas");
      return;
    }
    if (Number(gracePeriodDays) > 0 && lists.overdueReminderDays.some((day) => day >= Number(gracePeriodDays))) {
      platformToast.error("Overdue reminders must be sent before the grace period ends");
      return;
    }

    setSavingDunning(true);
    try {
      await apiUpdateSystemSetting("dunning_schedule", {
        value: {
          gracePeriodDays: Number(gracePeriodDays),
          ...lists,
        },
        description: "Automated dunning schedule and grace period policy",
      });
      platformToast.success("Dunning schedule parameters saved");
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to update dunning schedule");
    } finally {
      setSavingDunning(false);
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return "0m";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              System Health & Operational Configuration
            </h1>
            <Badge
              variant={healthData?.status === "healthy" ? "success" : "danger"}
              size="sm"
              className="font-mono"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {healthData?.status === "healthy" ? "All Systems Operational" : "Degraded"}
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Real-time Node.js process telemetry, MongoDB cluster status, global maintenance gate, and seller tax settings.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          loading={isFetching}
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Poll Telemetry
        </Button>
      </div>

      {/* Real-Time Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>MongoDB Cluster</span>
            <Database
              className={`w-4 h-4 ${
                /connected|healthy|ok/i.test(database.status || "")
                  ? "text-[var(--platform-success)]"
                  : /down|error|disconnected|fail/i.test(database.status || "")
                    ? "text-[var(--platform-danger)]"
                    : "text-[var(--platform-text-muted)]"
              }`}
            />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)] capitalize">
            {database.status}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">DB: {database.name}</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Process Memory RSS</span>
            <Cpu className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {memory.rssMb} MB
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">
            Heap: {memory.heapUsedMb} / {memory.heapTotalMb} MB
          </span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Engine Uptime</span>
            <Clock className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {formatUptime(healthData?.uptimeSeconds)}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Continuous availability</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Maintenance Gate</span>
            <ShieldAlert className="w-4 h-4 text-[var(--platform-warning)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {maintenance.enabled ? "ACTIVE" : "STANDBY"}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">
            {maintenance.enabled ? "Public access locked" : "Normal traffic flow"}
          </span>
        </div>
      </div>

      {/* Global Maintenance Mode Controller Card */}
      <div className={`p-5 rounded-xl border transition-all ${
        maintenance.enabled
          ? "bg-[var(--platform-warning-surface)] border-[var(--platform-warning-border)]"
          : "bg-[var(--platform-surface-raised)] border-[var(--platform-border-subtle)]"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={`p-2.5 rounded-lg ${
              maintenance.enabled
                ? "bg-[var(--platform-warning)]/20 text-[var(--platform-warning)]"
                : "bg-[var(--platform-neutral-surface)] text-[var(--platform-text-muted)]"
            }`}>
              <ShieldAlert className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-[var(--platform-text-primary)]">
                  Global Maintenance Gate
                </h3>
                <Badge
                  variant={maintenance.enabled ? "warning" : "neutral"}
                  size="xs"
                >
                  {maintenance.enabled ? "Traffic Blocked" : "Disabled"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--platform-text-secondary)] mt-1 max-w-2xl">
                When enabled, all gym tenant dashboard traffic is routed to the maintenance screen.
                Platform Super Admin consoles remain accessible.
              </p>
              {maintenance.enabled && maintenance.message && (
                <div className="mt-2 text-xs font-mono text-[var(--platform-warning)] bg-[var(--platform-surface)]/60 p-2 rounded border border-[var(--platform-warning-border)]">
                  Notice: "{maintenance.message}"
                </div>
              )}
            </div>
          </div>

          <Button
            variant={maintenance.enabled ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setMaintenanceMessage(maintenance.message || "Scheduled system upgrades in progress.");
              setMaintenanceDialogOpen(true);
            }}
          >
            {maintenance.enabled ? "Deactivate Maintenance" : "Activate Maintenance Mode"}
          </Button>
        </div>
      </div>

      {/* Public www marketing visibility (super_admin) */}
      {isSuperAdmin ? (
        <div
          className={`p-5 rounded-xl border transition-all ${
            publicSite.published
              ? "bg-[var(--platform-surface-raised)] border-[var(--platform-border-subtle)]"
              : "bg-[var(--platform-info-surface)] border-[var(--platform-info-border)]"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className={`p-2.5 rounded-lg ${
                  publicSite.published
                    ? "bg-[var(--platform-success-subtle)] text-[var(--platform-success)]"
                    : "bg-[var(--platform-info)]/15 text-[var(--platform-info)]"
                }`}
              >
                <Globe className="w-6 h-6" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-[var(--platform-text-primary)]">
                    Public marketing site (www)
                  </h3>
                  <Badge variant={publicSite.published ? "success" : "info"} size="xs">
                    {publicSite.published ? "Published" : "Under development"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--platform-text-secondary)] mt-1 max-w-2xl">
                  When under development, guests on <span className="font-mono">www.forma-official.com</span>{" "}
                  see a coming-soon page. Platform super admins can still preview after signing in on{" "}
                  <span className="font-mono">*.forma-official.com</span> (preview cookie shared across the
                  domain).
                </p>
                {!publicSite.published && publicSite.message ? (
                  <div className="mt-2 text-xs font-mono text-[var(--platform-info)] bg-[var(--platform-surface)]/60 p-2 rounded border border-[var(--platform-info-border)]">
                    Guest notice: &quot;{publicSite.message}&quot;
                  </div>
                ) : null}
                <a
                  href={
                    typeof window !== "undefined" &&
                    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
                      ? "/"
                      : "https://www.forma-official.com/"
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-xs font-medium text-[var(--platform-accent)] underline-offset-2 hover:underline"
                >
                  Open www public site
                </a>
              </div>
            </div>

            <Button
              variant={publicSite.published ? "outline" : "primary"}
              size="sm"
              onClick={() => {
                setPublicSiteMessage(
                  publicSite.message || "Forma’s public site is under development. Check back soon."
                );
                setPublicSiteDialogOpen(true);
              }}
            >
              {publicSite.published ? "Mark under development" : "Publish to guests"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="p-5 rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--platform-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">Background jobs & audit trail</h2>
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">
            Each job runs on one server at a time. A job is flagged when it has not succeeded within three of its intervals.
          </span>
        </div>

        {audit && (audit.pendingDeadLetters > 0 || audit.lost > 0) ? (
          <Callout variant="warning">
            {audit.pendingDeadLetters > 0
              ? `${audit.pendingDeadLetters} audit entries could not be written and are queued for retry. `
              : ""}
            {audit.lost > 0
              ? `${audit.lost} audit entries were lost on this server since it started; check the error logs for AUDIT_LOST. `
              : ""}
            {audit.lastError ? `Last error: ${audit.lastError}` : ""}
          </Callout>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <MiniStat label="Audit entries written" value={audit?.written ?? 0} hint="Since this server started" />
          <MiniStat label="Writes retried" value={audit?.retried ?? 0} hint="Recovered on retry" />
          <MiniStat
            label="Queued for retry"
            value={audit?.pendingDeadLetters ?? "—"}
            hint="Retried every hour"
            tone={audit?.pendingDeadLetters > 0 ? "warning" : undefined}
          />
          <MiniStat
            label="Error monitoring"
            value={healthData?.monitoring?.sentry ? "On" : "Off"}
            hint={healthData?.monitoring?.sentry ? "Errors are reported to Sentry" : "Set SENTRY_DSN to enable"}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--platform-text-muted)] border-b border-[var(--platform-border-subtle)]">
                <th className="py-2 pr-3 font-medium">Job</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Last success</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 pr-3 font-medium">Runs / failures</th>
                <th className="py-2 font-medium">Last error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[var(--platform-text-muted)]">
                    No job runs recorded yet. Jobs record their first run a few minutes after the server starts.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.name} className="border-b border-[var(--platform-border-subtle)] last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-[var(--platform-text-primary)]">{JOB_LABELS[job.name] || job.name}</div>
                      <div className="text-[11px] text-[var(--platform-text-muted)]">
                        Every {formatInterval(job.intervalMs)}
                        {job.instance ? ` · ${job.instance}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={jobVariant(job)} size="xs">
                        {job.overdue && job.status !== "running" ? "Overdue" : JOB_STATUS[job.status] || job.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[var(--platform-text-secondary)]">
                      {formatRelative(job.lastSuccessAt)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[var(--platform-text-secondary)]">
                      {job.lastDurationMs != null ? `${(job.lastDurationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[var(--platform-text-secondary)]">
                      {job.runCount} / {job.failureCount}
                    </td>
                    <td className="py-2 text-[var(--platform-danger)] max-w-xs truncate" title={job.lastError || ""}>
                      {job.status === "failed" ? job.lastError : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform Operational Configuration Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-[var(--platform-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
            Platform Operational Configuration
          </h2>
        </div>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <TabsList>
            <TabTrigger value="seller">
              Seller & Tax Identity
            </TabTrigger>
            <TabTrigger value="dunning">
              Dunning & Grace Periods
            </TabTrigger>
          </TabsList>

          {/* Tab 1: Seller Details */}
          <TabContent value="seller" className="mt-4">
            <form
              onSubmit={handleSaveSeller}
              className="p-5 rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] space-y-4 max-w-2xl"
            >
              {!sellerSaved && (
                <Callout variant="warning">
                  Seller identity is not saved yet. Invoices currently fall back to these defaults until you save them.
                </Callout>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                    Legal Company Name <span className="text-[var(--platform-danger)]">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Forma"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                    Tax / VAT Identification
                  </label>
                  <Input
                    placeholder="e.g. US-EIN-99201948"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Billing & Accounts Receivable Email <span className="text-[var(--platform-danger)]">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="billing@forma.app"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Physical Corporate Address
                </label>
                <Textarea
                  rows={2}
                  placeholder="100 Tech Boulevard, Suite 400, New York, NY 10001"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" variant="primary" loading={savingSeller}>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Seller Credentials
                </Button>
              </div>
            </form>
          </TabContent>

          {/* Tab 2: Dunning Schedule */}
          <TabContent value="dunning" className="mt-4">
            <form
              onSubmit={handleSaveDunning}
              className="p-5 rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] space-y-4 max-w-2xl"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Dunning Grace Period (Days)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                  required
                />
                <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
                  How long a gym stays past due (still usable) after its billing period ends. When the grace period ends, the gym is suspended automatically. Use 0 to suspend right away.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Renewal reminders (days before the period ends)
                </label>
                <Input
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  placeholder="3, 1"
                />
                <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
                  Comma-separated days. Example: 3, 1 emails the owner three days and one day before renewal is due.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Trial reminders (days before the trial ends)
                </label>
                <Input
                  value={trialReminderDays}
                  onChange={(e) => setTrialReminderDays(e.target.value)}
                  placeholder="7, 3, 1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                  Overdue reminders (days after going past due)
                </label>
                <Input
                  value={overdueReminderDays}
                  onChange={(e) => setOverdueReminderDays(e.target.value)}
                  placeholder="0, 2"
                />
                <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
                  0 sends a notice the day the gym becomes past due. Each value must be less than the grace period.
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" variant="primary" loading={savingDunning}>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Dunning Policy
                </Button>
              </div>
            </form>
          </TabContent>
        </Tabs>
      </div>

      {/* Maintenance Toggle Dialog */}
      <ConfirmDialog
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        title={maintenance.enabled ? "Disable Global Maintenance Mode" : "Activate Global Maintenance Mode"}
        description={
          maintenance.enabled
            ? "Disabling maintenance will immediately restore public gym app traffic."
            : "Activating maintenance mode will immediately lock public tenant traffic and display the broadcast notice."
        }
        confirmText={maintenance.enabled ? "Restore Normal Access" : "Activate Maintenance Gate"}
        variant={maintenance.enabled ? "primary" : "warning"}
        requireReason={false}
        loading={togglingMaintenance}
        onConfirm={handleToggleMaintenance}
      >
        {!maintenance.enabled && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Public Notice
            </label>
            <Textarea
              rows={3}
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="Scheduled system upgrades in progress."
            />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={publicSiteDialogOpen}
        onOpenChange={setPublicSiteDialogOpen}
        title={publicSite.published ? "Mark www as under development" : "Publish www to guests"}
        description={
          publicSite.published
            ? "Guests will only see a coming-soon page. Super admins signed in on forma-official.com can still preview."
            : "The public marketing site on www will become visible to everyone."
        }
        confirmText={publicSite.published ? "Mark under development" : "Publish to guests"}
        variant={publicSite.published ? "warning" : "primary"}
        requireReason={false}
        loading={togglingPublicSite}
        onConfirm={handleTogglePublicSite}
      >
        {publicSite.published ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Guest notice
            </label>
            <Textarea
              rows={3}
              value={publicSiteMessage}
              onChange={(e) => setPublicSiteMessage(e.target.value)}
              placeholder="Forma’s public site is under development. Check back soon."
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
