import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { Spinner } from '../components/ui';

export default function Login() {
  usePageTitle('Sign In');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});

  if (user) {
    if (user.role === 'Accountant') return <Navigate to="/accounting/dashboard" replace />;
    if (['Sales', 'Sales Manager'].includes(user.role)) return <Navigate to="/sales/dashboard" replace />;
    if (['Coach', 'Coach Manager'].includes(user.role)) return <Navigate to="/coach/dashboard" replace />;
    if (['Owner', 'General Manager'].includes(user.role)) return <Navigate to="/owner/dashboard" replace />;
    return <Navigate to="/members" replace />;
  }

  const validate = () => {
    const e = {};
    if (!username.trim())                  e.username = 'Username is required';
    if (!password)                         e.password = 'Password is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const user = await signIn(username.trim(), password);
      toast.success(`Welcome back, ${user.name}!`);
      if (user.role === 'Accountant') {
        navigate('/accounting/dashboard', { replace: true });
      } else if (['Sales', 'Sales Manager'].includes(user.role)) {
        navigate('/sales/dashboard', { replace: true });
      } else if (['Coach', 'Coach Manager'].includes(user.role)) {
        navigate('/coach/dashboard', { replace: true });
      } else if (['Owner', 'General Manager'].includes(user.role)) {
        navigate('/owner/dashboard', { replace: true });
      } else {
        navigate('/members', { replace: true });
      }
    } catch (err) {
      let msg;
      if (!err.response) {
        msg = (import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL)
          ? 'Cannot reach the server. Check your connection and API URL.'
          : 'App is misconfigured: Backend origin is missing (BACKEND_ORIGIN).';
      } else if (err.response.status === 404) {
        msg = err.response.data?.error?.message || err.response.data?.message || 'API endpoint not found. Please check your API URL.';
      } else if (err.response.status === 429) {
        msg = err.response.data?.error?.message || err.response.data?.message || 'Account temporarily locked due to failed login attempts. Please wait.';
      } else {
        const data = err.response.data || {};
        const fieldErrors = data.fieldErrors || data.error?.fieldErrors || {};
        const emailIssue = Array.isArray(fieldErrors.email) ? fieldErrors.email[0] : '';
        if (emailIssue && !username.includes('@')) {
          msg = 'This server still expects your email address. Sign in with the full email, such as owner@test.com. The username works after the API update is deployed.';
        } else {
          msg = data.error?.message || data.message || 'Invalid username or password.';
        }
      }
      setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: '#142843',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
    }}>

      {/* ── Subtle background glows ───────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(252,243,226,0.16) 0%, transparent 65%)',
          top: -150, left: -150,
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(252,243,226,0.10) 0%, transparent 65%)',
          bottom: -120, right: -120,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(252,243,226,0.14) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }} />
      </div>

      {/* ── Card ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 460,
        background: '#FCF3E2',
        border: '1px solid #E6DCC8',
        borderRadius: 20,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
        padding: 'clamp(28px, 6vw, 44px) clamp(18px, 5vw, 40px)',
      }}>

        {/* Logo + Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img
            src="/forma-horizontal.jpeg"
            alt="Forma"
            style={{ width: '100%', maxWidth: 280, height: 'auto', display: 'block', margin: '0 auto 14px' }}
          />
          <p style={{ fontSize: 13, color: '#6B7280', letterSpacing: '0.2px' }}>
            Gym & Fitness Management Platform
          </p>
        </div>

        {/* Divider */}
        <div style={{
          height: 1, background: '#E5E7EB', marginBottom: 32,
        }} />

        {/* Form header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontSize: 20, fontWeight: 700, color: '#111827',
            letterSpacing: '-0.2px', marginBottom: 4,
          }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 14, color: '#6B7280' }}>
            Sign in to access your dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>

          {/* Global error */}
          {errors.form && (
            <div style={{
              padding: '11px 14px', borderRadius: 8, marginBottom: 18,
              background: '#FEF2F2', border: '1px solid #FECACA',
              color: '#DC2626', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {errors.form}
            </div>
          )}


          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#374151', letterSpacing: '0.3px',
              textTransform: 'uppercase', marginBottom: 7,
            }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <svg style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                color: '#9CA3AF', pointerEvents: 'none',
              }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: '', form: '' })); }}
                placeholder="your username"
                style={{
                  width: '100%', padding: '12px 14px 12px 40px', fontSize: 14,
                  border: `1.5px solid ${errors.username ? '#FCA5A5' : '#E6DCC8'}`,
                  borderRadius: 10, outline: 'none', color: '#142843',
                  background: errors.username ? '#FEF2F2' : '#FFFFFF',
                  transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#142843';
                  e.target.style.boxShadow = '0 0 0 3px rgba(20,40,67,0.12)';
                  e.target.style.background = '#FFFFFF';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.username ? '#FCA5A5' : '#E6DCC8';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = errors.username ? '#FEF2F2' : '#FFFFFF';
                }}
              />
            </div>
            {errors.username && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#DC2626' }}>{errors.username}</p>}
          </div>

          {/* Password */}
          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#374151', letterSpacing: '0.3px',
              textTransform: 'uppercase', marginBottom: 7,
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <svg style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                color: '#9CA3AF', pointerEvents: 'none',
              }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '', form: '' })); }}
                placeholder="Enter your password"
                style={{
                  width: '100%', padding: '12px 44px 12px 40px', fontSize: 14,
                  border: `1.5px solid ${errors.password ? '#FCA5A5' : '#E6DCC8'}`,
                  borderRadius: 10, outline: 'none', color: '#142843',
                  background: errors.password ? '#FEF2F2' : '#FFFFFF',
                  transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#142843';
                  e.target.style.boxShadow = '0 0 0 3px rgba(20,40,67,0.12)';
                  e.target.style.background = '#FFFFFF';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.password ? '#FCA5A5' : '#E6DCC8';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = errors.password ? '#FEF2F2' : '#FFFFFF';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9CA3AF', width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#142843'}
                onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#DC2626' }}>{errors.password}</p>}
          </div>

          <div style={{ textAlign: 'right', marginTop: -8 }}>
            <Link to="/auth/forgot-password" style={{ fontSize: 13, color: '#142843', fontWeight: 600 }}>
              Forgot password?
            </Link>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', minHeight: 48, padding: '14px', fontSize: 15, fontWeight: 700,
              background: loading ? 'rgba(20,40,67,0.45)' : '#142843',
              color: '#FCF3E2', border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 4px 16px rgba(20,40,67,0.28)',
              transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
              letterSpacing: '0.2px',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#1E3A5F';
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(20,40,67,0.35)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#142843';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,40,67,0.28)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading
              ? <><Spinner size="sm" /> Signing in…</>
              : <>
                  Sign In
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
            }
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 28, paddingTop: 20,
          borderTop: '1px solid #E6DCC8',
          display: 'flex', justifyContent: 'center', gap: 24,
        }}>
          {[
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, label: 'Encrypted' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'Protected' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: '24/7 Access' },
          ].map((b) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#9CA3AF', fontSize: 12 }}>
              {b.icon}
              {b.label}
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#7A8B9C' }}>
          © {new Date().getFullYear()} Forma. All rights reserved.
        </p>
      </div>
    </div>
  );
}
