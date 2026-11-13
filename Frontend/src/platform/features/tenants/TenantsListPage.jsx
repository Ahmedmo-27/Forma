import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  
  Plus,
  MoreHorizontal,
  Eye,
  Clock,
  Ban,
  CheckCircle,
  Trash2,
  ExternalLink,
  Layers,
  Sliders,
} from "lucide-react";
import {
  apiGetTenants,
  apiUpdateTenantLifecycle,
  apiPurgeTenant,
  apiCreateImpersonationSession,
} from "../../lib/api/endpoints";
import { DataTable } from "../../shell/DataTable/DataTable";
import { OnboardTenantModal } from "./OnboardTenantModal";
import { BulkActionsModal } from "./BulkActionsModal";
import TenantOverridesModal from "./TenantOverridesModal";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import { Button } from "../../ui/Button";
import { Badge, StatusPill } from "../../ui/Badge";
import { CopyChip } from "../../ui/CopyChip";
import { DropdownMenu } from "../../ui/DropdownMenu";
import { usePermission } from "../../lib/auth/PermissionContext";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { formatCurrency, formatDate } from "../../lib/utils/formatters";
import { platformToast } from "../../ui/Toast";

export default function TenantsListPage() {
  const navigate = useNavigate();
  const [searchParams, _setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [cycleFilter, setCycleFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [overridesModalOpen, setOverridesModalOpen] = useState(false);
  const [selectedTenantForOverrides, setSelectedTenantForOverrides] = useState(null);

  // Single tenant action confirm modal
  const [lifecycleModal, setLifecycleModal] = useState({
    isOpen: false,
    tenant: null,
    action: null,
    title: "",
    impactSummary: "",
  });

  // Purge modal
  const [purgeModal, setPurgeModal] = useState({
    isOpen: false,
    tenant: null,
  });

  const [actionLoading, setActionLoading] = useState(false);

  // Permissions
  const canWriteTenants = usePermission("tenants.write");
  const canLifecycle = usePermission("tenants.lifecycle");
  const canPurge = usePermission("tenants.purge");
  const canSupport = usePermission("support.impersonate_read");

  const { startImpersonation } = usePlatformAuth();

  // Query tenants list
  const {
    data,
    isLoading,
    isError: _isError,
    error: _error,
    refetch,
  } = useQuery({
    queryKey: ["tenants", { page, search, statusFilter, cycleFilter }],
    queryFn: async () => {
      const res = await apiGetTenants({
        page,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        cycle: cycleFilter || undefined,
      });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const tenants = data?.tenants || [];
  const pagination = data?.pagination || { total: 0, limit: 20 };

  // Handle Lifecycle Mutations
  const handleConfirmLifecycle = async ({ reason }) => {
    if (!lifecycleModal.tenant) return;
    setActionLoading(true);

    try {
      await apiUpdateTenantLifecycle(lifecycleModal.tenant.id, {
        action: lifecycleModal.action,
        reason,
        ...(lifecycleModal.action === "extend_trial" ? { days: 7 } : {}),
      });

      platformToast.success(
        `Lifecycle action '${lifecycleModal.action}' applied to ${lifecycleModal.tenant.name}`
      );
      setLifecycleModal({ isOpen: false, tenant: null, action: null });
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Failed to execute lifecycle action");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Hard Purge
  const handleConfirmPurge = async ({ reason, typedSlug }) => {
    if (!purgeModal.tenant) return;
    setActionLoading(true);

    try {
      await apiPurgeTenant(purgeModal.tenant.id, {
        slugConfirmation: typedSlug,
        reason,
      });

      platformToast.success(`Gym '${purgeModal.tenant.name}' permanently purged.`);
      setPurgeModal({ isOpen: false, tenant: null });
      refetch();
    } catch (err) {
      platformToast.error(err.message || "Purge failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Launch Impersonation
  const handleLaunchImpersonate = async (tenant) => {
    try {
      const res = await apiCreateImpersonationSession({
        tenantId: tenant.id,
        mode: "read_only",
        reason: "Direct console subscribers list inspection",
      });

      startImpersonation({
        token: res.data.token,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        mode: "read_only",
      });

      localStorage.setItem("token", res.data.token);
      platformToast.success(`Read-only session initiated for ${tenant.name}.`);
      window.open("/members", "_blank");
    } catch (err) {
      platformToast.error(err.message || "Failed to start impersonation session");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Subscriber Gym",
      render: (t) => (
        <div className="space-y-0.5">
          <Link
            to={`/platform/tenants/${t.id}`}
            className="font-semibold text-[var(--platform-text-primary)] hover:text-[var(--platform-accent)] hover:underline transition-colors block"
          >
            {t.name}
          </Link>
          <div className="flex items-center gap-1.5">
            <CopyChip value={t.slug} prefix="/" />
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan & Cycle",
      render: (t) => {
        const cycle = t.cycle || t.billing?.cycle || "monthly";
        const isLifetime = cycle === "lifetime";
        const hasOverrides = (t.featureOverrides?.add || []).length > 0 || (t.roleOverrides?.add || []).length > 0;
        return (
          <div className="space-y-1">
            <div className="font-medium text-[var(--platform-text-primary)] capitalize">
              {t.plan?.name || "Basic Tier"}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={isLifetime ? "success" : "neutral"} size="sm">
                {cycle}
              </Badge>
              {hasOverrides && (
                <Badge variant="accent" size="xs">
                  +{(t.featureOverrides?.add || []).length} custom
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusPill status={t.status} />,
    },
    {
      key: "owner",
      header: "Owner Contact",
      render: (t) =>
        t.owner ? (
          <div>
            <div className="font-medium text-[var(--platform-text-primary)]">{t.owner.name}</div>
            <div className="text-[11px] platform-mono text-[var(--platform-text-muted)] truncate max-w-[160px]">
              {t.owner.email}
            </div>
          </div>
        ) : (
          <span className="text-[var(--platform-text-muted)]">—</span>
        ),
    },
    {
      key: "capacity",
      header: "Member Capacity",
      align: "right",
      render: (t) => {
        const current = t.usage?.members || 0;
        const max = Number(t.usage?.maxMembers);
        const hasCap = Number.isFinite(max) && max > 0;
        const ratio = hasCap ? Math.round((current / max) * 100) : null;
        return (
          <div className="text-right platform-mono">
            <div className="font-semibold text-[var(--platform-text-primary)]">
              {current.toLocaleString()}
              {hasCap ? ` / ${max.toLocaleString()}` : ""}
            </div>
            <div
              className={`text-[11px] ${
                ratio !== null && ratio >= 80
                  ? "text-[var(--platform-warning)] font-bold"
                  : "text-[var(--platform-text-muted)]"
              }`}
            >
              {ratio === null ? "No member cap" : `${ratio}% utilized`}
            </div>
          </div>
        );
      },
    },
    {
      key: "mrrContribution",
      header: "MRR",
      align: "right",
      render: (t) => (
        <span className="font-semibold platform-mono text-[var(--platform-text-primary)]">
          {formatCurrency(t.mrrContribution || 0)}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      align: "right",
      render: (t) => (
        <span className="text-xs platform-mono text-[var(--platform-text-muted)]">
          {formatDate(t.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <DropdownMenu
          trigger={
            <Button size="xs" variant="ghost" aria-label="Subscriber actions">
              <MoreHorizontal className="w-4 h-4 text-[var(--platform-text-muted)]" />
            </Button>
          }
          items={[
            { header: true, label: t.name },
            {
              label: "View Full Profile",
              icon: Eye,
              onClick: () => navigate(`/platform/tenants/${t.id}`),
            },
            ...(canLifecycle
              ? [
                  {
                    label: "Customize Entitlements",
                    icon: Sliders,
                    onClick: () => {
                      setSelectedTenantForOverrides(t);
                      setOverridesModalOpen(true);
                    },
                  },
                ]
              : []),
            ...(canSupport
              ? [
                  {
                    label: "Impersonate (View As)",
                    icon: ExternalLink,
                    onClick: () => handleLaunchImpersonate(t),
                  },
                ]
              : []),
            ...(canLifecycle
              ? [
                  { divider: true },
                  {
                    label: "Extend Trial (+7 Days)",
                    icon: Clock,
                    onClick: () =>
                      setLifecycleModal({
                        isOpen: true,
                        tenant: t,
                        action: "extend_trial",
                        title: `Extend Trial for ${t.name}`,
                        impactSummary: "Adds 7 days to the current trial period and keeps tenant active.",
                      }),
                  },
                  ...(t.status === "active"
                    ? [
                        {
                          label: "Suspend Gym Access",
                          icon: Ban,
                          danger: true,
                          onClick: () =>
                            setLifecycleModal({
                              isOpen: true,
                              tenant: t,
                              action: "suspend",
                              title: `Suspend Gym: ${t.name}`,
                              impactSummary:
                                "Blocks staff and member logins across this gym workspace immediately.",
                            }),
                        },
                      ]
                    : [
                        {
                          label: "Reactivate Account",
                          icon: CheckCircle,
                          onClick: () =>
                            setLifecycleModal({
                              isOpen: true,
                              tenant: t,
                              action: "reactivate",
                              title: `Reactivate: ${t.name}`,
                              impactSummary: "Restores standard access for staff and members immediately.",
                            }),
                        },
                      ]),
                ]
              : []),
            ...(canPurge
              ? [
                  { divider: true },
                  {
                    label: "Purge Gym Forever",
                    icon: Trash2,
                    danger: true,
                    onClick: () => setPurgeModal({ isOpen: true, tenant: t }),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--platform-border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--platform-text-primary)]">
              Gym Subscribers
            </h1>
            <Badge variant="neutral">{pagination.total} Gyms</Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Manage multi-tenant gym workspaces, license states, operational overrides, and subscriber lifecycles.
          </p>
        </div>

        {canWriteTenants && (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              leftIcon={Plus}
              onClick={() => setIsOnboardOpen(true)}
            >
              Onboard Gym
            </Button>
          </div>
        )}
      </div>

      {/* Main Data Table */}
      <DataTable
        columns={columns}
        data={tenants}
        total={pagination.total}
        page={page}
        limit={20}
        loading={isLoading}
        onPageChange={setPage}
        onSearch={setSearch}
        searchValue={search}
        searchPlaceholder="Search gyms by name, slug, or owner email..."
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
            options: [
              { value: "active", label: "Active" },
              { value: "trial", label: "Free Trial" },
              { value: "past_due", label: "Past Due" },
              { value: "suspended", label: "Suspended" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          {
            key: "cycle",
            label: "Cycle",
            value: cycleFilter,
            onChange: (val) => {
              setCycleFilter(val);
              setPage(1);
            },
            options: [
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Annual" },
            ],
          },
        ]}
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        bulkActions={({ selectedIds: ids }) => (
          canLifecycle ? (
            <Button
              size="xs"
              variant="outline"
              leftIcon={Layers}
              onClick={() => setIsBulkOpen(true)}
            >
              Bulk Actions ({ids.length})
            </Button>
          ) : null
        )}
        onExportCsv={() => {
          window.open(
            `/api/platform/analytics/export`,
            "_blank"
          );
        }}
      />

      {/* Onboarding Dialog */}
      <OnboardTenantModal
        isOpen={isOnboardOpen}
        onClose={() => setIsOnboardOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Bulk Lifecycle Modal */}
      <BulkActionsModal
        isOpen={isBulkOpen}
        selectedIds={selectedIds}
        onClose={() => setIsBulkOpen(false)}
        onSuccess={() => {
          setSelectedIds([]);
          refetch();
        }}
      />

      {/* Lifecycle Mutation Confirm Dialog */}
      <ConfirmDialog
        isOpen={lifecycleModal.isOpen}
        onClose={() => setLifecycleModal({ isOpen: false, tenant: null, action: null })}
        onConfirm={handleConfirmLifecycle}
        title={lifecycleModal.title}
        impactSummary={lifecycleModal.impactSummary}
        confirmLabel={`Confirm ${lifecycleModal.action}`}
        variant={lifecycleModal.action === "suspend" ? "danger" : "primary"}
        loading={actionLoading}
      />

      {/* Hard Purge Modal with Typed Slug Match */}
      {purgeModal.tenant && (
        <ConfirmDialog
          isOpen={purgeModal.isOpen}
          onClose={() => setPurgeModal({ isOpen: false, tenant: null })}
          onConfirm={handleConfirmPurge}
          title={`Permanently Purge Gym: ${purgeModal.tenant.name}`}
          description="This is an irreversible destructive operation that removes all members, staff users, packages, attendance logs, and storage assets forever."
          impactSummary={`Tombstone audit record will be preserved. Gym slug /${purgeModal.tenant.slug} will be permanently released.`}
          confirmLabel="Permanently Delete Workspace"
          variant="danger"
          typedSlugMatch={purgeModal.tenant.slug}
          loading={actionLoading}
        />
      )}
      {/* Tenant Entitlements Customizer Modal */}
      {selectedTenantForOverrides && (
        <TenantOverridesModal
          open={overridesModalOpen}
          onOpenChange={setOverridesModalOpen}
          tenant={selectedTenantForOverrides}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
