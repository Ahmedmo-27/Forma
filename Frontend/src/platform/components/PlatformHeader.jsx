import { usePlatformAuth } from "../context/PlatformAuthContext";
import { MenuIcon, XIcon, LogOutIcon, ShieldCheckIcon } from "./PlatformIcons";

export default function PlatformHeader({ sidebarOpen, onToggleSidebar }) {
    const { admin, logout } = usePlatformAuth();

    // Initials for avatar
    const initials = admin?.name
        ? admin.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
        : "SA";

    return (
        <header className="sticky top-0 z-30 flex h-[4.5rem] min-h-[4.5rem] items-center justify-between border-b border-slate-800/60 bg-slate-900/90 px-4 sm:px-6 backdrop-blur-2xl shadow-[0_1px_0_rgba(255,255,255,0.03),0_4px_16px_rgba(0,0,0,0.4)] text-slate-200">
            {/* Left: Mobile Toggle & Brand Identity */}
            <div className="flex items-center gap-3.5">
                {/* Mobile hamburger button */}
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition lg:hidden"
                    aria-label={sidebarOpen ? "Close sidebar menu" : "Open sidebar menu"}
                >
                    {sidebarOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
                </button>

                {/* Brand Logo & Title */}
                <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-500 to-indigo-400 font-black text-white text-sm shadow-lg shadow-indigo-500/30 border border-indigo-400/20 overflow-hidden">
                        <span className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/10 to-transparent" />
                        LP
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm tracking-tight text-white">
                                Leap Platform
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-300 border border-indigo-400/30 shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                                <ShieldCheckIcon className="w-3 h-3 text-indigo-300" />
                                Super Admin
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Engine Live • Tenant Subsystem</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Environment Info, Admin Profile & Sign Out */}
            <div className="flex items-center gap-3 sm:gap-4">
                {/* Global Status Pill (Desktop) */}
                <div className="hidden md:flex items-center gap-2 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 text-[11px] text-emerald-400/80 font-medium">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    <span>All Systems Operational</span>
                </div>

                {/* Admin Card */}
                {admin && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 hover:bg-slate-800/80 transition-colors duration-150">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-[11px] font-bold text-white ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/20">
                            {initials}
                        </div>
                        <div className="hidden sm:block text-left text-xs">
                            <div className="font-semibold text-slate-100 leading-tight">
                                {admin.name}
                            </div>
                            <div className="text-[10px] text-slate-400 leading-tight">
                                {admin.email}
                            </div>
                        </div>
                    </div>
                )}

                {/* Sign Out Button */}
                <button
                    type="button"
                    onClick={logout}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 transition-all duration-150 shadow-sm"
                    title="Sign Out of Platform Console"
                >
                    <LogOutIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                </button>
            </div>
        </header>
    );
}
