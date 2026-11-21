import { apiOrigin } from '../../api/axios';
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import usePageTitle from '../../hooks/usePageTitle';
import { useTenant } from '../../context/TenantContext';
import {
  updateTenantMe,
  uploadTenantLogo,
  getWhatsAppSession,
  startWhatsAppSession,
  logoutWhatsAppSession,
} from '../../api/endpoints';
import {
  PageHeader, Card, CardHeader, Input, Select, Btn, Spinner,
} from '../../components/ui';
import {
  
  normalizeHexColor,
  toColorPickerValue,
  validateFile,
  LOGO_EXTENSIONS,
  LOGO_ACCEPT,
  UPLOAD_INTAKE_MB,
} from '../../lib/validation';
import { Check, LayoutDashboard, Package, Plus, RefreshCw, Users } from 'lucide-react';
import { tr } from '../../i18n/translate';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
const KNOWN_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];

const DEFAULT_PALETTE = {
  navbar: '#142843',
  primary: '#142843',
  secondary: '#1E3A5F',
  accent: '#1E3A5F',
  background: '#FCF3E2',
  text: '#142843',
  icon: '#142843',
};

const PALETTE_FIELDS = [
  { key: 'navbar', label: tr('Nav Bar / Header'), default: '#142843', hint: tr('Top navigation bar, mobile drawer, and bottom nav') },
  { key: 'primary', label: tr('Primary Brand'), default: '#142843', hint: tr('Main buttons, active focus rings, and primary highlights') },
  { key: 'secondary', label: tr('Secondary / Sub-nav'), default: '#1E3A5F', hint: tr('Sub-nav active pills and secondary action buttons') },
  { key: 'accent', label: tr('Accent Highlight'), default: '#1E3A5F', hint: tr('Special badges, active tags, and accent chips') },
  { key: 'background', label: tr('Page Background'), default: '#FCF3E2', hint: tr('Workspace surface and canvas background') },
  { key: 'text', label: tr('Primary Text'), default: '#142843', hint: tr('Headings, labels, and readable body text') },
  { key: 'icon', label: tr('Icon Color'), default: '#142843', hint: tr('Lucide SVG icons on cards, empty states, and feature lists') },
];

import LocationsSettingsPanel from './LocationsSettingsPanel';
import BillingProfilePanel from './BillingProfilePanel';
import { useAuth } from '../../context/AuthContext';

const SETTINGS_TABS = ['branding', 'locale', 'whatsapp', 'locations', 'billing', 'plan'];

const ACTIVITY_LABELS = {
  gym: tr('Gym'),
  crossfit: tr('Crossfit'),
  box: tr('Box'),
  mma: tr('MMA'),
  kickboxing: tr('Kickboxing'),
  calisthenics: tr('Calisthenics'),
};

const TENANT_STATUS_LABELS = {
  trial: tr('Trial'),
  active: tr('Active'),
  past_due: tr('Past due'),
  suspended: tr('Suspended'),
  cancelled: tr('Cancelled'),
};

const BILLING_CYCLE_LABELS = {
  monthly: tr('Monthly'),
  yearly: tr('Yearly'),
  lifetime: tr('Lifetime'),
};

function hasCap(max) {
  return max != null && Number(max) > 0;
}

function quotaMaxLabel(max, unit, fmtNumber) {
  return hasCap(max) ? `${fmtNumber(Number(max))}${unit}` : '∞';
}

function quotaPercent(used, max) {
  if (!hasCap(max)) return 0;
  return Math.min(100, ((Number(used) || 0) / Number(max)) * 100);
}

function QuotaMeter({ label, used, max, unit = '', color, overMessage }) {
  const { fmtNumber } = useFormat();
  const value = Number(used) || 0;
  const over = hasCap(max) && value > Number(max);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        <span>{label}</span>
        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{fmtNumber(value)}{unit} / {quotaMaxLabel(max, unit, fmtNumber)}</span>
      </div>
      <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: over ? '#DC2626' : color, width: `${quotaPercent(value, max)}%` }} />
      </div>
      {over && overMessage && (
        <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, marginTop: 4 }}>{overMessage}</div>
      )}
    </div>
  );
}

