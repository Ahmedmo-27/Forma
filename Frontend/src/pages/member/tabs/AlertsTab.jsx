import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Btn, Spinner, EmptyState, Textarea } from '../../../components/ui';
import { addAlert, deactivateAlert } from '../../../api/endpoints';
import { AlertTriangle, Bell, X } from 'lucide-react';
import { useI18n } from '../../../i18n/useI18n';
import { useMemberDates } from '../useMemberDates';

export default function AlertsTab({ member, user, onRefresh }) {
  const { t } = useI18n();
  const { fmtDateTime } = useMemberDates();
  const [text, setText]       = useState('');
  const [adding, setAdding]   = useState(false);
  const [dismissing, setDismissing] = useState(null);

  const canAdd = ['Receptionist', 'Sales', 'Sales Manager'].includes(user?.role);
  const alerts = member.alert || [];
  const activeAlerts   = alerts.filter(a => a?.active);
  const inactiveAlerts = alerts.filter(a => !a?.active);

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed) { toast.error(t('Alert text is required')); return; }
    if (trimmed.length > 2000) { toast.error(t('Alert text must not exceed 2000 characters')); return; }
    setAdding(true);
    try {
      await addAlert(member.systemId, trimmed);
      toast.success(t('Alert added'));
      setText('');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message ?? t('Failed to add alert'));
    } finally { setAdding(false); }
  };

  const handleDismiss = async (alertId) => {
    setDismissing(alertId);
    try {
      await deactivateAlert(member.systemId, alertId);
      toast.success(t('Alert dismissed'));
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message ?? t('Failed to dismiss alert'));
    } finally { setDismissing(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Add new alert ──────────────────────────────────────────── */}
      {canAdd && (
        <Card>
          <CardHeader title={t('Add Alert')} />
          <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 12 }}>
            {t("This alert will pop up for anyone who opens this member's profile or checks them in.")}
          </p>
          <Textarea
            label={t('Alert Message *')}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('e.g. Member has outstanding balance, contact before renewal')}
            rows={3}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="blue" size="sm" onClick={handleAdd} disabled={adding || !text.trim()}>
              {adding ? <Spinner size="sm" /> : t('Add Alert')}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── Active alerts ──────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t('Active Alerts ({count})', { count: activeAlerts.length })} />
        {activeAlerts.length === 0 ? (
          <EmptyState icon={Bell} message={t('No active alerts')} sub={t('Add an alert above to notify anyone who views this profile')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeAlerts.map(a => (
              <div key={a._id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px', borderRadius: 6,
                background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
              }}>
                <AlertTriangle size={18} color="var(--amber)" style={{ flexShrink: 0 }} aria-hidden />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4, lineHeight: 1.5 }}>
                    {a.text}
                  </p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--t4)', flexWrap: 'wrap' }}>
                    <span>{t('by {name}', { name: a.createdBy?.name ?? t('Unknown') })}</span>
                    <span>{fmtDateTime(a.createdAt)}</span>
                  </div>
                </div>
                {canAdd && (
                  <Btn variant="ghost" size="xs" onClick={() => handleDismiss(a._id)}
                    disabled={dismissing === a._id}>
                    {dismissing === a._id ? <Spinner size="sm" /> : t('Dismiss')}
                  </Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Dismissed alerts ────────────────────────────────────────── */}
      {inactiveAlerts.length > 0 && (
        <Card>
          <CardHeader title={t('Dismissed ({count})', { count: inactiveAlerts.length })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {inactiveAlerts.map(a => (
              <div key={a._id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 14px', borderRadius: 6,
                background: 'var(--bg)', border: '1px solid var(--border)',
                opacity: 0.6,
              }}>
                <X size={14} color="var(--t4)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 2, lineHeight: 1.5 }}>
                    {a.text}
                  </p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--t4)' }}>
                    <span>{t('by {name}', { name: a.createdBy?.name ?? t('Unknown') })}</span>
                    <span>{fmtDateTime(a.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
