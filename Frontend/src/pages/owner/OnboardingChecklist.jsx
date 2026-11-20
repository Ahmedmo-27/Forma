import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { Card } from '../../components/ui';
import { getTenantOnboarding, updateTenantMe } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';

const STEPS = {
  branding: { title: tr('Add your logo and gym name'), to: '/owner/settings?tab=branding' },
  packages: { title: tr('Create your membership packages'), to: '/sales/packages' },
  first_member: { title: tr('Add or import your first member'), to: '/members' },
  first_membership: { title: tr('Sell your first membership'), to: '/members' },
  invite_staff: { title: tr('Invite your team'), to: '/sales/staff' },
  whatsapp: { title: tr('Connect WhatsApp for reminders'), to: '/owner/settings?tab=whatsapp' },
  billing_profile: { title: tr('Add the legal details printed on your invoices'), to: '/owner/settings?tab=billing' },
};

/** Setup checklist on the owner dashboard. Hidden once complete or dismissed. */
export default function OnboardingChecklist({ user }) {
  const { t } = useI18n();
  const [checklist, setChecklist] = useState(null);
  const [hidden, setHidden] = useState(false);
  const isOwner = user?.role === 'Owner' && !user?.isImpersonation;

  useEffect(() => {
    if (!isOwner) return undefined;
    let active = true;
    getTenantOnboarding()
      .then((res) => { if (active) setChecklist(res.data); })
      .catch(() => { /* the dashboard works without the checklist */ });
    return () => { active = false; };
  }, [isOwner]);

  if (!isOwner || hidden || !checklist || checklist.allDone || checklist.dismissedAt) return null;

  const dismiss = async () => {
    setHidden(true);
    try {
      await updateTenantMe({ onboarding: { dismissed: true } });
    } catch {
      setHidden(false);
      toast.error(t('Could not hide the checklist. Try again.'));
    }
  };

  const percent = Math.round((checklist.completed / checklist.total) * 100);

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>{t('Finish setting up your gym')}</div>
          <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 2 }}>
            {t('{completed} of {total} done. Each step ticks itself off as you go.', { completed: checklist.completed, total: checklist.total })}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Hide setup checklist')}
          title={t('Hide setup checklist')}
          style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
        >
          <X size={16} />
        </button>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${percent}%`, background: 'var(--green, #16A34A)' }} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {checklist.steps.map((step) => {
          const meta = STEPS[step.key];
          if (!meta) return null;
          const Icon = step.done ? CheckCircle2 : Circle;
          return (
            <li key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <Icon size={16} color={step.done ? 'var(--green, #16A34A)' : 'var(--t4)'} aria-hidden="true" style={{ flexShrink: 0 }} />
              {step.done ? (
                <span style={{ color: 'var(--t4)', textDecoration: 'line-through' }}>{t(meta.title)}</span>
              ) : (
                <Link to={meta.to} style={{ color: 'var(--t1)', fontWeight: 600 }}>{t(meta.title)}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
