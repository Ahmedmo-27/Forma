import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetPlans,
  apiGetFeatures,
  apiGetRoles,
  apiArchivePlan,
  apiUpdateFeature,
} from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Input,
  Select,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  CopyChip,
  Skeleton,
  Callout,
  EmptyState,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import CreateFeatureModal, { FEATURE_CATEGORIES } from "./CreateFeatureModal";
import CreatePlanModal from "./CreatePlanModal";
import PlanImpactModal from "./PlanImpactModal";
import {
  Package,
  Layers,
  Sparkles,
  Plus,
  Archive,
  Edit2,
  Eye,
  Check,
  X,
  HardDrive,
  MessageSquare,
  Users,
  Shield,
  Activity,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils/formatters";

export default function PlansFeaturesPage() {
  const [activeTab, setActiveTab] = useState("plans");

  // Modals state
  const [featureModalOpen, setFeatureModalOpen] = useState(false);
  const [featureToEdit, setFeatureToEdit] = useState(null);

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planToEdit, setPlanToEdit] = useState(null);

  const [impactPlan, setImpactPlan] = useState(null);
  const [impactOpen, setImpactOpen] = useState(false);

  const [archivePlanTarget, setArchivePlanTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // Queries
  const {
    data: plansData,
    isLoading: plansLoading,
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiGetPlans().then((r) => r.data),
  });

  const {
    data: featuresData,
    isLoading: featuresLoading,
    refetch: refetchFeatures,
  } = useQuery({
    queryKey: ["platform", "features"],
    queryFn: () => apiGetFeatures().then((r) => r.data),
  });

  const {
    data: rolesData,
    isLoading: rolesLoading,
  } = useQuery({
    queryKey: ["platform", "roles"],
    queryFn: () => apiGetRoles().then((r) => r.data).catch(() => []),
  });

  const plans = plansData || [];
  const features = featuresData || [];
  const roles = rolesData || [];

  // Matrix Filter state
  const [matrixFilter, setMatrixFilter] = useState("all");
  const [matrixSearch, setMatrixSearch] = useState("");

  // Filter features
  const [featureCategory, setFeatureCategory] = useState("all");
  const [featureSearch, setFeatureSearch] = useState("");

  const filteredFeatures = features.filter((f) => {
    const matchesCategory =
      featureCategory === "all" || f.category === featureCategory;
    const matchesSearch =
      !featureSearch ||
      f.name.toLowerCase().includes(featureSearch.toLowerCase()) ||
      f.key.toLowerCase().includes(featureSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleArchiveConfirm = async ({ reason }) => {
    if (!archivePlanTarget) return;
    setArchiving(true);
    try {
      await apiArchivePlan(archivePlanTarget._id, { reason });
      platformToast.success(`Plan '${archivePlanTarget.name}' archived`);
      setArchivePlanTarget(null);
      refetchPlans();
    } catch (err) {
      platformToast.error(err?.message || "Failed to archive plan");
    } finally {
      setArchiving(false);
    }
  };

  const handleToggleFeatureActive = async (feature) => {
    try {
      await apiUpdateFeature(feature._id, { isActive: !feature.isActive });
      platformToast.success(
        `Feature '${feature.key}' ${!feature.isActive ? "activated" : "deactivated"}`
      );
      refetchFeatures();
    } catch (err) {
      platformToast.error(err?.message || "Failed to toggle feature status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Plans & Entitlements Catalog
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              Live Registry
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Author tiers, hard capacity limits, fair-use storage quotas, and feature flags.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFeatureToEdit(null);
              setFeatureModalOpen(true);
            }}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Add Feature Flag
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPlanToEdit(null);
              setPlanModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Subscription Plan
          </Button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Active Plans</span>
            <Package className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {plans.filter((p) => p.visibility !== "archived").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Commercial offerings</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Registered Features</span>
            <Layers className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {features.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Modular capabilities</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Core Entitlements</span>
            <Shield className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {features.filter((f) => f.isCore).length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Always included</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Archived Tiers</span>
            <Archive className="w-4 h-4 text-[var(--platform-text-muted)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-muted)]">
            {plans.filter((p) => p.visibility === "archived").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Subscribers grandfathered</span>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabTrigger value="plans">
            Subscription Plans ({plans.length})
          </TabTrigger>
          <TabTrigger value="matrix">
            Entitlements Matrix
          </TabTrigger>
          <TabTrigger value="features">
            Feature Catalog ({features.length})
          </TabTrigger>
          <TabTrigger value="roles">
            Staff Roles & Permissions ({roles.length})
          </TabTrigger>
        </TabsList>

        {/* =========================================================================
            Tab 1: Subscription Plans
           ========================================================================= */}
        <TabContent value="plans" className="space-y-4 mt-4">
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No subscription plans found"
              description="Create your first commercial tier to begin provisioning gym subscribers."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setPlanModalOpen(true)}
                >
                  Create Plan
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((plan) => {
                const isArchived = plan.visibility === "archived";
                return (
                  <div
                    key={plan._id}
                    className={`rounded-xl border transition-all flex flex-col justify-between ${
                      isArchived
                        ? "bg-[var(--platform-canvas)] border-[var(--platform-border-subtle)] opacity-75"
                        : "bg-[var(--platform-surface-raised)] border-[var(--platform-border-subtle)] hover:border-[var(--platform-border-strong)]"
                    }`}
                  >
                    {/* Header */}
                    <div className="p-5 pb-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[var(--platform-text-primary)]">
                              {plan.name}
                            </span>
                            <Badge
                              variant={
                                plan.visibility === "public"
                                  ? "success"
                                  : plan.visibility === "hidden"
                                  ? "warning"
                                  : "neutral"
                              }
                              size="xs"
                            >
                              {plan.visibility}
                            </Badge>
                          </div>
                          <div className="mt-1">
                            <CopyChip text={plan.key} label={`Plan ${plan.key}`} />
                          </div>
                        </div>

                        {/* Pricing Tag */}
                        <div className="text-right">
                          <span className="text-lg font-bold font-mono text-[var(--platform-text-primary)]">
                            {formatCurrency(plan.priceMonthly, plan.currency || "USD")}
                          </span>
                          <span className="text-[11px] text-[var(--platform-text-muted)] block">
                            /month
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[var(--platform-text-secondary)] min-h-[32px] line-clamp-2 mt-2">
                        {plan.description || "No description provided for this tier."}
                      </p>

                      {/* Hard Limits */}
                      <div className="mt-4 pt-3 border-t border-[var(--platform-border-subtle)] space-y-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                          Operational Limits
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2 rounded bg-[var(--platform-canvas)] border border-[var(--platform-border-subtle)]">
                            <div className="flex items-center gap-1 text-[var(--platform-text-muted)] text-[10px]">
                              <Users className="w-3 h-3" />
                              <span>Members</span>
                            </div>
                            <span className="font-mono font-semibold text-[var(--platform-text-primary)]">
                              {plan.limits?.maxMembers || "∞"}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-[var(--platform-canvas)] border border-[var(--platform-border-subtle)]">
                            <div className="flex items-center gap-1 text-[var(--platform-text-muted)] text-[10px]">
                              <Activity className="w-3 h-3" />
                              <span>Staff</span>
                            </div>
                            <span className="font-mono font-semibold text-[var(--platform-text-primary)]">
                              {plan.limits?.maxStaff || "∞"}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-[var(--platform-canvas)] border border-[var(--platform-border-subtle)]">
                            <div className="flex items-center gap-1 text-[var(--platform-text-muted)] text-[10px]">
                              <Layers className="w-3 h-3" />
                              <span>Branches</span>
                            </div>
                            <span className="font-mono font-semibold text-[var(--platform-text-primary)]">
                              {plan.limits?.maxBranches || "1"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Fair Use Allowances */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-[var(--platform-text-secondary)]">
                          <HardDrive className="w-3.5 h-3.5 text-[var(--platform-text-muted)]" />
                          <span>{plan.fairUseCaps?.storageGb || 25} GB Cloud Storage</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[var(--platform-text-secondary)]">
                          <MessageSquare className="w-3.5 h-3.5 text-[var(--platform-text-muted)]" />
                          <span>{plan.fairUseCaps?.whatsappMessagesMonthly || 0} WA Msgs/Mo</span>
                        </div>
                      </div>

                      {/* Entitlements Count */}
                      <div className="mt-3 flex items-center justify-between text-xs text-[var(--platform-text-muted)]">
                        <span>Capabilities Entitled:</span>
                        <Badge variant="neutral" size="xs" className="font-mono">
                          {plan.features?.length || 0} active flags
                        </Badge>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-3 bg-[var(--platform-canvas)] border-t border-[var(--platform-border-subtle)] rounded-b-xl flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setImpactPlan(plan);
                          setImpactOpen(true);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Impact
                      </Button>

                      <div className="flex items-center gap-1.5">
                        {!isArchived && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-[var(--platform-danger)] hover:bg-[var(--platform-danger-surface)]"
                            onClick={() => setArchivePlanTarget(plan)}
                          >
                            <Archive className="w-3.5 h-3.5 mr-1" />
                            Archive
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setPlanToEdit(plan);
                            setPlanModalOpen(true);
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Edit Tier
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabContent>

        {/* =========================================================================
            Tab 2: Entitlements Matrix (Side-by-side comparison of Features & Roles)
           ========================================================================= */}
        <TabContent value="matrix" className="space-y-4 mt-4">
          {/* Matrix Header Filters & Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Input
                placeholder="Filter capabilities, roles, or limits..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="w-full sm:w-72"
              />
              <Select
                value={matrixFilter}
                onChange={(e) => setMatrixFilter(e.target.value)}
                className="w-44 text-xs"
              >
                <option value="all">All Entitlements</option>
                <option value="features">Features Only</option>
                <option value="roles">Staff Roles Only</option>
                <option value="limits">Capacity Limits Only</option>
              </Select>
            </div>

            <div className="text-xs text-[var(--platform-text-muted)] flex items-center gap-2">
              <span>Showing comparison across {plans.length} commercial tiers</span>
            </div>
          </div>

          <Callout variant="info" className="text-xs">
            <strong>Entitlements Matrix:</strong> This matrix provides a global view of what each subscription plan includes. To edit any plan's features, roles, or limits, click <em>Edit Plan</em> on the column header. To customize a specific gym (such as adding a Gold feature to a Basic gym), open that gym from the Gyms & Tenants section.
          </Callout>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)]">
                  <th className="py-4 px-4 font-semibold text-[var(--platform-text-primary)] w-72 min-w-[260px] sticky left-0 bg-[var(--platform-canvas)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                    Capability / Entitlement
                  </th>
                  <th className="py-4 px-3 font-semibold text-[var(--platform-text-muted)] w-28 text-center">
                    Category
                  </th>
                  {plans.map((p) => (
                    <th
                      key={p._id}
                      className="py-4 px-4 font-semibold text-[var(--platform-text-primary)] min-w-[170px] text-center border-l border-[var(--platform-border-subtle)]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm">{p.name}</span>
                          <Badge
                            variant={
                              p.visibility === "public"
                                ? "success"
                                : p.visibility === "hidden"
                                ? "warning"
                                : "neutral"
                            }
                            size="xs"
                          >
                            {p.visibility}
                          </Badge>
                        </div>
                        <span className="font-mono text-xs text-[var(--platform-text-secondary)]">
                          {formatCurrency(p.priceMonthly, p.currency || "USD")}/mo
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="mt-1 h-6 text-[11px] text-[var(--platform-accent)] hover:bg-[var(--platform-surface)]"
                          onClick={() => {
                            setPlanToEdit(p);
                            setPlanModalOpen(true);
                          }}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit Plan
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                {/* ── SECTION 1: PLATFORM FEATURES ── */}
                {(matrixFilter === "all" || matrixFilter === "features") && (
                  <>
                    <tr className="bg-[var(--platform-surface)]/70 font-bold text-[11px] uppercase tracking-wider text-[var(--platform-text-muted)]">
                      <td
                        colSpan={2 + plans.length}
                        className="py-2.5 px-4 sticky left-0 bg-[var(--platform-surface)]/70"
                      >
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-[var(--platform-info)]" />
                          <span>Platform Features & System Modules ({features.length})</span>
                        </div>
                      </td>
                    </tr>
                    {features
                      .filter(
                        (f) =>
                          !matrixSearch ||
                          f.name.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                          f.key.toLowerCase().includes(matrixSearch.toLowerCase())
                      )
                      .map((feat) => (
                        <tr
                          key={feat._id || feat.key}
                          className="hover:bg-[var(--platform-surface)]/40 transition-colors"
                        >
                          <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                            <div className="flex items-start gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 font-medium text-[var(--platform-text-primary)]">
                                  <span>{feat.name}</span>
                                  {feat.isCore && (
                                    <Badge variant="info" size="xs">
                                      Core
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-[var(--platform-text-muted)] block">
                                  {feat.key}
                                </span>
                                {feat.description && (
                                  <span className="text-[10px] text-[var(--platform-text-muted)] line-clamp-1 mt-0.5">
                                    {feat.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant="neutral" size="xs" className="capitalize">
                              {feat.category || "core"}
                            </Badge>
                          </td>
                          {plans.map((p) => {
                            const isIncluded = (p.features || []).includes(feat.key);
                            return (
                              <td
                                key={p._id}
                                className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)]"
                              >
                                {isIncluded ? (
                                  <Badge
                                    variant="success"
                                    size="xs"
                                    className="gap-1 inline-flex items-center font-medium"
                                  >
                                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    Included
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--platform-text-muted)] font-mono text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </>
                )}

                {/* ── SECTION 2: STAFF ROLES & PERMISSIONS ── */}
                {(matrixFilter === "all" || matrixFilter === "roles") && (
                  <>
                    <tr className="bg-[var(--platform-surface)]/70 font-bold text-[11px] uppercase tracking-wider text-[var(--platform-text-muted)]">
                      <td
                        colSpan={2 + plans.length}
                        className="py-2.5 px-4 sticky left-0 bg-[var(--platform-surface)]/70"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-[var(--platform-accent)]" />
                          <span>Allowed Staff Roles & Accounts ({roles.length})</span>
                        </div>
                      </td>
                    </tr>
                    {roles
                      .filter(
                        (r) =>
                          !matrixSearch ||
                          r.name.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                          r.key.toLowerCase().includes(matrixSearch.toLowerCase())
                      )
                      .map((role) => (
                        <tr
                          key={role.key}
                          className="hover:bg-[var(--platform-surface)]/40 transition-colors"
                        >
                          <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                            <div>
                              <div className="font-medium text-[var(--platform-text-primary)]">
                                {role.name}
                              </div>
                              <span className="text-[10px] font-mono text-[var(--platform-text-muted)] block">
                                {role.key}
                              </span>
                              {role.description && (
                                <span className="text-[10px] text-[var(--platform-text-muted)] line-clamp-1 mt-0.5">
                                  {role.description}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant="accent" size="xs">
                              {role.category || "Staff"}
                            </Badge>
                          </td>
                          {plans.map((p) => {
                            const isAllowed = (p.allowedRoles || []).includes(role.key);
                            return (
                              <td
                                key={p._id}
                                className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)]"
                              >
                                {isAllowed ? (
                                  <Badge
                                    variant="info"
                                    size="xs"
                                    className="gap-1 inline-flex items-center font-medium"
                                  >
                                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    Permitted
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--platform-text-muted)] font-mono text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </>
                )}

                {/* ── SECTION 3: OPERATIONAL LIMITS & QUOTAS ── */}
                {(matrixFilter === "all" || matrixFilter === "limits") && (
                  <>
                    <tr className="bg-[var(--platform-surface)]/70 font-bold text-[11px] uppercase tracking-wider text-[var(--platform-text-muted)]">
                      <td
                        colSpan={2 + plans.length}
                        className="py-2.5 px-4 sticky left-0 bg-[var(--platform-surface)]/70"
                      >
                        <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-[var(--platform-warning)]" />
                          <span>Operational Limits & Fair-Use Quotas</span>
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-[var(--platform-surface)]/40 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                        <span className="font-medium text-[var(--platform-text-primary)]">
                          Max Active Members
                        </span>
                        <span className="text-[10px] text-[var(--platform-text-muted)] block">
                          Hard member ceiling before upgrade required
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="xs">
                          Limit
                        </Badge>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p._id}
                          className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)] font-mono font-semibold text-xs"
                        >
                          {p.limits?.maxMembers || "∞"} members
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-[var(--platform-surface)]/40 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                        <span className="font-medium text-[var(--platform-text-primary)]">
                          Max Staff Logins
                        </span>
                        <span className="text-[10px] text-[var(--platform-text-muted)] block">
                          Active staff operator seats
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="xs">
                          Limit
                        </Badge>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p._id}
                          className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)] font-mono font-semibold text-xs"
                        >
                          {p.limits?.maxStaff || "∞"} seats
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-[var(--platform-surface)]/40 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                        <span className="font-medium text-[var(--platform-text-primary)]">
                          Max Branch Locations
                        </span>
                        <span className="text-[10px] text-[var(--platform-text-muted)] block">
                          Supported physical gym facilities
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="xs">
                          Limit
                        </Badge>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p._id}
                          className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)] font-mono font-semibold text-xs"
                        >
                          {p.limits?.maxBranches || 1} branch
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-[var(--platform-surface)]/40 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                        <span className="font-medium text-[var(--platform-text-primary)]">
                          Cloud Storage Allowance
                        </span>
                        <span className="text-[10px] text-[var(--platform-text-muted)] block">
                          Member profile photos & contract scans
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="xs">
                          Quota
                        </Badge>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p._id}
                          className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)] font-mono font-semibold text-xs"
                        >
                          {p.fairUseCaps?.storageGb || 25} GB
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-[var(--platform-surface)]/40 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-[var(--platform-surface-raised)] z-10 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                        <span className="font-medium text-[var(--platform-text-primary)]">
                          WhatsApp Messages / Month
                        </span>
                        <span className="text-[10px] text-[var(--platform-text-muted)] block">
                          Automated WhatsApp notifications quota
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="xs">
                          Quota
                        </Badge>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p._id}
                          className="py-3 px-4 text-center border-l border-[var(--platform-border-subtle)] font-mono font-semibold text-xs"
                        >
                          {p.fairUseCaps?.whatsappMessagesMonthly || 0} msgs
                        </td>
                      ))}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </TabContent>

        {/* =========================================================================
            Tab 2: Feature Flags Catalog
           ========================================================================= */}
        <TabContent value="features" className="space-y-4 mt-4">
          {/* Feature Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search feature key or title..."
                value={featureSearch}
                onChange={(e) => setFeatureSearch(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select
                value={featureCategory}
                onChange={(e) => setFeatureCategory(e.target.value)}
                className="w-48"
              >
                <option value="all">All Categories</option>
                {FEATURE_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>

            <span className="text-xs text-[var(--platform-text-muted)] self-end sm:self-center">
              Showing {filteredFeatures.length} of {features.length} flags
            </span>
          </div>

          {/* Features Table */}
          {featuresLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : filteredFeatures.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No features matched"
              description="Try adjusting your filter query or register a new feature."
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Feature Identifier</th>
                    <th className="py-3 px-4">Display Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Core</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {filteredFeatures.map((feat) => (
                    <tr
                      key={feat._id}
                      className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                    >
                      <td className="py-3 px-4 font-mono">
                        <CopyChip text={feat.key} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--platform-text-primary)]">
                          {feat.name}
                        </div>
                        {feat.description && (
                          <span className="text-[11px] text-[var(--platform-text-muted)] block line-clamp-1">
                            {feat.description}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="neutral" size="xs" className="uppercase">
                          {feat.category || "core"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {feat.isCore ? (
                          <Badge variant="info" size="xs">
                            Core
                          </Badge>
                        ) : (
                          <span className="text-[var(--platform-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleFeatureActive(feat)}
                          aria-label={feat.isActive ? "Deactivate feature" : "Activate feature"}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                            feat.isActive
                              ? "bg-[var(--platform-success-surface)] text-[var(--platform-success)] border border-[var(--platform-success-border)]"
                              : "bg-[var(--platform-neutral-surface)] text-[var(--platform-text-muted)] border border-[var(--platform-border-subtle)]"
                          }`}
                        >
                          {feat.isActive ? (
                            <>
                              <Check className="w-3 h-3" />
                              Active
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              Disabled
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setFeatureToEdit(feat);
                            setFeatureModalOpen(true);
                          }}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabContent>

        {/* =========================================================================
            Tab 4: Staff Roles & Permissions Catalog
           ========================================================================= */}
        <TabContent value="roles" className="space-y-4 mt-4">
          <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
              Staff Roles & RBAC Matrix
            </h3>
            <p className="text-xs text-[var(--platform-text-muted)] mt-1">
              Platform roles define the operational personas gyms can provision. Each plan limits which roles a gym can invite.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => {
              const permittingPlans = plans.filter((p) => (p.allowedRoles || []).includes(r.key));
              return (
                <div
                  key={r.key}
                  className="p-4 rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <span className="font-semibold text-sm text-[var(--platform-text-primary)]">
                          {r.name}
                        </span>
                        <div className="mt-0.5">
                          <CopyChip text={r.key} label={r.key} />
                        </div>
                      </div>
                      <Badge variant="accent" size="xs">
                        {r.category || "Staff"}
                      </Badge>
                    </div>

                    <p className="text-xs text-[var(--platform-text-secondary)] leading-relaxed mt-2 min-h-[36px]">
                      {r.description || "Operational gym operator role."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--platform-border-subtle)] space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] block">
                      Permitted in Tiers:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {permittingPlans.length === 0 ? (
                        <span className="text-[11px] text-[var(--platform-text-muted)]">
                          No plans currently allow this role
                        </span>
                      ) : (
                        permittingPlans.map((p) => (
                          <Badge key={p._id} variant="neutral" size="xs">
                            {p.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabContent>
      </Tabs>

      {/* Modals */}
      <CreateFeatureModal
        open={featureModalOpen}
        onOpenChange={setFeatureModalOpen}
        featureToEdit={featureToEdit}
        onSaved={refetchFeatures}
      />

      <CreatePlanModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
        planToEdit={planToEdit}
        availableFeatures={features}
        availableRoles={roles}
        onSaved={refetchPlans}
      />

      {impactPlan && (
        <PlanImpactModal
          open={impactOpen}
          onOpenChange={setImpactOpen}
          plan={impactPlan}
          targetFeatures={impactPlan.features}
          onConfirmSave={() => setImpactOpen(false)}
        />
      )}

      {/* Archive Plan Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(archivePlanTarget)}
        onOpenChange={(open) => !open && setArchivePlanTarget(null)}
        title={`Archive Plan: ${archivePlanTarget?.name}`}
        description="Archiving will prevent any new signups or upgrades to this tier. Existing subscribers will retain their current plan configuration."
        confirmText="Archive Commercial Tier"
        variant="danger"
        requireReason={true}
        loading={archiving}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
