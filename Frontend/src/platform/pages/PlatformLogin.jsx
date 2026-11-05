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
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
                {/* Header */}
                <div className="text-center">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 font-black text-white text-lg shadow-lg shadow-indigo-600/30">
                        LP
                    </span>
                    <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-100">
                        Platform Console Sign In
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                        Restricted security domain for SaaS operators & business team
                    </p>
                </div>

                {/* Email & Password */}
                <form onSubmit={handleCredentialsSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Platform Email
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="operator@leapgym.com"
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {loading ? "Signing In..." : "Sign In"}
                    </button>
                </form>
            </div>
        </div>
    );
}
