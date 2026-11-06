import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/endpoints';
import usePageTitle from '../hooks/usePageTitle';
import { Spinner } from '../components/ui';
import { AuthCard } from './SetupPassword';

export default function ForgotPassword() {
  usePageTitle('Reset password');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setError('');
    setMessage('');
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setMessage(res.data?.message || 'If an account exists for that email, a reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Could not send a reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email a link if an account exists for this address."
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <p style={{ margin: 0, fontSize: 13, color: '#DC2626' }}>{error}</p>}
        {message && <p style={{ margin: 0, fontSize: 13, color: '#166534' }}>{message}</p>}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              height: 44,
              borderRadius: 10,
              border: '1px solid #E5E7EB',
              background: '#F9FAFB',
              padding: '0 12px',
              fontSize: 14,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            height: 46,
            border: 'none',
            borderRadius: 10,
            background: loading ? 'rgba(68,41,140,0.45)' : '#44298C',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? <Spinner size="sm" /> : 'Send reset link'}
        </button>
        <Link to="/login" style={{ fontSize: 13, color: '#44298C', fontWeight: 600, textAlign: 'center' }}>
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}
