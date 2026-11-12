import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { setupPassword } from '../api/endpoints';
import usePageTitle from '../hooks/usePageTitle';
import { Spinner } from '../components/ui';

export default function SetupPassword() {
  usePageTitle('Set password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!token) {
      setError('This setup link is missing a token. Ask your platform operator for a new invite.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await setupPassword(token, password);
      navigate('/login', { replace: true, state: { passwordSet: true } });
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Could not set your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Set your password"
      subtitle={email ? `Account: ${email}` : 'Choose a password for your gym workspace.'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <p style={{ margin: 0, fontSize: 13, color: '#DC2626' }}>{error}</p>}
        <label style={labelStyle}>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={loading} style={buttonStyle(loading)}>
          {loading ? <Spinner size="sm" /> : 'Save password'}
        </button>
        <Link to="/login" style={{ fontSize: 13, color: '#142843', fontWeight: 600, textAlign: 'center' }}>
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}

export function AuthCard({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#142843',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 460,
        background: '#FCF3E2',
        border: '1px solid #E6DCC8',
        borderRadius: 20,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#142843', margin: '0 0 6px' }}>{title}</h1>
        <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 24px' }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' };
const inputStyle = {
  height: 44,
  borderRadius: 10,
  border: '1px solid #E6DCC8',
  background: '#FFFFFF',
  padding: '0 12px',
  fontSize: 14,
};
function buttonStyle(loading) {
  return {
    height: 46,
    border: 'none',
    borderRadius: 10,
    background: loading ? 'rgba(20,40,67,0.45)' : '#142843',
    color: '#FCF3E2',
    fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer',
  };
}