export default function TenantSettings() {
  const { t } = useI18n();
  const { fmtNumber, fmtDate } = useFormat();
  usePageTitle(t('Gym Settings'));
  const { tenant, refreshTenant, applyTenant, applyBranding, hasFeature, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const settingsTab = searchParams.get('tab');
  const whatsappInPlan = Boolean(hasFeature?.('whatsapp'));

  const [activeTab, setActiveTab] = useState(() => (
    SETTINGS_TABS.includes(settingsTab) ? settingsTab : 'branding'
  ));
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form states initialized from tenant
  const [displayName, setDisplayName] = useState('');
  const [palette, setPalette] = useState(() => ({
    ...DEFAULT_PALETTE,
    ...(tenant?.settings?.branding?.palette || {}),
  }));
  const [savedPalette, setSavedPalette] = useState(() => ({
    ...DEFAULT_PALETTE,
    ...(tenant?.settings?.branding?.palette || {}),
  }));
  const [currency, setCurrency] = useState('EGP');
  const [countryCode, setCountryCode] = useState('20');
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [language, setLanguage] = useState('en');
  const [packageTransferFee, setPackageTransferFee] = useState('0');
  const [activities, setActivities] = useState(KNOWN_ACTIVITIES);
  const [customActivity, setCustomActivity] = useState('');

  // WhatsApp connection states
  const [waSession, setWaSession] = useState(null);
  const [waLoading, setWaLoading] = useState(true);
  const [waBusy, setWaBusy] = useState(false);
  const [waQrUrl, setWaQrUrl] = useState('');

  useEffect(() => {
    if (!SETTINGS_TABS.includes(settingsTab)) return undefined;
    const frame = requestAnimationFrame(() => setActiveTab(settingsTab));
    return () => cancelAnimationFrame(frame);
  }, [settingsTab]);

  // Initialize from tenant
  useEffect(() => {
    if (tenant?.settings) {
      setDisplayName(tenant.settings.branding?.displayName || tenant.name || '');
      const nextPalette = {
        ...DEFAULT_PALETTE,
        ...(tenant.settings.branding?.palette || {}),
      };
      setPalette(nextPalette);
      setSavedPalette(nextPalette);
      if (tenant.settings.locale) {
        setCurrency(tenant.settings.locale.currency || 'EGP');
        setCountryCode(tenant.settings.locale.countryCode || '20');
        setTimezone(tenant.settings.locale.timezone || 'Africa/Cairo');
        setLanguage(tenant.settings.locale.language || 'en');
      }
      setPackageTransferFee(String(tenant.settings.packageTransferFee ?? 0));
      if (tenant.settings.enabledActivities?.length > 0) {
        setActivities(tenant.settings.enabledActivities);
      }
    }
  }, [tenant]);

  // Live preview for this tenant, including showcase workspaces.
  useEffect(() => {
    if (!applyBranding || !palette) return;
    applyBranding({ palette });
  }, [palette, applyBranding]);

  // If user navigates away without saving, restore saved branding
  useEffect(() => {
    return () => {
      if (tenant?.settings?.branding && applyBranding) {
        applyBranding(tenant.settings.branding);
      }
    };
  }, [tenant, applyBranding]);

  // WhatsApp status checker — only hit the gated API when the plan includes WhatsApp.
  // Otherwise Gym Settings (branding, locale, plan) would trigger Upgrade Required.
  const checkWhatsAppStatus = useCallback(async (quiet = false) => {
    if (!whatsappInPlan) {
      setWaSession(null);
      if (!quiet) setWaLoading(false);
      return null;
    }
    try {
      if (!quiet) setWaLoading(true);
      const res = await getWhatsAppSession({ skipGlobalError: true });
      setWaSession(res.data);
      return res.data;
    } catch (err) {
      console.warn('Failed to fetch WhatsApp status', err);
    } finally {
      if (!quiet) setWaLoading(false);
    }
  }, [whatsappInPlan]);

  useEffect(() => {
    if (tenantLoading) return undefined;
    if (!whatsappInPlan) {
      setWaSession(null);
      setWaLoading(false);
      return undefined;
    }
    let cancelled = false;
    checkWhatsAppStatus()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWaLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantLoading, whatsappInPlan, checkWhatsAppStatus]);

  // Poll WhatsApp session status while QR or connecting, or every 15s otherwise
  useEffect(() => {
    if (!whatsappInPlan) return undefined;
    const status = waSession?.status;
    if (!status) return undefined;
    const pollDelay = status === 'qr' || status === 'connecting' ? 2500 : 15000;
    const timer = setInterval(() => {
      checkWhatsAppStatus(true).catch(() => {});
    }, pollDelay);
    return () => clearInterval(timer);
  }, [whatsappInPlan, waSession?.status, checkWhatsAppStatus]);

  // Convert QR code text to data URL image
  useEffect(() => {
    if (!waSession?.qr) {
      setWaQrUrl('');
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(waSession.qr, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => {
        if (!cancelled) setWaQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setWaQrUrl('');
      });
    return () => { cancelled = true; };
  }, [waSession?.qr]);

  const handleConnectWhatsApp = async () => {
    setWaBusy(true);
    try {
      const res = await startWhatsAppSession();
      setWaSession(res.data);
      toast.success(t('WhatsApp session initiated. Scan the QR code.'));
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to start WhatsApp session'));
    } finally {
      setWaBusy(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    setWaBusy(true);
    try {
      const res = await logoutWhatsAppSession();
      setWaSession(res.data);
      setWaQrUrl('');
      toast.success(t('WhatsApp account disconnected successfully'));
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to disconnect WhatsApp'));
    } finally {
      setWaBusy(false);
    }
  };

  const handleRefreshWhatsApp = async () => {
    setWaBusy(true);
    try {
      await checkWhatsAppStatus(false);
      toast.success(t('WhatsApp status refreshed'));
    } finally {
      setWaBusy(false);
    }
  };

  const handleColorChange = (key, rawValue) => {
    setPalette(prev => ({
      ...prev,
      [key]: rawValue,
    }));
  };

  const handleColorBlur = (key) => {
    const raw = palette[key];
    const normalized = normalizeHexColor(raw);
    if (normalized) {
      setPalette(prev => ({
        ...prev,
        [key]: normalized,
      }));
    }
  };

  const handleResetPalette = () => {
    setPalette(savedPalette);
    if (applyBranding) applyBranding({ palette: savedPalette });
    toast.success(t('Reset to saved palette'));
  };

  const handleDefaultPalette = () => {
    setPalette(DEFAULT_PALETTE);
    if (applyBranding) applyBranding({ palette: DEFAULT_PALETTE });
    toast.success(t('Forma palette restored. Save settings to keep it.'));
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();

    if (displayName && displayName.trim().length > 120) {
      toast.error(t('Gym display name must not exceed 120 characters'));
      return;
    }

    const normalizedPalette = {};
    if (palette) {
      for (const [key, color] of Object.entries(palette)) {
        if (color) {
          const norm = normalizeHexColor(color);
          if (!norm) {
            toast.error(t('Invalid hex color format for {key}: "{color}". Example: #142843', { key, color }));
            return;
          }
          normalizedPalette[key] = norm;
        }
      }
    }

    if (timezone && timezone.trim().length > 100) {
      toast.error(t('Timezone must not exceed 100 characters'));
      return;
    }

    const transferFee = Number(packageTransferFee);
    if (!Number.isFinite(transferFee) || transferFee < 0) {
      toast.error(t('Enter a valid package transfer fee'));
      return;
    }

    setSaving(true);
    try {
      const paletteForSave = normalizedPalette;
      const payload = {
        branding: {
          displayName: displayName.trim() || undefined,
          ...(paletteForSave ? { palette: paletteForSave } : {}),
        },
        locale: {
          currency: currency.trim() || 'EGP',
          countryCode: countryCode.trim() || '20',
          timezone: timezone.trim() || 'Africa/Cairo',
          language: language.trim() || 'en',
        },
        packageTransferFee: transferFee,
        enabledActivities: activities,
        settings: {
          branding: {
            displayName: displayName.trim() || undefined,
            ...(paletteForSave ? { palette: paletteForSave } : {}),
          },
          locale: {
            currency: currency.trim() || 'EGP',
            countryCode: countryCode.trim() || '20',
            timezone: timezone.trim() || 'Africa/Cairo',
            language: language.trim() || 'en',
          },
          packageTransferFee: transferFee,
          enabledActivities: activities,
        },
      };

      const res = await updateTenantMe(payload);
      const nextTenant = res.data?.tenant;
      if (nextTenant) applyTenant(nextTenant);
      if (applyBranding) applyBranding({ palette: normalizedPalette });
      setPalette(normalizedPalette);
      setSavedPalette(normalizedPalette);
      toast.success(t('Gym settings saved successfully!'));
      await refreshTenant();
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to update gym settings'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateFile(file, { maxSizeMB: UPLOAD_INTAKE_MB, allowedExtensions: LOGO_EXTENSIONS, allowSvg: true });
    if (!check.valid) {
      toast.error(check.error);
      e.target.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('logoFile', file);
    setUploadingLogo(true);
    try {
      const res = await uploadTenantLogo(fd);
      const nextTenant = res.data?.tenant;
      if (nextTenant) applyTenant(nextTenant);
      toast.success(t('Logo uploaded successfully!'));
      await refreshTenant();
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to upload logo'));
      }
    } finally {
      e.target.value = '';
      setUploadingLogo(false);
    }
  };

  const toggleActivity = (act) => {
    if (activities.includes(act)) {
      if (activities.length === 1) {
        toast.error(t('At least one activity must be enabled'));
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
      toast.error(t('Activity already exists'));
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
  const logoFile = logoKey ? String(logoKey).split(/[/\\]/).pop() : null;
  const logoUrl = logoFile ? `${apiOrigin}/uploads/${encodeURIComponent(logoFile)}` : '/forma-favicon.png';

  const plan = tenant?.plan;
  const usage = tenant?.usage || {};
  const limits = tenant?.limits || tenant?.effectiveLimits || {};

  return (
    <Layout>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader
          walkthrough="settings-header"
          title={t('Gym & Tenant Settings')}
          sub={t("Manage your gym's brand identity, locale, offerings, and plan")}
          action={
            <Btn variant="primary" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <><Spinner size="sm" /> {t('Saving…')}</> : t('Save Settings')}
            </Btn>
          }
        />

        {/* Navigation Tabs */}
        <div className="tabs-scroll" data-walkthrough="settings-tabs" style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5E7EB', marginBottom: 24 }}>
          {[
            { id: 'branding', label: t('Branding & Palette') },
            { id: 'locale', label: t('Locale & Activities') },
            {
              id: 'whatsapp',
              label: 'WhatsApp', // i18n-ignore
              badge: !whatsappInPlan
                ? 'outside'
                : waSession?.status === 'connected'
                  ? 'connected'
                  : (waSession?.status === 'qr' ? 'qr' : 'disconnected'),
            },
            { id: 'locations', label: t('Locations') },
            { id: 'billing', label: t('Billing & Reports') },
            { id: 'plan', label: t('Plan & Usage') },
          ].map(tabItem => {
            const isTabActive = activeTab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                onClick={() => setActiveTab(tabItem.id)}
                style={{
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: isTabActive ? 700 : 500,
                  color: isTabActive ? 'var(--navy)' : '#6B7280',
                  background: 'none',
                  border: 'none',
                  borderBottom: isTabActive ? '2px solid var(--navy)' : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: -1,
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>{tabItem.label}</span>
                {tabItem.badge && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        tabItem.badge === 'connected'
                          ? '#16A34A'
                          : tabItem.badge === 'qr'
                            ? '#D97706'
                            : tabItem.badge === 'outside'
                              ? '#3B82F6'
                              : '#9CA3AF',
                      boxShadow: tabItem.badge === 'connected' ? '0 0 6px rgba(22,163,74,0.6)' : 'none',
                      display: 'inline-block',
                    }}
                    title={
                      tabItem.badge === 'connected'
                        ? t('WhatsApp Linked')
                        : tabItem.badge === 'qr'
                          ? t('QR Code Pending')
                          : tabItem.badge === 'outside'
                            ? t('Outside current plan')
                            : t('Not Linked')
                    }
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Branding */}
        {activeTab === 'branding' && (
          <div data-walkthrough="settings-brand" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader title={t('Gym Brand Identity')} sub={t('Customize the name and logo that appear across your workspace')} />
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <div style={{
                  width: 90, height: 90, borderRadius: 16,
                  border: '1px solid #E5E7EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: palette.background || '#FCF3E2',
                  overflow: 'hidden', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  <img key={logoUrl} src={logoUrl} alt={t('Logo')} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    {t('Upload New Logo (PNG, JPG, WebP, or SVG)')}
                  </label>
                  <input
                    type="file"
                    accept={LOGO_ACCEPT}
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    style={{ fontSize: 13 }}
                  />
                  {uploadingLogo && <span style={{ marginInlineStart: 10, fontSize: 12, color: 'var(--navy)' }}>{t('Uploading…')}</span>}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Input
                  label={t('Gym Display Name')}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={t('e.g. Spartan Gym')}
                />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--t1)' }}>
                    {t('Theme Palette & Live Preview')}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t3)' }}>
                    {t('These colors belong to this gym. They load after sign-in, once this workspace finishes loading. If none are saved yet, the theme stays on. Showcase workspaces can change them too. The sign-in screen and the platform console keep Forma’s navy and cream.')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="outline" size="sm" onClick={handleResetPalette} disabled={saving}>
                    {t('Revert to Saved')}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={handleDefaultPalette} disabled={saving}>
                    {t('Default Theme')}
                  </Btn>
                  <Btn variant="primary" size="sm" onClick={handleSaveSettings} disabled={saving}>
                    {saving ? <><Spinner size="sm" /> {t('Saving…')}</> : t('Save Palette')}
                  </Btn>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginTop: 20 }}>
                {PALETTE_FIELDS.map(c => {
                  const currentValue = palette[c.key] ?? c.default;
                  const pickerValue = toColorPickerValue(currentValue, c.default);
                  const isInvalid = currentValue && !normalizeHexColor(currentValue);

                  return (
                    <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>{t(c.label)}</label>
                        {isInvalid && (
                          <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>{t('Invalid Hex')}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="color"
                          value={pickerValue}
                          onChange={e => handleColorChange(c.key, e.target.value.toUpperCase())}
                          style={{
                            width: 40, height: 36,
                            border: '1px solid #D1D5DB', borderRadius: 6,
                            cursor: 'pointer',
                            padding: 2, background: '#fff',
                          }}
                          title={t('Pick {label}', { label: t(c.label) })}
                        />
                        <input
                          type="text"
                          value={palette[c.key] ?? ''}
                          onChange={e => handleColorChange(c.key, e.target.value)}
                          onBlur={() => handleColorBlur(c.key)}
                          placeholder={c.default}
                          dir="ltr"
                          maxLength={9}
                          style={{
                            width: 105, padding: '7px 8px', fontSize: 12,
                            fontFamily: 'monospace',
                            border: `1px solid ${isInvalid ? 'var(--red)' : '#D1D5DB'}`,
                            borderRadius: 6,
                            outline: 'none',
                            textTransform: 'uppercase',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t(c.hint)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Live Preview Container Box */}
              <div style={{
                marginTop: 24,
                padding: 24,
                borderRadius: 14,
                background: palette.background,
                border: '1px solid #E5E7EB',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                transition: 'background 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: palette.primary,
                      boxShadow: `0 0 6px ${palette.primary}`,
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: palette.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {t('Interactive Live Workspace Preview')}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 12,
                    background: palette.accent,
                    color: '#FFFFFF',
                  }}>
                    {t('Active Accent')}
                  </span>
                </div>

                {/* Simulated Top Navigation Bar */}
                <div style={{
                  background: palette.navbar || DEFAULT_PALETTE.navbar,
                  borderRadius: '10px 10px 0 0',
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  transition: 'background 0.2s ease',
                }}>
                  {/* Brand Logo & Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'color-mix(in srgb, var(--navy) 40%, #ffffff)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#FFFFFF', fontWeight: 800, fontSize: 12,
                    }}>
                      {((displayName || 'G').trim()[0] || 'G').toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      {displayName || t('GYM WORKSPACE')}
                    </span>
                  </div>

                  {/* Nav Links / Tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: palette.secondary || DEFAULT_PALETTE.secondary,
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {t('Active Tab')}
                    </div>
                    <div style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      {t('Members')}
                    </div>
                    <div style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      {t('Reports')}
                    </div>
                  </div>
                </div>

                {/* Simulated Sub-nav Tab Row */}
                <div style={{
                  background: `color-mix(in srgb, ${palette.navbar || DEFAULT_PALETTE.navbar} 82%, #000000)`,
                  padding: '8px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: 16,
                  transition: 'background 0.2s ease',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#FFFFFF',
                    background: palette.secondary || DEFAULT_PALETTE.secondary,
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    {t('Sub-nav Tab')}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                    {t('Overview')}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                    {t('Activity Logs')}
                  </span>
                </div>

                {/* Simulated Mini Card */}
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: palette.text }}>
                      {t('Live Workspace Content')}
                    </h4>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: palette.secondary,
                      background: `color-mix(in srgb, ${palette.secondary} 12%, transparent)`,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>
                      {t('Sub-nav Pill')}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: palette.text, opacity: 0.85, lineHeight: 1.5 }}>
                    {t('Adjusting the color pickers or hex codes above immediately updates this preview, the navigation bar above, and the actual live application layout.')}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    <button
                      type="button"
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        background: palette.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'default',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                    >
                      {t('Primary Button')}
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        background: palette.secondary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'default',
                      }}
                    >
                      {t('Secondary Action')}
                    </button>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      background: palette.background,
                      color: palette.text,
                      border: '1px solid #D1D5DB',
                    }}>
                      {t('Page Surface Chip')}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #E5E7EB',
                    background: palette.background,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: palette.text, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {t('Icons')}
                    </span>
                    {[LayoutDashboard, Users, Package].map((Icon, i) => (
                      <span
                        key={i}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: '#FFFFFF',
                          border: '1px solid #E5E7EB',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: palette.icon || DEFAULT_PALETTE.icon,
                        }}
                      >
                        <Icon size={18} strokeWidth={1.75} aria-hidden />
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12, color: palette.text, opacity: 0.75, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} aria-hidden style={{ color: palette.icon || DEFAULT_PALETTE.icon }} />
                  <span>
                    {t('Colors chosen here update this workspace immediately. Click Save Palette to keep them for the next sign-in.')}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'billing' && (
          <BillingProfilePanel
            tenant={tenant}
            isOwner={user?.role === 'Owner'}
            onSaved={async (nextTenant) => {
              if (nextTenant) applyTenant(nextTenant);
              await refreshTenant();
            }}
          />
        )}

        {/* Tab 2: Locale & Activities */}
        {activeTab === 'locale' && (
          <div data-walkthrough="settings-locale" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader title={t('Regional & Locale Settings')} sub={t('Controls currency symbols, timezone dates, and system formatting')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                <Select label={t('Operating Currency')} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {[
                    'EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD'
                  ].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>

                <Input
                  label={t('Default Phone Country Code')}
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  placeholder="20"
                  dir="ltr"
                />

                <Select label={t('Timezone')} value={timezone} onChange={e => setTimezone(e.target.value)}>
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

                <Select
                  label={t('Language')}
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  hint={t('Gym default language for staff. Each person can switch from their profile menu.')}
                >
                  <option value="en">{t('English (US)')}</option>
                  <option value="ar">{t('العربية (Arabic)')}</option>
                </Select>

                <Input
                  label={t('Package transfer fee')}
                  type="number"
                  min="0"
                  value={packageTransferFee}
                  onChange={e => setPackageTransferFee(e.target.value)}
                  hint={t('Default fee charged to the original member when their current package is transferred. Staff can change it on each transfer.')}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title={t('Enabled Activity Offerings')} sub={t('Define which workout and class types are available when configuring packages')} />
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
                      <span>{ACTIVITY_LABELS[act] ? t(ACTIVITY_LABELS[act]) : act}</span>
                      {active ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, maxWidth: 360 }}>
                <Input
                  value={customActivity}
                  onChange={e => setCustomActivity(e.target.value)}
                  placeholder={t('Add custom activity (e.g. Pilates)')}
                />
                <Btn variant="outline" type="button" onClick={addCustomActivity}>
                  {t('Add')}
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 3: WhatsApp */}
        {activeTab === 'whatsapp' && (
          <div data-walkthrough="settings-whatsapp" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!whatsappInPlan ? (
              <Card>
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                      fontSize: 22,
                      fontWeight: 700,
                    }}
                    aria-hidden
                  >
                    {/* i18n-ignore */}
                    i
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: '0 0 8px' }}>
                    {t('WhatsApp is outside your current plan')}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--t3)', maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.5 }}>
                    {t('This feature is not included in your gym’s plan. You can keep customizing other settings. Ask your platform administrator to add WhatsApp if you need it.')}
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 14px',
                      borderRadius: 20,
                      background: 'var(--surface-2, #F3F4F6)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--t2, #4B5563)',
                    }}
                  >
                    {t('Current Tier:')} <span style={{ color: 'var(--navy)' }}>{plan?.name || t('Standard')}</span>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <Btn variant="outline" size="sm" onClick={() => setActiveTab('plan')}>
                      {t('View Plan & Usage')}
                    </Btn>
                  </div>
                </div>
              </Card>
            ) : (
            <>
            <Card>
              <CardHeader
                title={t('WhatsApp Account Linking')}
                sub={t('Check and manage WhatsApp connectivity for your account to send invoices, messages, and QR passes.')}
              />

              {waLoading && !waSession ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: 'var(--t3)' }}>
                  <Spinner size="md" />
                  <span>{t('Checking WhatsApp account status…')}</span>
                </div>
              ) : (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Status Banner */}
                  {waSession?.status === 'connected' ? (
                    <div style={{
                      padding: '20px 24px',
                      borderRadius: 12,
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%', background: '#16A34A',
                            boxShadow: '0 0 8px rgba(22, 163, 74, 0.7)',
                          }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                            {t('WhatsApp Account Linked & Active')}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#15803D',
                          background: '#DCFCE7', padding: '4px 10px', borderRadius: 20,
                          border: '1px solid #86EFAC',
                        }}>
                          {t('CONNECTED')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div dir="ltr" style={{
                          padding: '8px 16px', borderRadius: 8, background: '#FFFFFF',
                          border: '1px solid #86EFAC', fontSize: 16, fontWeight: 800,
                          color: '#166534', letterSpacing: '0.5px',
                        }}>
                          +{waSession.phone}
                        </div>
                        <span style={{ fontSize: 13, color: '#374151' }}>
                          {t('Linked to your user profile. Automated triggers and manual templates will be sent from this number.')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                        <Btn
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnectWhatsApp}
                          disabled={waBusy}
                          style={{ borderColor: '#F87171', color: '#DC2626' }}
                        >
                          {waBusy ? <><Spinner size="sm" /> {t('Disconnecting…')}</> : t('Disconnect WhatsApp')}
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={handleRefreshWhatsApp}
                          disabled={waBusy}
                        >
                          {waBusy ? <Spinner size="sm" /> : <><RefreshCw size={14} aria-hidden /> {t('Refresh Status')}</>}
                        </Btn>
                        <Link
                          to="/account/whatsapp"
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginInlineStart: 8 }}
                        >
                          {t('Open Dedicated WhatsApp Page')} <span className="rtl-flip" style={{ display: 'inline-block' }}>→</span>
                        </Link>
                      </div>
                    </div>
                  ) : waSession?.status === 'qr' ? (
                    <div style={{
                      padding: '20px 24px',
                      borderRadius: 12,
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%', background: '#D97706',
                            boxShadow: '0 0 8px rgba(217, 119, 6, 0.7)',
                          }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#92400E' }}>
                            {t('Waiting for WhatsApp QR Scan')}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#B45309',
                          background: '#FEF3C7', padding: '4px 10px', borderRadius: 20,
                          border: '1px solid #FCD34D',
                        }}>
                          {t('SCAN CODE')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                        {waQrUrl ? (
                          <div dir="ltr" style={{
                            padding: 12, background: '#FFFFFF', borderRadius: 12,
                            border: '1px solid #E5E7EB', display: 'inline-block',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          }}>
                            <img src={waQrUrl} alt={t('WhatsApp QR Code')} width={220} height={220} style={{ display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', borderRadius: 12 }}>
                            <Spinner size="md" />
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 240 }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: '#78350F' }}>
                            {t('Scan from WhatsApp on your phone:')}
                          </h4>
                          <ol style={{ margin: 0, paddingInlineStart: 20, fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                            <li>{t('Open WhatsApp on your mobile phone')}</li>
                            <li>{t('Navigate to Settings > Linked Devices')}</li>
                            <li>{t('Tap Link a Device and point your camera at this QR code')}</li>
                            <li>{t('The status will update automatically once scanned')}</li>
                          </ol>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <Btn variant="outline" size="sm" onClick={handleDisconnectWhatsApp} disabled={waBusy}>
                          {t('Cancel Connection')}
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={handleRefreshWhatsApp} disabled={waBusy}>
                          <><RefreshCw size={14} aria-hidden /> {t('Refresh Status')}</>
                        </Btn>
                      </div>
                    </div>
                  ) : waSession?.status === 'connecting' ? (
                    <div style={{
                      padding: '24px',
                      borderRadius: 12,
                      background: '#F0F9FF',
                      border: '1px solid #BAE6FD',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                    }}>
                      <Spinner size="md" />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0369A1' }}>
                          {t('Connecting to WhatsApp Servers…')}
                        </div>
                        <div style={{ fontSize: 12, color: '#0284C7', marginTop: 2 }}>
                          {t('Please wait while the connection handshake completes.')}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px 24px',
                      borderRadius: 12,
                      background: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%', background: '#9CA3AF',
                          }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>
                            {t('No WhatsApp Account Linked')}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#6B7280',
                          background: '#E5E7EB', padding: '4px 10px', borderRadius: 20,
                        }}>
                          {t('NOT LINKED')}
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: 13, color: '#4B5563', lineHeight: 1.5, maxWidth: 640 }}>
                        {t('This user account currently has no active WhatsApp connection. Connect your number so you can send WhatsApp invitations, renewals, check-in barcodes, and customer service messages directly through Forma.')}
                        {waSession?.phone && (
                          <span style={{ display: 'block', marginTop: 6, fontWeight: 600, color: '#6B7280' }}>
                            {t('Previously linked number:')} <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>+{waSession.phone}</span>
                          </span>
                        )}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                        <Btn
                          variant="success"
                          size="md"
                          onClick={handleConnectWhatsApp}
                          disabled={waBusy}
                        >
                          {waBusy ? <><Spinner size="sm" /> {t('Starting…')}</> : t('Link WhatsApp Account')}
                        </Btn>
                        <Btn
                          variant="outline"
                          size="md"
                          onClick={handleRefreshWhatsApp}
                          disabled={waBusy}
                        >
                          <><RefreshCw size={14} aria-hidden /> {t('Refresh Status')}</>
                        </Btn>
                        <Link
                          to="/account/whatsapp"
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginInlineStart: 8 }}
                        >
                          {t('Dedicated Connect Page')} <span className="rtl-flip" style={{ display: 'inline-block' }}>→</span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Monthly WhatsApp Allowance & Quota Meter */}
            <Card>
              <CardHeader
                title={t('Gym-wide WhatsApp Quotas')}
                sub={t('Aggregated message consumption against current billing entitlement')}
              />
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  <span>{t('Messages Sent This Month')}</span>
                  <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{fmtNumber(usage.whatsappMonthlyMessages ?? 0)} / {quotaMaxLabel(limits.whatsappMonthlyMessages, '', fmtNumber)}</span>
                </div>
                <div style={{ height: 10, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: 'var(--green)',
                    width: `${quotaPercent(usage.whatsappMonthlyMessages, limits.whatsappMonthlyMessages)}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                  {t('Quotas reset at the start of each calendar month based on your gym’s current plan ({plan}).', { plan: plan?.name || t('Standard') })}
                </div>
              </div>
            </Card>
            </>
            )}
          </div>
        )}

        {activeTab === 'locations' && (
          <div data-walkthrough="settings-locations">
            <LocationsSettingsPanel />
          </div>
        )}

        {/* Tab 4: Plan & Usage */}
        {activeTab === 'plan' && (
          <div data-walkthrough="settings-plan" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                      {t('Subscription Details')}
                    </h3>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                    {t('Current Plan:')} <strong>{plan?.name || t('Standard Plan')}</strong>
                    {' • '}{t('Billing Cycle: {cycle}', { cycle: tenant?.billing?.cycle ? (BILLING_CYCLE_LABELS[tenant.billing.cycle] ? t(BILLING_CYCLE_LABELS[tenant.billing.cycle]) : tenant.billing.cycle) : t('Monthly') })}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{t('STATUS')}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', marginTop: 4 }}>
                    {tenant?.status ? (TENANT_STATUS_LABELS[tenant.status] ? t(TENANT_STATUS_LABELS[tenant.status]) : tenant.status) : t('Active')}
                  </div>
                </div>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{t('PLAN TIER')}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', textTransform: 'capitalize', marginTop: 4 }}>
                    {plan?.key || '—'}
                  </div>
                </div>
                <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                    {t('RENEWAL / EXPIRY')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                    {tenant?.currentPeriodEnd ? fmtDate(tenant.currentPeriodEnd) : t('Never')}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('Plan Quotas & Fair-Use Meters')} sub={t('Track your active usage against subscription allocations')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginTop: 16 }}>
                <QuotaMeter label={t('Active Members')} used={usage.members} max={limits.maxMembers} color="var(--navy)" />
                <QuotaMeter label={t('Staff Users')} used={usage.staff} max={limits.maxStaff} color="var(--navy-2)" />
                <QuotaMeter label={t('Branches')} used={usage.branches} max={limits.maxBranches} color="#7C3AED" />
                <QuotaMeter
                  label={t('Storage Capacity')}
                  used={usage.storageGb}
                  max={limits.storageGb}
                  unit=" GB"
                  color="#0284C7"
                  overMessage={t('Capacity limit exceeded. Please contact platform support or upgrade your plan.')}
                />
                <QuotaMeter
                  label={t('WhatsApp Messages (Monthly)')}
                  used={usage.whatsappMonthlyMessages}
                  max={limits.whatsappMonthlyMessages}
                  color="#16A34A"
                />
              </div>
            </Card>

            <Card>
              <CardHeader title={t('Active Features Matrix')} sub={t('Features unlocked by your plan and overrides')} />
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} aria-hidden />
                      {feat}
                    </span>
                  </span>
                ))}
              </div>
            </Card>

          </div>
        )}
      </div>
    </Layout>
  );
}
