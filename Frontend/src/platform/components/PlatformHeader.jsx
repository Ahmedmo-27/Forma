import { usePlatformAuth } from "../context/PlatformAuthContext";
import { MenuIcon, XIcon, LogOutIcon, ShieldCheckIcon } from "./PlatformIcons";

export default function PlatformHeader({ sidebarOpen, onToggleSidebar }) {
    const { admin, logout } = usePlatformAuth();

    // Initials for avatar
    const initials = admin?.name
        ? admin.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
        : "SA";

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 sm:px-6 backdrop-blur-xl text-slate-200">
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
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-400 font-black text-white text-sm shadow-lg shadow-indigo-500/25 border border-indigo-400/30">
                        LP
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tracking-tight text-slate-100">
                                Leap Platform
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400 border border-indigo-500/20">
                                <ShieldCheckIcon className="w-3 h-3 text-indigo-400" />
                                Super Admin
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Engine Live • Tenant Subsystem</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Environment Info, Admin Profile & Sign Out */}
            <div className="flex items-center gap-3 sm:gap-4">
                {/* Global Status Pill (Desktop) */}
                <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    <span>All Systems Operational</span>
                </div>

                {/* Admin Card */}
                {admin && (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-inner">
                            {initials}
                        </div>
                        <div className="hidden sm:block text-left text-xs">
                            <div className="font-semibold text-slate-200 leading-tight flex items-center gap-1.5">
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
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/30 transition shadow-sm"
                    title="Sign Out of Platform Console"
                >
                    <LogOutIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                </button>
            </div>
        </header>
    );
}
