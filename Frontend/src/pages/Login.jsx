import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { Spinner } from '../components/ui';

export default function Login() {
  usePageTitle('Sign In');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});

  if (user) {
    if (user.role === 'Accountant') return <Navigate to="/accounting/dashboard" replace />;
    if (['Sales', 'Sales Manager'].includes(user.role)) return <Navigate to="/sales/dashboard" replace />;
    if (['Coach', 'Coach Manager'].includes(user.role)) return <Navigate to="/coach/dashboard" replace />;
    return <Navigate to="/members" replace />;
  }
  const validate = () => {
    const e = {};
    if (!email.trim())                     e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email))  e.email    = 'Enter a valid email address';
    if (!password)                         e.password = 'Password is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const user = await signIn(email.trim(), password);
      toast.success(`Welcome back, ${user.name}!`);
      if (user.role === 'Accountant') {
        navigate('/accounting/dashboard', { replace: true });
      } else if (['Sales', 'Sales Manager'].includes(user.role)) {
        navigate('/sales/dashboard', { replace: true });
      } else if (['Coach', 'Coach Manager'].includes(user.role)) {
        navigate('/coach/dashboard', { replace: true });
      } else {
        navigate('/members', { replace: true });
      }
    } catch (err) {
      let msg;
      if (!err.response) {
        msg = import.meta.env.VITE_API_URL
          ? 'Cannot reach the server. Check your connection and API URL.'
          : 'App is misconfigured: API URL is missing (VITE_API_URL).';
      } else if (err.response.status === 404) {
        msg = 'API endpoint not found. Set VITE_API_URL to your backend URL including /api (e.g. https://flame-factory.onrender.com/api).';
      } else {
        msg = err.response.data?.message || 'Invalid email or password.';
      }
      toast.error(msg);
      setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100svh', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ── LEFT PANEL — branding ───────────────────────────────────── */}
      <div className="login-left" style={{
        flex: '1 1 50%',
        background: 'linear-gradient(145deg, #0B0817 0%, #130D2A 45%, #1E1248 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Decorative circles */}
        <div style={{
          position: 'absolute', width: 600, height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(68,41,140,0.18) 0%, transparent 70%)',
          top: -120, right: -120, pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: 360, height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,240,255,0.08) 0%, transparent 70%)',
          bottom: -80, left: -80, pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(0,240,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 380 }}>

          {/* Logo mark */}
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'linear-gradient(135deg, #44298C 0%, #5B38BA 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 8px 32px rgba(68,41,140,0.55)',
          }}>
            <img src="/leap-logo.svg" alt="LEAP" style={{ width: 64, height: 64 }} />
          </div>

          <h1 style={{
            fontSize: 36, fontWeight: 800, color: '#ffffff',
            letterSpacing: '2px', marginBottom: 12, textTransform: 'uppercase',
          }}>
            LEAP
          </h1>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.6, marginBottom: 40,
          }}>
            Complete gym & CrossFit management platform — members, packages, sales, and more.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {['Member Profiles', 'Sales Tracking', 'Freeze Management', 'Check-In System', 'Invitations'].map((f) => (
              <span key={f} style={{
                padding: '7px 16px', borderRadius: 24,
                background: 'rgba(68,41,140,0.25)',
                border: '1px solid rgba(0,240,255,0.15)',
                color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500,
              }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Bottom copyright */}
        <p style={{
          position: 'absolute', bottom: 24,
          fontSize: 11, color: 'rgba(255,255,255,0.25)',
        }}>
          © {new Date().getFullYear()} LEAP. All rights reserved.
        </p>
      </div>

      {/* ── RIGHT PANEL — form ──────────────────────────────────────── */}
      <div className="login-right" style={{
        flex: '1 1 50%',
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        minWidth: 0,
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#00F0FF', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
              Welcome back
            </p>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', marginBottom: 8 }}>
              Sign in to your account
            </h2>
            <p style={{ fontSize: 14, color: 'var(--t3)' }}>
              Enter your credentials to access the dashboard.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>

            {/* Global error */}
            {errors.form && (
              <div style={{
                padding: '12px 14px', borderRadius: 8, marginBottom: 20,
                background: 'var(--red-bg)', border: '1px solid var(--red-bd)',
                color: 'var(--red)', fontSize: 13,
              }}>
                {errors.form}
              </div>
            )}

            {/* Email */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '', form: '' })); }}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '14px 18px', fontSize: 15,
                  border: `1.5px solid ${errors.email ? 'var(--red-bd)' : 'var(--border)'}`,
                  borderRadius: 12, outline: 'none', color: 'var(--t1)',
                  background: 'var(--bg)',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#00F0FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,240,255,0.10)'; }}
                onBlur={(e)  => { e.target.style.borderColor = errors.email ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
              />
              {errors.email && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--red)' }}>{errors.email}</p>}
            </div>

            {/* Password */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '', form: '' })); }}
                  placeholder="Enter your password"
                  style={{
                    width: '100%', padding: '14px 46px 14px 18px', fontSize: 15,
                    border: `1.5px solid ${errors.password ? 'var(--red-bd)' : 'var(--border)'}`,
                    borderRadius: 12, outline: 'none', color: 'var(--t1)',
                    background: 'var(--bg)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#00F0FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,240,255,0.10)'; }}
                  onBlur={(e)  => { e.target.style.borderColor = errors.password ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--t4)', padding: 2, display: 'flex', alignItems: 'center',
                  }}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--red)' }}>{errors.password}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '15px', fontSize: 16, fontWeight: 700,
                background: loading
                  ? 'rgba(68,41,140,0.50)'
                  : 'linear-gradient(135deg, #44298C 0%, #5B38BA 100%)',
                color: '#ffffff', border: 'none', borderRadius: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 6px 24px rgba(68,41,140,0.6)',
                transition: 'opacity 0.15s, box-shadow 0.15s',
                letterSpacing: '0.2px',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.92'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {loading
                ? <><Spinner size="sm" /> Signing in…</>
                : 'Sign In →'
              }
            </button>
          </form>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--t4)', fontWeight: 500, letterSpacing: '2px' }}>SECURE LOGIN</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Trust badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
            {[
              { icon: '🔒', label: 'Encrypted' },
              { icon: '🛡️', label: 'Protected' },
              { icon: '⚡', label: 'Fast & Secure' },
            ].map((b) => (
              <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 22 }}>{b.icon}</span>
                <span style={{ fontSize: 12, color: 'var(--t4)', fontWeight: 500 }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: hide left panel below md ────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .login-left { display: none !important; }
          .login-right { flex: 1 1 100% !important; padding: 40px 24px !important; }
        }
      `}</style>
    </div>
  );
}
