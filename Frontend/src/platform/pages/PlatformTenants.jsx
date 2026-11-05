import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    getTenants,
    onboardTenant,
    updateTenantLifecycle,
    purgeTenant,
} from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import ConfirmActionModal from "../components/ConfirmActionModal";
import SlugConfirmModal from "../components/SlugConfirmModal";
import { PlusIcon } from "../components/PlatformIcons";
import toast from "react-hot-toast";

export default function PlatformTenants() {
    const [searchParams] = useSearchParams();
    const initialStatus = searchParams.get("status") || "";

    const [tenants, setTenants] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    const [cycleFilter, setCycleFilter] = useState("");
    const [loading, setLoading] = useState(true);

    // Modal states
    const [isOnboardOpen, setIsOnboardOpen] = useState(false);
    const [lifecycleModal, setLifecycleModal] = useState({ isOpen: false, tenant: null, action: null });
    const [purgeModal, setPurgeModal] = useState({ isOpen: false, tenant: null });
    const [actionLoading, setActionLoading] = useState(false);

    // Onboarding form state
    const [onboardForm, setOnboardForm] = useState({
        name: "",
        slug: "",
        ownerName: "",
        ownerEmail: "",
        planKey: "basic",
        cycle: "monthly",
        trialDays: 14,
        isLifetime: false,
        amountPaid: 0,
    });

    const loadTenants = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: 20,
                search: search.trim() || undefined,
                status: statusFilter || undefined,
                cycle: cycleFilter || undefined,
            };
            const res = await getTenants(params);
            setTenants(res.data.tenants || []);
            setTotal(res.data.pagination?.total || 0);
        } catch {
            toast.error("Failed to load subscribers list");
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, cycleFilter]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadTenants();
        }, 200);
        return () => clearTimeout(timer);
    }, [loadTenants]);

    const handleOnboardSubmit = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const res = await onboardTenant(onboardForm);
            toast.success(`Gym '${res.data.tenant.name}' successfully onboarded!`);
            setIsOnboardOpen(false);
            setOnboardForm({
                name: "",
                slug: "",
                ownerName: "",
                ownerEmail: "",
                planKey: "basic",
                cycle: "monthly",
                trialDays: 14,
                isLifetime: false,
                amountPaid: 0,
            });
            loadTenants();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to onboard tenant");
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmLifecycle = async (reason) => {
        if (!lifecycleModal.tenant) return;
        setActionLoading(true);
        try {
            await updateTenantLifecycle(lifecycleModal.tenant.id, {
                action: lifecycleModal.action,
                reason,
                ...(lifecycleModal.action === "extend_trial" ? { days: 7 } : {}),
            });
            toast.success(`Action '${lifecycleModal.action}' applied to ${lifecycleModal.tenant.name}`);
            setLifecycleModal({ isOpen: false, tenant: null, action: null });
            loadTenants();
        } catch (err) {
            toast.error(err.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmPurge = async ({ slugConfirmation, reason }) => {
        if (!purgeModal.tenant) return;
        setActionLoading(true);
        try {
            await purgeTenant(purgeModal.tenant.id, { slugConfirmation, reason });
            toast.success(`Gym '${purgeModal.tenant.name}' purged forever.`);
            setPurgeModal({ isOpen: false, tenant: null });
            loadTenants();
        } catch (err) {
            toast.error(err.response?.data?.message || "Purge failed");
        } finally {
            setActionLoading(false);
        }
    };

    const columns = [
        {
            key: "name",
            header: "Gym (Tenant)",
            render: (t) => (
                <div>
                    <Link
                        to={`/platform/tenants/${t.id}`}
                        className="font-bold text-slate-100 hover:text-indigo-400 hover:underline"
                    >
                        {t.name}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-500">/{t.slug}</div>
                </div>
            ),
        },
        {
            key: "plan",
            header: "Plan & Cycle",
            render: (t) => (
                <div>
                    <span className="font-semibold text-slate-200 uppercase">{t.plan?.name || "Basic"}</span>
                    <div className="text-[11px] text-indigo-400 uppercase font-mono">{t.cycle}</div>
                </div>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (t) => {
                const styles = {
                    active: { bg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", dot: "bg-emerald-400" },
                    trial: { bg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20", dot: "bg-indigo-400" },
                    past_due: { bg: "bg-amber-500/10 text-amber-300 border-amber-500/20", dot: "bg-amber-400" },
                    suspended: { bg: "bg-rose-500/10 text-rose-300 border-rose-500/20", dot: "bg-rose-400" },
                    cancelled: { bg: "bg-slate-800 text-slate-400 border-slate-700", dot: "bg-slate-500" },
                };
                const s = styles[t.status] || styles.cancelled;
                return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${s.bg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {t.status.replace("_", " ")}
                    </span>
                );
            },
        },
        {
            key: "usage",
            header: "Capacity Usage",
            render: (t) => {
                const memPct = Math.min(100, Math.round(((t.usage?.members || 0) / (t.usage?.maxMembers || 500)) * 100));
                return (
                    <div className="text-[11px] space-y-1 min-w-[130px]">
                        <div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Members</span>
                                <span className="font-mono text-slate-200">{t.usage?.members || 0}/{t.usage?.maxMembers || 500}</span>
                            </div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-0.5">
                                <div className={`h-full rounded-full ${memPct >= 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${memPct}%` }} />
                            </div>
                        </div>
                        <div className="text-[10px] text-slate-400">
                            Staff: <span className="font-mono text-slate-300">{t.usage?.staff || 0}/{t.usage?.maxStaff || 10}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "mrrContribution",
            header: "MRR",
            render: (t) => (
                <span className="font-mono font-semibold text-slate-200">
                    {t.cycle === "lifetime" ? (
                        <span className="text-emerald-400 font-bold">LIFETIME</span>
                    ) : (
                        `$${t.mrrContribution || 0}/mo`
                    )}
                </span>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            render: (t) => (
                <div className="flex items-center gap-2">
                    <Link
                        to={`/platform/tenants/${t.id}`}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                    >
                        Details
                    </Link>

                    {t.status === "trial" && (
                        <button
                            type="button"
                            onClick={() => setLifecycleModal({ isOpen: true, tenant: t, action: "extend_trial" })}
                            className="rounded border border-indigo-500/30 bg-indigo-950/40 px-2 py-1 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-900/50"
                        >
                            +7d Trial
                        </button>
                    )}

                    {t.status === "active" && (
                        <button
                            type="button"
                            onClick={() => setLifecycleModal({ isOpen: true, tenant: t, action: "suspend" })}
                            className="rounded border border-rose-800/40 bg-rose-950/30 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/40"
                        >
                            Suspend
                        </button>
                    )}

                    {t.status === "suspended" && (
                        <button
                            type="button"
                            onClick={() => setLifecycleModal({ isOpen: true, tenant: t, action: "reactivate" })}
                            className="rounded border border-emerald-800/40 bg-emerald-950/30 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/40"
                        >
                            Reactivate
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setPurgeModal({ isOpen: true, tenant: t })}
                        className="rounded border border-rose-900/50 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-950"
                        title="Hard Purge (super_admin only)"
                    >
                        Purge
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-100">Subscribers & Gyms</h1>
                    <p className="text-xs text-slate-400">
                        Directory of all gym tenants, lifecycle states, and resource caps
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOnboardOpen(true)}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 hover:shadow-indigo-600/40 transition active:scale-[0.98]"
                >
                    <PlusIcon className="h-4 w-4" />
                    <span>Onboard New Gym</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3">
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="past_due">Past Due</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                </select>

                <select
                    value={cycleFilter}
                    onChange={(e) => setCycleFilter(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                    <option value="">All Cycles</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                </select>
            </div>

            {/* Table */}
            <PlatformDataTable
                columns={columns}
                data={tenants}
                total={total}
                page={page}
                limit={20}
                loading={loading}
                onPageChange={setPage}
                searchValue={search}
                onSearch={setSearch}
                searchPlaceholder="Search gyms by name or slug..."
            />

            {/* Modal: Onboard New Gym */}
            {isOnboardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-slate-100">Onboard New Subscriber Gym</h3>
                        <p className="mt-1 text-xs text-slate-400">
                            Creates tenant, initializes safe owner account, and generates secure password-set link.
                        </p>

                        <form onSubmit={handleOnboardSubmit} className="mt-4 space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Gym Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={onboardForm.name}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                                        placeholder="e.g. Cairo Crossfit"
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Subdomain Slug *</label>
                                    <input
                                        type="text"
                                        required
                                        value={onboardForm.slug}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, slug: e.target.value })}
                                        placeholder="e.g. cairo-crossfit"
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100 font-mono focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Owner Full Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={onboardForm.ownerName}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, ownerName: e.target.value })}
                                        placeholder="e.g. Captain Ahmed"
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Owner Email Address *</label>
                                    <input
                                        type="email"
                                        required
                                        value={onboardForm.ownerEmail}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, ownerEmail: e.target.value })}
                                        placeholder="owner@gym.com"
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Plan Tier</label>
                                    <select
                                        value={onboardForm.planKey}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, planKey: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200 focus:outline-none"
                                    >
                                        <option value="basic">Basic Plan</option>
                                        <option value="gold">Gold Plan</option>
                                        <option value="platinum">Platinum Plan</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Billing Cycle</label>
                                    <select
                                        value={onboardForm.cycle}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, cycle: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200 focus:outline-none"
                                    >
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                        <option value="lifetime">Lifetime Deal</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="isLifetimeCheckbox"
                                    checked={onboardForm.isLifetime}
                                    onChange={(e) => setOnboardForm({ ...onboardForm, isLifetime: e.target.checked })}
                                    className="rounded border-slate-700 bg-slate-950"
                                />
                                <label htmlFor="isLifetimeCheckbox" className="font-semibold text-slate-300">
                                    Lifetime Deal Grant (Skips trial, marks active immediately)
                                </label>
                            </div>

                            {onboardForm.isLifetime && (
                                <div>
                                    <label className="block font-semibold uppercase text-slate-300">Amount Paid ($)</label>
                                    <input
                                        type="number"
                                        value={onboardForm.amountPaid}
                                        onChange={(e) => setOnboardForm({ ...onboardForm, amountPaid: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:outline-none"
                                    />
                                </div>
                            )}

                            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsOnboardOpen(false)}
                                    className="rounded-lg px-4 py-2 font-medium text-slate-400 hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="rounded-lg bg-indigo-600 px-5 py-2 font-bold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    {actionLoading ? "Creating..." : "Create Tenant"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Lifecycle Action Confirmation Modal */}
            <ConfirmActionModal
                isOpen={lifecycleModal.isOpen}
                title={`Confirm Action: ${lifecycleModal.action?.replace("_", " ").toUpperCase()}`}
                message={`Are you sure you want to apply '${lifecycleModal.action}' to gym '${lifecycleModal.tenant?.name}'?`}
                confirmText="Apply Action"
                onConfirm={handleConfirmLifecycle}
                onClose={() => setLifecycleModal({ isOpen: false, tenant: null, action: null })}
                loading={actionLoading}
            />

            {/* Slug Confirmed Purge Modal */}
            <SlugConfirmModal
                isOpen={purgeModal.isOpen}
                title={`Purge Gym: ${purgeModal.tenant?.name}`}
                expectedSlug={purgeModal.tenant?.slug || ""}
                warningMessage="This will permanently delete all gym members, staff, contracts, packages, templates, uploaded files, and settings. This cannot be undone."
                onConfirm={handleConfirmPurge}
                onClose={() => setPurgeModal({ isOpen: false, tenant: null })}
                loading={actionLoading}
            />
        </div>
    );
}
