import { useState } from "react";
import { useDetailCrumb } from "../../lib/pageMeta";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Ban,
  CheckCircle,
  Download,
  Trash2,
  Pin,
  X,
  Sliders,
  Sparkles,
} from "lucide-react";
import {
  apiGetTenantDetail,
  apiUpdateTenantLifecycle,
  apiAddTenantNote,
  apiDeleteTenantNote,
  apiUpdateTenantTags,
  apiPurgeTenant,
  apiCreateImpersonationSession,
  apiExportTenantData,
} from "../../lib/api/endpoints";
import { Button } from "../../ui/Button";
import { Badge, StatusPill } from "../../ui/Badge";
import { CopyChip } from "../../ui/CopyChip";
import { UsageMeter } from "../../ui/UsageMeter";
import { Tabs, TabsList, TabTrigger, TabContent } from "../../ui/Tabs";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { Checkbox } from "../../ui/Checkbox";
import { Skeleton } from "../../ui/Skeleton";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import TenantOverridesModal from "./TenantOverridesModal";
import TenantFeatureEditor from "./TenantFeatureEditor";
import TenantStaffAccess from "./TenantStaffAccess";
import { usePermission } from "../../lib/auth/PermissionContext";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { formatCurrency, formatDate, formatBytes } from "../../lib/utils/formatters";
import { platformToast } from "../../ui/Toast";

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Tab & Form states
  const [activeTab, setActiveTab] = useState("overview");
  const [newNote, setNewNote] = useState("");
  const [isNotePinned, setIsNotePinned] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [tagInput, setTagInput] = useState("");

  // Modals state
  const [lifecycleModal, setLifecycleModal] = useState({
    isOpen: false,
    action: null,
    title: "",
    impactSummary: "",
  });
  const [purgeModal, setPurgeModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [overridesModalOpen, setOverridesModalOpen] = useState(false);

  // Permissions
  const canLifecycle = usePermission("tenants.lifecycle");
  const canPurge = usePermission("tenants.purge");
  const canSupport = usePermission("support.impersonate_read");
  const canNotes = usePermission("tenants.notes");

  const { startImpersonation } = usePlatformAuth();

  // Load tenant detail
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tenant-detail", id],
    queryFn: async () => {
      const res = await apiGetTenantDetail(id);
      return res.data;
    },
  });

  const tenant = data?.tenant;
  useDetailCrumb(tenant?.name);
  const usage = data?.usage || {};
  const effectiveLimits = data?.effectiveLimits || tenant?.effectiveLimits || {};
  const effectiveFeatures = Array.isArray(data?.effectiveFeatures)
    ? data.effectiveFeatures
    : (Array.isArray(tenant?.effectiveFeatures) ? tenant.effectiveFeatures : Object.keys(data?.effectiveFeatures || {}));
  const effectiveRoles = Array.isArray(data?.effectiveRoles)
    ? data.effectiveRoles
    : (Array.isArray(tenant?.effectiveRoles) ? tenant.effectiveRoles : (tenant?.planId?.allowedRoles || tenant?.plan?.allowedRoles || []));
  const memberCount = usage.memberCount ?? usage.members ?? 0;
  const staffCount = usage.staffCount ?? usage.staff ?? 0;
  const notes = data?.notes || [];
  const recentAudit = data?.recentAudit || [];
  const recentLedger = data?.recentLedger || [];
  const invoices = data?.invoices || recentLedger;

  // Add Note Handler
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setAddingNote(true);
    try {
      await apiAddTenantNote(id, {
        text: newNote.trim(),
        pinned: isNotePinned,
      });
      platformToast.success("Internal note added");
      setNewNote("");
      setIsNotePinned(false);
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  // Delete Note Handler
  const handleDeleteNote = async (noteId) => {
    try {
      await apiDeleteTenantNote(id, noteId);
      platformToast.success("Note removed");
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to delete note");
    }
  };

  // Add Tag Handler
  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!tagInput.trim()) return;

    const currentTags = tenant.tags || [];
    const newTag = tagInput.trim().toLowerCase();
    if (currentTags.includes(newTag)) {
      setTagInput("");
      return;
    }

    try {
      await apiUpdateTenantTags(id, { tags: [...currentTags, newTag] });
      platformToast.success(`Tag '${newTag}' added`);
      setTagInput("");
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to update tags");
    }
  };

  // Remove Tag Handler
  const handleRemoveTag = async (tagToRemove) => {
    const nextTags = (tenant.tags || []).filter((t) => t !== tagToRemove);
    try {
      await apiUpdateTenantTags(id, { tags: nextTags });
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to remove tag");
    }
  };

  // Handle Lifecycle Confirmation
  const handleConfirmLifecycle = async ({ reason }) => {
    setActionLoading(true);
    try {
      await apiUpdateTenantLifecycle(id, {
        action: lifecycleModal.action,
        reason,
        ...(lifecycleModal.action === "extend_trial" ? { days: 7 } : {}),
      });

      platformToast.success(`Action '${lifecycleModal.action}' applied to ${tenant.name}`);
      setLifecycleModal({ isOpen: false, action: null });
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Launch Impersonation
  const handleLaunchImpersonate = async () => {
    try {
      const res = await apiCreateImpersonationSession({
        tenantId: id,
        mode: "read_only",
        reason: "Direct console tenant inspection",
      });

      startImpersonation({
        token: res.data.token,
        tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug },
        mode: "read_only",
      });

      localStorage.setItem("token", res.data.token);
      platformToast.success(`Read-only session initiated for ${tenant.name}.`);
      window.open("/members", "_blank");
    } catch (err) {
      platformToast.error(err.message || "Failed to start impersonation");
    }
  };

  // Handle Export Data
  const handleExportData = async () => {
    try {
      const res = await apiExportTenantData(id);
      const dataStr =
        "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tenant-export-${tenant.slug}-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      platformToast.success("Tenant archive exported and downloaded");
    } catch (err) {
      platformToast.error(err.message || "Export failed");
    }
  };

  // Handle Hard Purge
  const handleConfirmPurge = async ({ reason, typedSlug }) => {
    setActionLoading(true);
    try {
      await apiPurgeTenant(id, { slugConfirmation: typedSlug, reason });
      platformToast.success(`Gym '${tenant.name}' purged forever.`);
      navigate("/platform/tenants");
    } catch (err) {
      platformToast.error(err.message || "Purge failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse text-left">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-base font-semibold text-[var(--platform-text-primary)]">
          Gym Tenant Not Found
        </h2>
        <p className="text-xs text-[var(--platform-text-muted)]">
          The requested subscriber workspace may have been purged or does not exist.
        </p>
        <Link to="/platform/tenants">
          <Button size="sm" variant="outline" leftIcon={ArrowLeft}>
            Back to Subscribers List
          </Button>
        </Link>
      </div>
    );
  }

  const cycle = tenant.billing?.cycle || "monthly";
  const intervalCount = tenant.billing?.intervalCount || 1;
  const isLifetime = cycle === "lifetime";
  const durationLabel = isLifetime
    ? "Lifetime"
    : cycle === "yearly"
      ? intervalCount === 1
        ? "1 year"
        : `${intervalCount} years`
      : intervalCount === 1
        ? "1 month"
        : `${intervalCount} months`;

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      {/* ── 1. Top Breadcrumb & Page Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--platform-border-subtle)]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[var(--platform-text-muted)] mb-1">
            <Link
              to="/platform/tenants"
              className="inline-flex items-center gap-1 hover:text-[var(--platform-text-primary)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Gyms</span>
            </Link>
            <span>/</span>
            <span className="platform-mono font-medium">{tenant.slug}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-[var(--platform-text-primary)]">
              {tenant.name}
            </h1>
            <CopyChip value={tenant.slug} prefix="/" />
            <StatusPill status={tenant.status} />
            <Badge variant={isLifetime ? "success" : "neutral"} size="sm">
              {durationLabel}
            </Badge>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canSupport && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={ExternalLink}
              onClick={handleLaunchImpersonate}
            >
              View As Gym
            </Button>
          )}

          {canLifecycle && (
            <>
              {tenant.status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={Ban}
                  onClick={() =>
                    setLifecycleModal({
                      isOpen: true,
                      action: "suspend",
                      title: `Suspend Gym: ${tenant.name}`,
                      impactSummary:
                        "Blocks staff and member logins across this workspace immediately.",
                    })
                  }
                  className="text-[var(--platform-danger)] border-[var(--platform-danger)]/30 hover:bg-[var(--platform-danger-subtle)]"
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={CheckCircle}
                  onClick={() =>
                    setLifecycleModal({
                      isOpen: true,
                      action: "reactivate",
                      title: `Reactivate Gym: ${tenant.name}`,
                      impactSummary: "Restores normal access for staff and members immediately.",
                    })
                  }
                >
                  Reactivate
                </Button>
              )}
            </>
          )}

          <Button size="sm" variant="outline" leftIcon={Download} onClick={handleExportData}>
            Export JSON
          </Button>

          {canPurge && (
            <Button
              size="sm"
              variant="danger-outline"
              leftIcon={Trash2}
              onClick={() => setPurgeModal(true)}
            >
              Purge
            </Button>
          )}
        </div>
      </div>

      {/* ── 2. Top Summary Strip (KPIs & Metrics) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
            Active Plan
          </div>
          <div className="text-base font-bold text-[var(--platform-text-primary)] capitalize">
            {tenant.plan?.name || tenant.planId?.name || "Basic Tier"}
          </div>
          <div className="text-[11px] platform-mono text-[var(--platform-text-muted)]">
            {isLifetime ? "Lifetime License" : `Renews ${formatDate(tenant.currentPeriodEnd)}`}
          </div>
        </div>

        <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
            Member Capacity
          </div>
          <div className="text-base font-bold platform-mono text-[var(--platform-text-primary)]">
            {memberCount} / {effectiveLimits.maxMembers || 500}
          </div>
          <div className="text-[11px] text-[var(--platform-text-muted)]">
            {Math.round((memberCount / (effectiveLimits.maxMembers || 500)) * 100)}% utilized
          </div>
        </div>

        <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
            Storage Consumed
          </div>
          <div className="text-base font-bold platform-mono text-[var(--platform-text-primary)]">
            {formatBytes(usage.storageBytes || 0)}
          </div>
          <div className="text-[11px] text-[var(--platform-text-muted)]">
            {isLifetime
              ? `Fair-use cap: ${usage.storageLimitGb || 25} GB`
              : `Plan allowance: ${usage.storageLimitGb || tenant.plan?.fairUseCaps?.storageGb || 25} GB`}
          </div>
        </div>

        <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
            Primary Owner
          </div>
          <div className="text-base font-bold text-[var(--platform-text-primary)] truncate">
            {tenant.ownerUserId?.name || "Unassigned"}
          </div>
          <div className="text-[11px] platform-mono text-[var(--platform-text-muted)] truncate">
            {tenant.ownerUserId?.email || "—"}
          </div>
        </div>
      </div>

      {/* ── 3. Tabs Navigation ── */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabTrigger value="overview">Overview & Limits</TabTrigger>
          <TabTrigger value="features">Features</TabTrigger>
          <TabTrigger value="access">Access</TabTrigger>
          <TabTrigger value="notes" badge={notes.length}>
            Internal Notes
          </TabTrigger>
          <TabTrigger value="tags" badge={(tenant.tags || []).length}>
            Tags & Metadata
          </TabTrigger>
          <TabTrigger value="billing" badge={invoices.length}>
            Billing & Invoices
          </TabTrigger>
          <TabTrigger value="audit" badge={recentAudit.length}>
            Audit Trail
          </TabTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW & LIMITS */}
        <TabContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Capacity Usage Meters */}
            <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
              <h3 className="text-sm font-semibold text-[var(--platform-text-primary)] pb-2 border-b border-[var(--platform-border-subtle)]">
                Telemetry & Resource Quotas
              </h3>
              <div className="space-y-4">
                <UsageMeter
                  label="Member Capacity Limit"
                  current={memberCount}
                  max={effectiveLimits.maxMembers || 500}
                  unit="members"
                />
                <UsageMeter
                  label="Staff / Operator Seats"
                  current={staffCount}
                  max={effectiveLimits.maxStaff || 10}
                  unit="staff"
                />
                <UsageMeter
                  label="Disk Storage Consumption"
                  current={Math.round(((usage.storageBytes || 0) / (1024 * 1024 * 1024)) * 10) / 10}
                  max={usage.storageLimitGb || effectiveLimits.storageGb || (isLifetime ? (tenant.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25) : (tenant.plan?.fairUseCaps?.storageGb || 25))}
                  unit="GB"
                />
              </div>
            </div>

            {/* Right: Plan Entitlements & Feature Customizer */}
            <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-[var(--platform-border-subtle)]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                    Plan Entitlements & Features
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[var(--platform-text-muted)]">
                      Tier: <strong>{tenant.plan?.name || tenant.planId?.name || "Basic"}</strong>
                    </span>
                    {(tenant.featureOverrides?.add?.length > 0 || tenant.roleOverrides?.add?.length > 0) && (
                      <Badge variant="accent" size="xs">
                        Custom Overrides Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setActiveTab("features")}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Edit features
                  </Button>
                  {canLifecycle && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setOverridesModalOpen(true)}
                    >
                      <Sliders className="w-3.5 h-3.5 mr-1" />
                      Roles & limits
                    </Button>
                  )}
                </div>
              </div>

              {/* Overrides Callout if present */}
              {(tenant.featureOverrides?.add?.length > 0 || tenant.featureOverrides?.remove?.length > 0) && (
                <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Custom Entitlements Granted</span>
                  </div>
                  {tenant.featureOverrides?.add?.length > 0 && (
                    <div className="text-[11px]">
                      Added features: <span className="font-mono">{tenant.featureOverrides.add.join(", ")}</span>
                    </div>
                  )}
                  {tenant.featureOverrides?.remove?.length > 0 && (
                    <div className="text-[11px]">
                      Revoked features: <span className="font-mono">{tenant.featureOverrides.remove.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Features Matrix Grid */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] block">
                  Active Features ({effectiveFeatures.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs max-h-52 overflow-y-auto pr-1">
                  {effectiveFeatures.length === 0 ? (
                    <span className="text-xs text-[var(--platform-text-muted)] col-span-2">
                      No active features enabled.
                    </span>
                  ) : (
                    effectiveFeatures.map((featKey) => {
                      const isCustomAdded = (tenant.featureOverrides?.add || []).includes(featKey);
                      return (
                        <div
                          key={featKey}
                          className={`flex items-center justify-between p-2 rounded-[var(--platform-radius-sm)] border ${
                            isCustomAdded
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300"
                              : "bg-[var(--platform-surface-subtle)] border-[var(--platform-border-subtle)]"
                          }`}
                        >
                          <span className="platform-mono text-[11px]">
                            {featKey}
                          </span>
                          <Badge variant={isCustomAdded ? "accent" : "success"} size="xs">
                            {isCustomAdded ? "Custom (+)" : "Included"}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Allowed Roles Grid */}
              <div className="space-y-2 pt-2 border-t border-[var(--platform-border-subtle)]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] block">
                  Permitted Staff Roles ({effectiveRoles.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveRoles.length === 0 ? (
                    <span className="text-xs text-[var(--platform-text-muted)]">
                      No permitted staff roles configured.
                    </span>
                  ) : (
                    effectiveRoles.map((roleKey) => {
                      const isCustomAdded = (tenant.roleOverrides?.add || []).includes(roleKey);
                      return (
                        <Badge
                          key={roleKey}
                          variant={isCustomAdded ? "accent" : "neutral"}
                          size="xs"
                        >
                          {roleKey} {isCustomAdded && "(+)"}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabContent>

        <TabContent value="features">
          <TenantFeatureEditor tenant={tenant} onSaved={refetch} />
        </TabContent>

        <TabContent value="access">
          <TenantStaffAccess tenantId={id} />
        </TabContent>

        {/* TAB 2: INTERNAL NOTES */}
        <TabContent value="notes">
          <div className="space-y-6">
            {canNotes && (
              <form
                onSubmit={handleAddNote}
                className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                    Add Operator Audit Note
                  </h3>
                  <Checkbox
                    label="Pin note to top"
                    checked={isNotePinned}
                    onChange={setIsNotePinned}
                  />
                </div>

                <Textarea
                  placeholder="Record support interactions, special pricing agreements, or churn mitigation notes..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={2}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    loading={addingNote}
                    disabled={!newNote.trim()}
                  >
                    Save Note
                  </Button>
                </div>
              </form>
            )}

            {/* Notes List */}
            <div className="space-y-3">
              {notes.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--platform-text-muted)] rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
                  No internal operator notes recorded for this gym.
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note._id}
                    className="p-4 rounded-[var(--platform-radius-md)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {note.pinned && (
                          <Badge variant="accent" size="sm">
                            <Pin className="w-2.5 h-2.5 mr-1" />
                            Pinned
                          </Badge>
                        )}
                        <span className="font-semibold text-[var(--platform-text-primary)]">
                          {note.authorName || "Platform Operator"}
                        </span>
                        <span className="text-[11px] platform-mono text-[var(--platform-text-muted)]">
                          {formatDate(note.createdAt, true)}
                        </span>
                      </div>

                      {canNotes && (
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note._id)}
                          aria-label="Delete operator note"
                          className="text-[var(--platform-text-muted)] hover:text-[var(--platform-danger)] transition-colors cursor-pointer p-0.5 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <p className="text-[var(--platform-text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {note.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabContent>

        {/* TAB 3: TAGS & METADATA */}
        <TabContent value="tags">
          <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
            <h3 className="text-sm font-semibold text-[var(--platform-text-primary)] pb-2 border-b border-[var(--platform-border-subtle)]">
              Operational Tags
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              {(tenant.tags || []).length === 0 ? (
                <span className="text-xs text-[var(--platform-text-muted)]">
                  No tags assigned yet.
                </span>
              ) : (
                (tenant.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] text-xs platform-mono font-medium"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="text-[var(--platform-text-muted)] hover:text-[var(--platform-danger)] p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            <form onSubmit={handleAddTag} className="flex items-center gap-2 pt-3 max-w-sm">
              <Input
                placeholder="Add tag (e.g. vip, churn-risk)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <Button type="submit" size="md" variant="secondary" disabled={!tagInput.trim()}>
                Add Tag
              </Button>
            </form>
          </div>
        </TabContent>

        {/* TAB 4: BILLING & INVOICES */}
        <TabContent value="billing">
          <div className="space-y-6">
            {/* Invoices */}
            <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] overflow-hidden">
              <div className="p-4 border-b border-[var(--platform-border-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                  Invoices & Transactions
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--platform-surface-subtle)] uppercase text-[10px] font-bold text-[var(--platform-text-muted)] border-b border-[var(--platform-border)]">
                    <tr>
                      <th className="py-2.5 px-4">Invoice #</th>
                      <th className="py-2.5 px-4">Cycle</th>
                      <th className="py-2.5 px-4">Amount</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[var(--platform-text-muted)]">
                          No invoices generated for this subscriber.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv._id} className="hover:bg-[var(--platform-surface-subtle)]/50">
                          <td className="py-3 px-4 platform-mono font-semibold">
                            {inv.invoiceNumber || inv.externalRef || inv._id}
                          </td>
                          <td className="py-3 px-4 capitalize">{inv.cycle || "Monthly"}</td>
                          <td className="py-3 px-4 platform-mono font-bold">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusPill status={inv.status || inv.type || "active"} />
                          </td>
                          <td className="py-3 px-4 platform-mono text-[var(--platform-text-muted)]">
                            {formatDate(inv.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabContent>

        {/* TAB 5: AUDIT TRAIL */}
        <TabContent value="audit">
          <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] overflow-hidden">
            <div className="p-4 border-b border-[var(--platform-border-subtle)]">
              <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
                Recent Security & Lifecycle Audit Events
              </h3>
            </div>
            <div className="divide-y divide-[var(--platform-border-subtle)] text-xs">
              {recentAudit.length === 0 ? (
                <div className="p-8 text-center text-[var(--platform-text-muted)]">
                  No audit logs recorded for this tenant.
                </div>
              ) : (
                recentAudit.map((log) => (
                  <div key={log._id} className="p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="accent" size="sm">
                          {log.action}
                        </Badge>
                        <span className="text-[var(--platform-text-muted)] platform-mono text-[11px]">
                          by {log.meta?.actorEmail || "Platform Admin"}
                        </span>
                      </div>
                      {log.meta?.reason && (
                        <div className="text-[var(--platform-text-secondary)] italic">
                          "{log.meta.reason}"
                        </div>
                      )}
                    </div>
                    <span className="platform-mono text-[11px] text-[var(--platform-text-muted)] shrink-0">
                      {formatDate(log.createdAt, true)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabContent>
      </Tabs>

      {/* Lifecycle Mutation Dialog */}
      <ConfirmDialog
        isOpen={lifecycleModal.isOpen}
        onClose={() => setLifecycleModal({ isOpen: false, action: null })}
        onConfirm={handleConfirmLifecycle}
        title={lifecycleModal.title}
        impactSummary={lifecycleModal.impactSummary}
        confirmLabel={`Confirm ${lifecycleModal.action}`}
        variant={lifecycleModal.action === "suspend" ? "danger" : "primary"}
        loading={actionLoading}
      />

      {/* Hard Purge Dialog */}
      <ConfirmDialog
        isOpen={purgeModal}
        onClose={() => setPurgeModal(false)}
        onConfirm={handleConfirmPurge}
        title={`Permanently Purge Gym: ${tenant.name}`}
        description="This is an irreversible operation that permanently destroys this tenant workspace and all its members, packages, and check-ins."
        impactSummary="Tombstone audit record will be preserved. Tenant slug will be freed for reassignment."
        confirmLabel="Purge Workspace Forever"
        variant="danger"
        typedSlugMatch={tenant.slug}
        loading={actionLoading}
      />
      {/* Tenant Entitlements Customizer Modal */}
      {tenant && (
        <TenantOverridesModal
          open={overridesModalOpen}
          onOpenChange={setOverridesModalOpen}
          tenant={tenant}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
