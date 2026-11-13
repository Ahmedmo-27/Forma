import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { usePlatformAuth } from "../../lib/auth/AuthContext";
import { apiLogin } from "../../lib/api/endpoints";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Callout } from "../../ui/Callout";
import { platformToast } from "../../ui/Toast";
import { isValidEmail } from "../../lib/utils/validation";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginSuccess } = usePlatformAuth();

  useEffect(() => {
    document.title = "Sign In · Forma";
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

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
      loginSuccess(res.data);
      platformToast.success(`Welcome back, ${res.data.user?.name || "Operator"}`);
      navigate("/platform/dashboard");
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err.response?.data?.message || "Invalid platform operator credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#142843] text-[#142843] select-none">
      <div className="forma-auth w-full max-w-sm rounded-[var(--platform-radius-xl)] bg-[#FCF3E2] border border-[#E6DCC8] p-6 shadow-xl space-y-6 text-left animate-in fade-in duration-200">
        <div className="text-center space-y-2">
          <img
            src="/forma-horizontal.jpeg"
            alt="Forma"
            className="w-full max-w-[220px] h-auto mx-auto block"
          />
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[#142843]">
              Forma Platform
            </h1>
            <p className="text-xs text-[#5C6E84] mt-0.5">
              Super Admin & Operator Authentication
            </p>
          </div>
        </div>

        {error && (
          <Callout variant="danger" onDismiss={() => setError("")}>
            {error}
          </Callout>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            ref={emailRef}
            label="Operator Email"
            type="email"
            required
            autoComplete="username"
            leftIcon={Mail}
            placeholder="operator@forma.com"
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
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] rounded cursor-pointer transition-colors"
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

        <div className="pt-4 border-t border-[var(--platform-border-subtle)] text-center text-[11px] text-[var(--platform-text-muted)] flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3 text-[var(--platform-success)]" />
          <span>SOC2 Type II • Zero Tenant Boundary Enforced</span>
        </div>
      </div>
    </div>
  );
}
