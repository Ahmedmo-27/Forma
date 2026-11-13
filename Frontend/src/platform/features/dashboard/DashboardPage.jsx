import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  Zap,
} from "lucide-react";
import {
  apiGetAnalyticsOverview,
  apiComputeSnapshotNow,
  apiGetHealthDetails,
} from "../../lib/api/endpoints";
import { KpiCard } from "../../shell/KpiCard";
import { Button } from "../../ui/Button";
import { Badge, StatusPill } from "../../ui/Badge";
import { Skeleton } from "../../ui/Skeleton";
import { ErrorState } from "../../ui/ErrorState";
import { formatCurrency, formatNumber } from "../../lib/utils/formatters";
import { platformToast } from "../../ui/Toast";

function formatGrowth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function growthTone(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

export default function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [healthDetails, setHealthDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, healthRes] = await Promise.allSettled([
        apiGetAnalyticsOverview(),
        apiGetHealthDetails(),
      ]);

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value.data);
        setLoadError("");
      } else {
        setOverview(null);
        setLoadError("Dashboard metrics could not be loaded. Figures below are hidden until a snapshot succeeds.");
      }
      if (healthRes.status === "fulfilled") {
        setHealthDetails(healthRes.value.data);
      } else {
        setHealthDetails(null);
      }
    } catch {
      setLoadError("Dashboard metrics could not be loaded.");
      platformToast.error("Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleComputeNow = async () => {
    setRefreshing(true);
    try {
      await apiComputeSnapshotNow();
      platformToast.success("Daily metric snapshot computed successfully!");
      await loadData();
    } catch (err) {
      platformToast.error(err.message || "Failed to recompute daily snapshot");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="space-y-8 animate-pulse text-left">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between pb-6 border-b border-[var(--platform-border-subtle)]">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-80" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>

        {/* KPI Strip Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-[var(--platform-radius-lg)] bg-[var(--platform-surface)] border border-[var(--platform-border)] space-y-3"
            >
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Main Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-6 rounded-[var(--platform-radius-lg)] bg-[var(--platform-surface)] border border-[var(--platform-border)] space-y-4"
            >
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const metrics = overview?.metrics || {};
  const revenue = metrics.revenue || {};
  const growth = metrics.growth || {};
  const mix = metrics.mix || {};
  const health = metrics.health || {};
  const definitions = overview?.definitions || {};

  const totalSubscribers =
    (mix.byCycle?.monthly || 0) + (mix.byCycle?.yearly || 0) || 1;

  const monthlyPercent = Math.round(((mix.byCycle?.monthly || 0) / totalSubscribers) * 100);
  const yearlyPercent = Math.round(((mix.byCycle?.yearly || 0) / totalSubscribers) * 100);

  const upsellCandidates = healthDetails?.upsellCandidates || [];
  const churnRisks = healthDetails?.churnRisks || [];

  return (
    <div className="space-y-8 text-left animate-in fade-in duration-200">
      {/* ── 1. Page Header with Generous Bottom Separation ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--platform-border-subtle)]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-[var(--platform-text-primary)]">
              Executive Overview
            </h1>
            <StatusPill
              status={overview ? "operational" : "warning"}
              label={overview ? "Snapshot loaded" : "Metrics unavailable"}
            />
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1.5 leading-relaxed">
            Consolidated subscription revenue, gym capacity telemetry, and platform operational health.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={RefreshCw}
            loading={refreshing}
            onClick={handleComputeNow}
            title="Force recomputation of daily snapshots from ledger events"
          >
            {refreshing ? "Computing Rollup..." : "Recompute Snapshot"}
          </Button>
        </div>
      </div>

      {loadError && (
        <ErrorState title="Metrics unavailable" message={loadError} onRetry={loadData} />
      )}

      {/* ── 2. KPI Cards Strip with Balanced Breathing Room ── */}
      {overview && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          title="Monthly Recurring (MRR)"
          value={formatCurrency(revenue.mrr)}
          subtext="Recurring subscribers"
          delta={formatGrowth(growth.mrrGrowth)}
          deltaType={growthTone(growth.mrrGrowth)}
          howCalculated={definitions.mrr || "Sum of all normalized monthly recurring subscriptions."}
          icon={DollarSign}
        />

        <KpiCard
          title="Annual Run Rate (ARR)"
          value={formatCurrency(revenue.arr)}
          subtext="MRR × 12 annualized"
          delta={formatGrowth(growth.arrGrowth)}
          deltaType={growthTone(growth.arrGrowth)}
          howCalculated={definitions.arr || "MRR annualized across active monthly and yearly contracts."}
          icon={TrendingUp}
        />

        <KpiCard
          title="Yearly Subscribers"
          value={formatNumber(mix.byCycle?.yearly || 0)}
          subtext="Annual contract gyms"
          deltaType="neutral"
          howCalculated="Count of active gyms billed on the yearly cycle — the highest subscription tier."
          icon={Sparkles}
        />

        <KpiCard
          title="Net Settled Revenue"
          value={formatCurrency(revenue.netRevenue)}
          subtext={`${formatCurrency(revenue.refundsTotal || 0)} refunded`}
          deltaType="neutral"
          howCalculated={
            definitions.netRevenue ||
            "Total gross cash received minus processed tenant refunds and dispute reversals."
          }
          icon={ShieldCheck}
        />
      </div>
      )}

      {/* ── 3. Detailed Analytics Grids with 24px Gaps ── */}
      {overview && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* ── Card 1: Subscriber Distribution & Operational Lifecycle ── */}
        <div className="p-6 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xs flex flex-col justify-between space-y-6 platform-card">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--platform-border-subtle)]">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                  Subscriber Distribution
                </h2>
                <p className="text-xs text-[var(--platform-text-secondary)] mt-0.5">
                  Breakdown by contract cycle
                </p>
              </div>
              <Link
                to="/platform/tenants"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline"
              >
                <span>View All Gyms</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Cycle Progress Bars */}
            <div className="space-y-4">
              {/* Monthly */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--platform-text-secondary)] font-medium">Monthly Recurring</span>
                  <span className="platform-mono font-semibold text-[var(--platform-text-primary)]">
                    {formatNumber(mix.byCycle?.monthly || 0)}{" "}
                    <span className="text-[11px] text-[var(--platform-text-muted)]">({monthlyPercent}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--platform-surface-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--platform-accent)] transition-all duration-300"
                    style={{ width: `${monthlyPercent}%` }}
                  />
                </div>
              </div>

              {/* Yearly */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--platform-text-secondary)] font-medium">Annual Contracts</span>
                  <span className="platform-mono font-semibold text-[var(--platform-text-primary)]">
                    {formatNumber(mix.byCycle?.yearly || 0)}{" "}
                    <span className="text-[11px] text-[var(--platform-text-muted)]">({yearlyPercent}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--platform-surface-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--platform-info)] transition-all duration-300"
                    style={{ width: `${yearlyPercent}%` }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Lifecycle Matrix Sub-panel */}
          <div className="pt-5 border-t border-[var(--platform-border-subtle)] space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Gyms By Operational Lifecycle
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/platform/tenants?status=active"
                className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] hover:border-[var(--platform-success)]/40 transition-colors group"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--platform-text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--platform-success)]" />
                  <span>Active Gyms</span>
                </div>
                <div className="mt-1.5 platform-mono text-xl font-bold text-[var(--platform-success)]">
                  {formatNumber(growth.activeTenants || 0)}
                </div>
              </Link>

              <Link
                to="/platform/tenants?status=trial"
                className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] hover:border-[var(--platform-info)]/40 transition-colors group"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--platform-text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--platform-info)]" />
                  <span>Free Trials</span>
                </div>
                <div className="mt-1.5 platform-mono text-xl font-bold text-[var(--platform-info)]">
                  {formatNumber(growth.trialTenants || 0)}
                </div>
              </Link>

              <Link
                to="/platform/tenants?status=past_due"
                className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] hover:border-[var(--platform-warning)]/40 transition-colors group"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--platform-text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--platform-warning)]" />
                  <span>Past Due</span>
                </div>
                <div className="mt-1.5 platform-mono text-xl font-bold text-[var(--platform-warning)]">
                  {formatNumber(growth.pastDueTenants || 0)}
                </div>
              </Link>

              <Link
                to="/platform/tenants?status=suspended"
                className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] hover:border-[var(--platform-danger)]/40 transition-colors group"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--platform-text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--platform-danger)]" />
                  <span>Suspended</span>
                </div>
                <div className="mt-1.5 platform-mono text-xl font-bold text-[var(--platform-danger)]">
                  {formatNumber(growth.suspendedTenants || 0)}
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Card 2: Health & Proactive Telemetry ── */}
        <div className="p-6 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xs flex flex-col justify-between space-y-6 platform-card">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--platform-border-subtle)]">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                  Health & Proactive Actions
                </h2>
                <p className="text-xs text-[var(--platform-text-secondary)] mt-0.5">
                  Churn prevention & capacity expansion
                </p>
              </div>
              <Badge variant={healthDetails ? "neutral" : "warning"} size="sm">
                {healthDetails ? "Latest snapshot" : "Unavailable"}
              </Badge>
            </div>

            {/* Section 1: Upsell Candidates */}
            <div className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--platform-text-primary)] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[var(--platform-accent)]" />
                  <span>Capacity Upsell Candidates</span>
                </span>
                <span className="platform-mono text-xs font-bold text-[var(--platform-accent)]">
                  {upsellCandidates.length || health.upsellCandidateCount || 0}
                </span>
              </div>
              <p className="text-[11px] text-[var(--platform-text-muted)] leading-relaxed">
                Gyms at ≥ 80% member or staff capacity limit ready for plan upgrade.
                {health.averageHealthScore != null ? ` Average tenant health score: ${health.averageHealthScore}/100.` : ""}
                {growth.nrrStatus === "insufficient_history" ? " Net revenue retention is blank until two monthly snapshots exist." : ""}
              </p>
              {upsellCandidates.length > 0 && (
                <div className="pt-2 border-t border-[var(--platform-border-subtle)] space-y-1.5">
                  {upsellCandidates.slice(0, 2).map((gym) => (
                    <Link
                      key={gym.id}
                      to={`/platform/tenants/${gym.id}`}
                      className="flex items-center justify-between gap-2 text-xs min-h-8 rounded-[var(--platform-radius-sm)] hover:text-[var(--platform-accent)]"
                    >
                      <span className="text-[var(--platform-text-secondary)] truncate font-medium">
                        {gym.name}
                      </span>
                      <span className="platform-mono text-[11px] font-semibold text-[var(--platform-accent)] shrink-0">
                        {gym.capacityPercent}% capacity
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Inactive Churn Risks */}
            <div className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--platform-text-primary)] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--platform-danger)]" />
                  <span>Inactive Churn Risks</span>
                </span>
                <span className="platform-mono text-xs font-bold text-[var(--platform-danger)]">
                  {churnRisks.length || health.churnRiskCount || 0}
                </span>
              </div>
              <p className="text-[11px] text-[var(--platform-text-muted)] leading-relaxed">
                Gyms with zero check-ins or staff logins over the past 14 days.
              </p>
              {churnRisks.length > 0 && (
                <div className="pt-2 border-t border-[var(--platform-border-subtle)] space-y-1.5">
                  {churnRisks.slice(0, 2).map((gym) => (
                    <Link
                      key={gym.id}
                      to={`/platform/tenants/${gym.id}`}
                      className="flex items-center justify-between gap-2 text-xs min-h-8 rounded-[var(--platform-radius-sm)] hover:text-[var(--platform-danger)]"
                    >
                      <span className="text-[var(--platform-text-secondary)] truncate font-medium">
                        {gym.name}
                      </span>
                      <span className="platform-mono text-[11px] font-semibold text-[var(--platform-danger)] shrink-0">
                        {gym.daysInactive}d inactive
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Expiring Trials */}
            <div className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--platform-text-primary)]">
                  Trials in progress
                </span>
                <span className="platform-mono text-xs font-bold text-[var(--platform-warning)]">
                  {formatNumber(growth.trialTenants || 0)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--platform-text-muted)] leading-relaxed">
                Gyms that are still on a trial and have not converted yet.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--platform-border-subtle)]">
            <Link
              to="/platform/usage"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline"
            >
              <span>Inspect Infrastructure Consumption</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── Card 3: Pricing & Platform Governance ── */}
        <div className="p-6 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xs flex flex-col justify-between space-y-6 platform-card">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--platform-border-subtle)]">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                  Subscription Pricing
                </h2>
                <p className="text-xs text-[var(--platform-text-secondary)] mt-0.5">
                  Monthly and yearly billing only
                </p>
              </div>
              <Badge variant="neutral" size="sm">
                Yearly Max Tier
              </Badge>
            </div>

            <div className="rounded-[var(--platform-radius-md)] border border-dashed border-[var(--platform-border)] px-4 py-6 text-center space-y-2">
              <p className="text-xs font-medium text-[var(--platform-text-primary)]">
                Highest plan cycle is yearly
              </p>
              <p className="text-[11px] text-[var(--platform-text-muted)] leading-relaxed">
                Manage monthly and yearly price matrices, coupons, and sales status from pricing.
              </p>
              <Link
                to="/platform/pricing-coupons"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline min-h-8"
              >
                Manage pricing
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] text-xs text-[var(--platform-text-secondary)] leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--platform-success)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[var(--platform-text-primary)]">Deterministic Ledger Sync:</strong> Computed
                automatically via immutable platform audit logs and pre-aggregated ledger snapshots.
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--platform-border-subtle)] flex items-center justify-between">
            <Link
              to="/platform/ledger"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline"
            >
              <span>View Financial Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-[11px] text-[var(--platform-text-muted)]">
              From ledger snapshots
            </span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
