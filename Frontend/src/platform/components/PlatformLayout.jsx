import { useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
    DashboardIcon, TenantsIcon, PlansIcon, PricingIcon,
    PaymentsIcon, LedgerIcon, UsageIcon, SupportIcon,
    AnnouncementsIcon, AuditIcon, UsersIcon, HealthIcon,
    MenuIcon, XIcon, LogOutIcon, ShieldCheckIcon,
} from "./PlatformIcons";

const NAV_ITEMS = [
    { label: "Dashboard",         path: "/platform/dashboard",         icon: DashboardIcon,     permission: "tenants.read" },
    { label: "Tenants",           path: "/platform/tenants",           icon: TenantsIcon,       permission: "tenants.read" },
    { label: "Usage",             path: "/platform/usage",             icon: UsageIcon,         permission: "tenants.read" },
    { label: "Support",           path: "/platform/support",           icon: SupportIcon,       permission: "support.impersonate_read" },
    { label: "Plans",             path: "/platform/plans-features",    icon: PlansIcon,         permission: "plans.manage" },
    { label: "Pricing",           path: "/platform/pricing-coupons",   icon: PricingIcon,       permission: "pricing.manage" },
    { label: "Payments",          path: "/platform/payments-invoices", icon: PaymentsIcon,      permission: "billing.payments" },
    { label: "Ledger",            path: "/platform/ledger",            icon: LedgerIcon,        permission: "billing.ledger" },
    { label: "Announcements",     path: "/platform/announcements",     icon: AnnouncementsIcon, permission: "announcements.manage" },
    { label: "Audit",             path: "/platform/audit",             icon: AuditIcon,         permission: "audit.view" },
    { label: "Users",             path: "/platform/users",             icon: UsersIcon,         permission: "platform_users.manage" },
    { label: "Health",            path: "/platform/health",            icon: HealthIcon,        permission: "system.health" },
];

function ini(name = "") {
    return name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "SA";
}

