import { DoorOpen, Dumbbell, Flame, PersonStanding, Swords, Target, Zap } from 'lucide-react';
import { Modal, Spinner, CAIRO_ZONE } from './ui';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';

const ACTIVITY_ICONS = {
  gym: DoorOpen,
  crossfit: Flame,
  box: Target,
  mma: Swords,
  kickboxing: Zap,
  calisthenics: PersonStanding,
  pt: Dumbbell,
};

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

function activityTitle(t, activityType) {
  if (activityType === 'gym') return t('Regular gym');
  if (activityType === 'pt') return t('PT session');
  return t(activityType);
}

function promptMessage(t, prompt) {
  const packages = prompt?.packages || prompt?.member?.packages || [];
  const hasPt = Array.isArray(prompt?.options)
    ? prompt.options.includes('pt')
    : Number(prompt?.member?.ptSessionsLeft) > 0;
  if (packages.length > 1 && hasPt) {
    return t('This member has multiple active packages and PT sessions. Ask them what they are attending today, then pick one.');
  }
  if (packages.length > 1) {
    return t('This member has more than one active package. Ask them what they are attending today, then pick one.');
  }
  if (packages.length >= 1 && hasPt) {
    return t('This member has both a membership package and PT sessions. Ask them what they are attending today, then pick one.');
  }
  return t('This member has more than one active package. Ask them what they are attending today, then pick one.');
}

/**
 * Shown when a member has more than one active check-in choice
 * (multiple package categories and/or PT). `onChoose` receives the option key.
 */
export default function CheckInTypeModal({ prompt, busy = false, onChoose, onClose }) {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  const member = prompt?.member || {};
  const packages = prompt?.packages || member.packages || [];
  const options = Array.isArray(prompt?.options) && prompt.options.length
    ? prompt.options
    : [
      ...packages.map((pkg) => pkg.activityType),
      ...(member.ptSessionsLeft > 0 ? ['pt'] : []),
    ];
  const packageByType = Object.fromEntries(
    packages.map((pkg) => [pkg.activityType, pkg]),
  );
  const sessionsLeft = member.ptSessionsLeft ?? 0;

  const choices = options.map((key) => {
    if (key === 'pt') {
      return {
        key: 'pt',
        icon: ACTIVITY_ICONS.pt,
        title: activityTitle(t, 'pt'),
        lines: [
          member.ptSessionsLeft === 1
            ? t('1 session left')
            : t('{count} sessions left', { count: sessionsLeft }),
          member.coachName ? t('Coach: {name}', { name: member.coachName }) : null,
          t('Uses 1 PT session'),
        ],
      };
    }
    const pkg = packageByType[key];
    const endsAt = pkg?.endsAt || (key === 'gym' ? member.gymEndsAt : null);
    const packageName = pkg?.packageName || (key === 'gym' ? member.gymPackage : null);
    const sessionBased = pkg?.accessType === 'sessions';
    const pkgSessionsLeft = sessionBased
      ? Math.max(0, Number(pkg.sessionsLeft ?? ((pkg.sessionLimit || 0) - (pkg.sessionsUsed || 0))))
      : null;
    const sessionLimit = sessionBased ? Math.max(0, Number(pkg.sessionLimit) || 0) : null;
    return {
      key,
      icon: ACTIVITY_ICONS[key] || DoorOpen,
      title: activityTitle(t, key),
      lines: [
        packageName || null,
        sessionBased && sessionLimit != null
          ? t('{left} out of {total} sessions', { left: pkgSessionsLeft, total: sessionLimit })
          : null,
        endsAt
          ? t('Active until {date}', {
            date: fmtDate(endsAt, {
              timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric',
            }),
          })
          : null,
      ],
    };
  });

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
        {promptMessage(t, prompt)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {choices.map((choice) => (
          <Choice
            key={choice.key}
            icon={choice.icon}
            title={choice.title}
            lines={choice.lines}
            disabled={busy}
            onClick={() => onChoose(choice.key)}
          />
        ))}
      </div>
      {busy && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 14 }}><Spinner size="sm" /></div>
      )}
    </Modal>
  );
}
