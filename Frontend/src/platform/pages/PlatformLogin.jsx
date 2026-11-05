import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
    platformLogin,
    platformMfaSetup,
    platformMfaVerify,
    platformMfaChallenge,
} from "../api/platformEndpoints";
import toast from "react-hot-toast";

export default function PlatformLogin() {
    const navigate = useNavigate();
    const { loginSuccess } = usePlatformAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [step, setStep] = useState("credentials"); // "credentials" | "mfa_challenge" | "mfa_setup"
    const [tempToken, setTempToken] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [isRecoveryCode, setIsRecoveryCode] = useState(false);
    const [setupData, setSetupData] = useState(null);
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await platformLogin({ email, password });
            setTempToken(res.data.tempToken);

            if (res.data.mfaSetupRequired) {
                // Must enroll in MFA first
                const setupRes = await platformMfaSetup({ tempToken: res.data.tempToken });
                setSetupData(setupRes.data);
                setStep("mfa_setup");
                toast.success("Credentials verified. Please complete MFA enrollment.");
            } else if (res.data.mfaRequired) {
                setStep("mfa_challenge");
                toast.success("Please enter your 6-digit authenticator code.");
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Invalid credentials");
        } finally {
            setLoading(false);
        }
    };

    const handleMfaVerifyEnrollment = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await platformMfaVerify({ tempToken, code: totpCode });
            setRecoveryCodes(res.data.recoveryCodes || []);
            loginSuccess(res.data);
            toast.success("MFA successfully enabled!");
            setStep("mfa_codes_display");
        } catch (err) {
            toast.error(err.response?.data?.message || "Verification code failed");
        } finally {
            setLoading(false);
        }
    };

    const handleMfaChallengeSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await platformMfaChallenge({
                tempToken,
                code: totpCode,
                isRecoveryCode,
            });
            loginSuccess(res.data);
            toast.success("Welcome to Platform Console");
            navigate("/platform");
        } catch (err) {
            toast.error(err.response?.data?.message || "Invalid authentication code");
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

                {/* Step 1: Email & Password */}
                {step === "credentials" && (
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
                            className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                            {loading ? "Verifying..." : "Continue to MFA"}
                        </button>
                    </form>
                )}

                {/* Step 2: MFA Challenge */}
                {step === "mfa_challenge" && (
                    <form onSubmit={handleMfaChallengeSubmit} className="mt-6 space-y-4">
                        <div className="rounded-lg bg-indigo-950/40 border border-indigo-900/50 p-3 text-xs text-indigo-300">
                            Enter the code from your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password)
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                {isRecoveryCode ? "Backup Recovery Code" : "6-Digit Authenticator Code"}
                            </label>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                placeholder={isRecoveryCode ? "XXXX-XXXX" : "000000"}
                                maxLength={isRecoveryCode ? 12 : 6}
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-indigo-400 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                            />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsRecoveryCode(!isRecoveryCode);
                                    setTotpCode("");
                                }}
                                className="text-indigo-400 hover:text-indigo-300 underline"
                            >
                                {isRecoveryCode ? "Use Authenticator App Instead" : "Use Backup Recovery Code"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep("credentials")}
                                className="text-slate-500 hover:text-slate-300"
                            >
                                Back
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                            {loading ? "Authenticating..." : "Verify & Sign In"}
                        </button>
                    </form>
                )}

                {/* Step 3: MFA Setup / Enrollment */}
                {step === "mfa_setup" && setupData && (
                    <form onSubmit={handleMfaVerifyEnrollment} className="mt-6 space-y-4">
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 text-center">
                            <p className="text-xs text-slate-300 font-semibold mb-2">
                                Add this secret key to your Authenticator App:
                            </p>
                            <code className="block rounded bg-slate-900 border border-slate-800 p-2 font-mono text-sm text-amber-400 select-all">
                                {setupData.secret}
                            </code>
                            <p className="mt-2 text-[11px] text-slate-500">
                                Alternatively open this URI on your device:
                            </p>
                            <a
                                href={setupData.otpAuthUrl}
                                className="text-[11px] text-indigo-400 hover:underline break-all"
                            >
                                Open in Authenticator App
                            </a>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                Enter 6-digit code shown in app to confirm setup:
                            </label>
                            <input
                                type="text"
                                required
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                placeholder="000000"
                                maxLength={6}
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-indigo-400 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || totpCode.length !== 6}
                            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                            {loading ? "Verifying..." : "Confirm & Save MFA"}
                        </button>
                    </form>
                )}

                {/* Step 4: Display Newly Generated Recovery Codes */}
                {step === "mfa_codes_display" && (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-lg bg-emerald-950/40 border border-emerald-800 p-4">
                            <h4 className="font-bold text-emerald-300 text-sm">Save Your Recovery Codes</h4>
                            <p className="mt-1 text-xs text-emerald-400/90 leading-relaxed">
                                Store these single-use codes safely. If you lose access to your authenticator app, each code can be used once to recover access.
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-slate-200">
                                {recoveryCodes.map((c, i) => (
                                    <div key={i} className="rounded bg-slate-900 border border-slate-800 p-1.5 text-center">
                                        {c}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate("/platform")}
                            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
                        >
                            I Have Saved My Codes → Proceed to Console
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
