import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetSystemHealth,
  apiToggleMaintenanceMode,
  apiUpdateSystemSetting,
} from "../../lib/api/endpoints";
import { isValidEmail, isNonNegativeInteger } from "../../lib/utils/validation";
import {
  Button,
  Badge,
  Input,
  Textarea,
  Select,
  Switch,
  Callout,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  Skeleton,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import {
  Activity,
  Server,
  Database,
  Cpu,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Building,
  CreditCard,
  Archive,
  Save,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function HealthSettingsPage() {
  const [activeTab, setActiveTab] = useState("seller");

  // Maintenance Toggle State
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);

  // Editable Settings States
  // 1. Seller Details
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [address, setAddress] = useState("");
  const [savingSeller, setSavingSeller] = useState(false);

  // 2. Dunning Schedule
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [savingDunning, setSavingDunning] = useState(false);

  // Query System Health
  const {
    data: healthData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["platform", "system-health"],
    queryFn: () => apiGetSystemHealth().then((r) => r.data),
    refetchInterval: 15000,
  });

  const maintenance = healthData?.maintenance || { enabled: false, message: "" };
  const memory = healthData?.memory || { rssMb: 0, heapUsedMb: 0, heapTotalMb: 1 };
  const database = healthData?.database || { status: "unknown", name: "leap" };

  // Sync settings when data arrives
  useEffect(() => {
    if (healthData?.settings) {
      if (healthData.settings.sellerDetails) {
        setCompanyName(healthData.settings.sellerDetails.companyName || "");
        setTaxId(healthData.settings.sellerDetails.taxId || "");
        setBillingEmail(healthData.settings.sellerDetails.billingEmail || "");
        setAddress(healthData.settings.sellerDetails.address || "");
      }
      if (healthData.settings.dunningSchedule) {
        setGracePeriodDays(healthData.settings.dunningSchedule.gracePeriodDays ?? 3);
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

  // Handle Save Seller Details
  const handleSaveSeller = async (e) => {
    e.preventDefault();
    const emailTrim = billingEmail.trim();
    if (emailTrim && !isValidEmail(emailTrim)) {
      platformToast.error("Please enter a valid billing email address");
      return;
    }
    if (companyName.trim().length > 120) {
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
          companyName: companyName.trim(),
          taxId: taxId.trim(),
          billingEmail: emailTrim,
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

    setSavingDunning(true);
    try {
      await apiUpdateSystemSetting("dunning_schedule", {
        value: {
          gracePeriodDays: Number(gracePeriodDays),
          reminderDays: [3, 1],
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>MongoDB Cluster</span>
            <Database className="w-4 h-4 text-[var(--platform-success)]" />
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                    Legal Company Name <span className="text-[var(--platform-danger)]">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Flame Gym Technologies LLC"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
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
                  placeholder="billing@gymflame.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
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
                  Subscribers remain active for this duration following an initial invoice failure before automated suspension.
                </span>
              </div>

              <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] space-y-1 text-xs text-[var(--platform-text-secondary)]">
                <span className="font-semibold text-[var(--platform-text-primary)]">
                  Automated Dunning Retries:
                </span>
                <p className="text-[11px] text-[var(--platform-text-muted)]">
                  Payment attempts are executed at Day 3 and Day 1 before grace period expiration.
                </p>
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
      />
    </div>
  );
}
