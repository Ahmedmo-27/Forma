import { useEffect, useState } from 'react';
import { Input, Select, Textarea } from './ui';
import { useTenant } from '../context/TenantContext';
import { listLocations } from '../api/endpoints';

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
  locationScope: 'all',
  eligibleLocationIds: [],
};

export function packageToForm(pkg) {
  const ids = (pkg?.eligibleLocationIds || []).map((loc) => String(loc?._id || loc));
  return {
    name: pkg.name || '',
    activityType: pkg.activityType || 'gym',
    duration: pkg.duration || '1 month',
    price: String(pkg.price ?? ''),
    freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
    invitationLimit: String(pkg.invitationLimit ?? 0),
    renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
    description: pkg.description ?? '',
    locationScope: pkg.locationScope === 'branches' ? 'branches' : 'all',
    eligibleLocationIds: ids,
  };
}

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

  if (form.locationScope === 'branches' && !(form.eligibleLocationIds || []).length) {
    e.eligibleLocationIds = 'Select at least one branch';
  }

  return e;
}

export function packageFormToPayload(form) {
  const locationScope = form.locationScope === 'branches' ? 'branches' : 'all';
  return {
    name: form.name.trim(),
    activityType: form.activityType,
    duration: form.duration,
    price: Number(form.price),
    freezeLimitDays: Number(form.freezeLimitDays),
    invitationLimit: Number(form.invitationLimit),
    renewalDiscountPercent: Number(form.renewalDiscountPercent),
    description: form.description.trim() || null,
    locationScope,
    eligibleLocationIds: locationScope === 'branches' ? (form.eligibleLocationIds || []) : [],
  };
}

export function packageEligibilityLabel(pkg) {
  if (!pkg || pkg.locationScope !== 'branches') return 'All branches';
  const names = (pkg.eligibleLocationIds || [])
    .map((loc) => loc?.name || loc?.locationId || null)
    .filter(Boolean);
  if (!names.length) return 'Selected branches';
  if (names.length === 1) return names[0];
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

export default function PackageForm({ form, onChange, errors }) {
  const set = (k, v) => onChange({ ...form, [k]: v });
  const [locations, setLocations] = useState([]);
  let activities = ACTIVITY_TYPES;
  let currency = 'EGP';
  try {
    const tenantCtx = useTenant();
    if (tenantCtx?.enabledActivities?.length) activities = tenantCtx.enabledActivities;
    if (tenantCtx?.currency) currency = tenantCtx.currency;
  } catch {
    // fallback if outside TenantProvider
  }

  useEffect(() => {
    let cancelled = false;
    listLocations()
      .then((res) => {
        if (!cancelled) setLocations(res.data?.locations || []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleLocation = (id, checked) => {
    const setIds = new Set(form.eligibleLocationIds || []);
    if (checked) setIds.add(id);
    else setIds.delete(id);
    onChange({
      ...form,
      locationScope: 'branches',
      eligibleLocationIds: [...setIds],
    });
  };

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

      <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 8 }}>
          Branch eligibility
        </div>
        <Select
          label="Available at"
          value={form.locationScope || 'all'}
          error={errors?.eligibleLocationIds}
          onChange={(e) => {
            const locationScope = e.target.value === 'branches' ? 'branches' : 'all';
            onChange({
              ...form,
              locationScope,
              eligibleLocationIds: locationScope === 'all' ? [] : (form.eligibleLocationIds || []),
            });
          }}
        >
          <option value="all">All branches</option>
          <option value="branches">Selected branches only</option>
        </Select>
        {form.locationScope === 'branches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {locations.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
                No locations yet. Add branches in Settings → Locations.
              </p>
            )}
            {locations.map((loc) => {
              const id = String(loc._id);
              const checked = (form.eligibleLocationIds || []).includes(id);
              return (
                <label
                  key={id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: checked ? 'color-mix(in srgb, var(--navy) 6%, var(--card))' : 'var(--card)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleLocation(id, e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{loc.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{loc.locationId}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
