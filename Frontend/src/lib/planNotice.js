/** Plan prompts shown in the tenant app: overdue payment, trial ending, caps nearly used. */
const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_RATIO = 0.8;
const CAPS = [
  { key: 'members', limit: 'maxMembers', noun: 'members' },
  { key: 'staff', limit: 'maxStaff', noun: 'staff accounts' },
  { key: 'branches', limit: 'maxBranches', noun: 'branches' },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function dismissKey(tenantId, kind) {
  return `ff_plan_banner:${tenantId}:${kind}:${todayKey()}`;
}

/** The single most urgent plan message for this gym, or null. */
export function pickPlanNotice(tenant, now = new Date()) {
  if (!tenant || tenant.billing?.isLifetime) return null;

  if (tenant.status === 'past_due') {
    const graceEndsAt = tenant.dunning?.graceEndsAt ? new Date(tenant.dunning.graceEndsAt) : null;
    return {
      kind: 'past_due',
      tone: 'danger',
      text: graceEndsAt
        ? `Your subscription payment is overdue. The workspace will be suspended on ${graceEndsAt.toLocaleDateString()} unless payment is received.`
        : 'Your subscription payment is overdue. Renew now to avoid suspension.',
      cta: 'Renew plan',
    };
  }

  if (tenant.status === 'trial' && tenant.trialEndsAt) {
    const daysLeft = Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / DAY_MS);
    if (daysLeft >= 0 && daysLeft <= 7) {
      return {
        kind: `trial_${daysLeft}`,
        tone: daysLeft <= 1 ? 'danger' : 'warning',
        text: daysLeft === 0
          ? 'Your free trial ends today. Choose a plan to keep access to your members and data.'
          : `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Choose a plan to keep access to your members and data.`,
        cta: 'Choose a plan',
      };
    }
  }

  const usage = tenant.usage || {};
  const limits = tenant.limits || tenant.effectiveLimits || {};
  let worst = null;
  for (const cap of CAPS) {
    const max = Number(limits[cap.limit]);
    const used = Number(usage[cap.key]) || 0;
    if (!Number.isFinite(max) || max <= 0) continue;
    const ratio = used / max;
    if (ratio >= WARN_RATIO && (!worst || ratio > worst.ratio)) worst = { ...cap, used, max, ratio };
  }
  if (!worst) return null;

  if (worst.used > worst.max) {
    return {
      kind: `cap_over_${worst.key}`,
      tone: 'danger',
      text: `You have ${worst.used} ${worst.noun} but your plan allows ${worst.max}. You can't add more until you remove ${worst.used - worst.max} or upgrade.`,
      cta: 'Upgrade plan',
    };
  }
  if (worst.ratio >= 1) {
    return {
      kind: `cap_full_${worst.key}`,
      tone: 'danger',
      text: `You have used all ${worst.max} ${worst.noun} on your plan. Upgrade to add more.`,
      cta: 'Upgrade plan',
    };
  }
  return {
    kind: `cap_near_${worst.key}_${worst.ratio >= 0.95 ? 95 : 80}`,
    tone: 'warning',
    text: `You are using ${worst.used} of ${worst.max} ${worst.noun} on your plan (${Math.round(worst.ratio * 100)}%). Upgrade before you hit the limit.`,
    cta: 'See plans',
  };
}
