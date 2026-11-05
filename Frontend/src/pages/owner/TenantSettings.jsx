import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import usePageTitle from '../../hooks/usePageTitle';
import { useTenant } from '../../context/TenantContext';
import { updateTenantMe, uploadTenantLogo } from '../../api/endpoints';
import {
  PageHeader, Card, CardHeader, Input, Select, Btn, Spinner,
} from '../../components/ui';
import LifetimeCheckoutModal from '../../components/billing/LifetimeCheckoutModal';
import LifetimeUpgradeModal from '../../components/billing/LifetimeUpgradeModal';

const KNOWN_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];

export default function TenantSettings() {
  usePageTitle('Gym Settings');
  const { tenant, refreshTenant, loading: tenantLoading } = useTenant();

  const [activeTab, setActiveTab] = useState('branding');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  // Form states initialized from tenant
  const [displayName, setDisplayName] = useState('');
  const [palette, setPalette] = useState({
    primary: '#44298C',
    secondary: '#5B38BA',
    accent: '#44298C',
    background: '#F4F5F7',
    text: '#111827',
  });
  const [currency, setCurrency] = useState('EGP');
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [language, setLanguage] = useState('en');
  const [activities, setActivities] = useState(KNOWN_ACTIVITIES);
  const [customActivity, setCustomActivity] = useState('');

  // WhatsApp
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waAccountId, setWaAccountId] = useState('');
  const [waToken, setWaToken] = useState('');

  useEffect(() => {
    if (tenant?.settings) {
      setDisplayName(tenant.settings.branding?.displayName || tenant.name || '');
      if (tenant.settings.branding?.palette) {
        setPalette(prev => ({ ...prev, ...tenant.settings.branding.palette }));
      }
      if (tenant.settings.locale) {
        setCurrency(tenant.settings.locale.currency || 'EGP');
        setTimezone(tenant.settings.locale.timezone || 'Africa/Cairo');
        setLanguage(tenant.settings.locale.language || 'en');
      }
      if (tenant.settings.enabledActivities?.length > 0) {
        setActivities(tenant.settings.enabledActivities);
      }
      if (tenant.settings.whatsapp) {
        setWaPhoneId(tenant.settings.whatsapp.phoneNumberId || '');
        setWaAccountId(tenant.settings.whatsapp.businessAccountId || '');
      }
    }
  }, [tenant]);

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = {
        settings: {
          branding: {
            displayName,
            palette,
          },
          locale: {
            currency,
            timezone,
            language,
          },
          enabledActivities: activities,
        },
      };

      if (waPhoneId || waAccountId || waToken) {
        payload.settings.whatsapp = {
          phoneNumberId: waPhoneId,
          businessAccountId: waAccountId,
        };
        if (waToken) {
          payload.settings.whatsapp.accessToken = waToken;
        }
      }

      await updateTenantMe(payload);
      toast.success('Gym settings saved successfully!');
      await refreshTenant();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update gym settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('logo', file);
    setUploadingLogo(true);
    try {
      await uploadTenantLogo(fd);
      toast.success('Logo uploaded successfully!');
      await refreshTenant();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const toggleActivity = (act) => {
    if (activities.includes(act)) {
      if (activities.length === 1) {
        toast.error('At least one activity must be enabled');
        return;
      }
      setActivities(activities.filter(a => a !== act));
    } else {
      setActivities([...activities, act]);
    }
  };

  const addCustomActivity = () => {
    const trimmed = customActivity.trim().toLowerCase();
    if (!trimmed) return;
    if (activities.includes(trimmed)) {
      toast.error('Activity already exists');
      return;
    }
    setActivities([...activities, trimmed]);
    setCustomActivity('');
  };

  if (tenantLoading && !tenant) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Spinner size="lg" />
        </div>
      </Layout>
    );
  }

  const logoKey = tenant?.settings?.branding?.logoKey;
  const logoUrl = logoKey ? `/uploads/${encodeURIComponent(logoKey)}` : '/leap-logo.svg';

  const plan = tenant?.plan;
  const usage = tenant?.usage || {};
  const limits = tenant?.effectiveLimits || {};

  return (
    <Layout>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader
          title="Gym & Tenant Settings"
          sub="Manage your gym's brand identity, locale, offerings, credentials, and plan"
          action={
            <Btn variant="primary" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : 'Save Settings'}
            </Btn>
          }
        />

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5E7EB', marginBottom: 24 }}>
          {[
            { id: 'branding', label: 'Branding & Palette' },
            { id: 'locale', label: 'Locale & Activities' },
            { id: 'whatsapp', label: 'WhatsApp API' },
            { id: 'plan', label: 'Plan & Usage' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? 'var(--navy)' : '#6B7280',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--navy)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'all 0.15s ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Branding */}
        {activeTab === 'branding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader title="Gym Brand Identity" sub="Customize the name and logo that appear across your workspace" />
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 16 }}>
                <div style={{
                  width: 90, height: 90, borderRadius: 16,
                  border: '1px solid #E5E7EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: palette.background || '#F4F5F7',
                  overflow: 'hidden', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  <img src={logoUrl} alt="Logo" style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Upload New Logo (PNG, SVG, JPG, WebP)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    style={{ fontSize: 13 }}
                  />
                  {uploadingLogo && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--navy)' }}>Uploading…</span>}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Input
                  label="Gym Display Name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Flame Factory / Leap Fitness"
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Theme Palette & Live Preview" sub="Colors dynamically injected into CSS variables on client load" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
                {[
                  { key: 'primary', label: 'Primary Brand' },
                  { key: 'secondary', label: 'Secondary / Sub-nav' },
                  { key: 'accent', label: 'Accent Highlight' },
                  { key: 'background', label: 'Page Background' },
                  { key: 'text', label: 'Primary Text' },
                ].map(c => (
                  <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>{c.label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        value={palette[c.key]}
                        onChange={e => setPalette(p => ({ ...p, [c.key]: e.target.value }))}
                        style={{ width: 40, height: 36, border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                      />
                      <input
                        type="text"
                        value={palette[c.key]}
                        onChange={e => setPalette(p => ({ ...p, [c.key]: e.target.value }))}
                        style={{ width: 90, padding: '7px 8px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Preview Box */}
              <div style={{
                marginTop: 24,
                padding: 20,
                borderRadius: 12,
                background: palette.background,
                border: '1px solid #E5E7EB',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 12 }}>
                  Live Preview Container
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: palette.primary, color: '#FFFFFF',
                    fontWeight: 700, fontSize: 13,
                  }}>
                    {displayName || 'Gym Primary Button'}
                  </div>
                  <div style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: palette.secondary, color: '#FFFFFF',
                    fontWeight: 600, fontSize: 13,
                  }}>
                    Secondary Action
                  </div>
                  <span style={{ color: palette.text, fontSize: 14, fontWeight: 500 }}>
                    Sample Body Text rendered in selected color
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 2: Locale & Activities */}
        {activeTab === 'locale' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader title="Regional & Locale Settings" sub="Controls currency symbols, timezone dates, and system formatting" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                <Select label="Currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD'].map(cur => (
                    <option key={cur} value={cur}>{cur}</option>
                  ))}
                </Select>

                <Select label="Timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {[
                    'Africa/Cairo',
                    'Asia/Riyadh',
                    'Asia/Dubai',
                    'UTC',
                    'Europe/London',
                    'Europe/Paris',
                    'America/New_York',
                  ].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </Select>

                <Select label="Language" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="en">English (US)</option>
                  <option value="ar">العربية (Arabic)</option>
                </Select>
              </div>
            </Card>

            <Card>
              <CardHeader title="Enabled Activity Offerings" sub="Define which workout and class types are available when configuring packages" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                {Array.from(new Set([...KNOWN_ACTIVITIES, ...activities])).map(act => {
                  const active = activities.includes(act);
                  return (
                    <button
                      key={act}
                      type="button"
                      onClick={() => toggleActivity(act)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        background: active ? 'var(--navy)' : '#F3F4F6',
                        color: active ? '#FFFFFF' : '#4B5563',
                        border: active ? '1px solid var(--navy)' : '1px solid #E5E7EB',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textTransform: 'capitalize',
                      }}
                    >
                      <span>{act}</span>
                      {active ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, maxWidth: 360 }}>
                <Input
                  value={customActivity}
                  onChange={e => setCustomActivity(e.target.value)}
                  placeholder="Add custom activity (e.g. Pilates)"
                />
                <Btn variant="outline" type="button" onClick={addCustomActivity}>
                  Add
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 3: WhatsApp */}
        {activeTab === 'whatsapp' && (
          <Card>
            <CardHeader
              title="WhatsApp Cloud API Credentials"
              sub="Secrets are stored encrypted at rest with AES-256-GCM. Never shared with unauthorized roles."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              <Input
                label="WhatsApp Phone Number ID"
                value={waPhoneId}
                onChange={e => setWaPhoneId(e.target.value)}
                placeholder="e.g. 104829104812391"
              />
              <Input
                label="WhatsApp Business Account ID (WABA ID)"
                value={waAccountId}
                onChange={e => setWaAccountId(e.target.value)}
                placeholder="e.g. 981249120491823"
              />
              <Input
                label="Permanent System User Access Token"
                type="password"
                value={waToken}
                onChange={e => setWaToken(e.target.value)}
                placeholder="Enter new token (write-only, leave blank to keep unchanged)"
                hint="Your token is masked and securely encrypted on write"
              />
            </div>
          </Card>
        )}

        {/* Tab 4: Plan & Usage */}
        {activeTab === 'plan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                      Subscription Details
                    </h3>
                    {tenant?.billing?.isLifetime && (
                      <span
                        style={{
                          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                          color: '#FFFFFF',
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 20,
                          letterSpacing: '0.05em',
                          boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)',
                        }}
                      >
                        ★ LIFETIME LICENSE
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                    Current Plan: <strong>{plan?.name || 'Standard Plan'}</strong>
                    {tenant?.billing?.isLifetime
                      ? ' • Perpetual License (No renewal required)'
                      : ` • Billing Cycle: ${tenant?.billing?.cycle || 'Monthly'}`}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {tenant?.billing?.isLifetime ? (
                    plan?.key !== 'platinum' && (
                      <Btn variant="primary" onClick={() => setIsUpgradeOpen(true)}>
                        Upgrade Lifetime Tier
                      </Btn>
                    )
                  ) : (
                    <Btn
                      variant="primary"
                      onClick={() => setIsCheckoutOpen(true)}
                      style={{ background: 'linear-gradient(135deg, #44298C 0%, #6D47CC 100%)' }}
                    >
                      Buy Lifetime License
                    </Btn>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>STATUS</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', marginTop: 4 }}>
                    {tenant?.status || 'Active'}
                  </div>
                </div>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>PLAN TIER</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', textTransform: 'capitalize', marginTop: 4 }}>
                    {plan?.key || 'Platinum'}
                  </div>
                </div>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                    {tenant?.billing?.isLifetime ? 'ENTITLEMENT POLICY' : 'RENEWAL / EXPIRY'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                    {tenant?.billing?.isLifetime
                      ? (tenant.billing?.lifetime?.entitlementPolicy === 'snapshot' ? 'Frozen Snapshot' : 'Follow Tier Updates')
                      : (tenant?.currentPeriodEnd ? new Date(tenant.currentPeriodEnd).toLocaleDateString() : 'Never')}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Plan Quotas & Fair-Use Meters" sub="Track your active usage against subscription allocations" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginTop: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    <span>Active Members</span>
                    <span>{usage.members ?? 0} / {limits.maxMembers ?? '∞'}</span>
                  </div>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: 'var(--navy)',
                      width: `${Math.min(100, ((usage.members || 0) / (limits.maxMembers || 100)) * 100)}%`,
                    }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    <span>Staff Users</span>
                    <span>{usage.staff ?? 0} / {limits.maxStaff ?? '∞'}</span>
                  </div>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: 'var(--navy-2)',
                      width: `${Math.min(100, ((usage.staff || 0) / (limits.maxStaff || 10)) * 100)}%`,
                    }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    <span>Storage Capacity</span>
                    <span>{usage.storageGb ?? 0.5} GB / {limits.storageGb ?? 25} GB</span>
                  </div>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: '#0284C7',
                      width: `${Math.min(100, ((usage.storageGb || 0.5) / (limits.storageGb || 25)) * 100)}%`,
                    }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    <span>WhatsApp Messages (Monthly)</span>
                    <span>{usage.whatsappMonthlyMessages ?? 0} / {limits.whatsappMonthlyMessages ?? 2000}</span>
                  </div>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: '#16A34A',
                      width: `${Math.min(100, ((usage.whatsappMonthlyMessages || 0) / (limits.whatsappMonthlyMessages || 2000)) * 100)}%`,
                    }} />
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Active Features Matrix" sub="Features unlocked by your plan and overrides" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {tenant?.effectiveFeatures?.map(feat => (
                  <span
                    key={feat}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'rgba(22, 163, 74, 0.1)',
                      color: '#15803D',
                      border: '1px solid rgba(22, 163, 74, 0.25)',
                    }}
                  >
                    ✓ {feat}
                  </span>
                ))}
              </div>
            </Card>

            {/* Modals */}
            <LifetimeCheckoutModal
              isOpen={isCheckoutOpen}
              onClose={() => setIsCheckoutOpen(false)}
              defaultPlanKey={plan?.key || 'gold'}
              onSuccess={() => {
                refreshTenant();
                setIsCheckoutOpen(false);
              }}
            />

            <LifetimeUpgradeModal
              isOpen={isUpgradeOpen}
              onClose={() => setIsUpgradeOpen(false)}
              currentPlanKey={plan?.key || 'basic'}
              currentAmountPaid={tenant?.billing?.lifetime?.amountPaid || 0}
              onSuccess={() => {
                refreshTenant();
                setIsUpgradeOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
