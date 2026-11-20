import { DoorOpen, Dumbbell } from 'lucide-react';
import { Modal, Spinner, CAIRO_ZONE } from './ui';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';

function Choice({ icon: Icon, title, lines, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '1 1 200px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        padding: '16px 16px',
        textAlign: 'start',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = 'var(--navy)';
        e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 12%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--navy) 10%, transparent)', color: 'var(--navy)',
      }}>
        <Icon size={18} aria-hidden />
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>{title}</span>
      {lines.filter(Boolean).map((line) => (
        <span key={line} style={{ fontSize: 12, color: 'var(--t3)' }}>{line}</span>
      ))}
    </button>
  );
}

/**
 * Shown when a member has both an active gym package and PT sessions.
 * `prompt` is the 409 response body. `onChoose` receives 'gym' or 'pt'.
 */
export default function CheckInTypeModal({ prompt, busy = false, onChoose, onClose }) {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  const member = prompt?.member || {};
  const sessionsLeft = member.ptSessionsLeft ?? 0;
  const gymLines = [
    member.gymPackage || null,
    member.gymEndsAt
      ? t('Active until {date}', {
        date: fmtDate(member.gymEndsAt, {
          timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric',
        }),
      })
      : null,
  ];
  const ptLines = [
    member.ptSessionsLeft === 1
      ? t('1 session left')
      : t('{count} sessions left', { count: sessionsLeft }),
    member.coachName ? t('Coach: {name}', { name: member.coachName }) : null,
    t('Uses 1 PT session'),
  ];

  return (
    <Modal
      open={Boolean(prompt)}
      onClose={busy ? undefined : onClose}
      title={member.name ? t('Check in {name}', { name: member.name }) : t('Check in')}
      maxWidth={520}
      footer={(
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 600, color: 'var(--t2)', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('Cancel')}
        </button>
      )}
    >
      <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 14px', lineHeight: 1.5 }}>
        {t('This member has both a gym package and PT sessions. Ask them what they are attending today, then pick one.')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Choice icon={DoorOpen} title={t('Regular gym')} lines={gymLines} disabled={busy} onClick={() => onChoose('gym')} />
        <Choice icon={Dumbbell} title={t('PT session')} lines={ptLines} disabled={busy} onClick={() => onChoose('pt')} />
      </div>
      {busy && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 14 }}><Spinner size="sm" /></div>
      )}
    </Modal>
  );
}
