import { usePlatformAuth } from "../context/PlatformAuthContext";

export default function PlatformHeader() {
    const { admin, logout } = usePlatformAuth();

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 backdrop-blur-md text-slate-200">
            <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-black text-white text-xs shadow-md shadow-indigo-500/20">
                    LP
                </span>
                <span className="font-bold text-sm tracking-wide text-slate-100">
                    Leap Platform <span className="text-indigo-400 font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">Console</span>
                </span>
            </div>

            <div className="flex items-center gap-4 text-xs">
                {admin && (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="font-semibold text-slate-100">{admin.name}</div>
                            <div className="text-[11px] text-slate-400">{admin.email}</div>
                        </div>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300 border border-indigo-500/30">
                            {admin.role?.replace("_", " ")}
                        </span>
                    </div>
                )}

                <button
                    type="button"
                    onClick={logout}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 transition"
                >
                    Sign Out
                </button>
            </div>
        </header>
    );
}
