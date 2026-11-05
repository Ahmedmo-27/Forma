import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetPlans,
  apiGetFeatures,
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
import CreateFeatureModal from "./CreateFeatureModal";
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

  const plans = plansData || [];
  const features = featuresData || [];

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

  const handleArchiveConfirm = async (reason) => {
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
          <TabTrigger value="features">
            Feature Catalog ({features.length})
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
                <option value="core">Core Capabilities</option>
                <option value="pos">Point of Sale (POS)</option>
                <option value="crm">CRM & Members</option>
                <option value="automation">WhatsApp & Automation</option>
                <option value="analytics">Enterprise Analytics</option>
                <option value="hardware">Access Control & Hardware</option>
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
