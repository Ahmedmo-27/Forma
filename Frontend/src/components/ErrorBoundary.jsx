import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '32px 28px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.40)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--amber)' }}>
            <AlertTriangle size={40} strokeWidth={1.5} aria-hidden />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>An unexpected error occurred. Refresh the page to continue.</p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--red)', overflowX: 'auto', maxHeight: 100, marginBottom: 20 }}>
              {this.state.error.message}
            </pre>
          )}
          <button onClick={() => window.location.reload()} style={{ padding: '8px 20px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
}
