import { useState, useEffect } from "react";
import {
    getPlans,
    getFeatures,
    createPlan,
    archivePlan,
    getPlanImpactPreview,
    createFeature,
} from "../api/platformEndpoints";
import ConfirmActionModal from "../components/ConfirmActionModal";
import toast from "react-hot-toast";

export default function PlatformPlansFeatures() {
    const [plans, setPlans] = useState([]);
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
    const [isCreateFeatureOpen, setIsCreateFeatureOpen] = useState(false);
    const [archiveModal, setArchiveModal] = useState({ isOpen: false, plan: null });
    const [impactModal, setImpactModal] = useState({ isOpen: false, data: null });
    const [actionLoading, setActionLoading] = useState(false);

    const [planForm, setPlanForm] = useState({
        key: "",
        name: "",
        priceMonthly: 500,
        priceYearly: 5000,
        currency: "USD",
        features: [],
        limits: { maxMembers: 500, maxStaff: 10, maxBranches: 1 },
        description: "",
    });

    const [featureForm, setFeatureForm] = useState({
        key: "",
        name: "",
        category: "core",
        description: "",
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [plansRes, featRes] = await Promise.all([getPlans(), getFeatures()]);
            setPlans(plansRes.data || []);
            setFeatures(featRes.data || []);
        } catch (err) {
            toast.error("Failed to load plans and features");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCreatePlan = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await createPlan(planForm);
            toast.success(`Plan '${planForm.name}' created`);
            setIsCreatePlanOpen(false);
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to create plan");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateFeature = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await createFeature(featureForm);
            toast.success(`Feature '${featureForm.name}' added to catalog`);
            setIsCreateFeatureOpen(false);
            setFeatureForm({ key: "", name: "", category: "core", description: "" });
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to create feature");
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmArchive = async (reason) => {
        if (!archiveModal.plan) return;
        setActionLoading(true);
        try {
            await archivePlan(archiveModal.plan._id, { reason });
            toast.success(`Plan '${archiveModal.plan.name}' archived.`);
            setArchiveModal({ isOpen: false, plan: null });
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to archive plan");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCheckImpact = async (plan) => {
        try {
            const res = await getPlanImpactPreview(plan._id, { targetFeatures: plan.features });
            setImpactModal({ isOpen: true, data: res.data });
        } catch (err) {
            toast.error("Failed to load impact preview");
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-100">Plans & Feature Catalog</h1>
                    <p className="text-xs text-slate-400">
                        Manage subscription tiers, feature flags, and subscriber impact previews
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsCreateFeatureOpen(true)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    >
                        + Add Feature
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCreatePlanOpen(true)}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
                    >
                        + Create Plan
                    </button>
                </div>
            </div>

            {/* Plans List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => (
                    <div
                        key={p._id}
                        className={`rounded-2xl border p-6 shadow-xl flex flex-col justify-between ${
                            p.visibility === "archived"
                                ? "border-slate-800 bg-slate-950/60 opacity-60"
                                : "border-slate-800 bg-slate-900"
                        }`}
                    >
                        <div className="space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-black text-slate-100 uppercase">{p.name}</h3>
                                    <div className="font-mono text-xs text-indigo-400">key: {p.key}</div>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    p.visibility === "archived"
                                        ? "bg-slate-800 text-slate-400 border border-slate-700"
                                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                }`}>
                                    {p.visibility}
                                </span>
                            </div>

                            <div className="text-2xl font-black text-slate-100">
                                ${p.priceMonthly} <span className="text-xs font-normal text-slate-400">/mo</span>
                            </div>

                            <p className="text-xs text-slate-400">{p.description || "Standard platform tier."}</p>

                            <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                                <div className="font-semibold text-slate-300">Caps & Limits:</div>
                                <div className="text-slate-400 text-[11px]">
                                    Max Members: {p.limits?.maxMembers || 500}<br />
                                    Max Staff: {p.limits?.maxStaff || 10}<br />
                                    Max Branches: {p.limits?.maxBranches || 1}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-800/80 space-y-1">
                                <div className="font-semibold text-slate-300 text-xs">Features Included:</div>
                                <div className="flex flex-wrap gap-1">
                                    {(p.features || []).map((f) => (
                                        <span key={f} className="rounded bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-slate-800">
                                            {f}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs">
                            <button
                                type="button"
                                onClick={() => handleCheckImpact(p)}
                                className="text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                                🔍 Impact Preview
                            </button>

                            {p.visibility !== "archived" && (
                                <button
                                    type="button"
                                    onClick={() => setArchiveModal({ isOpen: true, plan: p })}
                                    className="text-rose-400 hover:text-rose-300"
                                >
                                    Archive Plan
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Impact Preview Modal */}
            {impactModal.isOpen && impactModal.data && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-4">
                        <h3 className="text-base font-bold text-slate-100">
                            Subscriber Impact Preview: {impactModal.data.plan?.name}
                        </h3>
                        <p className="text-xs text-slate-400">
                            Shows how current gym subscribers are affected based on their entitlement policy.
                        </p>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between p-2.5 rounded bg-slate-950 border border-slate-800">
                                <span className="text-slate-400">Total Gyms Subscribed:</span>
                                <strong className="text-slate-100">{impactModal.data.totalSubscribers}</strong>
                            </div>
                            <div className="flex justify-between p-2.5 rounded bg-indigo-950/30 border border-indigo-900/40">
                                <span className="text-indigo-300">Recurring Subscribers Affected:</span>
                                <strong className="text-indigo-400">{impactModal.data.impact?.recurringSubscribersAffected}</strong>
                            </div>
                            <div className="flex justify-between p-2.5 rounded bg-indigo-950/30 border border-indigo-900/40">
                                <span className="text-indigo-300">Lifetime Deals (Follow Tier) Affected:</span>
                                <strong className="text-indigo-400">{impactModal.data.impact?.lifetimeFollowTierAffected}</strong>
                            </div>
                            <div className="flex justify-between p-2.5 rounded bg-emerald-950/30 border border-emerald-900/40">
                                <span className="text-emerald-300">Lifetime Deals (Snapshot) Protected:</span>
                                <strong className="text-emerald-400">{impactModal.data.impact?.lifetimeSnapshotProtected}</strong>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setImpactModal({ isOpen: false, data: null })}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Confirmation Modal */}
            <ConfirmActionModal
                isOpen={archiveModal.isOpen}
                title={`Archive Plan: ${archiveModal.plan?.name}`}
                message="Archiving this plan prevents new subscriptions. Existing subscribers will continue uninterrupted."
                confirmText="Archive Plan"
                confirmColor="bg-amber-600 hover:bg-amber-700"
                onConfirm={handleConfirmArchive}
                onClose={() => setArchiveModal({ isOpen: false, plan: null })}
                loading={actionLoading}
            />
        </div>
    );
}
