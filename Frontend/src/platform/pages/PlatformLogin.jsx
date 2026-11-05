import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { platformLogin } from "../api/platformEndpoints";
import toast from "react-hot-toast";

export default function PlatformLogin() {
    const navigate = useNavigate();
    const { loginSuccess } = usePlatformAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await platformLogin({ email, password });
            loginSuccess(res.data);
            toast.success("Welcome to Platform Console");
            navigate("/platform");
        } catch (err) {
            toast.error(err.response?.data?.message || "Invalid credentials");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white overflow-hidden">
            {/* Ambient background glows */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl" />
            </div>
            {/* Dot pattern */}
            <div className="pointer-events-none absolute inset-0" style={{backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.04) 1px, transparent 1px)', backgroundSize: '28px 28px'}} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-2xl p-8 shadow-2xl shadow-black/60 ring-1 ring-white/[0.04]">
                {/* Header */}
                <div className="text-center">
                    <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-500 to-indigo-400 font-black text-white text-xl shadow-xl shadow-indigo-600/40 border border-indigo-400/20">
                        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/15 to-transparent" />
                        <span className="relative z-10">LP</span>
                    </span>
                    <h2 className="mt-4 text-xl font-extrabold tracking-tight text-slate-100">
                        Platform Console Sign In
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-500">
                        Restricted security domain for SaaS operators & business team
                    </p>
                </div>

                {/* Email & Password */}
                <form onSubmit={handleCredentialsSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
                            Platform Email
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="operator@leapgym.com"
                            className="mt-1.5 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all backdrop-blur-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="mt-1.5 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all backdrop-blur-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 hover:shadow-indigo-500/40 transition-all duration-150 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {loading ? "Signing In..." : "Sign In"}
                    </button>
                </form>
            </div>
        </div>
    );
}
