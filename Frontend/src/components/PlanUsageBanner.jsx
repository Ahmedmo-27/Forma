import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, TrendingUp, X } from 'lucide-react';
import { dismissKey, pickPlanNotice } from '../lib/planNotice';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';
import { tr } from '../i18n/translate';

const TONES = {
  danger: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '#DC2626' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', icon: '#D97706' },
};

const CAP_NOUNS = { members: tr('members'), staff: tr('staff accounts'), branches: tr('branches') };
const CAP_LIMITS = { members: 'maxMembers', staff: 'maxStaff', branches: 'maxBranches' };

/**
 * Arabic copy for the notices built in lib/planNotice.js. English keeps the
 * text from the library untouched; Arabic is rebuilt from the notice kind and
 * the tenant's own numbers so every sentence stays a single translatable key.
 */
function localizeNotice(notice, tenant, t, fmtDate, fmtNumber) {
  const { kind } = notice;
  if (kind === 'past_due') {
    const graceEndsAt = tenant?.dunning?.graceEndsAt;
    return graceEndsAt
      ? t('Your subscription payment is overdue. The workspace will be suspended on {date} unless payment is received.', { date: fmtDate(graceEndsAt) })
      : t('Your subscription payment is overdue. Renew now to avoid suspension.');
  }
  if (kind.startsWith('trial_')) {
    const days = Number(kind.slice('trial_'.length));
    if (days === 0) return t('Your free trial ends today. Choose a plan to keep access to your members and data.');
    if (days === 1) return t('Your free trial ends in 1 day. Choose a plan to keep access to your members and data.');
    if (days === 2) return t('Your free trial ends in 2 days. Choose a plan to keep access to your members and data.');
    return t('Your free trial ends in {count} days. Choose a plan to keep access to your members and data.', { count: fmtNumber(days) });
  }
  const match = /^cap_(over|full|near)_([a-z]+)/.exec(kind);
  if (match && CAP_NOUNS[match[2]]) {
    const key = match[2];
    const limits = tenant?.limits || tenant?.effectiveLimits || {};
    const max = Number(limits[CAP_LIMITS[key]]);
    const used = Number(tenant?.usage?.[key]) || 0;
    const noun = t(CAP_NOUNS[key]);
    if (match[1] === 'over') {
      return t('You have {used} {noun} but your plan allows {max}. You can\'t add more until you remove {extra} or upgrade.', {
        used: fmtNumber(used), noun, max: fmtNumber(max), extra: fmtNumber(used - max),
      });
    }
    if (match[1] === 'full') {
      return t('You have used all {max} {noun} on your plan. Upgrade to add more.', { max: fmtNumber(max), noun });
    }
    return t('You are using {used} of {max} {noun} on your plan ({percent}%). Upgrade before you hit the limit.', {
      used: fmtNumber(used), max: fmtNumber(max), noun, percent: fmtNumber(Math.round((used / max) * 100)),
    });
  }
  return notice.text;
}
/** Trial, overdue, and near-cap prompts for owners and general managers. */
export default function PlanUsageBanner({ tenant, user }) {
  const { t, lang } = useI18n();
  const { fmtDate, fmtNumber } = useFormat();
  const notice = useMemo(() => pickPlanNotice(tenant), [tenant]);
  const tenantId = tenant?.id || tenant?._id || 'tenant';
  const [dismissed, setDismissed] = useState(() => new Set());

  const canAct = user?.role === 'Owner' || user?.role === 'General Manager';
  if (!notice || !canAct || user?.isImpersonation) return null;

  const key = dismissKey(tenantId, notice.kind);
  const isDismissed = dismissed.has(key) || (() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  })();
  if (isDismissed) return null;

  const tone = TONES[notice.tone] || TONES.warning;
  const Icon = notice.kind.startsWith('cap_near') ? TrendingUp : AlertTriangle;
  const dismiss = () => {
    try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
    setDismissed((prev) => new Set(prev).add(key));
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        background: tone.bg, borderBottom: `1px solid ${tone.border}`, color: tone.text, fontSize: 13,
      }}
    >
      <Icon size={16} color={tone.icon} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{lang === 'ar' ? localizeNotice(notice, tenant, t, fmtDate, fmtNumber) : notice.text}</span>
      {user?.role === 'Owner' && (
        <Link
          to="/owner/settings?tab=plan"
          style={{ fontWeight: 700, color: tone.text, textDecoration: 'underline', whiteSpace: 'nowrap' }}
        >
          {t(notice.cta)}
        </Link>
      )}
      {notice.kind !== 'past_due' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Dismiss for today')}
          style={{ background: 'none', border: 'none', color: tone.text, cursor: 'pointer', padding: 4, display: 'inline-flex' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
