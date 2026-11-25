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
import { useI18n } from '../../i18n/useI18n';

function statusLabel(status, t) {
  if (status === 'connected') return t('Connected');
  if (status === 'qr') return t('Waiting for scan');
  if (status === 'connecting') return t('Connecting');
  return t('Not connected');
}

export default function ConnectWhatsApp() {
  const { t } = useI18n();
  usePageTitle(t('Connect WhatsApp'));
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
    // Baileys pairing payloads are long (wa.me/settings/linked_devices#…).
    // Low error correction + larger canvas keeps the modules scannable.
    QRCode.toDataURL(session.qr, { width: 560, margin: 2, errorCorrectionLevel: 'L' })
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
      toast.success(t('WhatsApp disconnected'));
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
          walkthrough="wa-connect-header"
          title={t('Connect WhatsApp')}
          sub={t('Link your own WhatsApp. Messages you send from Forma go out from this number.')}
        />
        <Card>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spinner />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div data-walkthrough="wa-connect-status">
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--t4)' }}>
                  {t('Status')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{statusLabel(status, t)}</div>
                {phone && (
                  <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
                    {status === 'connected' ? <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{phone}</span> : t('Last linked {phone}', { phone: `\u2066${phone}\u2069` })}
                  </div>
                )}
              </div>

              {status === 'qr' && (
                <div data-walkthrough="wa-connect-qr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--t2)', maxWidth: 420 }}>
                    {t('Open WhatsApp on your phone, go to Linked devices, and scan this code. It can change once just after it appears. Scan the code that is on the screen.')}
                  </p>
                  {qrUrl ? (
                    <img src={qrUrl} alt={t('WhatsApp QR code')} width={560} height={560} style={{ borderRadius: 12, background: '#fff', maxWidth: '100%', height: 'auto' }} />
                  ) : (
                    <Spinner />
                  )}
                </div>
              )}

              {status === 'connecting' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t3)', fontSize: 14 }}>
                  <Spinner size="sm" />
                  {t('Waiting for WhatsApp…')}
                </div>
              )}

              {status === 'disconnected' && (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--t3)', maxWidth: 460 }}>
                  {t('Connect once. Forma keeps the link on this account, including after you sign out of the app. Disconnect here if you want sends to stop.')}
                </p>
              )}

              <div data-walkthrough="wa-connect-action" style={{ display: 'flex', gap: 8 }}>
                {status !== 'connected' && (
                  <Btn variant="success" onClick={connect} disabled={busy || status === 'qr' || status === 'connecting'}>
                    {busy || status === 'connecting' ? t('Connecting…') : status === 'qr' ? t('Scan the code') : t('Connect')}
                  </Btn>
                )}
                {status !== 'disconnected' && (
                  <Btn variant="outline" onClick={disconnect} disabled={busy}>
                    {busy ? t('Disconnecting…') : t('Disconnect')}
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
