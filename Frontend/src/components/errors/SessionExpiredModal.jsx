import { useMemo, useState } from "react";
import { Clock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import axios from "axios";
import { apiOrigin } from "../../api/axios";
import { useI18n } from "../../i18n/useI18n";
import { emitSessionResume } from "../../lib/sessionResume";

function readStoredUser() {
  try {
    const raw = localStorage.getItem("ff_user") || localStorage.getItem("leap_platform_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function copyForCode(code, t) {
  if (code === "AUTH_SESSION_REVOKED") {
    return {
      title: t("Signed out for security"),
      detail: t("This session was ended from another device, or your password was changed. Sign in again to continue."),
    };
  }
  if (code === "AUTH_WRONG_AUDIENCE") {
    return {
      title: t("Wrong portal for this account"),
      detail: t("This account belongs to a different Forma portal. Sign in from the correct login page."),
    };
  }
  // AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID, and any other auth session codes
  return {
    title: t("Your session has ended"),
    detail: t("For your security, Forma signed you out after a period of inactivity or when your login expired."),
  };
}

export function SessionExpiredModal({ isOpen, onClose, onLoginSuccess, error }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const storedUser = useMemo(() => (isOpen ? readStoredUser() : null), [isOpen]);
  const email = storedUser?.email || "";
  const username = storedUser?.username || "";
  const displayName = storedUser?.name || username || email || t("your account");
  const accountHint = username || email;

  const isPlatform = typeof window !== "undefined" && window.location.pathname.startsWith("/platform");
  const { title, detail } = copyForCode(error?.code, t);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email && !username) {
      setErrorMsg(t("Account details were not found in this browser. Please open the sign-in page."));
      return;
    }
    if (!password) {
      setErrorMsg(t("Password is required."));
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      if (isPlatform) {
        const res = await axios.post(
          `${apiOrigin}/api/platform/auth/login`,
          { email, password },
          { withCredentials: true }
        );
        const platformUser = res.data?.user;
        if (!platformUser) {
          setErrorMsg(t("Invalid password. Please check your credentials."));
          return;
        }
        localStorage.setItem("leap_platform_user", JSON.stringify(platformUser));
        localStorage.removeItem("leap_platform_token");
        localStorage.removeItem("leap_platform_refresh_token");
        const { adoptPlatformAuthTokens } = await import("../../lib/sessionBearer");
        const { suppressAuthErrorModals } = await import("../../lib/authErrorGate");
        suppressAuthErrorModals(5000);
        adoptPlatformAuthTokens(res.data || {});
        // Providers mount outside this modal — push session into React state.
        emitSessionResume({ surface: "platform", user: platformUser, tokens: res.data || {} });
      } else {
        const tenantSlug = localStorage.getItem("ff_tenant_slug");
        const res = await axios.post(
          `${apiOrigin}/api/users/login`,
          {
            username: username || email,
            ...(email ? { email } : {}),
            password,
            gymSlug: tenantSlug,
          },
          { withCredentials: true }
        );

        let sessionPayload = res.data;
        if (sessionPayload?.requiresTenantSelection) {
          const memberships = sessionPayload.memberships || [];
          const preferred =
            memberships.find((m) => m.slug && m.slug === tenantSlug)
            || memberships[0];
          if (!preferred?.tenantId || !sessionPayload.selectionToken) {
            setErrorMsg(t("Choose a gym from the sign-in page, then try again."));
            return;
          }
          const selected = await axios.post(
            `${apiOrigin}/api/users/select-tenant`,
            {
              selectionToken: sessionPayload.selectionToken,
              tenantId: preferred.tenantId,
            },
            { withCredentials: true }
          );
          sessionPayload = selected.data;
        }

        const user = sessionPayload?.user || sessionPayload;
        if (!user || typeof user !== "object" || !user.role) {
          setErrorMsg(t("Invalid password. Please check your credentials."));
          return;
        }
        localStorage.setItem("ff_user", JSON.stringify(user));
        localStorage.removeItem("ff_token");
        if (user.tenantSlug) {
          localStorage.setItem("ff_tenant_slug", user.tenantSlug);
        }
        const { adoptTenantAuthTokens } = await import("../../lib/sessionBearer");
        const { suppressAuthErrorModals } = await import("../../lib/authErrorGate");
        suppressAuthErrorModals(5000);
        adoptTenantAuthTokens(sessionPayload || {});
        // Re-hydrate Auth + Tenant (palette, plan features, nav) after cookie refresh.
        emitSessionResume({ surface: "tenant", user, tokens: sessionPayload || {} });
      }

      onClose();
      onLoginSuccess?.();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        t("Invalid password. Please check your credentials.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFullLogout = () => {
    localStorage.clear();
    window.location.href = isPlatform ? "/platform/login" : "/login";
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-[#142843]/72 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-description"
        className="w-full max-w-md bg-[#FCF3E2] border border-[#E6DCC8] rounded-2xl shadow-2xl p-6 text-start outline-none animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-[#142843]/10 border border-[#142843]/15 text-[#142843] flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full bg-[#142843]/8 text-[#142843] border border-[#142843]/12">
            {t("Sign-in required")}
          </span>
        </div>

        <h2 id="session-expired-title" className="text-lg font-bold text-[#142843] mb-2 tracking-tight">
          {title}
        </h2>

        <p id="session-expired-description" className="text-sm text-[#5C6E84] leading-relaxed mb-3">
          {detail}
        </p>

        <div className="mb-5 flex gap-2.5 rounded-xl border border-[#C5D4A8] bg-[#EEF5E4] px-3.5 py-3 text-xs text-[#3F5A2A] leading-relaxed">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold mb-0.5">{t("Nothing is broken")}</p>
            <p>
              {t("This is a normal security step — not a system error or bug. Sign in again and you can pick up where you left off.")}
            </p>
          </div>
        </div>

        {(accountHint || displayName) && (
          <p className="text-xs text-[#5C6E84] mb-3">
            {t("Continuing as")}{" "}
            <strong className="text-[#142843]">
              <bdi>{displayName}</bdi>
            </strong>
            {accountHint && accountHint !== displayName ? (
              <>
                {" "}
                <span className="text-[#7A8B9C]">
                  (<bdi>{accountHint}</bdi>)
                </span>
              </>
            ) : null}
          </p>
        )}

        {errorMsg && (
          <div className="p-2.5 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#5C6E84] mb-1.5">
            {t("Password")}
          </label>
          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Enter your password")}
              autoFocus
              autoComplete="current-password"
              className="w-full px-3.5 py-3 text-sm rounded-xl border border-[#E6DCC8] bg-white text-[#142843] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#142843]/25 focus:border-[#142843]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t("Hide password") : t("Show password")}
              className="absolute end-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-[#9CA3AF] hover:text-[#142843]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#E6DCC8]">
            <button
              type="button"
              onClick={handleFullLogout}
              className="text-xs font-medium text-[#5C6E84] hover:text-[#142843] cursor-pointer"
            >
              {t("Go to sign-in page")}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 text-sm font-semibold text-[#FCF3E2] bg-[#142843] hover:bg-[#1E3A5F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer shadow-sm"
            >
              {loading ? t("Signing in…") : t("Sign in again")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
