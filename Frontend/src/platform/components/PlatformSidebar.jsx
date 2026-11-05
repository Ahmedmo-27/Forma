import { Link, useLocation } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
    DashboardIcon,
    TenantsIcon,
    PlansIcon,
    PricingIcon,
    PaymentsIcon,
    LedgerIcon,
    UsageIcon,
    SupportIcon,
    AnnouncementsIcon,
    AuditIcon,
    UsersIcon,
    HealthIcon,
    XIcon,
} from "./PlatformIcons";

export default function PlatformSidebar({ isOpen, onClose }) {
    const location = useLocation();
    const { hasPermission } = usePlatformAuth();

    const navSections = [
        {
            title: "Overview",
            items: [
                { label: "Dashboard", path: "/platform/dashboard", icon: DashboardIcon, permission: "tenants.read" },
            ],
        },
        {
            title: "Operations",
            items: [
                { label: "Tenants (Gyms)", path: "/platform/tenants", icon: TenantsIcon, permission: "tenants.read" },
                { label: "Usage & Fair Use", path: "/platform/usage", icon: UsageIcon, permission: "tenants.read" },
                { label: "Support & Impersonate", path: "/platform/support", icon: SupportIcon, permission: "support.impersonate_read" },
            ],
        },
        {
            title: "Monetization & Plans",
            items: [
                { label: "Plans & Features", path: "/platform/plans-features", icon: PlansIcon, permission: "plans.manage" },
                { label: "Pricing & Coupons", path: "/platform/pricing-coupons", icon: PricingIcon, permission: "pricing.manage" },
                { label: "Payments & Invoices", path: "/platform/payments-invoices", icon: PaymentsIcon, permission: "billing.payments" },
                { label: "Financial Ledger", path: "/platform/ledger", icon: LedgerIcon, permission: "billing.ledger" },
            ],
        },
        {
            title: "Governance & Health",
            items: [
                { label: "Announcements", path: "/platform/announcements", icon: AnnouncementsIcon, permission: "announcements.manage" },
                { label: "Platform Audit Log", path: "/platform/audit", icon: AuditIcon, permission: "audit.view" },
                { label: "Platform Users", path: "/platform/users", icon: UsersIcon, permission: "platform_users.manage" },
                { label: "System Health & Config", path: "/platform/health", icon: HealthIcon, permission: "system.health" },
            ],
        },
    ];

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800/60 bg-slate-900/95 px-3 py-4 text-slate-300 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
                isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
            }`}
        >
            {/* Mobile Header with Close Button */}
            <div className="mb-2 flex items-center justify-between pb-2 border-b border-slate-800/60 lg:hidden">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Platform Navigation
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                    <XIcon className="h-5 w-5" />
                </button>
            </div>

            {/* Navigation Sections */}
            <nav className="flex-1 space-y-5 overflow-y-auto pr-1 py-1 custom-scrollbar">
                {navSections.map((section) => {
                    const accessible = section.items.filter(
                        (item) => !item.permission || hasPermission(item.permission)
                    );
                    if (accessible.length === 0) return null;

                    return (
                        <div key={section.title} className="space-y-1.5">
                            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                {section.title}
                            </div>
                            <div className="space-y-0.5">
                                {accessible.map((item) => {
                                    const Icon = item.icon;
                                    const isActive =
                                        location.pathname === item.path ||
                                        (item.path !== "/platform/dashboard" && location.pathname.startsWith(item.path));

                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            onClick={onClose}
                                            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150 ${
                                                isActive
                                                    ? "relative overflow-hidden bg-indigo-600/20 text-indigo-200 font-semibold border border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)] before:absolute before:left-0 before:inset-y-1 before:w-0.5 before:rounded-r before:bg-indigo-400"
                                                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100 hover:translate-x-0.5"
                                            }`}
                                        >
                                            <Icon
                                                className={`h-4 w-4 transition-colors ${
                                                    isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                                                }`}
                                            />
                                            <span>{item.label}</span>
                                            {isActive && (
                                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.9)] animate-pulse" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* Bottom Status Card */}
            <div className="mt-auto pt-4 border-t border-slate-800/70">
                <div className="rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-800/40 to-slate-900/60 p-3 text-[11px] shadow-inner">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 tracking-tight">Leap Engine</span>
                        <span className="font-mono text-[10px] rounded-md bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.5 text-indigo-300">v2.4 LTS</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-slate-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                        <span className="text-emerald-300/80">All Systems Healthy</span>
                    </div>
                    <div className="mt-1.5 text-[10px] text-slate-500">Security &amp; Ledger verified</div>
                </div>
            </div>
        </aside>
    );
}
