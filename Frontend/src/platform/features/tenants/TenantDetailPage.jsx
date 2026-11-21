import { useMemo, useState } from "react";
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
  Pencil,
  X,
  Sliders,
  Sparkles,
  Clock,
  AlertTriangle,
  UserRoundPen,
} from "lucide-react";
import {
  apiGetTenantDetail,
  apiUpdateTenantLifecycle,
  apiAddTenantNote,
  apiDeleteTenantNote,
  apiUpdateTenantTags,
  apiUpdateTenantName,
  apiUpdateTenantPurpose,
  apiListTenantStaff,
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
import { Select } from "../../ui/Select";
import { Textarea } from "../../ui/Textarea";
import { Checkbox } from "../../ui/Checkbox";
import { Skeleton } from "../../ui/Skeleton";
import { Dialog } from "../../ui/Dialog";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import TenantOverridesModal from "./TenantOverridesModal";
import TenantFeatureEditor from "./TenantFeatureEditor";
import TenantOutOfPlanPanel from "./TenantOutOfPlanPanel";
import TenantSubscriptionPanel from "./TenantSubscriptionPanel";
import TenantStaffAccess from "./TenantStaffAccess";
import TenantBranchesPanel from "./TenantBranchesPanel";
import { usePermission } from "../../lib/auth/PermissionContext";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { formatCurrency, formatDate, formatBytes } from "../../lib/utils/formatters";
import { platformToast } from "../../ui/Toast";

const BILLING_PROFILE_ROWS = [
  ["Legal name", "legalName"],
  ["Tax registration no.", "taxNumber"],
  ["Commercial registration", "commercialRegistration"],
  ["Billing email", "billingEmail"],
  ["Phone", "phone"],
];

function BillingProfileCard({ profile }) {
  const p = profile || {};
  const address = [
    p.addressLine1,
    p.addressLine2,
    [p.city, p.region, p.postalCode].filter(Boolean).join(", "),
    p.country,
  ].filter(Boolean);
  const isEmpty = !p.legalName && !p.taxNumber && address.length <= 1;

  return (
    <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Billing profile</h3>
        {p.updatedAt ? (
          <span className="text-[11px] text-[var(--platform-text-muted)]">Updated {formatDate(p.updatedAt)}</span>
        ) : null}
      </div>
      {isEmpty ? (
        <p className="text-xs text-[var(--platform-text-muted)]">
          The owner has not added a legal name or tax number yet. Invoices show the gym name only. The owner can fill
          this in under Settings, then Billing &amp; Reports.
        </p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {BILLING_PROFILE_ROWS.map(([label, key]) => (
            <div key={key}>
              <dt className="text-[var(--platform-text-muted)]">{label}</dt>
              <dd className="text-[var(--platform-text-primary)] font-medium">{p[key] || "—"}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-[var(--platform-text-muted)]">Address</dt>
            <dd className="text-[var(--platform-text-primary)] font-medium whitespace-pre-line">
              {address.length ? address.join("\n") : "—"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

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
  const [lifecycleDays, setLifecycleDays] = useState(7);
  const [lifecycleSlug, setLifecycleSlug] = useState("");
  const [lifecycleOwnerId, setLifecycleOwnerId] = useState("");
  const [purgeModal, setPurgeModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [overridesModalOpen, setOverridesModalOpen] = useState(false);
  const [purposeModalOpen, setPurposeModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const closeLifecycleModal = () =>
    setLifecycleModal({ isOpen: false, action: null, title: "", impactSummary: "" });

  const openLifecycleModal = (next) => {
    setLifecycleModal({
      isOpen: true,
      action: next.action,
      title: next.title,
      impactSummary: next.impactSummary || "",
    });
    if (next.action === "extend_trial") setLifecycleDays(next.days ?? 7);
    if (next.action === "change_slug") setLifecycleSlug(next.newSlug ?? "");
    if (next.action === "transfer_ownership") setLifecycleOwnerId(next.newOwnerUserId ?? "");
  };

  // Permissions
  const canLifecycle = usePermission("tenants.lifecycle");
  const canWrite = usePermission("tenants.write");
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
  const owner = tenant?.owner || tenant?.ownerUserId || null;
  const ownerId = owner?._id || owner?.id || null;
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
  const branchCount = usage.branchCount ?? usage.branches ?? 0;
  const notes = data?.notes || [];
  const recentAudit = data?.recentAudit || [];
  const recentLedger = data?.recentLedger || [];
  const invoices = data?.invoices || recentLedger;

  const transferOwnershipOpen = lifecycleModal.isOpen && lifecycleModal.action === "transfer_ownership";
  const staffQuery = useQuery({
    queryKey: ["tenant-staff", id],
    queryFn: async () => {
      const res = await apiListTenantStaff(id);
      return res.data;
    },
    enabled: Boolean(id && transferOwnershipOpen),
  });
  const staffOptions = useMemo(() => {
    const users = staffQuery.data?.users || [];
    return users.map((user) => ({
      value: String(user._id),
      label: `${user.name}${user.isPrimaryOwner ? " (current owner)" : ""} — ${user.email || user.username || user.role}`,
      disabled: ownerId ? String(user._id) === String(ownerId) : false,
    }));
  }, [staffQuery.data, ownerId]);

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

  const isShowcase = tenant?.purpose === "showcase";

  const openRenameModal = () => {
    setRenameValue(tenant?.name || "");
    setRenameModalOpen(true);
  };

  const handleRenameTenant = async (e) => {
    e?.preventDefault?.();
    const nextName = renameValue.trim();
    if (!nextName) {
      platformToast.error("Gym name is required");
      return;
    }
    if (nextName.length > 120) {
      platformToast.error("Gym name must not exceed 120 characters");
      return;
    }
    if (nextName === tenant.name) {
      setRenameModalOpen(false);
      return;
    }
    setRenameSaving(true);
    try {
      await apiUpdateTenantName(id, nextName);
      platformToast.success("Gym name updated");
      setRenameModalOpen(false);
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to update gym name");
    } finally {
      setRenameSaving(false);
    }
  };

  const handleConfirmPurpose = async () => {
    setActionLoading(true);
    try {
      const next = isShowcase ? "customer" : "showcase";
      await apiUpdateTenantPurpose(id, next);
      platformToast.success(
        next === "showcase"
          ? "Marked as a showcase. Saved colors stay in effect."
          : "Set back to a customer gym."
      );
      setPurposeModalOpen(false);
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to update showcase theme");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Lifecycle Confirmation
  const handleConfirmLifecycle = async ({ reason }) => {
    const action = lifecycleModal.action;
    const payload = { action, reason };

    if (action === "extend_trial") {
      const days = Number(lifecycleDays);
      if (!Number.isFinite(days) || days <= 0) {
        platformToast.error("Enter a positive number of days");
        return;
      }
      payload.days = days;
    }

    if (action === "change_slug") {
      const newSlug = lifecycleSlug.trim().toLowerCase();
      if (!newSlug || !/^[a-z0-9-]+$/.test(newSlug)) {
        platformToast.error("Slug must be lowercase letters, numbers, and hyphens only");
        return;
      }
      if (newSlug === tenant.slug) {
        platformToast.error("Enter a different slug");
        return;
      }
      payload.newSlug = newSlug;
    }

    if (action === "transfer_ownership") {
      if (!lifecycleOwnerId) {
        platformToast.error("Select a staff member to become the new owner");
        return;
      }
      if (ownerId && String(lifecycleOwnerId) === String(ownerId)) {
        platformToast.error("Select a different staff member");
        return;
      }
      payload.newOwnerUserId = lifecycleOwnerId;
    }

    setActionLoading(true);
    try {
      await apiUpdateTenantLifecycle(id, payload);

      const successByAction = {
        mark_past_due: `${tenant.name} is past due. The grace period has started.`,
        extend_trial: `Trial extended by ${payload.days} day${payload.days === 1 ? "" : "s"} for ${tenant.name}`,
        change_slug: `Slug updated to /${payload.newSlug}`,
        transfer_ownership: `Ownership transferred for ${tenant.name}`,
      };
      platformToast.success(
        successByAction[action] || `Action '${action}' applied to ${tenant.name}`
      );
      closeLifecycleModal();
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

      startImpersonation(
        {
          tenant: res.data.session?.tenant || { id: tenant._id, name: tenant.name, slug: tenant.slug },
          mode: res.data.session?.mode || "read_only",
        },
        res.data
      );

      platformToast.success(`Read-only session initiated for ${tenant.name}.`);
      window.open(res.data.redirectPath || "/members", "_blank");
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
            {canWrite && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Pencil}
                onClick={openRenameModal}
                aria-label="Edit gym name"
                className="text-[var(--platform-text-muted)]"
              >
                Edit name
              </Button>
            )}
            <CopyChip value={tenant.slug} prefix="/" />
            {canLifecycle && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Pencil}
                onClick={() =>
                  openLifecycleModal({
                    action: "change_slug",
                    title: `Change slug: ${tenant.name}`,
                    impactSummary:
                      "The old slug is kept in history. Login and deep links that use the previous slug may stop working until updated.",
                    newSlug: tenant.slug,
                  })
                }
                aria-label="Edit gym slug"
                className="text-[var(--platform-text-muted)]"
              >
                Edit slug
              </Button>
            )}
            <StatusPill status={tenant.status} />
            {tenant.purpose === "showcase" && (
              <Badge variant="accent" size="sm">Showcase</Badge>
            )}
            <Badge variant={isLifetime ? "success" : "neutral"} size="sm">
              {durationLabel}
            </Badge>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPurposeModalOpen(true)}
            >
              {isShowcase ? "Use as customer gym" : "Mark as showcase"}
            </Button>
          )}

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
              <Button
                size="sm"
                variant="outline"
                leftIcon={Clock}
                onClick={() =>
                  openLifecycleModal({
                    action: "extend_trial",
                    title: `Extend trial: ${tenant.name}`,
                    impactSummary:
                      "Adds the chosen number of days to the current trial end (or from today if the trial already ended) and sets status to trial.",
                    days: 7,
                  })
                }
              >
                Extend trial
              </Button>
              {!isLifetime && (tenant.status === "active" || tenant.status === "trial") && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={AlertTriangle}
                  onClick={() =>
                    openLifecycleModal({
                      action: "mark_past_due",
                      title: `Mark past due: ${tenant.name}`,
                      impactSummary:
                        "The gym keeps working during the grace period. The owner gets overdue reminders, and the gym is suspended automatically if it is still unpaid when the grace period ends. Reactivate after payment to clear it.",
                    })
                  }
                  className="text-[var(--platform-warning)] border-[var(--platform-warning)]/30 hover:bg-[var(--platform-warning-subtle)]"
                >
                  Mark past due
                </Button>
              )}
              {tenant.status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={Ban}
                  onClick={() =>
                    openLifecycleModal({
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
                    openLifecycleModal({
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

      {tenant.status === "past_due" && (
        <div className="flex items-start gap-3 p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-warning)]/30 bg-[var(--platform-warning-subtle)]">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-[var(--platform-warning)] shrink-0" />
          <div className="text-xs text-[var(--platform-text-secondary)] space-y-0.5">
            <div className="font-semibold text-[var(--platform-text-primary)]">Payment overdue</div>
            <div>
              {tenant.dunning?.pastDueSince
                ? `Past due since ${formatDate(tenant.dunning.pastDueSince)}. `
                : "Past due. "}
              {tenant.dunning?.graceEndsAt
                ? `Suspends automatically on ${formatDate(tenant.dunning.graceEndsAt)} unless reactivated.`
                : "The grace period starts on the next dunning run."}
              {tenant.dunning?.markedBy === "platform" ? " Marked manually from the console." : ""}
            </div>
          </div>
        </div>
      )}
      {tenant.status === "suspended" && tenant.dunning?.suspendedByDunning && (
        <div className="flex items-start gap-3 p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-danger)]/30 bg-[var(--platform-danger-subtle)]">
          <Ban className="w-4 h-4 mt-0.5 text-[var(--platform-danger)] shrink-0" />
          <div className="text-xs text-[var(--platform-text-secondary)]">
            Suspended for non-payment
            {tenant.dunning?.suspendedAt ? ` on ${formatDate(tenant.dunning.suspendedAt)}` : ""}. Reactivate once payment is
            recorded.
          </div>
        </div>
      )}
      {tenant.overLimits?.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-warning)]/30 bg-[var(--platform-warning-subtle)]">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-[var(--platform-warning)] shrink-0" />
          <div className="text-xs text-[var(--platform-text-secondary)] space-y-0.5">
            <div className="font-semibold text-[var(--platform-text-primary)]">Over plan limits</div>
            <div>
              {tenant.overLimits
                .map((o) => `${o.current} ${o.noun} on a limit of ${o.max}`)
                .join(" · ")}
              . New records are blocked until the gym is back under the cap or moves to a bigger plan.
            </div>
          </div>
        </div>
      )}

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
            {memberCount} / {effectiveLimits.maxMembers > 0 ? effectiveLimits.maxMembers : "∞"}
          </div>
          <div className="text-[11px] text-[var(--platform-text-muted)]">
            {effectiveLimits.maxMembers > 0
              ? `${Math.round((memberCount / effectiveLimits.maxMembers) * 100)}% utilized`
              : "No member cap"}
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
              ? `Fair-use cap: ${effectiveLimits.storageGb ?? usage.storageLimitGb ?? "—"} GB`
              : `Plan allowance: ${effectiveLimits.storageGb ?? usage.storageLimitGb ?? "—"} GB`}
          </div>
        </div>

        <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Primary Owner
            </div>
            {canLifecycle && (
              <Button
                size="xs"
                variant="ghost"
                leftIcon={UserRoundPen}
                onClick={() =>
                  openLifecycleModal({
                    action: "transfer_ownership",
                    title: `Transfer ownership: ${tenant.name}`,
                    impactSummary:
                      "The selected staff member becomes the primary owner and is promoted to the Owner role. The previous owner keeps their account unless you change their role separately.",
                  })
                }
                aria-label="Transfer ownership"
                className="text-[var(--platform-text-muted)] -mr-1"
              >
                Transfer
              </Button>
            )}
          </div>
          <div className="text-base font-bold text-[var(--platform-text-primary)] truncate">
            {owner?.name || "Unassigned"}
          </div>
          <div className="text-[11px] platform-mono text-[var(--platform-text-muted)] truncate">
            {owner?.email || "—"}
          </div>
        </div>
      </div>

      {/* ── 3. Tabs Navigation ── */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabTrigger value="overview">Overview & Limits</TabTrigger>
          <TabTrigger value="features">Features</TabTrigger>
          <TabTrigger value="access">Access</TabTrigger>
          <TabTrigger value="branches" badge={branchCount || undefined}>
            Branches
          </TabTrigger>
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
                  max={effectiveLimits.maxMembers > 0 ? effectiveLimits.maxMembers : null}
                  unit="members"
                />
                <UsageMeter
                  label="Staff / Operator Seats"
                  current={staffCount}
                  max={effectiveLimits.maxStaff > 0 ? effectiveLimits.maxStaff : null}
                  unit="staff"
                />
                <UsageMeter
                  label="Branches"
                  current={branchCount}
                  max={effectiveLimits.maxBranches > 0 ? effectiveLimits.maxBranches : null}
                  unit="branches"
                />
                <UsageMeter
                  label="Disk Storage Consumption"
                  current={Math.round(((usage.storageBytes || 0) / (1024 * 1024 * 1024)) * 10) / 10}
                  max={effectiveLimits.storageGb ?? usage.storageLimitGb ?? null}
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

              {Array.isArray(tenant.featureTrials) && tenant.featureTrials.length > 0 && (
                <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Active feature trials</span>
                  </div>
                  {tenant.featureTrials.map((trial) => (
                    <div key={`${trial.featureKey}-${trial.endsAt}`} className="text-[11px] flex justify-between gap-2">
                      <span className="font-mono">{trial.featureKey}</span>
                      <span>ends {formatDate(trial.endsAt)}</span>
                    </div>
                  ))}
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
                      const trial = (tenant.featureTrials || []).find((t) => t.featureKey === featKey);
                      return (
                        <div
                          key={featKey}
                          className={`flex items-center justify-between p-2 rounded-[var(--platform-radius-sm)] border ${
                            trial
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                              : isCustomAdded
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300"
                              : "bg-[var(--platform-surface-subtle)] border-[var(--platform-border-subtle)]"
                          }`}
                        >
                          <span className="platform-mono text-[11px]">
                            {featKey}
                          </span>
                          <Badge variant={trial ? "warning" : isCustomAdded ? "accent" : "success"} size="xs">
                            {trial ? "Trial" : isCustomAdded ? "Custom (+)" : "Included"}
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
          <div className="space-y-4">
            <TenantSubscriptionPanel tenant={tenant} onSaved={refetch} />
            <TenantOutOfPlanPanel tenant={tenant} onSaved={refetch} />
            <TenantFeatureEditor tenant={tenant} onSaved={refetch} />
          </div>
        </TabContent>

        <TabContent value="access">
          <TenantStaffAccess tenantId={id} />
        </TabContent>

        <TabContent value="branches">
          <TenantBranchesPanel tenantId={id} />
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
            <BillingProfileCard profile={tenant.billingProfile} />

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

      <Dialog
        isOpen={renameModalOpen}
        onClose={() => !renameSaving && setRenameModalOpen(false)}
        title="Edit gym name"
        description="This updates the gym name shown in the platform console and as the fallback workspace name."
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={renameSaving} onClick={() => setRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={renameSaving}
              disabled={renameSaving || !renameValue.trim()}
              onClick={handleRenameTenant}
            >
              Save name
            </Button>
          </>
        }
      >
        <form onSubmit={handleRenameTenant} className="space-y-3">
          <Input
            label="Gym name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={120}
            autoFocus
            placeholder="e.g. Spartan Gym"
          />
        </form>
      </Dialog>

      <ConfirmDialog
        isOpen={purposeModalOpen}
        onClose={() => setPurposeModalOpen(false)}
        onConfirm={handleConfirmPurpose}
        title={isShowcase ? `Use ${tenant.name} as a customer gym` : `Mark ${tenant.name} as a showcase tenant`}
        description={
          isShowcase
            ? "This workspace stays a normal gym. A palette stashed by the old showcase lock is restored if one is still stored."
            : "This workspace is marked as a showcase. Its saved colors stay, and staff can keep changing them."
        }
        impactSummary={
          isShowcase
            ? "Purpose becomes customer. Colors follow the palette saved on this gym."
            : "Purpose becomes showcase. Colors are not replaced."
        }
        confirmLabel={isShowcase ? "Use as customer gym" : "Mark as showcase"}
        variant="primary"
        requireReason={false}
        loading={actionLoading}
      />

      {/* Lifecycle Mutation Dialog */}
      <ConfirmDialog
        isOpen={lifecycleModal.isOpen}
        onClose={closeLifecycleModal}
        onConfirm={handleConfirmLifecycle}
        title={lifecycleModal.title}
        impactSummary={lifecycleModal.impactSummary}
        confirmLabel={
          lifecycleModal.action === "extend_trial"
            ? "Extend trial"
            : lifecycleModal.action === "change_slug"
              ? "Save slug"
              : lifecycleModal.action === "transfer_ownership"
                ? "Transfer ownership"
                : `Confirm ${lifecycleModal.action}`
        }
        variant={lifecycleModal.action === "suspend" ? "danger" : "primary"}
        loading={actionLoading}
      >
        {lifecycleModal.action === "extend_trial" && (
          <Input
            label="Days to add"
            type="number"
            min={1}
            max={365}
            value={lifecycleDays}
            onChange={(e) => setLifecycleDays(e.target.value)}
            helperText={
              tenant.trialEndsAt
                ? `Current trial ends ${formatDate(tenant.trialEndsAt)}`
                : "No active trial end date on file; extension starts from today."
            }
          />
        )}
        {lifecycleModal.action === "change_slug" && (
          <Input
            label="New slug"
            value={lifecycleSlug}
            onChange={(e) => setLifecycleSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            isMono
            maxLength={80}
            placeholder={tenant.slug}
            helperText="Lowercase letters, numbers, and hyphens only."
          />
        )}
        {lifecycleModal.action === "transfer_ownership" && (
          <div className="space-y-2">
            <Select
              label="New primary owner"
              placeholder={staffQuery.isLoading ? "Loading staff…" : "Select a staff member"}
              options={staffOptions}
              value={lifecycleOwnerId}
              onChange={(e) => setLifecycleOwnerId(e.target.value)}
              disabled={staffQuery.isLoading || staffOptions.length === 0}
            />
            {staffQuery.isError && (
              <p className="text-xs text-[var(--platform-danger)]">Could not load staff for this gym.</p>
            )}
            {!staffQuery.isLoading && !staffQuery.isError && staffOptions.filter((o) => !o.disabled).length === 0 && (
              <p className="text-xs text-[var(--platform-text-muted)]">
                No other staff members are available. Add staff under Access first.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>

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
