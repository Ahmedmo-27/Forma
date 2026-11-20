import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Avatar, Badge, CAIRO_ZONE } from '../../components/ui';
import { getTodayCoachTransfers } from '../../api/endpoints';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

export default function CoachTransfers() {
  const { t } = useI18n();
  const { fmtDate, fmtTime } = useFormat();
  usePageTitle(t('Today\'s Transfers'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Head Coach';

  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTodayCoachTransfers();
      setTransfers(res.data.transfers ?? []);
    } catch {
      toast.error(t('Failed to load transfers'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const fmtTransferTime = (v) => (v
    ? fmtTime(v, { timeZone: CAIRO_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }, 'en-US')
    : '—');

  return (
    <Layout>
      <PageHeader walkthrough="transfers-header" title={t('Today\'s Transfers')}>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {fmtDate(new Date(), { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB')}
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="transfers-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              {isManager
                ? t('All Coach Transfers Today ({count})', { count: transfers.length })
                : t('Members Transferred to You Today ({count})', { count: transfers.length })}
            </span>
            <div style={{
              padding: '4px 12px', borderRadius: 16,
              background: transfers.length > 0 ? 'var(--navy)' : 'var(--border)',
              color: '#fff', fontSize: 13, fontWeight: 800,
            }}>
              {loading ? '…' : transfers.length}
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
          ) : transfers.length === 0 ? (
            <EmptyState icon={RefreshCw} message={t('No transfers today')} sub={isManager ? t('All coach transfers for today will appear here') : t('Members assigned to you today will appear here')} />
          ) : (
            <div>
              {transfers.map((tf, i) => (
                <div key={tf._id ?? i}
                  onClick={() => navigate(`/members/${tf.member.systemId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 18px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Avatar name={tf.member.name} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{tf.member.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                      #{tf.member.systemId} · {tf.text}
                    </div>
                    {isManager && tf.member.current_couch?.name && (
                      <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
                        {t('Coach: {name}', { name: tf.member.current_couch.name })}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'end', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
                      {fmtTransferTime(tf.time)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{t('by {name}', { name: tf.by })}</div>
                    <Badge status={tf.member.couch_subscription_status || 'guest'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
