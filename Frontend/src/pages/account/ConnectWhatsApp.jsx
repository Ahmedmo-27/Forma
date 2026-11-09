import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import usePageTitle from '../../hooks/usePageTitle';
import { PageHeader, Card, Btn, Spinner } from '../../components/ui';
import {
  getWhatsAppSession,
  startWhatsAppSession,
  logoutWhatsAppSession,
} from '../../api/endpoints';

function statusLabel(status) {
  if (status === 'connected') return 'Connected';
  if (status === 'qr') return 'Waiting for scan';
  if (status === 'connecting') return 'Connecting';
  return 'Not connected';
}

export default function ConnectWhatsApp() {
  usePageTitle('Connect WhatsApp');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  const refresh = useCallback(async () => {
    const res = await getWhatsAppSession();
    setSession(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    const status = session?.status;
    if (!status) return undefined;
    const delay = status === 'qr' || status === 'connecting' ? 2000 : 10000;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, delay);
    return () => clearInterval(timer);
  }, [session?.status, refresh]);

  useEffect(() => {
    if (!session?.qr) {
      setQrUrl('');
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(session.qr, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => { cancelled = true; };
  }, [session?.qr]);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await startWhatsAppSession();
      setSession(res.data);
    } catch {
      /* Global error handler shows the message. */
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await logoutWhatsAppSession();
      setSession(res.data);
      toast.success('WhatsApp disconnected');
    } catch {
      /* Global error handler shows the message. */
    } finally {
      setBusy(false);
    }
  };

  const status = session?.status || 'disconnected';
  const phone = session?.phone ? `+${session.phone}` : null;

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader
          title="Connect WhatsApp"
          sub="Link your own WhatsApp. Messages you send from Leap go out from this number."
        />
        <Card>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spinner />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--t4)' }}>
                  Status
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{statusLabel(status)}</div>
                {phone && (
                  <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
                    {status === 'connected' ? phone : `Last linked ${phone}`}
                  </div>
                )}
              </div>

              {status === 'qr' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--t2)', maxWidth: 420 }}>
                    Open WhatsApp on your phone, go to Linked devices, and scan this code. It can change once just after it appears. Scan the code that is on the screen.
                  </p>
                  {qrUrl ? (
                    <img src={qrUrl} alt="WhatsApp QR code" width={280} height={280} style={{ borderRadius: 12, background: '#fff', maxWidth: '100%', height: 'auto' }} />
                  ) : (
                    <Spinner />
                  )}
                </div>
              )}

              {status === 'connecting' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t3)', fontSize: 14 }}>
                  <Spinner size="sm" />
                  Waiting for WhatsApp…
                </div>
              )}

              {status === 'disconnected' && (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--t3)', maxWidth: 460 }}>
                  Connect once. Leap keeps the link on this account, including after you sign out of the app. Disconnect here if you want sends to stop.
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {status !== 'connected' && (
                  <Btn variant="success" onClick={connect} disabled={busy || status === 'qr' || status === 'connecting'}>
                    {busy || status === 'connecting' ? 'Connecting…' : status === 'qr' ? 'Scan the code' : 'Connect'}
                  </Btn>
                )}
                {status !== 'disconnected' && (
                  <Btn variant="outline" onClick={disconnect} disabled={busy}>
                    {busy ? 'Disconnecting…' : 'Disconnect'}
                  </Btn>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
