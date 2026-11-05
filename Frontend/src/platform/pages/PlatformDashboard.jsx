import { useState, useEffect } from "react";
import { getAnalyticsOverview, computeSnapshotNow } from "../api/platformEndpoints";
import toast from "react-hot-toast";

export default function PlatformDashboard() {
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        try {
            setLoading(true);
            const res = await getAnalyticsOverview();
            setOverview(res.data);
        } catch (err) {
            toast.error("Failed to load dashboard overview");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleComputeNow = async () => {
        setRefreshing(true);
        try {
            await computeSnapshotNow();
            toast.success("Daily metric snapshot computed successfully!");
            await loadData();
        } catch (err) {
            toast.error("Failed to recompute snapshot");
        } finally {
            setRefreshing(false);
        }
    };

    if (loading && !overview) {
        return <div className="py-20 text-center text-slate-500 text-xs">Loading business metrics...</div>;
    }

    const metrics = overview?.metrics || {};
    const revenue = metrics.revenue || {};
    const growth = metrics.growth || {};
    const mix = metrics.mix || {};
    const health = metrics.health || {};
    const definitions = overview?.definitions || {};

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-100">Executive Overview</h1>
                    <p className="text-xs text-slate-400">
                        Real-time revenue, subscription growth, and platform health
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleComputeNow}
                    disabled={refreshing}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
                >
                    <span>{refreshing ? "Computing..." : "🔄 Recompute Snapshot"}</span>
                </button>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* MRR */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">MRR</span>
                        <span className="text-xs text-slate-500 cursor-help" title={definitions.mrr}>ℹ️</span>
                    </div>
                    <div className="mt-2 text-2xl font-black text-indigo-400">
                        ${(revenue.mrr || 0).toLocaleString()}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Recurring subscribers only</p>
                </div>

                {/* ARR */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ARR</span>
                        <span className="text-xs text-slate-500 cursor-help" title={definitions.arr}>ℹ️</span>
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-100">
                        ${(revenue.arr || 0).toLocaleString()}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">MRR × 12 annualized</p>
                </div>

                {/* Lifetime Capital */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lifetime Revenue</span>
                        <span className="text-xs text-slate-500 cursor-help" title={definitions.lifetimeRevenueTotal}>ℹ️</span>
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-400">
                        ${(revenue.lifetimeRevenueTotal || 0).toLocaleString()}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">One-time capital collected</p>
                </div>

                {/* Net Revenue */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Net Revenue</span>
                        <span className="text-xs text-slate-500 cursor-help" title={definitions.netRevenue}>ℹ️</span>
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-100">
                        ${(revenue.netRevenue || 0).toLocaleString()}
                    </div>
                    <p className="mt-1 text-[11px] text-rose-400/80">
                        -${(revenue.refundsTotal || 0).toLocaleString()} refunds
                    </p>
                </div>
            </div>

            {/* Subscriber Mix & Health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tenant Mix */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Tenant Mix by Cycle</h3>
                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                            <span className="text-slate-400">Monthly Subscriptions</span>
                            <span className="font-bold text-slate-200">{mix.byCycle?.monthly || 0}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                            <span className="text-slate-400">Yearly Subscriptions</span>
                            <span className="font-bold text-slate-200">{mix.byCycle?.yearly || 0}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                            <span className="text-slate-400">Lifetime Deals</span>
                            <span className="font-bold text-emerald-400">{mix.byCycle?.lifetime || 0}</span>
                        </div>
                    </div>

                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-4">Tenants by Status</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <div className="text-[11px] text-slate-500">Active Gyms</div>
                            <div className="font-bold text-emerald-400 text-base">{growth.activeTenants || 0}</div>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <div className="text-[11px] text-slate-500">Free Trials</div>
                            <div className="font-bold text-indigo-400 text-base">{growth.trialTenants || 0}</div>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <div className="text-[11px] text-slate-500">Past Due</div>
                            <div className="font-bold text-amber-400 text-base">{growth.pastDueTenants || 0}</div>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <div className="text-[11px] text-slate-500">Suspended</div>
                            <div className="font-bold text-rose-400 text-base">{growth.suspendedTenants || 0}</div>
                        </div>
                    </div>
                </div>

                {/* Health & Upsell Indicators */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Customer Health & Retention</h3>
                    <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-indigo-300">Capacity Upsell Candidates</span>
                                <span className="font-black text-indigo-400 text-lg">{health.upsellCandidates || 0}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-indigo-400/80">Gyms at &ge; 80% member or staff capacity limit</p>
                        </div>

                        <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-rose-300">Inactive Churn Risks</span>
                                <span className="font-black text-rose-400 text-lg">{health.churnRisks || 0}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-rose-400/80">Gyms with no activity in 14+ days</p>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-900/50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-amber-300">Expiring Trials (Next 7 Days)</span>
                                <span className="font-black text-amber-400 text-lg">{health.expiringTrialsCount || 0}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-amber-400/80">Require sales follow-up or extension</p>
                        </div>
                    </div>
                </div>

                {/* Lifetime Seat Caps Progress */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Lifetime Seat Caps</h3>
                    <div className="space-y-3">
                        {(mix.lifetimeSeats || []).length === 0 ? (
                            <p className="text-xs text-slate-500">No capped promotional lifetime tiers active.</p>
                        ) : (
                            mix.lifetimeSeats.map((ls, idx) => {
                                const percent = ls.cap ? Math.min(100, Math.round((ls.sold / ls.cap) * 100)) : 100;
                                return (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-slate-200 uppercase">{ls.planKey} Tier</span>
                                            <span className="text-slate-400">
                                                {ls.sold} / {ls.cap ?? "∞"} seats ({percent}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                            <div
                                                className={`h-full transition-all ${
                                                    percent >= 90 ? "bg-rose-500" : percent >= 75 ? "bg-amber-500" : "bg-emerald-500"
                                                }`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="mt-6 p-3 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                        💡 <strong>How numbers are generated:</strong> Computed daily via pre-aggregated snapshots. Numbers are deterministic and verified against the ledger.
                    </div>
                </div>
            </div>
        </div>
    );
}