function TabItem({ item }) {
    return (
        <NavLink to={item.path} style={{ textDecoration: "none", flexShrink: 0 }}>
            {({ isActive }) => (
                <span
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 16px", borderRadius: 7,
                        fontSize: 12, fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#fff" : "rgba(148,163,184,0.70)",
                        background: isActive ? "linear-gradient(135deg,#4f46e5,#6366f1)" : "rgba(0,0,0,0.20)",
                        border: `1px solid ${isActive ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
                        cursor: "pointer",
                        transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
                        whiteSpace: "nowrap",
                        boxShadow: isActive ? "0 2px 10px rgba(79,70,229,0.40),inset 0 1px 0 rgba(255,255,255,0.10)" : "none",
                    }}
                    onMouseEnter={e => {
                        if (!isActive) {
                            e.currentTarget.style.color = "#fff";
                            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
                        }
                    }}
                    onMouseLeave={e => {
                        if (!isActive) {
                            e.currentTarget.style.color = "rgba(148,163,184,0.70)";
                            e.currentTarget.style.background = "rgba(0,0,0,0.20)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        }
                    }}
                >
                    {item.label}
                </span>
            )}
        </NavLink>
    );
}

export default function PlatformLayout() {
    const { token, loading, admin, logout, hasPermission } = usePlatformAuth();
    const [mob, setMob] = useState(false);
    const [drop, setDrop] = useState(false);

    const TOP_BG  = "#0e1117";
    const TAB_BG  = "#080b10";

    const visibleItems = NAV_ITEMS.filter(item => !item.permission || hasPermission(item.permission));

    if (loading) {
        return (
            <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#020617", flexDirection: "column", gap: 16 }}>
                <div style={{ width: 40, height: 40, border: "2px solid rgba(99,102,241,0.2)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#475569" }}>Verifying Platform Access…</p>
            </div>
        );
    }

    if (!token) return <Navigate to="/platform/login" replace />;

    return (
        <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: "#020617", color: "#f1f5f9", fontFamily: "'Inter',ui-sans-serif,system-ui,sans-serif" }}>

            {/* Ambient glows */}
            <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
                <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,70,229,0.12) 0%,transparent 65%)", top: -150, left: -100 }} />
                <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(16,185,129,0.06) 0%,transparent 65%)", bottom: -100, right: -100 }} />
                <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(148,163,184,0.03) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
            </div>

            {/* ── ROW 1: sticky top bar ──────────────────────────── */}
            <div style={{ position: "sticky", top: 0, zIndex: 50, background: TOP_BG, borderBottom: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, height: 62, padding: "0 20px" }}>

                    {/* Brand */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginRight: 8 }}>
                        <div style={{
                            padding: "4px 12px", borderRadius: 8,
                            background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                            fontSize: 12, fontWeight: 900, color: "#fff",
                            letterSpacing: "1.5px", textTransform: "uppercase",
                            boxShadow: "0 2px 10px rgba(79,70,229,0.40)",
                            border: "1px solid rgba(99,102,241,0.4)",
                        }}>
                            PLATFORM
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "rgba(148,163,184,0.5)", display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.8)", display: "inline-block" }} />
                                Admin Console
                            </span>
                        </div>
                    </div>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Right actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>

                        {/* Status pill */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.20)", fontSize: 11, color: "rgba(52,211,153,0.85)", fontWeight: 500 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.8)" }} />
                            All Systems Operational
                        </div>

                        {/* Profile dropdown */}
                        <div style={{ position: "relative" }}>
                            <button
                                onClick={() => setDrop(p => !p)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                                    borderRadius: 8, padding: "5px 12px 5px 6px",
                                    cursor: "pointer", transition: "background 0.12s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.10)"}
                                onMouseLeave={e => { if (!drop) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                            >
                                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0, boxShadow: "0 0 8px rgba(99,102,241,0.4)" }}>
                                    {ini(admin?.name)}
                                </div>
                                <div style={{ textAlign: "left", lineHeight: 1.25 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{admin?.name || "Admin"}</div>
                                    <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)" }}>{admin?.email || "platform"}</div>
                                </div>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: "rgba(255,255,255,0.35)", transition: "transform 0.15s", transform: drop ? "rotate(180deg)" : "none" }}>
                                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>

                            {drop && (
                                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: 180, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 100 }}>
                                    <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 4 }}>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{admin?.name}</p>
                                        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>Super Admin</p>
                                    </div>
                                    <button onClick={logout} style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                                        padding: "8px 12px", borderRadius: 6, border: "none",
                                        background: "transparent", cursor: "pointer",
                                        fontSize: 13, fontWeight: 600, color: "#f87171", fontFamily: "inherit",
                                        transition: "background 0.12s",
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.10)"}
                                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                    >
                                        <LogOutIcon className="w-3.5 h-3.5" style={{ width: 14, height: 14 }} />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Mobile burger */}
                        <button onClick={() => setMob(true)} style={{ display: "none", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, width: 40, height: 40, cursor: "pointer", alignItems: "center", justifyContent: "center" }} id="plat-mob-btn" aria-label="Menu">
                            <MenuIcon className="h-5 w-5 text-slate-300" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── ROW 2: tab nav (scrolls away) ─────────────────── */}
            <div id="plat-tab-nav" style={{
                background: TAB_BG,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                padding: "0 20px 0 20px",
                height: 46, display: "flex", alignItems: "center",
                gap: 5, overflowX: "auto", scrollbarWidth: "none",
                boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
                position: "relative", zIndex: 40,
            }}>
                {visibleItems.map(item => <TabItem key={item.path} item={item} />)}
            </div>

            {/* ── MOBILE DRAWER ─────────────────────────────────── */}
            {mob && <div onClick={() => setMob(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />}
            <div style={{
                position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 100,
                background: "#0e1117", borderRight: "1px solid rgba(255,255,255,0.06)",
                transform: mob ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.24s cubic-bezier(.4,0,.2,1)",
                display: "flex", flexDirection: "column",
                boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "1px", textTransform: "uppercase" }}>Platform Admin</span>
                    <button onClick={() => setMob(false)} aria-label="Close navigation" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "rgba(148,163,184,0.7)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
                    {visibleItems.map(item => (
                        <NavLink key={item.path} to={item.path} onClick={() => setMob(false)} style={{ textDecoration: "none", display: "block" }}>
                            {({ isActive }) => (
                                <div style={{ padding: "9px 12px", borderRadius: 6, margin: "2px 0", background: isActive ? "rgba(79,70,229,0.25)" : "transparent", border: `1px solid ${isActive ? "rgba(99,102,241,0.35)" : "transparent"}`, color: isActive ? "#fff" : "rgba(148,163,184,0.65)", fontSize: 13, fontWeight: isActive ? 600 : 400, transition: "all 0.12s" }}>
                                    {item.label}
                                </div>
                            )}
                        </NavLink>
                    ))}
                </nav>
                <div style={{ padding: "12px 14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{ini(admin?.name)}</div>
                        <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{admin?.name}</p>
                            <p style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>Super Admin</p>
                        </div>
                    </div>
                    <button onClick={logout} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
                        <LogOutIcon style={{ width: 13, height: 13 }} /> Sign Out
                    </button>
                </div>
            </div>

            {/* ── MAIN CONTENT ──────────────────────────────────── */}
            <main style={{ flex: 1, position: "relative", zIndex: 10, padding: "24px 28px 48px" }}>
                <Outlet />
            </main>

            <style>{`
                #plat-tab-nav::-webkit-scrollbar { display: none; }
                #plat-mob-btn { display: none !important; }
                @media (max-width: 1024px) {
                    #plat-tab-nav { display: none !important; }
                    #plat-mob-btn { display: flex !important; }
                }
            `}</style>
        </div>
    );
}
