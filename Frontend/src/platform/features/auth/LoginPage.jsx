import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, KeyRound, Shield, AlertCircle } from "lucide-react";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { apiLogin, apiMfaChallenge, apiMfaSetup, apiMfaVerify } from "../../lib/api/endpoints";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Badge } from "../../ui/Badge";
import { Callout } from "../../ui/Callout";
import { platformToast } from "../../ui/Toast";
import { isValidEmail } from "../../lib/utils/validation";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginSuccess } = usePlatformAuth();

  const [step, setStep] = useState("login"); // "login" | "mfa_challenge" | "mfa_setup" | "mfa_recovery_display"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // MFA Challenge State
  const [tempToken, setTempToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);

  // MFA Enrollment State
  const [setupSecret, setSetupSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  // Step 1: Initial Login
  const handleLogin = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const nextEmailError = !trimmedEmail
      ? "Email address is required"
      : !isValidEmail(trimmedEmail)
        ? "Enter a valid email address"
        : "";
    const nextPasswordError = !password ? "Password is required" : "";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError) {
      emailRef.current?.focus();
      return;
    }
    if (nextPasswordError) {
      passwordRef.current?.focus();
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await apiLogin({ email: trimmedEmail, password });
      const data = res.data;

      if (data.mfaRequired) {
        setTempToken(data.tempToken);
        setStep("mfa_challenge");
      } else if (data.mfaSetupRequired) {
        setTempToken(data.tempToken);
        // Load TOTP secret
        const setupRes = await apiMfaSetup({ tempToken: data.tempToken });
        setSetupSecret(setupRes.data.secret);
        setStep("mfa_setup");
      } else {
        loginSuccess(data);
        platformToast.success(`Welcome back, ${data.user?.name || "Operator"}`);
        navigate("/platform/dashboard");
      }
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err.response?.data?.message || "Invalid platform operator credentials");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit MFA Challenge
  const handleMfaChallenge = async (e) => {
    e.preventDefault();
    const trimmedCode = mfaCode.trim();
    if (!trimmedCode) {
      setError("Verification code is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await apiMfaChallenge({
        tempToken,
        code: trimmedCode,
        isRecoveryCode,
      });

      loginSuccess(res.data);
      platformToast.success("MFA verified successfully");
      navigate("/platform/dashboard");
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err.response?.data?.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify Enrollment
  const handleVerifyEnrollment = async (e) => {
    e.preventDefault();
    const trimmedCode = mfaCode.trim();
    if (!trimmedCode) {
      setError("6-digit verification code is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await apiMfaVerify({
        tempToken,
        code: trimmedCode,
      });

      setRecoveryCodes(res.data.recoveryCodes || []);
      setStep("mfa_recovery_display");
      loginSuccess(res.data);
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err.response?.data?.message || "Invalid 6-digit enrollment code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--platform-canvas)] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.12),transparent)] text-[var(--platform-text-primary)] select-none">
      <div className="w-full max-w-sm rounded-[var(--platform-radius-xl)] bg-[var(--platform-surface)] border border-[var(--platform-border)] p-6 shadow-xl space-y-6 text-left animate-in fade-in duration-200">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-[var(--platform-radius-md)] bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-md ring-1 ring-blue-500/30">
            LP
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Platform Console
            </h1>
            <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
              Super Admin & Operator Authentication
            </p>
          </div>
        </div>

        {error && (
          <Callout variant="danger" onDismiss={() => setError("")}>
            {error}
          </Callout>
        )}

        {/* STEP 1: LOGIN FORM */}
        {step === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              ref={emailRef}
              label="Operator Email"
              type="email"
              required
              autoComplete="username"
              leftIcon={Mail}
              placeholder="operator@leap.com"
              value={email}
              error={emailError}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              disabled={loading}
            />

            <Input
              ref={passwordRef}
              label="Master Password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              leftIcon={Lock}
              placeholder="Enter your password"
              value={password}
              error={passwordError}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              disabled={loading}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="inline-flex items-center justify-center min-w-8 min-h-8 text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] rounded cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              className="mt-2"
            >
              Sign In to Console
            </Button>
          </form>
        )}

        {/* STEP 2: MFA CHALLENGE */}
        {step === "mfa_challenge" && (
          <form onSubmit={handleMfaChallenge} className="space-y-4">
            <div className="text-xs text-[var(--platform-text-secondary)]">
              {isRecoveryCode
                ? "Enter one of your 8-character single-use emergency backup recovery codes."
                : "Enter the 6-digit TOTP security code from your authenticator application."}
            </div>

            <Input
              label={isRecoveryCode ? "Recovery Code" : "6-Digit Authentication Code"}
              isMono
              required
              autoComplete="one-time-code"
              inputMode={isRecoveryCode ? "text" : "numeric"}
              leftIcon={Shield}
              placeholder={isRecoveryCode ? "Recovery code" : "6-digit code"}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={isRecoveryCode ? 16 : 6}
            />

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              Verify & Proceed
            </Button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRecoveryCode((r) => !r);
                  setMfaCode("");
                  setError("");
                }}
                className="text-xs text-[var(--platform-accent)] hover:underline"
              >
                {isRecoveryCode
                  ? "Use Authenticator App (TOTP Code)"
                  : "Use Backup Recovery Code Instead"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: MFA ENROLLMENT SETUP */}
        {step === "mfa_setup" && (
          <form onSubmit={handleVerifyEnrollment} className="space-y-4">
            <div className="text-xs text-[var(--platform-text-secondary)]">
              Multi-factor authentication is required for this operator account. Scan the secret below into your authenticator app (Google Authenticator, 1Password, etc.).
            </div>

            <div className="p-3 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--platform-text-muted)]">
                Secret Key
              </span>
              <div className="platform-mono text-xs font-semibold select-all break-all text-[var(--platform-accent)]">
                {setupSecret}
              </div>
            </div>

            <Input
              label="Verification Code"
              isMono
              required
              placeholder="123456"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              Activate MFA & Complete Sign In
            </Button>
          </form>
        )}

        {/* STEP 4: RECOVERY CODES DISPLAY */}
        {step === "mfa_recovery_display" && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--platform-text-secondary)]">
              Store these single-use recovery codes in a secure location. They allow access if you lose your authenticator device.
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)]">
              {recoveryCodes.map((c, i) => (
                <div key={i} className="platform-mono text-xs font-semibold select-all">
                  {c}
                </div>
              ))}
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate("/platform/dashboard")}
            >
              I Have Saved My Codes
            </Button>
          </div>
        )}

        {/* Security Notice Footer */}
        <div className="pt-4 border-t border-[var(--platform-border-subtle)] text-center text-[11px] text-[var(--platform-text-muted)] flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3 text-[var(--platform-success)]" />
          <span>SOC2 Type II • Zero Tenant Boundary Enforced</span>
        </div>
      </div>
    </div>
  );
}
