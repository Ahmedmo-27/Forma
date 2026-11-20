import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import usePageTitle from '../../hooks/usePageTitle';
import { PageHeader, Card, Btn, Spinner } from '../../components/ui';
import { getInboxChannels } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';

const TYPE_LABELS = { whatsapp: 'WhatsApp' };
const STATUS_LABELS = {
  connected: tr('Connected'),
  connecting: tr('Connecting'),
  qr: tr('Waiting for scan'),
  disconnected: tr('Disconnected'),
};

function statusColor(status) {
  if (status === 'connected') return 'var(--green)';
  return 'var(--t4)';
}

export default function ConnectChannels() {
  const { t } = useI18n();
  usePageTitle(t('Connected channels'));
  const navigate = useNavigate();

  const channelsQuery = useQuery({
    queryKey: ['inbox', 'channels'],
    queryFn: async () => (await getInboxChannels()).data,
    staleTime: 0,
  });
  const channels = channelsQuery.data?.channels || [];

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader title={t('Connected channels')}>
          <Link to="/inbox" style={{ fontSize: 13, fontWeight: 600 }}>{t('Open inbox')}</Link>
        </PageHeader>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--t3)' }}>
              {t('Messages sent to these accounts land in one shared inbox for the whole gym.')}
            </p>

            {channelsQuery.isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
            ) : channels.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--t4)' }}>{t('No channels connected yet.')}</p>
            ) : (
              channels.map((channel) => (
                <div key={channel.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{TYPE_LABELS[channel.type] || channel.type}</div>
                    <div dir="auto" style={{ fontSize: 13, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channel.displayName}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: statusColor(channel.status), marginTop: 2 }}>
                      {STATUS_LABELS[channel.status] ? t(STATUS_LABELS[channel.status]) : channel.status}
                    </div>
                  </div>
                  <Btn size="sm" variant="outline" onClick={() => navigate('/account/whatsapp')}>{t('Manage')}</Btn>
                </div>
              ))
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="outline" onClick={() => navigate('/account/whatsapp')}>{t('Link WhatsApp')}</Btn>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
