import { useState } from "react";

export default function ConfirmActionModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    confirmColor = "bg-indigo-600 hover:bg-indigo-700",
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100">
                <h3 className="text-lg font-bold text-slate-100">{title}</h3>
                <p className="mt-2 text-sm text-slate-400">{message}</p>

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
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                        {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition ${confirmColor} disabled:opacity-50`}
                    >
                        {loading ? "Processing..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
