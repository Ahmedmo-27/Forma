import { useState } from "react";
import { AlertTriangleIcon, XIcon } from "./PlatformIcons";

export default function ConfirmActionModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    confirmColor = "bg-indigo-600 hover:bg-indigo-500",
    requiresReason = true,
    onConfirm,
    onClose,
    loading = false,
}) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (requiresReason && !reason.trim()) {
            setError("A specific reason is mandatory for this operation.");
            return;
        }
        setError("");
        onConfirm(reason.trim());
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl text-slate-100 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <AlertTriangleIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-100 tracking-tight">{title}</h3>
                            <p className="text-xs text-slate-400">Governance & Audit Action</p>
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

                <p className="mt-4 text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                    {message}
                </p>

                {requiresReason && (
                    <div className="mt-4">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Reason for this action <span className="text-rose-400">*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder="Provide audit reason (e.g. customer request, payment cleared, GDPR)..."
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-2.5">
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
                        disabled={loading}
                        className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-50 ${confirmColor}`}
                    >
                        {loading ? "Processing..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
