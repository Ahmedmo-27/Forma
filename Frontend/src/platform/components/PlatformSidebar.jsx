import { Link, useLocation } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";

export default function PlatformSidebar() {
    const location = useLocation();
    const { hasPermission } = usePlatformAuth();

    const navItems = [
        { label: "Dashboard", path: "/platform", icon: "📊", permission: "tenants.read" },
        { label: "Tenants (Gyms)", path: "/platform/tenants", icon: "🏢", permission: "tenants.read" },
        { label: "Plans & Features", path: "/platform/plans", icon: "📦", permission: "plans.manage" },
        { label: "Pricing & Coupons", path: "/platform/pricing", icon: "🏷️", permission: "pricing.manage" },
        { label: "Payments & Invoices", path: "/platform/payments", icon: "💳", permission: "billing.payments" },
        { label: "Financial Ledger", path: "/platform/ledger", icon: "📜", permission: "billing.ledger" },
        { label: "Usage & Fair Use", path: "/platform/usage", icon: "⚡", permission: "tenants.read" },
        { label: "Support & Impersonate", path: "/platform/support", icon: "🎧", permission: "support.impersonate_read" },
        { label: "Announcements", path: "/platform/announcements", icon: "📢", permission: "announcements.manage" },
        { label: "Platform Audit Log", path: "/platform/audit", icon: "🛡️", permission: "audit.view" },
        { label: "Platform Users", path: "/platform/users", icon: "👥", permission: "platform_users.manage" },
        { label: "System Health & Config", path: "/platform/system", icon: "⚙️", permission: "system.health" },
    ];

    const accessibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

    return (
        <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/60 p-4 text-slate-300 min-h-[calc(100vh-3.5rem)]">
            <div className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Platform Management
            </div>
            <nav className="space-y-1">
                {accessibleItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== "/platform" && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                isActive
                                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold"
                                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                            }`}
                        >
                            <span className="text-sm">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
