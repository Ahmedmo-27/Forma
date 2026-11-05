import { useState } from "react";

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-xl border border-rose-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 font-bold text-xl">
                        ⚠️
                    </span>
                    <div>
                        <h3 className="text-lg font-bold text-rose-300">{title}</h3>
                        <p className="text-xs text-rose-400 font-mono">DANGER: THIS ACTION IS PERMANENT & IRREVERSIBLE</p>
                    </div>
                </div>

                <div className="mt-4 rounded-lg bg-rose-950/40 border border-rose-900/60 p-3.5 text-xs text-rose-200 leading-relaxed">
                    {warningMessage}
                </div>

                <div className="mt-4 space-y-3">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-300">
                            Type <span className="font-mono text-amber-400 font-bold">{expectedSlug}</span> to confirm:
                        </label>
                        <input
                            type="text"
                            value={typedSlug}
                            onChange={(e) => {
                                setTypedSlug(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder={expectedSlug}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 font-mono focus:border-rose-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-300">
                            Mandatory Purge Reason <span className="text-rose-400">*</span>:
                        </label>
                        <textarea
                            rows={2}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            placeholder="Reason for complete tenant purge (e.g. GDPR request, legal compliance)..."
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                        />
                    </div>

                    {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loading || !isMatch || !reason.trim()}
                        className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-40 transition"
                    >
                        {loading ? "Purging..." : "Purge Tenant Forever"}
                    </button>
                </div>
            </div>
        </div>
    );
}
