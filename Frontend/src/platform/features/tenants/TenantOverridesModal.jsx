import { useState, useEffect } from "react";
import {
  Dialog,
  Button,
  Input,
  Badge,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  Callout,
  platformToast,
} from "../../ui";
import { apiUpdateTenantLifecycle, apiGetFeatures, apiGetRoles } from "../../lib/api/endpoints";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  Shield,
  Layers,
  Users,
  Activity,
  AlertTriangle,
} from "lucide-react";

export default function TenantOverridesModal({
  open,
  onOpenChange,
  tenant,
  onSaved,
}) {
  const [activeTab, setActiveTab] = useState("features");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Queries for catalog
  const { data: allFeatures = [] } = useQuery({
    queryKey: ["platform", "features"],
    queryFn: () => apiGetFeatures().then((r) => r.data),
    enabled: open,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["platform", "roles"],
    queryFn: () => apiGetRoles().then((r) => r.data).catch(() => []),
    enabled: open,
  });

  // Base plan entitlements
  const basePlanFeatures = new Set(tenant?.plan?.features || tenant?.planId?.features || []);
  const basePlanRoles = new Set(tenant?.plan?.allowedRoles || tenant?.planId?.allowedRoles || []);

  // Form State
  const [addFeatures, setAddFeatures] = useState([]);
  const [removeFeatures, setRemoveFeatures] = useState([]);
  const [addRoles, setAddRoles] = useState([]);
  const [removeRoles, setRemoveRoles] = useState([]);

  // Limit Overrides
  const [overrideMaxMembers, setOverrideMaxMembers] = useState("");
  const [overrideMaxStaff, setOverrideMaxStaff] = useState("");
  const [overrideMaxBranches, setOverrideMaxBranches] = useState("");

  // Audit Reason
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Synchronize when tenant or modal changes
  useEffect(() => {
    if (open && tenant) {
      setAddFeatures([...(tenant.featureOverrides?.add || [])]);
      setRemoveFeatures([...(tenant.featureOverrides?.remove || [])]);
      setAddRoles([...(tenant.roleOverrides?.add || [])]);
      setRemoveRoles([...(tenant.roleOverrides?.remove || [])]);

      setOverrideMaxMembers(
        tenant.limitOverrides?.maxMembers != null ? String(tenant.limitOverrides.maxMembers) : ""
      );
      setOverrideMaxStaff(
        tenant.limitOverrides?.maxStaff != null ? String(tenant.limitOverrides.maxStaff) : ""
      );
      setOverrideMaxBranches(
        tenant.limitOverrides?.maxBranches != null ? String(tenant.limitOverrides.maxBranches) : ""
      );

      setReason("");
      setError(null);
      setSearchQuery("");
    }
  }, [open, tenant]);

  // Feature Toggling Logic
  const handleToggleFeature = (featKey) => {
    const isBase = basePlanFeatures.has(featKey);
    const isExplicitlyAdded = addFeatures.includes(featKey);
    const isExplicitlyRemoved = removeFeatures.includes(featKey);

    if (isBase) {
      // Feature is in base plan: toggling turns it off (add to remove list) or turns it back on
      if (isExplicitlyRemoved) {
        setRemoveFeatures((prev) => prev.filter((k) => k !== featKey));
      } else {
        setRemoveFeatures((prev) => [...prev, featKey]);
      }
    } else {
      // Feature is NOT in base plan (e.g., Gold/Platinum feature): toggling grants it (+Add) or removes grant
      if (isExplicitlyAdded) {
        setAddFeatures((prev) => prev.filter((k) => k !== featKey));
      } else {
        setAddFeatures((prev) => [...prev, featKey]);
      }
    }
  };

  // Role Toggling Logic
  const handleToggleRole = (roleKey) => {
    const isBase = basePlanRoles.has(roleKey);
    const isExplicitlyAdded = addRoles.includes(roleKey);
    const isExplicitlyRemoved = removeRoles.includes(roleKey);

    if (isBase) {
      if (isExplicitlyRemoved) {
        setRemoveRoles((prev) => prev.filter((r) => r !== roleKey));
      } else {
        setRemoveRoles((prev) => [...prev, roleKey]);
      }
    } else {
      if (isExplicitlyAdded) {
        setAddRoles((prev) => prev.filter((r) => r !== roleKey));
      } else {
        setAddRoles((prev) => [...prev, roleKey]);
      }
    }
  };

  const handleResetDefaults = () => {
    setAddFeatures([]);
    setRemoveFeatures([]);
    setAddRoles([]);
    setRemoveRoles([]);
    setOverrideMaxMembers("");
    setOverrideMaxStaff("");
    setOverrideMaxBranches("");
  };

  const handleSaveOverrides = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A clear reason for granting/modifying overrides is required for the audit trail.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      action: "change_overrides",
      reason: reason.trim(),
      featureOverrides: {
        add: addFeatures,
        remove: removeFeatures,
      },
      roleOverrides: {
        add: addRoles,
        remove: removeRoles,
      },
      limitOverrides: {
        maxMembers: overrideMaxMembers ? Number(overrideMaxMembers) : null,
        maxStaff: overrideMaxStaff ? Number(overrideMaxStaff) : null,
        maxBranches: overrideMaxBranches ? Number(overrideMaxBranches) : null,
      },
    };

    try {
      await apiUpdateTenantLifecycle(tenant._id || tenant.id, payload);
      platformToast.success(`Entitlements updated for '${tenant.name}'`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to update tenant entitlements");
    } finally {
      setLoading(false);
    }
  };

  const totalOverridesCount =
    addFeatures.length +
    removeFeatures.length +
    addRoles.length +
    removeRoles.length +
    (overrideMaxMembers ? 1 : 0) +
    (overrideMaxStaff ? 1 : 0) +
    (overrideMaxBranches ? 1 : 0);

  const planName = tenant?.plan?.name || tenant?.planId?.name || "Basic Plan";

  const footer = (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleResetDefaults}
          disabled={totalOverridesCount === 0 || loading}
          className="text-[var(--platform-text-muted)] hover:text-[var(--platform-danger)]"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Reset to Plan Defaults
        </Button>
      </div>

      <div className="flex items-center gap-2.5">
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={loading}
          onClick={handleSaveOverrides}
        >
          Save Entitlements ({totalOverridesCount} overrides)
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={`Customize Entitlements: ${tenant?.name || "Gym Tenant"}`}
      description={`Base Tier: ${planName}. Add or remove individual features, grant extra staff roles, or adjust capacity limits.`}
      footer={footer}
      size="xl"
    >
      <form onSubmit={handleSaveOverrides} className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
        {error && <Callout variant="danger">{error}</Callout>}

        {/* Current Tier Overview Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--platform-text-muted)]">Base Subscription Tier:</span>
            <Badge variant="accent" size="sm" className="font-semibold">
              {planName}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[var(--platform-text-muted)]">Active Overrides:</span>
            <Badge
              variant={totalOverridesCount > 0 ? "warning" : "neutral"}
              size="sm"
              className="font-mono"
            >
              {totalOverridesCount === 0 ? "None (Standard Tier)" : `${totalOverridesCount} Overrides Active`}
            </Badge>
          </div>
        </div>

        {/* Audit Reason Input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Audit Reason for Override <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            placeholder="e.g. VIP client promo: granted WhatsApp integration and Sales rep role on Basic tier"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="text-xs"
          />
          <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
            This reason will be permanently recorded in the security audit trail.
          </span>
        </div>

        {/* Tabs for Features, Roles, and Limits */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <TabsList>
            <TabTrigger value="features">
              Features Matrix ({addFeatures.length > 0 ? `+${addFeatures.length}` : ""}{removeFeatures.length > 0 ? ` -${removeFeatures.length}` : ""})
            </TabTrigger>
            <TabTrigger value="roles">
              Staff Roles ({addRoles.length > 0 ? `+${addRoles.length}` : ""}{removeRoles.length > 0 ? ` -${removeRoles.length}` : ""})
            </TabTrigger>
            <TabTrigger value="limits">
              Capacity Limits
            </TabTrigger>
          </TabsList>

          {/* ── TAB 1: FEATURES MATRIX ── */}
          <TabContent value="features" className="space-y-3 mt-3">
            <div className="flex items-center justify-between gap-3">
              <Input
                placeholder="Search feature by name or key..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 text-xs"
              />
              <div className="flex items-center gap-2 text-[11px] text-[var(--platform-text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Included in Plan
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> Custom Added (+)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> Custom Revoked (-)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
              {allFeatures
                .filter(
                  (f) =>
                    !searchQuery ||
                    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    f.key.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((feat) => {
                  const isBase = basePlanFeatures.has(feat.key);
                  const isAdded = addFeatures.includes(feat.key);
                  const isRemoved = removeFeatures.includes(feat.key);
                  const isEffectivelyEnabled = (isBase && !isRemoved) || isAdded;

                  return (
                    <div
                      key={feat.key}
                      className={`p-3 rounded-lg border transition-all flex items-start justify-between gap-3 ${
                        isAdded
                          ? "bg-blue-500/5 border-blue-500/30 dark:bg-blue-500/10"
                          : isRemoved
                          ? "bg-red-500/5 border-red-500/30 opacity-75 dark:bg-red-500/10"
                          : isBase
                          ? "bg-[var(--platform-surface)] border-[var(--platform-border-subtle)]"
                          : "bg-[var(--platform-canvas)] border-dashed border-[var(--platform-border-subtle)] opacity-85"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-[var(--platform-text-primary)]">
                            {feat.name}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--platform-text-muted)]">
                            ({feat.key})
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isAdded && (
                            <Badge variant="info" size="xs">
                              <Plus className="w-2.5 h-2.5 mr-0.5" />
                              Custom Added
                            </Badge>
                          )}
                          {isRemoved && (
                            <Badge variant="danger" size="xs">
                              <Minus className="w-2.5 h-2.5 mr-0.5" />
                              Custom Revoked
                            </Badge>
                          )}
                          {isBase && !isRemoved && (
                            <Badge variant="success" size="xs">
                              <Check className="w-2.5 h-2.5 mr-0.5" />
                              Base Plan
                            </Badge>
                          )}
                          {!isBase && !isAdded && (
                            <Badge variant="neutral" size="xs">
                              Higher Tier Feature
                            </Badge>
                          )}
                          <Badge variant="neutral" size="xs" className="capitalize">
                            {feat.category || "core"}
                          </Badge>
                        </div>

                        {feat.description && (
                          <p className="text-[11px] text-[var(--platform-text-muted)] line-clamp-1">
                            {feat.description}
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        size="xs"
                        variant={isEffectivelyEnabled ? "outline" : "primary"}
                        onClick={() => handleToggleFeature(feat.key)}
                        className={`shrink-0 text-xs ${
                          isAdded
                            ? "text-blue-600 border-blue-400 hover:bg-blue-50"
                            : isRemoved
                            ? "text-red-600 border-red-400 hover:bg-red-50"
                            : ""
                        }`}
                      >
                        {isEffectivelyEnabled ? "Disable" : "Grant Feature"}
                      </Button>
                    </div>
                  );
                })}
            </div>
          </TabContent>

          {/* ── TAB 2: STAFF ROLES OVERRIDES ── */}
          <TabContent value="roles" className="space-y-3 mt-3">
            <Callout variant="info" className="text-xs">
              Staff role overrides allow this gym to invite specific staff personas (e.g. Sales or Accountant) even if their base tier normally restricts it.
            </Callout>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
              {allRoles.map((role) => {
                const isBase = basePlanRoles.has(role.key);
                const isAdded = addRoles.includes(role.key);
                const isRemoved = removeRoles.includes(role.key);
                const isEffectivelyPermitted = (isBase && !isRemoved) || isAdded;

                return (
                  <div
                    key={role.key}
                    className={`p-3 rounded-lg border transition-all flex items-start justify-between gap-3 ${
                      isAdded
                        ? "bg-blue-500/5 border-blue-500/30"
                        : isRemoved
                        ? "bg-red-500/5 border-red-500/30 opacity-75"
                        : isBase
                        ? "bg-[var(--platform-surface)] border-[var(--platform-border-subtle)]"
                        : "bg-[var(--platform-canvas)] border-dashed border-[var(--platform-border-subtle)] opacity-85"
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-[var(--platform-text-primary)]">
                          {role.name || role.key}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--platform-text-muted)]">
                          ({role.key})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isAdded && (
                          <Badge variant="info" size="xs">
                            <Plus className="w-2.5 h-2.5 mr-0.5" />
                            Role Granted
                          </Badge>
                        )}
                        {isRemoved && (
                          <Badge variant="danger" size="xs">
                            <Minus className="w-2.5 h-2.5 mr-0.5" />
                            Role Revoked
                          </Badge>
                        )}
                        {isBase && !isRemoved && (
                          <Badge variant="success" size="xs">
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            Base Plan
                          </Badge>
                        )}
                        <Badge variant="accent" size="xs">
                          {role.category || "Staff"}
                        </Badge>
                      </div>

                      {role.description && (
                        <p className="text-[11px] text-[var(--platform-text-muted)] line-clamp-1">
                          {role.description}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="xs"
                      variant={isEffectivelyPermitted ? "outline" : "primary"}
                      onClick={() => handleToggleRole(role.key)}
                      className="shrink-0 text-xs"
                    >
                      {isEffectivelyPermitted ? "Restrict" : "Allow Role"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabContent>

          {/* ── TAB 3: CAPACITY LIMITS OVERRIDES ── */}
          <TabContent value="limits" className="space-y-4 mt-3">
            <Callout variant="neutral" className="text-xs">
              Leave fields blank to inherit standard limits from the <strong>{planName}</strong>.
            </Callout>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Custom Max Members
                </label>
                <Input
                  type="number"
                  placeholder={`Plan default: ${tenant?.plan?.limits?.maxMembers || 500}`}
                  value={overrideMaxMembers}
                  onChange={(e) => setOverrideMaxMembers(e.target.value)}
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Custom Max Staff Logins
                </label>
                <Input
                  type="number"
                  placeholder={`Plan default: ${tenant?.plan?.limits?.maxStaff || 10}`}
                  value={overrideMaxStaff}
                  onChange={(e) => setOverrideMaxStaff(e.target.value)}
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Custom Max Branches
                </label>
                <Input
                  type="number"
                  placeholder={`Plan default: ${tenant?.plan?.limits?.maxBranches || 1}`}
                  value={overrideMaxBranches}
                  onChange={(e) => setOverrideMaxBranches(e.target.value)}
                  min="1"
                />
              </div>
            </div>
          </TabContent>
        </Tabs>
      </form>
    </Dialog>
  );
}
