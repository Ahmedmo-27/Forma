import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetPlanPrices,
  apiGetPlans,
  apiTogglePlanPriceSales,
  apiGetCoupons,
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
  EmptyState,
  platformToast,
} from "../../ui";
import CreatePriceModal from "./CreatePriceModal";
import CreateCouponModal from "./CreateCouponModal";
import {
  Tag,
  DollarSign,
  Ticket,
  Plus,
  Percent,
  CheckCircle2,
  XCircle,
  Edit2,
  Calendar,
  Lock,
  Layers,
} from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/utils/formatters";

export default function PricingCouponsPage() {
  const [activeTab, setActiveTab] = useState("prices");

  // Modals state
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceToEdit, setPriceToEdit] = useState(null);

  const [couponModalOpen, setCouponModalOpen] = useState(false);

  // Queries
  const {
    data: pricesData,
    isLoading: pricesLoading,
    refetch: refetchPrices,
  } = useQuery({
    queryKey: ["platform", "prices"],
    queryFn: () => apiGetPlanPrices().then((r) => r.data),
  });

  const {
    data: plansData,
  } = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiGetPlans().then((r) => r.data),
  });

  const {
    data: couponsData,
    isLoading: couponsLoading,
    refetch: refetchCoupons,
  } = useQuery({
    queryKey: ["platform", "coupons"],
    queryFn: () => apiGetCoupons().then((r) => r.data),
  });

  const prices = pricesData || [];
  const plans = plansData || [];
  const coupons = couponsData || [];

  // Toggle Sales
  const handleToggleSales = async (price) => {
    try {
      const res = await apiTogglePlanPriceSales(price._id);
      platformToast.success(res.data?.message || "Price sales status updated");
      refetchPrices();
    } catch (err) {
      platformToast.error(err?.message || "Failed to toggle sales status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Pricing Matrices & Coupons
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              Live Commercial Rules
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Manage multi-currency billing cadences, hard lifetime caps, and checkout promotions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCouponModalOpen(true)}
          >
            <Ticket className="w-4 h-4 mr-1.5" />
            Issue Coupon
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPriceToEdit(null);
              setPriceModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Price Tier
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Price Tiers</span>
            <DollarSign className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {prices.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">
            {prices.filter((p) => p.isActive).length} currently open for sale
          </span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Lifetime Deal Tiers</span>
            <Lock className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {prices.filter((p) => p.cycle === "lifetime").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Capped seat quotas</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Active Coupons</span>
            <Tag className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {coupons.filter((c) => c.isActive).length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">
            {coupons.length} total codes issued
          </span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Total Redemptions</span>
            <Percent className="w-4 h-4 text-[var(--platform-warning)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {coupons.reduce((acc, c) => acc + (c.timesRedeemed || 0), 0)}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Claimed across gyms</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabTrigger value="prices">
            Plan Price Tiers ({prices.length})
          </TabTrigger>
          <TabTrigger value="coupons">
            Promotional Coupons ({coupons.length})
          </TabTrigger>
        </TabsList>

        {/* Tab 1: Prices */}
        <TabContent value="prices" className="space-y-4 mt-4">
          {pricesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : prices.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No price matrices authored"
              description="Define pricing for monthly, yearly, or lifetime memberships."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setPriceModalOpen(true)}
                >
                  Create Price Tier
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Billing Cadence</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Lifetime Seat Quota</th>
                    <th className="py-3 px-4">Validity</th>
                    <th className="py-3 px-4 text-center">Sales Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {prices.map((p) => {
                    const planName = p.planId?.name || "Unknown Plan";
                    const planKey = p.planId?.key || "unknown";

                    return (
                      <tr
                        key={p._id}
                        className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-[var(--platform-text-primary)]">
                            {planName}
                          </div>
                          <div className="mt-0.5">
                            <CopyChip text={planKey} />
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              p.cycle === "lifetime"
                                ? "info"
                                : p.cycle === "yearly"
                                ? "success"
                                : "neutral"
                            }
                            size="xs"
                            className="capitalize"
                          >
                            {p.cycle}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold text-sm text-[var(--platform-text-primary)]">
                            {formatCurrency(p.amount, p.currency || "USD")}
                          </span>
                          <span className="text-[11px] text-[var(--platform-text-muted)] block">
                            {p.cycle === "lifetime" ? "one-time" : `/${p.cycle}`}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {p.cycle === "lifetime" ? (
                            p.maxLifetimeSeats != null ? (
                              <div className="space-y-1 max-w-[140px]">
                                <div className="flex justify-between text-[11px] font-mono">
                                  <span>Limit:</span>
                                  <span className="font-semibold">{p.maxLifetimeSeats} seats</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--platform-border-subtle)] overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--platform-accent)] rounded-full"
                                    style={{ width: "30%" }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[var(--platform-text-muted)] italic">Unlimited</span>
                            )
                          ) : (
                            <span className="text-[var(--platform-text-muted)]">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)]">
                          {p.validUntil ? (
                            <span className="flex items-center gap-1 text-[var(--platform-warning)]">
                              <Calendar className="w-3 h-3" />
                              Expires {formatDate(p.validUntil)}
                            </span>
                          ) : (
                            <span className="text-[var(--platform-text-muted)]">Perpetual</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSales(p)}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                              p.isActive
                                ? "bg-[var(--platform-success-surface)] text-[var(--platform-success)] border border-[var(--platform-success-border)]"
                                : "bg-[var(--platform-neutral-surface)] text-[var(--platform-text-muted)] border border-[var(--platform-border-subtle)]"
                            }`}
                          >
                            {p.isActive ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Sales Open
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" />
                                Sales Closed
                              </>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setPriceToEdit(p);
                              setPriceModalOpen(true);
                            }}
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabContent>

        {/* Tab 2: Coupons */}
        <TabContent value="coupons" className="space-y-4 mt-4">
          {couponsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : coupons.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No promotional coupons found"
              description="Generate percentage or fixed discounts to incentivize gym subscribers."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setCouponModalOpen(true)}
                >
                  Issue Coupon
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Coupon Code</th>
                    <th className="py-3 px-4">Discount</th>
                    <th className="py-3 px-4">Applies To</th>
                    <th className="py-3 px-4">Redemptions</th>
                    <th className="py-3 px-4">Expiration</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {coupons.map((c) => {
                    const isExpired =
                      c.expiresAt && new Date(c.expiresAt) < new Date();
                    return (
                      <tr
                        key={c._id}
                        className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                      >
                        <td className="py-3 px-4 font-mono">
                          <CopyChip text={c.code} />
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-semibold text-sm text-[var(--platform-success)]">
                            {c.type === "percentage"
                              ? `${c.discountValue}% OFF`
                              : `-${formatCurrency(c.discountValue, c.currency || "USD")}`}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {c.appliesTo?.cycles?.map((cy) => (
                              <Badge key={cy} variant="neutral" size="xs">
                                {cy}
                              </Badge>
                            ))}
                            {c.appliesTo?.planKeys?.map((pk) => (
                              <Badge key={pk} variant="info" size="xs" className="font-mono">
                                {pk}
                              </Badge>
                            ))}
                            {(!c.appliesTo?.planKeys || c.appliesTo.planKeys.length === 0) && (
                              <span className="text-[11px] text-[var(--platform-text-muted)]">
                                All tiers
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px]">
                          {c.timesRedeemed || 0} /{" "}
                          {c.maxRedemptions != null ? c.maxRedemptions : "∞"}
                        </td>

                        <td className="py-3 px-4 text-[11px]">
                          {c.expiresAt ? (
                            <span
                              className={
                                isExpired
                                  ? "text-[var(--platform-danger)] font-medium"
                                  : "text-[var(--platform-text-secondary)]"
                              }
                            >
                              {formatDate(c.expiresAt)}
                            </span>
                          ) : (
                            <span className="text-[var(--platform-text-muted)]">Never</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant={
                              !c.isActive || isExpired
                                ? "danger"
                                : "success"
                            }
                            size="xs"
                          >
                            {!c.isActive ? "Disabled" : isExpired ? "Expired" : "Active"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabContent>
      </Tabs>

      {/* Modals */}
      <CreatePriceModal
        open={priceModalOpen}
        onOpenChange={setPriceModalOpen}
        priceToEdit={priceToEdit}
        availablePlans={plans}
        onSaved={refetchPrices}
      />

      <CreateCouponModal
        open={couponModalOpen}
        onOpenChange={setCouponModalOpen}
        availablePlans={plans}
        onSaved={refetchCoupons}
      />
    </div>
  );
}
