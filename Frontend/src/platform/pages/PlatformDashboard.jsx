import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAnalyticsOverview, computeSnapshotNow } from "../api/platformEndpoints";
import {
    RefreshIcon,
    DollarSignIcon,
    TrendUpIcon,
    ShieldCheckIcon,
    SparklesIcon,
    InfoIcon,
    ChevronRightIcon,
} from "../components/PlatformIcons";
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
        } catch {
            toast.error("Failed to load dashboard overview");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                setLoading(true);
                const res = await getAnalyticsOverview();
                if (active) setOverview(res.data);
            } catch {
                if (active) toast.error("Failed to load dashboard overview");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const handleComputeNow = async () => {
        setRefreshing(true);
        try {
            await computeSnapshotNow();
            toast.success("Daily metric snapshot computed successfully!");
            await loadData();
        } catch {
            toast.error("Failed to recompute snapshot");
        } finally {
            setRefreshing(false);
        }
    };

    if (loading && !overview) {
        return (
            <div className="flex flex-col items-center justify-center py-28 text-slate-400">
                <div className="relative inline-flex items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500/20 border-t-indigo-500" />
                    <div className="absolute h-5 w-5 rounded-full bg-indigo-500/20 blur-sm" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Aggregating Enterprise Business Metrics...
                </p>
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
        (mix.byCycle?.monthly || 0) + (mix.byCycle?.yearly || 0) + (mix.byCycle?.lifetime || 0) || 1;

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/50">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
                            Executive Overview
                        </h1>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.12)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live Ledger Synced
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Consolidated subscription revenue, gym capacity telemetry, and platform operational health.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleComputeNow}
                        disabled={refreshing}
                        className="group inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-indigo-500/40 hover:text-indigo-200 transition-all duration-150 shadow-sm disabled:opacity-50"
                    >
                        <RefreshIcon
                            className={`h-4 w-4 text-indigo-400 transition-transform ${
                                refreshing ? "animate-spin" : "group-hover:rotate-180"
                            }`}
                        />
                        <span>{refreshing ? "Computing Daily Rollup..." : "Recompute Snapshot"}</span>
                    </button>
                </div>
            </div>

            {/* Metric KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* MRR Card */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl backdrop-blur-md group hover:border-indigo-500/50 transition duration-200">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-indigo-600 opacity-80" />
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Monthly Recurring (MRR)
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <DollarSignIcon className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-black text-indigo-200 tracking-tight drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]">
                            ${(revenue.mrr || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-800/50 text-[11px]">
                        <span className="text-slate-400">Recurring subscribers</span>
                        <span className="text-slate-400 cursor-help" title={definitions.mrr}>
                            <InfoIcon className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
                        </span>
                    </div>
                </div>

                {/* ARR Card */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl backdrop-blur-md group hover:border-blue-500/40 transition duration-200">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-60" />
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Annual Run Rate (ARR)
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <TrendUpIcon className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-black text-slate-100 tracking-tight">
                            ${(revenue.arr || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-800/50 text-[11px]">
                        <span className="text-slate-400">MRR × 12 annualized</span>
                        <span className="text-slate-400 cursor-help" title={definitions.arr}>
                            <InfoIcon className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
                        </span>
                    </div>
                </div>

                {/* Lifetime Capital Card */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl backdrop-blur-md group hover:border-emerald-500/40 transition duration-200">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-80" />
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Lifetime Capital
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <SparklesIcon className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-black text-emerald-400 tracking-tight">
                            ${(revenue.lifetimeRevenueTotal || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-800/50 text-[11px]">
                        <span className="text-slate-400">One-time capital collected</span>
                        <span className="text-slate-400 cursor-help" title={definitions.lifetimeRevenueTotal}>
                            <InfoIcon className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
                        </span>
                    </div>
                </div>

                {/* Net Revenue Card */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl backdrop-blur-md group hover:border-violet-500/40 transition duration-200">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-60" />
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Net Settled Revenue
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            <ShieldCheckIcon className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-black text-slate-100 tracking-tight">
                            ${(revenue.netRevenue || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-800/50 text-[11px]">
                        <span className="text-rose-400 font-medium">
                            -${(revenue.refundsTotal || 0).toLocaleString()} refunds
                        </span>
                        <span className="text-slate-400 cursor-help" title={definitions.netRevenue}>
                            <InfoIcon className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
                        </span>
                    </div>
                </div>
            </div>

            {/* Subscriber Mix & Health Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tenant Mix by Cycle & Status */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md ring-1 ring-white/[0.02] space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 letter-spacing-widest">
                            Subscriber Distribution
                        </h2>
                        <Link
                            to="/platform/tenants"
                            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                        >
                            <span>View All Gyms</span>
                            <ChevronRightIcon className="h-3 w-3" />
                        </Link>
                    </div>

                    {/* Cycle Progress Breakdown */}
                    <div className="space-y-3">
                        {/* Monthly */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Monthly Recurring</span>
                                <span className="font-mono font-bold text-slate-200">
                                    {mix.byCycle?.monthly || 0}{" "}
                                    <span className="text-[10px] text-slate-400">
                                        ({Math.round(((mix.byCycle?.monthly || 0) / totalSubscribers) * 100)}%)
                                    </span>
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.round(((mix.byCycle?.monthly || 0) / totalSubscribers) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Yearly */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Annual Contracts</span>
                                <span className="font-mono font-bold text-slate-200">
                                    {mix.byCycle?.yearly || 0}{" "}
                                    <span className="text-[10px] text-slate-400">
                                        ({Math.round(((mix.byCycle?.yearly || 0) / totalSubscribers) * 100)}%)
                                    </span>
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.round(((mix.byCycle?.yearly || 0) / totalSubscribers) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Lifetime */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Lifetime Pass Deals</span>
                                <span className="font-mono font-bold text-emerald-400">
                                    {mix.byCycle?.lifetime || 0}{" "}
                                    <span className="text-[10px] text-slate-400">
                                        ({Math.round(((mix.byCycle?.lifetime || 0) / totalSubscribers) * 100)}%)
                                    </span>
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.round(((mix.byCycle?.lifetime || 0) / totalSubscribers) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Status Matrix */}
                    <div className="pt-2 border-t border-slate-800/80">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                            Gyms By Operational Lifecycle
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <Link
                                to="/platform/tenants?status=active"
                                className="group p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 backdrop-blur-sm hover:border-emerald-500/40 transition"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                    <span>Active Gyms</span>
                                </div>
                                <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
                                    {growth.activeTenants || 0}
                                </div>
                            </Link>

                            <Link
                                to="/platform/tenants?status=trial"
                                className="group p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 backdrop-blur-sm hover:border-indigo-500/40 transition"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                                    <span>Free Trials</span>
                                </div>
                                <div className="mt-1 font-mono text-xl font-bold text-indigo-400">
                                    {growth.trialTenants || 0}
                                </div>
                            </Link>

                            <Link
                                to="/platform/tenants?status=past_due"
                                className="group p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 backdrop-blur-sm hover:border-amber-500/40 transition"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    <span>Past Due</span>
                                </div>
                                <div className="mt-1 font-mono text-xl font-bold text-amber-400">
                                    {growth.pastDueTenants || 0}
                                </div>
                            </Link>

                            <Link
                                to="/platform/tenants?status=suspended"
                                className="group p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 backdrop-blur-sm hover:border-rose-500/40 transition"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                                    <span>Suspended</span>
                                </div>
                                <div className="mt-1 font-mono text-xl font-bold text-rose-400">
                                    {growth.suspendedTenants || 0}
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Customer Health & Retention Actions */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md ring-1 ring-white/[0.02] space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 letter-spacing-widest">
                            Health & Proactive Actions
                        </h2>
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] text-indigo-400 border border-indigo-500/20">
                            AI Telemetry
                        </span>
                    </div>

                    <div className="space-y-3">
                        {/* Capacity Upsell */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900/80 border border-indigo-500/30">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-xs text-indigo-200">
                                    Capacity Upsell Candidates
                                </span>
                                <span className="font-mono font-black text-indigo-400 text-xl font-black">
                                    {health.upsellCandidates || 0}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-indigo-300/80">
                                Gyms at &ge; 80% member or staff capacity limit ready for plan upgrade.
                            </p>
                        </div>

                        {/* Inactive Churn Risks */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-rose-950/30 to-slate-900/80 border border-rose-500/30">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-xs text-rose-200">
                                    Inactive Churn Risks
                                </span>
                                <span className="font-mono font-black text-rose-400 text-xl font-black">
                                    {health.churnRisks || 0}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-rose-300/80">
                                Gyms with zero check-ins or staff logins over the past 14 days.
                            </p>
                        </div>

                        {/* Expiring Trials */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/30 to-slate-900/80 border border-amber-500/30">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-xs text-amber-200">
                                    Expiring Trials (7 Days)
                                </span>
                                <span className="font-mono font-black text-amber-400 text-xl font-black">
                                    {health.expiringTrialsCount || 0}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-amber-300/80">
                                Approaching trial expiration requiring account executive outreach.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Promotional Lifetime Seat Caps */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md ring-1 ring-white/[0.02] space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 letter-spacing-widest">
                            Lifetime Seat Quotas
                        </h2>
                        <span className="font-mono text-[10px] text-slate-400">Hard Cap Rules</span>
                    </div>

                    <div className="space-y-3.5">
                        {(mix.lifetimeSeats || []).length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">
                                No capped promotional lifetime tiers currently active.
                            </div>
                        ) : (
                            mix.lifetimeSeats.map((ls, idx) => {
                                const percent = ls.cap ? Math.min(100, Math.round((ls.sold / ls.cap) * 100)) : 100;
                                const barColor =
                                    percent >= 90
                                        ? "bg-rose-500"
                                        : percent >= 75
                                        ? "bg-amber-500"
                                        : "bg-emerald-500";

                                return (
                                    <div key={idx} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-slate-200 uppercase tracking-wide">
                                                {ls.planKey} Tier
                                            </span>
                                            <span className="font-mono text-slate-400 text-[11px]">
                                                {ls.sold} / {ls.cap ?? "∞"} seats ({percent}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                            <div
                                                className={`h-full transition-all duration-500 rounded-full ${barColor}`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Audit verified notice */}
                    <div className="mt-6 p-3 rounded-xl bg-slate-950/60 border border-slate-700/50 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2.5">
                        <ShieldCheckIcon className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                            <strong className="text-slate-300">Deterministic Ledger Sync:</strong> Computed automatically via immutable platform audit logs and pre-aggregated ledger snapshots.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
