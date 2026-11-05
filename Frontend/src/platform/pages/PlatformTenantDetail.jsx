import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
    getTenantDetail,
    updateTenantLifecycle,
    addTenantNote,
    deleteTenantNote,
    updateTenantTags,
    purgeTenant,
    createImpersonationSession,
} from "../api/platformEndpoints";
import ConfirmActionModal from "../components/ConfirmActionModal";
import SlugConfirmModal from "../components/SlugConfirmModal";
import toast from "react-hot-toast";

export default function PlatformTenantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newNote, setNewNote] = useState("");
    const [isNotePinned, setIsNotePinned] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Lifecycle modal
    const [lifecycleModal, setLifecycleModal] = useState({ isOpen: false, action: null });
    const [purgeModal, setPurgeModal] = useState(false);

    const loadDetail = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTenantDetail(id);
            setDetail(res.data);
        } catch (err) {
            toast.error("Failed to load tenant details");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;
        try {
            await addTenantNote(id, { text: newNote.trim(), pinned: isNotePinned });
            setNewNote("");
            setIsNotePinned(false);
            toast.success("Note added");
            loadDetail();
        } catch (err) {
            toast.error("Failed to add note");
        }
    };

    const handleDeleteNote = async (noteId) => {
        try {
            await deleteTenantNote(id, noteId);
            toast.success("Note removed");
            loadDetail();
        } catch (err) {
            toast.error("Failed to delete note");
        }
    };

    const handleLifecycleAction = async (reason) => {
        setActionLoading(true);
        try {
            await updateTenantLifecycle(id, {
                action: lifecycleModal.action,
                reason,
            });
            toast.success(`Action '${lifecycleModal.action}' applied successfully`);
            setLifecycleModal({ isOpen: false, action: null });
            loadDetail();
        } catch (err) {
            toast.error(err.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(false);
        }
    };

    const handleImpersonate = async () => {
        try {
            const res = await createImpersonationSession({
                tenantId: id,
                mode: "read_only",
                reason: "Direct console support view",
            });
            // Store token for tenant app view and open in new tab
            localStorage.setItem("token", res.data.token);
            toast.success("Read-only support session generated. Opening gym portal...");
            window.open(`/members`, "_blank");
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to initiate impersonation");
        }
    };

    const handlePurge = async ({ slugConfirmation, reason }) => {
        setActionLoading(true);
        try {
            await purgeTenant(id, { slugConfirmation, reason });
            toast.success("Tenant purged forever.");
            navigate("/platform/tenants");
        } catch (err) {
            toast.error(err.response?.data?.message || "Purge failed");
        } finally {
            setActionLoading(false);
        }
    };

    if (loading && !detail) {
        return <div className="py-20 text-center text-slate-500 text-xs">Loading gym details...</div>;
    }

    if (!detail?.tenant) {
        return <div className="py-20 text-center text-slate-400 text-xs">Gym not found.</div>;
    }

    const { tenant, usage, notes = [], recentAudit = [], recentLedger = [] } = detail;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Link to="/platform/tenants" className="text-xs text-indigo-400 hover:underline">
                            ← Back to Gyms
                        </Link>
                        <span className="text-slate-600">/</span>
                        <span className="font-mono text-xs text-slate-400">{tenant.slug}</span>
                    </div>
                    <h1 className="mt-1 text-2xl font-black text-slate-100">{tenant.name}</h1>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleImpersonate}
                        className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-3.5 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-600/30 transition shadow"
                    >
                        👁️ Impersonate (Read-Only)
                    </button>

                    {tenant.status === "active" ? (
                        <button
                            type="button"
                            onClick={() => setLifecycleModal({ isOpen: true, action: "suspend" })}
                            className="rounded-lg bg-rose-950/40 border border-rose-800/40 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
                        >
                            Suspend Gym
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setLifecycleModal({ isOpen: true, action: "reactivate" })}
                            className="rounded-lg bg-emerald-950/40 border border-emerald-800/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40"
                        >
                            Reactivate Gym
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setPurgeModal(true)}
                        className="rounded-lg border border-rose-900/60 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950"
                    >
                        Purge
                    </button>
                </div>
            </div>

            {/* Top Cards: Plan, Owner, Usage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Plan & Cycle */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow space-y-2 text-xs">
                    <span className="font-bold uppercase tracking-wider text-slate-400">Subscription Tier</span>
                    <div className="text-xl font-bold text-slate-100 uppercase">{tenant.plan?.name || "Basic"}</div>
                    <div className="font-mono text-indigo-400 uppercase font-semibold">
                        Cycle: {tenant.billing?.cycle || "monthly"}
                    </div>
                    {tenant.billing?.cycle === "lifetime" && (
                        <div className="rounded bg-emerald-950/40 border border-emerald-800/50 p-2 text-emerald-300 text-[11px]">
                            Lifetime Entitlement: <strong>{tenant.billing.lifetime?.entitlementPolicy || "follow_tier"}</strong>
                        </div>
                    )}
                </div>

                {/* Owner Info */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow space-y-2 text-xs">
                    <span className="font-bold uppercase tracking-wider text-slate-400">Owner User</span>
                    <div className="text-base font-bold text-slate-100">{tenant.owner?.name || "No Owner Assigned"}</div>
                    <div className="text-slate-300">{tenant.owner?.email || "—"}</div>
                    <div className="text-[11px] text-slate-500 font-mono">ID: {tenant.owner?._id || "—"}</div>
                </div>

                {/* Resource Caps */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow space-y-2 text-xs">
                    <span className="font-bold uppercase tracking-wider text-slate-400">Resource Consumption</span>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Active Members:</span>
                        <strong className="text-slate-200">{usage.members} / {tenant.effectiveLimits?.maxMembers || 500}</strong>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Staff Accounts:</span>
                        <strong className="text-slate-200">{usage.staff} / {tenant.effectiveLimits?.maxStaff || 10}</strong>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Disk Storage:</span>
                        <strong className="text-slate-200">{Math.round((usage.storageBytes || 0) / (1024 * 1024))} MB</strong>
                    </div>
                </div>
            </div>

            {/* Internal Notes & Feature Overrides */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Internal Notes */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow space-y-4 text-xs">
                    <h3 className="font-bold uppercase tracking-wider text-slate-300">Internal Platform Notes</h3>

                    <form onSubmit={handleAddNote} className="space-y-2">
                        <textarea
                            rows={2}
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add internal note for team (e.g. VIP client, promised custom invoice)..."
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none"
                        />
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isNotePinned}
                                    onChange={(e) => setIsNotePinned(e.target.checked)}
                                    className="rounded border-slate-700 bg-slate-950"
                                />
                                <span>Pin Note</span>
                            </label>
                            <button
                                type="submit"
                                className="rounded bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500"
                            >
                                Add Note
                            </button>
                        </div>
                    </form>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {notes.length === 0 ? (
                            <p className="text-slate-500">No notes recorded yet.</p>
                        ) : (
                            notes.map((n) => (
                                <div
                                    key={n._id}
                                    className={`rounded-lg p-3 border ${
                                        n.pinned
                                            ? "border-amber-500/40 bg-amber-950/20"
                                            : "border-slate-800 bg-slate-950/60"
                                    }`}
                                >
                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                        <span>
                                            {n.pinned && "📌 "}
                                            <strong>{n.authorName}</strong> ({new Date(n.createdAt).toLocaleDateString()})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteNote(n._id)}
                                            className="text-slate-500 hover:text-rose-400"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <p className="mt-1 text-slate-200 text-xs leading-relaxed">{n.text}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Effective Features & Overrides */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow space-y-4 text-xs">
                    <h3 className="font-bold uppercase tracking-wider text-slate-300">Effective Feature Gates</h3>
                    <div className="flex flex-wrap gap-1.5">
                        {(tenant.effectiveFeatures || []).map((f) => (
                            <span
                                key={f}
                                className="rounded bg-slate-800 border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-200"
                            >
                                ✓ {f}
                            </span>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                        <div className="text-slate-400 font-semibold uppercase text-[11px]">Feature Overrides</div>
                        <div className="text-[11px] text-slate-500">
                            Additions: {tenant.featureOverrides?.add?.length ? tenant.featureOverrides.add.join(", ") : "None"}<br />
                            Removals: {tenant.featureOverrides?.remove?.length ? tenant.featureOverrides.remove.join(", ") : "None"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmActionModal
                isOpen={lifecycleModal.isOpen}
                title={`Confirm ${lifecycleModal.action?.toUpperCase()}`}
                message={`Are you sure you want to ${lifecycleModal.action} gym '${tenant.name}'?`}
                confirmText="Apply"
                onConfirm={handleLifecycleAction}
                onClose={() => setLifecycleModal({ isOpen: false, action: null })}
                loading={actionLoading}
            />

            <SlugConfirmModal
                isOpen={purgeModal}
                title={`Purge ${tenant.name}`}
                expectedSlug={tenant.slug}
                warningMessage="Permanent purge across all collections and disk storage. Cannot be recovered."
                onConfirm={handlePurge}
                onClose={() => setPurgeModal(false)}
                loading={actionLoading}
            />
        </div>
    );
}
