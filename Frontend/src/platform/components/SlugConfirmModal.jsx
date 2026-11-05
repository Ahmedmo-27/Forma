import { useState } from "react";
import { AlertTriangleIcon, XIcon } from "./PlatformIcons";

export default function SlugConfirmModal({
    isOpen,
    title,
    expectedSlug,
    warningMessage,
    onConfirm,
    onClose,
    loading = false,
}) {
    const [typedSlug, setTypedSlug] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const isMatch = typedSlug.trim().toLowerCase() === expectedSlug.toLowerCase();

    const handleConfirm = () => {
        if (!isMatch) {
            setError(`Typed slug does not match '${expectedSlug}'.`);
            return;
        }
        if (!reason.trim()) {
            setError("Mandatory reason required for tenant purge.");
            return;
        }
        setError("");
        onConfirm({ slugConfirmation: typedSlug.trim(), reason: reason.trim() });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl border border-rose-900/60 bg-slate-900/95 p-6 shadow-2xl text-slate-100 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <AlertTriangleIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-rose-300 tracking-tight">{title}</h3>
                            <p className="text-[11px] font-mono uppercase tracking-wider text-rose-400">
                                Permanent Destructive Operation
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                        <XIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-4 rounded-xl bg-rose-950/40 border border-rose-900/50 p-4 text-xs text-rose-200/90 leading-relaxed">
                    {warningMessage}
                </div>

                <div className="mt-4 space-y-3.5">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-300">
                            Type <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{expectedSlug}</span> to confirm:
                        </label>
                        <input
                            type="text"
                            value={typedSlug}
                            onChange={(e) => {
                                setTypedSlug(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder={expectedSlug}
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-300">
                            Purge Audit Reason <span className="text-rose-400">*</span>
                        </label>
                        <textarea
                            rows={2}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder="State reason (e.g., test tenant deletion, customer GDPR erasure request)..."
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                        />
                    </div>

                    {error && <p className="text-xs text-rose-400">{error}</p>}
                </div>

                <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-800 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg border border-slate-700/60 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!isMatch || loading}
                        className="rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? "Purging Permanently..." : "Purge Tenant Forever"}
                    </button>
                </div>
            </div>
        </div>
    );
}
