import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { platformLogin } from "../api/platformEndpoints";
import toast from "react-hot-toast";

export default function PlatformLogin() {
    const navigate = useNavigate();
    const { loginSuccess } = usePlatformAuth();

    const [email,    setEmail]    = useState("");
    const [password, setPassword] = useState("");
    const [loading,  setLoading]  = useState(false);
    const [showPwd,  setShowPwd]  = useState(false);

    const handleSubmit = async (e) => {
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
        <div style={{
            minHeight: "100svh", background: "#020617",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px", position: "relative", overflow: "hidden",
            fontFamily: "'Inter',ui-sans-serif,system-ui,sans-serif",
        }}>
            {/* Ambient glows */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
                <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,70,229,0.16) 0%,transparent 65%)", top: -200, left: -150 }} />
                <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(16,185,129,0.06) 0%,transparent 65%)", bottom: -150, right: -150 }} />
                <div style={{ position: "absolute", width: 700, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse,rgba(79,70,229,0.08) 0%,transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(148,163,184,0.03) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
            </div>

            {/* Card */}
            <div style={{
                position: "relative", zIndex: 1,
                width: "100%", maxWidth: 460,
                background: "rgba(15,23,42,0.85)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20,
                boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,70,229,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
                padding: "44px 40px",
            }}>

                {/* Brand */}
                <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <div style={{
                        display: "inline-flex", padding: "6px 20px",
                        background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                        borderRadius: 10, marginBottom: 18,
                        boxShadow: "0 4px 20px rgba(79,70,229,0.45)",
                        border: "1px solid rgba(99,102,241,0.4)",
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "2px", textTransform: "uppercase" }}>PLATFORM</span>
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.3px", marginBottom: 6 }}>
                        Platform Console
                    </h1>
                    <p style={{ fontSize: 13, color: "rgba(100,116,139,0.8)" }}>
                        Restricted — SaaS operators & business team only
                    </p>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)", marginBottom: 28 }} />

                {/* Form */}
                <form onSubmit={handleSubmit} noValidate>
                    {/* Email */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(100,116,139,0.8)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>
                            Platform Email
                        </label>
                        <div style={{ position: "relative" }}>
                            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(100,116,139,0.5)", pointerEvents: "none" }}
                                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                            </svg>
                            <input
                                type="email" required value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="operator@domain.com"
                                style={{
                                    width: "100%", padding: "11px 14px 11px 38px", fontSize: 14,
                                    border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: 10,
                                    outline: "none", color: "#f1f5f9",
                                    background: "rgba(255,255,255,0.03)",
                                    boxSizing: "border-box", fontFamily: "inherit",
                                    transition: "border-color 0.15s, box-shadow 0.15s",
                                }}
                                onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"; }}
                                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.07)"; e.target.style.boxShadow = "none"; }}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 28 }}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(100,116,139,0.8)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>
                            Password
                        </label>
                        <div style={{ position: "relative" }}>
                            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(100,116,139,0.5)", pointerEvents: "none" }}
                                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            <input
                                type={showPwd ? "text" : "password"} required value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••••••"
                                style={{
                                    width: "100%", padding: "11px 44px 11px 38px", fontSize: 14,
                                    border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: 10,
                                    outline: "none", color: "#f1f5f9",
                                    background: "rgba(255,255,255,0.03)",
                                    boxSizing: "border-box", fontFamily: "inherit",
                                    transition: "border-color 0.15s, box-shadow 0.15s",
                                }}
                                onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"; }}
                                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.07)"; e.target.style.boxShadow = "none"; }}
                            />
                            <button type="button" onClick={() => setShowPwd(s => !s)} aria-label={showPwd ? "Hide password" : "Show password"}
                                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(100,116,139,0.5)", display: "flex", alignItems: "center", transition: "color 0.12s", padding: 2 }}
                                onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
                                onMouseLeave={e => e.currentTarget.style.color = "rgba(100,116,139,0.5)"}
                            >
                                {showPwd
                                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                }
                            </button>
                        </div>
                    </div>

                    {/* Submit */}
                    <button type="submit" disabled={loading} style={{
                        width: "100%", padding: "13px", fontSize: 14, fontWeight: 700,
                        background: loading ? "rgba(79,70,229,0.45)" : "linear-gradient(135deg,#4f46e5,#6366f1)",
                        color: "#fff", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 10,
                        cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
                        boxShadow: loading ? "none" : "0 4px 20px rgba(79,70,229,0.40)",
                        transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.2px",
                    }}
                        onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(79,70,229,0.55)"; } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 20px rgba(79,70,229,0.40)"; }}
                    >
                        {loading ? (
                            <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} /> Signing In…</>
                        ) : (
                            <>Sign In <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(100,116,139,0.5)" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 5px rgba(16,185,129,0.7)" }} />
                        Leap Engine • Secure Platform Access
                    </div>
                </div>
            </div>
        </div>
    );
}
