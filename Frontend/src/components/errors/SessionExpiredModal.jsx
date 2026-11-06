import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { apiOrigin } from "../../api/axios";

export function SessionExpiredModal({ isOpen, onClose, onLoginSuccess }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  let email = "";
  try {
    const raw = localStorage.getItem("ff_user") || localStorage.getItem("leap_platform_user");
    if (raw) email = JSON.parse(raw)?.email || "";
  } catch (_) {}

  const isPlatform = window.location.pathname.startsWith("/platform");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.trim()) {
      setErrorMsg("Account email not found in session. Please log in again.");
      return;
    }
    if (!password) {
      setErrorMsg("Password is required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      if (isPlatform) {
        const res = await axios.post(`${apiOrigin}/api/platform/auth/login`, {
          email,
          password,
        });
        localStorage.setItem("leap_platform_token", res.data.token);
        if (res.data.refreshToken) {
          localStorage.setItem("leap_platform_refresh_token", res.data.refreshToken);
        }
      } else {
        const tenantSlug = localStorage.getItem("ff_tenant_slug");
        const res = await axios.post(`${apiOrigin}/api/users/login`, {
          email,
          password,
          gymSlug: tenantSlug,
        });
        localStorage.setItem("ff_token", res.data.token);
        localStorage.setItem("ff_user", JSON.stringify(res.data));
      }

      onClose();
      onLoginSuccess?.();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        "Invalid password. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFullLogout = () => {
    localStorage.clear();
    window.location.href = isPlatform ? "/platform/login" : "/";
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 text-left outline-none animate-in zoom-in-95"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
          <Lock className="w-5 h-5" />
        </div>

        <h2 id="session-expired-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          Session Expired
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
          Enter your password for <strong className="text-zinc-800 dark:text-zinc-200">{email || "your account"}</strong> to continue without losing your in-progress work.
        </p>

        {errorMsg && (
          <div className="p-2.5 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleFullLogout}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
            >
              Switch Account
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
            >
              {loading ? "Verifying..." : "Resume Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
