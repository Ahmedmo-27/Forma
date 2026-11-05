import { useState, useEffect } from "react";
import {
    getPrices,
    togglePriceSales,
    getCoupons,
    createCoupon,
    deleteCoupon,
} from "../api/platformEndpoints";
import toast from "react-hot-toast";

export default function PlatformPricingCoupons() {
    const [prices, setPrices] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isCreateCouponOpen, setIsCreateCouponOpen] = useState(false);
    const [couponForm, setCouponForm] = useState({
        code: "",
        type: "percentage",
        discountValue: 20,
        currency: "USD",
        maxRedemptions: 100,
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [pRes, cRes] = await Promise.all([getPrices(), getCoupons()]);
            setPrices(pRes.data || []);
            setCoupons(cRes.data || []);
        } catch (err) {
            toast.error("Failed to load pricing and promotions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggleSales = async (id) => {
        try {
            const res = await togglePriceSales(id);
            toast.success(res.data.message);
            loadData();
        } catch (err) {
            toast.error("Failed to toggle sales status");
        }
    };

    const handleCreateCoupon = async (e) => {
        e.preventDefault();
        try {
            await createCoupon(couponForm);
            toast.success(`Coupon '${couponForm.code}' created!`);
            setIsCreateCouponOpen(false);
            setCouponForm({ code: "", type: "percentage", discountValue: 20, currency: "USD", maxRedemptions: 100 });
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to create coupon");
        }
    };

    const handleDeleteCoupon = async (id) => {
        try {
            await deleteCoupon(id);
            toast.success("Coupon deleted");
            loadData();
        } catch (err) {
            toast.error("Failed to delete coupon");
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-100">Pricing & Promotions</h1>
                <p className="text-xs text-slate-400">
                    Cycle-specific rates, lifetime seat caps, and promotional coupons
                </p>
            </div>

            {/* Pricing Tiers Table */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Active Pricing Tiers</h2>
                <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-800 bg-slate-950/60 uppercase font-semibold text-slate-400">
                            <tr>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3">Cycle</th>
                                <th className="px-4 py-3">Price Amount</th>
                                <th className="px-4 py-3">Seat Cap (Lifetime)</th>
                                <th className="px-4 py-3">Sales Status</th>
                                <th className="px-4 py-3 text-right">Toggle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {prices.map((p) => (
                                <tr key={p._id} className="hover:bg-slate-800/40 transition">
                                    <td className="px-4 py-3 font-bold text-slate-200 uppercase">
                                        {p.planId?.name || p.planKey || "—"}
                                    </td>
                                    <td className="px-4 py-3 uppercase font-mono text-indigo-400">{p.cycle}</td>
                                    <td className="px-4 py-3 font-mono font-bold text-slate-100 text-sm">
                                        ${p.amount} {p.currency}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                        {p.cycle === "lifetime" ? (
                                            <span>
                                                {p.soldLifetimeSeats || 0} / {p.maxLifetimeSeats ?? "Unlimited"} seats
                                            </span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                            p.isActive
                                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                        }`}>
                                            {p.isActive ? "OPEN" : "CLOSED"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSales(p._id)}
                                            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 font-semibold text-slate-300 hover:bg-slate-800"
                                        >
                                            {p.isActive ? "Close Sales" : "Open Sales"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Coupons & Promotions */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Promotions & Coupons</h2>
                    <button
                        type="button"
                        onClick={() => setIsCreateCouponOpen(true)}
                        className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                        + Create Coupon
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {coupons.length === 0 ? (
                        <p className="text-xs text-slate-500 col-span-3">No active promotional coupons found.</p>
                    ) : (
                        coupons.map((c) => (
                            <div key={c._id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
                                <div className="flex justify-between items-start">
                                    <span className="font-mono text-base font-black text-amber-400">{c.code}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteCoupon(c._id)}
                                        className="text-slate-500 hover:text-rose-400"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="text-slate-300 font-semibold">
                                    {c.type === "percentage" ? `${c.discountValue}% OFF` : `$${c.discountValue} OFF`}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                    Redemptions: {c.redeemedCount} / {c.maxRedemptions ?? "Unlimited"}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Create Coupon Modal */}
            {isCreateCouponOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
                        <h3 className="text-base font-bold text-slate-100">Create Promotion Code</h3>
                        <form onSubmit={handleCreateCoupon} className="mt-4 space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold uppercase text-slate-300">Promo Code</label>
                                <input
                                    type="text"
                                    required
                                    value={couponForm.code}
                                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                                    placeholder="e.g. LAUNCH50"
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-slate-100 uppercase"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Type</label>
                                    <select
                                        value={couponForm.type}
                                        onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value })}
                                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-200"
                                    >
                                        <option value="percentage">Percentage (%)</option>
                                        <option value="fixed">Fixed ($)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Value</label>
                                    <input
                                        type="number"
                                        required
                                        value={couponForm.discountValue}
                                        onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-100"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold uppercase text-slate-300">Max Redemptions Cap</label>
                                <input
                                    type="number"
                                    value={couponForm.maxRedemptions}
                                    onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: e.target.value })}
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-100"
                                />
                            </div>

                            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateCouponOpen(false)}
                                    className="rounded px-3 py-1.5 text-slate-400 hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded bg-indigo-600 px-4 py-1.5 font-bold text-white hover:bg-indigo-500"
                                >
                                    Create Code
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
