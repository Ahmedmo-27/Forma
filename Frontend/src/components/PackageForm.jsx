import { Input, Select, Textarea } from './ui';
import { useTenant } from '../context/TenantContext';

export const ACTIVITY_TYPES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
export const DURATIONS = ['1 month', '3 months', '6 months', '1 year'];

export const EMPTY_PACKAGE_FORM = {
  name: '',
  activityType: 'gym',
  duration: '1 month',
  price: '',
  freezeLimitDays: '0',
  invitationLimit: '0',
  renewalDiscountPercent: '0',
  description: '',
};

export function validatePackageForm(form) {
  const e = {};
  const nameTrim = form.name?.trim() || '';
  if (!nameTrim) {
    e.name = 'Name is required';
  } else if (nameTrim.length > 120) {
    e.name = 'Name must not exceed 120 characters';
  }

  const p = Number(form.price);
  if (form.price === '' || form.price === null || form.price === undefined || isNaN(p) || p <= 0) {
    e.price = 'Price must be greater than 0';
  }

  const freeze = Number(form.freezeLimitDays);
  if (form.freezeLimitDays !== '' && form.freezeLimitDays !== null && form.freezeLimitDays !== undefined) {
    if (isNaN(freeze) || !Number.isInteger(freeze) || freeze < 0) {
      e.freezeLimitDays = 'Must be a non-negative integer';
    }
  }

  const inv = Number(form.invitationLimit);
  if (form.invitationLimit !== '' && form.invitationLimit !== null && form.invitationLimit !== undefined) {
    if (isNaN(inv) || !Number.isInteger(inv) || inv < 0) {
      e.invitationLimit = 'Must be a non-negative integer';
    }
  }

  const d = Number(form.renewalDiscountPercent);
  if (form.renewalDiscountPercent !== '' && form.renewalDiscountPercent !== null && form.renewalDiscountPercent !== undefined) {
    if (isNaN(d) || d < 0 || d > 100) {
      e.renewalDiscountPercent = 'Must be 0–100';
    }
  }

  if (form.description && form.description.trim().length > 1000) {
    e.description = 'Description must not exceed 1000 characters';
  }

  return e;
}

export function packageFormToPayload(form) {
  return {
    name: form.name.trim(),
    activityType: form.activityType,
    duration: form.duration,
    price: Number(form.price),
    freezeLimitDays: Number(form.freezeLimitDays),
    invitationLimit: Number(form.invitationLimit),
    renewalDiscountPercent: Number(form.renewalDiscountPercent),
    description: form.description.trim() || null,
  };
}

export default function PackageForm({ form, onChange, errors }) {
  const set = (k, v) => onChange({ ...form, [k]: v });
  let activities = ACTIVITY_TYPES;
  let currency = 'EGP';
  try {
    const tenantCtx = useTenant();
    if (tenantCtx?.enabledActivities?.length) activities = tenantCtx.enabledActivities;
    if (tenantCtx?.currency) currency = tenantCtx.currency;
  } catch {
    // fallback if outside TenantProvider
  }

  return (
    <div data-walkthrough="new-package-form" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Input
        label="Package Name *" value={form.name} error={errors.name}
        onChange={e => set('name', e.target.value)} placeholder="e.g. Gold Membership"
      />
      <div className="grid-2">
        <Select label="Activity Type" value={form.activityType} onChange={e => set('activityType', e.target.value)}>
          {activities.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select label="Duration *" value={form.duration} onChange={e => set('duration', e.target.value)}>
          {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
      </div>
      <Input
        label={`Price (${currency}) *`} type="number" min="0" value={form.price} error={errors.price}
        onChange={e => set('price', e.target.value)} placeholder="0"
      />
      <div className="grid-3">
        <Input
          label="Freeze Limit (days)" type="number" min="0"
          value={form.freezeLimitDays} error={errors.freezeLimitDays}
          onChange={e => set('freezeLimitDays', e.target.value)}
          hint="Max freeze days"
        />
        <Input
          label="Invitation Slots" type="number" min="0"
          value={form.invitationLimit} error={errors.invitationLimit}
          onChange={e => set('invitationLimit', e.target.value)}
        />
        <Input
          label="Renewal Discount %" type="number" min="0" max="100"
          value={form.renewalDiscountPercent} error={errors.renewalDiscountPercent}
          onChange={e => set('renewalDiscountPercent', e.target.value)}
        />
      </div>
      <Textarea
        label="Description" value={form.description} error={errors?.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Optional notes…" rows={3}
      />
    </div>
  );
}
