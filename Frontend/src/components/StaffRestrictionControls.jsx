import { useState } from 'react';
import toast from 'react-hot-toast';
import { Btn, Spinner, Modal, Input, Badge } from './ui';
import { lockStaffUser, unlockStaffUser, suspendStaffUser } from '../api/endpoints';
import { canManageStaffRestrictions, isStaffRestricted, isStaffSuspended } from '../lib/staffRestriction';
import { useI18n } from '../i18n/useI18n';

/**
 * Suspend / lock / unlock staff login accounts (Owner / GM).
 */
export default function StaffRestrictionControls({
  staff,
  currentUser,
  onUpdated,
  layout = 'row',
  showBanner = true,
}) {
  const { t } = useI18n();
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!staff || !canManageStaffRestrictions(currentUser, staff)) return null;

  const applyUser = (res) => {
    const next = res?.data?.user;
    if (next && onUpdated) onUpdated(next);
  };

  const handleLock = async () => {
    setBusy(true);
    try {
      const res = await lockStaffUser(staff._id, blockReason.trim() || undefined);
      toast.success(t('Staff account locked'));
      setShowBlockModal(false);
      setBlockReason('');
      applyUser(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to lock staff account.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendUntil) {
      toast.error(t('Select a suspension end date.'));
      return;
    }
    setBusy(true);
    try {
      const res = await suspendStaffUser(staff._id, {
        suspendedUntil: suspendUntil,
        reason: suspendReason.trim() || undefined,
      });
      toast.success(t('Staff account suspended'));
      setShowSuspendModal(false);
      setSuspendUntil('');
      setSuspendReason('');
      applyUser(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to suspend staff account.'));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    try {
      const res = await unlockStaffUser(staff._id);
      toast.success(isStaffSuspended(staff) ? t('Staff account unsuspended') : t('Staff account unlocked'));
      applyUser(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to unlock staff account.'));
    } finally {
      setBusy(false);
    }
  };

  const rowStyle = layout === 'stretch'
    ? { display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }
    : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };

  return (
    <>
      {showBanner && isStaffRestricted(staff) && (
        <div
          style={{
            width: '100%',
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${isStaffSuspended(staff) ? 'var(--amber-bd, #fcd34d)' : 'var(--red-bd, #fecaca)'}`,
            background: isStaffSuspended(staff) ? 'var(--amber-bg, #fffbeb)' : 'var(--red-bg, #fef2f2)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Badge status={isStaffSuspended(staff) ? 'suspended' : 'blocked'} />
          {isStaffSuspended(staff) && staff.suspendedUntil && (
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>
              {t('Until {date}', { date: new Date(staff.suspendedUntil).toLocaleDateString() })}
            </span>
          )}
          {staff.blockedReason && (
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{staff.blockedReason}</span>
          )}
        </div>
      )}

      <div style={rowStyle}>
        {isStaffRestricted(staff) ? (
          <Btn
            variant="outline"
            size="sm"
            onClick={handleUnlock}
            disabled={busy}
            style={layout === 'stretch' ? { flex: 1, minWidth: 120 } : undefined}
          >
            {busy ? <Spinner size="sm" /> : (isStaffSuspended(staff) ? t('Lift suspension') : t('Unlock'))}
          </Btn>
        ) : (
          <>
            <Btn
              variant="outline"
              size="sm"
              onClick={() => setShowSuspendModal(true)}
              style={layout === 'stretch' ? { flex: 1, minWidth: 120 } : undefined}
            >
              {t('Suspend')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => setShowBlockModal(true)}
              style={layout === 'stretch' ? { flex: 1, minWidth: 120 } : undefined}
            >
              {t('Lock')}
            </Btn>
          </>
        )}
      </div>

      <Modal
        open={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title={t('Lock Staff Account')}
        size="sm"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setShowBlockModal(false)} disabled={busy}>{t('Cancel')}</Btn>
            <Btn variant="danger" size="sm" onClick={handleLock} disabled={busy}>
              {busy ? <Spinner size="sm" /> : t('Lock Staff Account')}
            </Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('Locking prevents this staff member from signing in until you unlock manually.')}
        </p>
        <Input
          label={t('Reason (optional)')}
          value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          placeholder={t('e.g. Left the gym, security concern')}
        />
      </Modal>

      <Modal
        open={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title={t('Suspend Staff Account')}
        size="sm"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setShowSuspendModal(false)} disabled={busy}>{t('Cancel')}</Btn>
            <Btn variant="primary" size="sm" onClick={handleSuspend} disabled={busy || !suspendUntil}>
              {busy ? <Spinner size="sm" /> : t('Suspend Staff Account')}
            </Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('Suspension blocks sign-in until the end date, then lifts automatically.')}
        </p>
        <Input
          label={t('Suspended until *')}
          type="date"
          value={suspendUntil}
          onChange={e => setSuspendUntil(e.target.value)}
        />
        <Input
          label={t('Reason (optional)')}
          value={suspendReason}
          onChange={e => setSuspendReason(e.target.value)}
          placeholder={t('e.g. Temporary leave, disciplinary action')}
        />
      </Modal>
    </>
  );
}
