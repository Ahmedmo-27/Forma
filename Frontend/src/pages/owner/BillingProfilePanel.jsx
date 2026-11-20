import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { updateTenantMe } from '../../api/endpoints';
import { Card, CardHeader, Input, Textarea, Btn, Spinner } from '../../components/ui';
import { isValidEmail } from '../../lib/validation';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

const CONTRACT_TERMS_MAX = 20000;

const EMPTY_PROFILE = {
  legalName: '',
  taxNumber: '',
  commercialRegistration: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'Egypt',
  billingEmail: '',
  phone: '',
};

const FIELD_LIMITS = {
  legalName: 160,
  taxNumber: 40,
  commercialRegistration: 40,
  addressLine1: 200,
  addressLine2: 200,
  city: 80,
  region: 80,
  postalCode: 20,
  country: 80,
  billingEmail: 160,
  phone: 30,
};

function profileFrom(tenant) {
  const source = tenant?.billingProfile || {};
  return Object.fromEntries(
    Object.keys(EMPTY_PROFILE).map((key) => [key, source[key] ?? EMPTY_PROFILE[key] ?? ''])
  );
}

/**
 * Owner-only billing identity printed on Forma invoices, plus the weekly
 * owner digest email preference.
 */
export default function BillingProfilePanel({ tenant, isOwner, onSaved }) {
  const { t } = useI18n();
  const { fmtNumber, fmtDate } = useFormat();
  const [profile, setProfile] = useState(() => profileFrom(tenant));
  const [weeklyDigest, setWeeklyDigest] = useState(tenant?.settings?.notifications?.weeklyDigest !== false);
  const [contractTerms, setContractTerms] = useState(tenant?.settings?.contractTerms || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfile(profileFrom(tenant));
    setWeeklyDigest(tenant?.settings?.notifications?.weeklyDigest !== false);
    setContractTerms(tenant?.settings?.contractTerms || '');
  }, [tenant]);

  const setField = (key) => (e) => setProfile((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async (e) => {
    e?.preventDefault();
    const trimmed = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, String(v || '').trim()]));
    const tooLong = Object.entries(trimmed).find(([k, v]) => v.length > FIELD_LIMITS[k]);
    if (tooLong) {
      toast.error(t('That value is too long (maximum {max} characters)', { max: FIELD_LIMITS[tooLong[0]] }));
      return;
    }
    if (trimmed.billingEmail && !isValidEmail(trimmed.billingEmail)) {
      toast.error(t('Enter a valid billing email'));
      return;
    }
    if (contractTerms.length > CONTRACT_TERMS_MAX) {
      toast.error(t('Contract terms must be under {max} characters', { max: fmtNumber(CONTRACT_TERMS_MAX) }));
      return;
    }

    setSaving(true);
    try {
      const payload = { notifications: { weeklyDigest } };
      if (isOwner) {
        payload.contractTerms = contractTerms.trim();
        payload.billingProfile = Object.fromEntries(
          Object.entries(trimmed).map(([k, v]) => [k, v || null])
        );
      }
      const res = await updateTenantMe(payload);
      toast.success(t('Billing and report settings saved'));
      onSaved?.(res.data?.tenant);
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || t('Could not save billing settings'));
      }
    } finally {
      setSaving(false);
    }
  };

  const updatedAt = tenant?.billingProfile?.updatedAt;

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardHeader
          title={t('Billing profile')}
          sub={t('Printed on your Forma subscription invoices. Use your registered company details so invoices are valid for tax.')}
        />
        {!isOwner && (
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 12 }}>
            {t('Only the gym owner can change these details.')}
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
          <Input label={t('Legal company name')} value={profile.legalName} onChange={setField('legalName')} disabled={!isOwner} placeholder={t('e.g. Iron Fitness LLC')} />
          <Input label={t('Tax registration number')} value={profile.taxNumber} onChange={setField('taxNumber')} disabled={!isOwner} placeholder={t('e.g. 123-456-789')} />
          <Input label={t('Commercial registration')} value={profile.commercialRegistration} onChange={setField('commercialRegistration')} disabled={!isOwner} />
          <Input label={t('Billing email')} type="email" value={profile.billingEmail} onChange={setField('billingEmail')} disabled={!isOwner} hint={t("Invoices go here. Leave empty to use the owner's email.")} />
          <Input label={t('Phone')} value={profile.phone} onChange={setField('phone')} disabled={!isOwner} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
          <Input label={t('Address line 1')} value={profile.addressLine1} onChange={setField('addressLine1')} disabled={!isOwner} />
          <Input label={t('Address line 2')} value={profile.addressLine2} onChange={setField('addressLine2')} disabled={!isOwner} />
          <Input label={t('City')} value={profile.city} onChange={setField('city')} disabled={!isOwner} />
          <Input label={t('Governorate / region')} value={profile.region} onChange={setField('region')} disabled={!isOwner} />
          <Input label={t('Postal code')} value={profile.postalCode} onChange={setField('postalCode')} disabled={!isOwner} />
          <Input label={t('Country')} value={profile.country} onChange={setField('country')} disabled={!isOwner} />
        </div>
        {updatedAt && (
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
            {t('Last updated {date}. Invoices already issued keep the details they were issued with.', { date: fmtDate(updatedAt) })}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t('Membership contract terms')}
          sub={t('Shown to members when they sign a membership at the desk. Each signed contract keeps the exact wording it was signed with.')}
        />
        <div style={{ marginTop: 16 }}>
          <Textarea
            value={contractTerms}
            onChange={(e) => setContractTerms(e.target.value)}
            disabled={!isOwner}
            rows={8}
            maxLength={CONTRACT_TERMS_MAX}
            placeholder={t('e.g. Memberships are personal and non-transferable. Freezes must be requested in advance…')}
          />
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>
            {t('{count} / {max} characters', { count: fmtNumber(contractTerms.length), max: fmtNumber(CONTRACT_TERMS_MAX) })}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Owner reports')} sub={t("A summary of your gym's week, emailed to the owner.")} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={weeklyDigest}
            onChange={(e) => setWeeklyDigest(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{t('Weekly digest email')}</span>
            <span style={{ display: 'block', fontSize: 13, color: '#6B7280' }}>
              {t('Sent Monday morning: revenue, new members, check-ins, renewals, and memberships ending soon.')}
            </span>
          </span>
        </label>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" type="submit" disabled={saving}>
          {saving ? <><Spinner size="sm" /> {t('Saving…')}</> : t('Save billing & reports')}
        </Btn>
      </div>
    </form>
  );
}
