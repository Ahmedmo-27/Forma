import { useState } from 'react';
import toast from 'react-hot-toast';
import { Btn, Spinner, Modal, Input } from './ui';
import { blockMember, unblockMember, suspendMember } from '../api/endpoints';
import { hasAccess } from '../lib/access';
import { isMemberSuspended } from '../lib/memberRestriction';
import { useI18n } from '../i18n/useI18n';

export function canManageMemberRestrictions(user) {
  return hasAccess(user, 'management')
    || ['Owner', 'General Manager', 'Sales Manager', 'Head Coach'].includes(user?.role);
}

/**
 * Suspend / lock / unlock actions for a member (Owner, GM, etc.).
 * Renders action buttons and confirmation modals; call onUpdated with the API member payload.
 */
export default function MemberRestrictionControls({
  member,
  user,
  onUpdated,
  layout = 'row',
}) {
  const { t } = useI18n();
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [blocking, setBlocking] = useState(false);

  if (!member || !canManageMemberRestrictions(user)) return null;

  const applyMember = (res) => {
    const next = res?.data?.member;
    if (next && onUpdated) onUpdated(next);
  };

  const handleBlock = async () => {
    setBlocking(true);
    try {
      const res = await blockMember(member.systemId, blockReason.trim() || undefined);
      toast.success(t('Member locked'));
      setShowBlockModal(false);
      setBlockReason('');
      applyMember(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to lock member.'));
    } finally {
      setBlocking(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendUntil) {
      toast.error(t('Select a suspension end date.'));
      return;
    }
    setBlocking(true);
    try {
      const res = await suspendMember(member.systemId, {
        suspendedUntil: suspendUntil,
        reason: suspendReason.trim() || undefined,
      });
      toast.success(t('Member suspended'));
      setShowSuspendModal(false);
      setSuspendUntil('');
      setSuspendReason('');
      applyMember(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to suspend member.'));
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async () => {
    setBlocking(true);
    try {
      const res = await unblockMember(member.systemId);
      toast.success(isMemberSuspended(member) ? t('Member unsuspended') : t('Member unlocked'));
      applyMember(res);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to unlock member.'));
    } finally {
      setBlocking(false);
    }
  };

  const rowStyle = layout === 'stretch'
    ? { display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }
    : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };

  return (
    <>
      <div style={rowStyle}>
        {member.isBlocked ? (
          <Btn
            variant="outline"
            size="sm"
            onClick={handleUnblock}
            disabled={blocking}
            style={layout === 'stretch' ? { flex: 1, minWidth: 120 } : undefined}
          >
            {blocking ? <Spinner size="sm" /> : (isMemberSuspended(member) ? t('Lift suspension') : t('Unlock'))}
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
        title={t('Lock Member')}
        size="sm"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setShowBlockModal(false)} disabled={blocking}>{t('Cancel')}</Btn>
            <Btn variant="danger" size="sm" onClick={handleBlock} disabled={blocking}>
              {blocking ? <Spinner size="sm" /> : t('Lock Member')}
            </Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('Locking prevents check-ins until you unlock manually. Are you sure?')}
        </p>
        <Input
          label={t('Reason (optional)')}
          value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          placeholder={t('e.g. Outstanding balance, inappropriate behavior')}
        />
      </Modal>

      <Modal
        open={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title={t('Suspend Member')}
        size="sm"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setShowSuspendModal(false)} disabled={blocking}>{t('Cancel')}</Btn>
            <Btn variant="primary" size="sm" onClick={handleSuspend} disabled={blocking || !suspendUntil}>
              {blocking ? <Spinner size="sm" /> : t('Suspend Member')}
            </Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('Suspension blocks check-ins until the end date, then lifts automatically.')}
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
          placeholder={t('e.g. Temporary disciplinary action')}
        />
      </Modal>
    </>
  );
}