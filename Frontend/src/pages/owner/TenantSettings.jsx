import { apiOrigin } from '../../api/axios';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  PageHeader, Card, CardHeader, Input, Select, Btn, Spinner, Badge,
} from '../../components/ui';
import LifetimeCheckoutModal from '../../components/billing/LifetimeCheckoutModal';
import LifetimeUpgradeModal from '../../components/billing/LifetimeUpgradeModal';
import {
  isValidHexColor,
  normalizeHexColor,
  toColorPickerValue,
  validateFile,
  LOGO_EXTENSIONS,
  LOGO_ACCEPT,
  UPLOAD_INTAKE_MB,
} from '../../lib/validation';

const KNOWN_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];

const DEFAULT_PALETTE = {
  navbar: '#1E1535',
  primary: '#44298C',
  secondary: '#5B38BA',
  accent: '#6D47CC',
  background: '#F4F5F7',
  text: '#111827',
};

const PALETTE_FIELDS = [
  { key: 'navbar', label: 'Nav Bar / Header', default: '#1E1535', hint: 'Top navigation bar, mobile drawer, and bottom nav' },
  { key: 'primary', label: 'Primary Brand', default: '#44298C', hint: 'Main buttons, active focus rings, and primary highlights' },
  { key: 'secondary', label: 'Secondary / Sub-nav', default: '#5B38BA', hint: 'Sub-nav active pills and secondary action buttons' },
  { key: 'accent', label: 'Accent Highlight', default: '#6D47CC', hint: 'Special badges, active tags, and accent chips' },
  { key: 'background', label: 'Page Background', default: '#F4F5F7', hint: 'Workspace surface and canvas background' },
  { key: 'text', label: 'Primary Text', default: '#111827', hint: 'Headings, labels, and readable body text' },
];

export default function TenantSettings() {
  usePageTitle('Gym Settings');
  const { tenant, refreshTenant, applyTenant, applyBranding, loading: tenantLoading } = useTenant();

  const [activeTab, setActiveTab] = useState('branding');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  // Form states initialized from tenant
  const [displayName, setDisplayName] = useState('');
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [savedPalette, setSavedPalette] = useState(DEFAULT_PALETTE);
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [language, setLanguage] = useState('en');
  const [activities, setActivities] = useState(KNOWN_ACTIVITIES);
  const [customActivity, setCustomActivity] = useState('');

  // WhatsApp connection states
  const [waSession, setWaSession] = useState(null);
  const [waLoading, setWaLoading] = useState(true);
  const [waBusy, setWaBusy] = useState(false);
  const [waQrUrl, setWaQrUrl] = useState('');

  // Initialize from tenant
  useEffect(() => {
    if (tenant?.settings) {
      setDisplayName(tenant.settings.branding?.displayName || tenant.name || '');
      if (tenant.settings.branding?.palette) {
        const nextPalette = { ...DEFAULT_PALETTE, ...tenant.settings.branding.palette };
        setPalette(nextPalette);
        setSavedPalette(nextPalette);
      }
      if (tenant.settings.locale) {
        setTimezone(tenant.settings.locale.timezone || 'Africa/Cairo');
        setLanguage(tenant.settings.locale.language || 'en');
      }
      if (tenant.settings.enabledActivities?.length > 0) {
        setActivities(tenant.settings.enabledActivities);
      }
    }
  }, [tenant]);

  // Live preview effect: immediately inject chosen palette into actual UI document variables
  useEffect(() => {
    if (palette && applyBranding) {
      applyBranding({ palette });
    }
  }, [palette, applyBranding]);

  // If user navigates away without saving, restore saved branding
  useEffect(() => {
    return () => {
      if (tenant?.settings?.branding && applyBranding) {
        applyBranding(tenant.settings.branding);
      }
    };
  }, [tenant, applyBranding]);

  // WhatsApp status checker
  const checkWhatsAppStatus = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setWaLoading(true);
      const res = await getWhatsAppSession();
      setWaSession(res.data);
      return res.data;
    } catch (err) {
      console.warn('Failed to fetch WhatsApp status', err);
    } finally {
      if (!quiet) setWaLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkWhatsAppStatus()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWaLoading(false);
      });
    return () => { cancelled = true; };
  }, [checkWhatsAppStatus]);

  // Poll WhatsApp session status while QR or connecting, or every 15s otherwise
  useEffect(() => {
    const status = waSession?.status;
    if (!status) return undefined;
    const pollDelay = status === 'qr' || status === 'connecting' ? 2500 : 15000;
    const timer = setInterval(() => {
      checkWhatsAppStatus(true).catch(() => {});
    }, pollDelay);
    return () => clearInterval(timer);
  }, [waSession?.status, checkWhatsAppStatus]);

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
      toast.success('WhatsApp session initiated. Scan the QR code.');
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || 'Failed to start WhatsApp session');
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
      toast.success('WhatsApp account disconnected successfully');
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || 'Failed to disconnect WhatsApp');
    } finally {
      setWaBusy(false);
    }
  };

  const handleRefreshWhatsApp = async () => {
    setWaBusy(true);
    try {
      await checkWhatsAppStatus(false);
      toast.success('WhatsApp status refreshed');
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
    toast.success('Reset to saved palette');
  };

  const handleDefaultPalette = () => {
    setPalette(DEFAULT_PALETTE);
    if (applyBranding) applyBranding({ palette: DEFAULT_PALETTE });
    toast.success('Restored default theme colors');
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();

    if (displayName && displayName.trim().length > 120) {
      toast.error('Gym display name must not exceed 120 characters');
      return;
    }

    const normalizedPalette = {};
    if (palette) {
      for (const [key, color] of Object.entries(palette)) {
        if (color) {
          const norm = normalizeHexColor(color);
          if (!norm) {
            toast.error(`Invalid hex color format for ${key}: "${color}". Example: #44298C`);
            return;
          }
          normalizedPalette[key] = norm;
        }
      }
    }

    if (timezone && timezone.trim().length > 100) {
      toast.error('Timezone must not exceed 100 characters');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        branding: {
          displayName: displayName.trim() || undefined,
          palette: normalizedPalette,
        },
        locale: {
          currency: 'EGP',
          timezone: timezone.trim() || 'Africa/Cairo',
          language: language.trim() || 'en',
        },
        enabledActivities: activities,
        settings: {
          branding: {
            displayName: displayName.trim() || undefined,
            palette: normalizedPalette,
          },
          locale: {
            currency: 'EGP',
            timezone: timezone.trim() || 'Africa/Cairo',
            language: language.trim() || 'en',
          },
          enabledActivities: activities,
        },
      };

      const res = await updateTenantMe(payload);
      const nextTenant = res.data?.tenant;
      if (nextTenant) applyTenant(nextTenant);
      if (applyBranding) applyBranding({ palette: normalizedPalette });
      setPalette(normalizedPalette);
      setSavedPalette(normalizedPalette);
      toast.success('Gym settings saved successfully!');
      await refreshTenant();
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || 'Failed to update gym settings');
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
      toast.success('Logo uploaded successfully!');
      await refreshTenant();
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || 'Failed to upload logo');
      }
    } finally {
      e.target.value = '';
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
  const logoFile = logoKey ? String(logoKey).split(/[\/\\]/).pop() : null;
  const logoUrl = logoFile ? `${apiOrigin}/uploads/${encodeURIComponent(logoFile)}` : '/leap-logo.svg';

  const plan = tenant?.plan;
  const usage = tenant?.usage || {};
  const limits = tenant?.limits || tenant?.effectiveLimits || {};

  return (
    <Layout>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader
          title="Gym & Tenant Settings"
          sub="Manage your gym's brand identity, locale, offerings, and plan"
          action={
            <Btn variant="primary" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : 'Save Settings'}
            </Btn>
          }
        />

        {/* Navigation Tabs */}
        <div className="tabs-scroll" style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5E7EB', marginBottom: 24 }}>
          {[
            { id: 'branding', label: 'Branding & Palette' },
            { id: 'locale', label: 'Locale & Activities' },
            {
              id: 'whatsapp',
              label: 'WhatsApp',
              badge: waSession?.status === 'connected' ? 'connected' : (waSession?.status === 'qr' ? 'qr' : 'disconnected'),
            },
            { id: 'plan', label: 'Plan & Usage' },
          ].map(t => {
            const isTabActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
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
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: t.badge === 'connected' ? '#16A34A' : (t.badge === 'qr' ? '#D97706' : '#9CA3AF'),
                      boxShadow: t.badge === 'connected' ? '0 0 6px rgba(22,163,74,0.6)' : 'none',
                      display: 'inline-block',
                    }}
                    title={t.badge === 'connected' ? 'WhatsApp Linked' : (t.badge === 'qr' ? 'QR Code Pending' : 'Not Linked')}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Branding */}
        {activeTab === 'branding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader title="Gym Brand Identity" sub="Customize the name and logo that appear across your workspace" />
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <div style={{
                  width: 90, height: 90, borderRadius: 16,
                  border: '1px solid #E5E7EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: palette.background || '#F4F5F7',
                  overflow: 'hidden', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  <img key={logoUrl} src={logoUrl} alt="Logo" style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Upload New Logo (PNG, JPG, WebP, or SVG)
                  </label>
                  <input
                    type="file"
                    accept={LOGO_ACCEPT}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--t1)' }}>
                    Theme Palette & Live Preview
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t3)' }}>
                    Colors dynamically update the actual UI in real-time and persist across the entire workspace upon saving.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="outline" size="sm" onClick={handleResetPalette}>
                    Revert to Saved
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={handleDefaultPalette}>
                    Default Theme
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
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>{c.label}</label>
                        {isInvalid && (
                          <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>Invalid Hex</span>
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
                            cursor: 'pointer', padding: 2, background: '#fff',
                          }}
                          title={`Pick ${c.label}`}
                        />
                        <input
                          type="text"
                          value={palette[c.key] ?? ''}
                          onChange={e => handleColorChange(c.key, e.target.value)}
                          onBlur={() => handleColorBlur(c.key)}
                          placeholder={c.default}
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
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{c.hint}</span>
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
                      Interactive Live Workspace Preview
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
                    Active Accent
                  </span>
                </div>

                {/* Simulated Top Navigation Bar */}
                <div style={{
                  background: palette.navbar || '#1E1535',
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
                      L
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      {displayName || 'GYM WORKSPACE'}
                    </span>
                  </div>

                  {/* Nav Links / Tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: palette.secondary || '#5B38BA',
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      Active Tab
                    </div>
                    <div style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      Members
                    </div>
                    <div style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      Reports
                    </div>
                  </div>
                </div>

                {/* Simulated Sub-nav Tab Row */}
                <div style={{
                  background: `color-mix(in srgb, ${palette.navbar || '#1E1535'} 82%, #000000)`,
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
                    background: palette.secondary || '#5B38BA',
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    Sub-nav Tab
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                    Overview
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                    Activity Logs
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
                      Live Workspace Content
                    </h4>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: palette.secondary,
                      background: `color-mix(in srgb, ${palette.secondary} 12%, transparent)`,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>
                      Sub-nav Pill
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: palette.text, opacity: 0.85, lineHeight: 1.5 }}>
                    Adjusting the color pickers or hex codes above immediately updates this preview, the navigation bar above, and the actual live application layout.
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
                      Primary Button
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
                      Secondary Action
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
                      Page Surface Chip
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12, color: palette.text, opacity: 0.75 }}>
                  ✓ Colors chosen here are injected live into the app CSS variables (<code>--nav-bg</code>, <code>--navy</code>, <code>--navy-2</code>, <code>--accent</code>, <code>--bg</code>, <code>--t1</code>). Click &ldquo;Save Settings&rdquo; to permanently apply them.
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
                <Select label="Currency" value="EGP" disabled>
                  <option value="EGP">EGP</option>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <CardHeader
                title="WhatsApp Account Linking"
                sub="Check and manage WhatsApp connectivity for your account to send invoices, messages, and QR passes."
              />

              {waLoading && !waSession ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: 'var(--t3)' }}>
                  <Spinner size="md" />
                  <span>Checking WhatsApp account status…</span>
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
                            WhatsApp Account Linked & Active
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#15803D',
                          background: '#DCFCE7', padding: '4px 10px', borderRadius: 20,
                          border: '1px solid #86EFAC',
                        }}>
                          CONNECTED
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{
                          padding: '8px 16px', borderRadius: 8, background: '#FFFFFF',
                          border: '1px solid #86EFAC', fontSize: 16, fontWeight: 800,
                          color: '#166534', letterSpacing: '0.5px',
                        }}>
                          +{waSession.phone}
                        </div>
                        <span style={{ fontSize: 13, color: '#374151' }}>
                          Linked to your user profile. Automated triggers and manual templates will be sent from this number.
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
                          {waBusy ? <><Spinner size="sm" /> Disconnecting…</> : 'Disconnect WhatsApp'}
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={handleRefreshWhatsApp}
                          disabled={waBusy}
                        >
                          {waBusy ? <Spinner size="sm" /> : '↻ Refresh Status'}
                        </Btn>
                        <Link
                          to="/account/whatsapp"
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginLeft: 8 }}
                        >
                          Open Dedicated WhatsApp Page →
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
                            Waiting for WhatsApp QR Scan
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#B45309',
                          background: '#FEF3C7', padding: '4px 10px', borderRadius: 20,
                          border: '1px solid #FCD34D',
                        }}>
                          SCAN CODE
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                        {waQrUrl ? (
                          <div style={{
                            padding: 12, background: '#FFFFFF', borderRadius: 12,
                            border: '1px solid #E5E7EB', display: 'inline-block',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          }}>
                            <img src={waQrUrl} alt="WhatsApp QR Code" width={220} height={220} style={{ display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', borderRadius: 12 }}>
                            <Spinner size="md" />
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 240 }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: '#78350F' }}>
                            Scan from WhatsApp on your phone:
                          </h4>
                          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                            <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                            <li>Navigate to <strong>Settings</strong> &gt; <strong>Linked Devices</strong></li>
                            <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                            <li>The status will update automatically once scanned</li>
                          </ol>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <Btn variant="outline" size="sm" onClick={handleDisconnectWhatsApp} disabled={waBusy}>
                          Cancel Connection
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={handleRefreshWhatsApp} disabled={waBusy}>
                          ↻ Refresh Status
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
                          Connecting to WhatsApp Servers…
                        </div>
                        <div style={{ fontSize: 12, color: '#0284C7', marginTop: 2 }}>
                          Please wait while the connection handshake completes.
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
                            No WhatsApp Account Linked
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#6B7280',
                          background: '#E5E7EB', padding: '4px 10px', borderRadius: 20,
                        }}>
                          NOT LINKED
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: 13, color: '#4B5563', lineHeight: 1.5, maxWidth: 640 }}>
                        This user account currently has no active WhatsApp connection. Connect your number so you can send WhatsApp invitations, renewals, check-in barcodes, and customer service messages directly through Leap.
                        {waSession?.phone && (
                          <span style={{ display: 'block', marginTop: 6, fontWeight: 600, color: '#6B7280' }}>
                            Previously linked number: +{waSession.phone}
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
                          {waBusy ? <><Spinner size="sm" /> Starting…</> : 'Link WhatsApp Account'}
                        </Btn>
                        <Btn
                          variant="outline"
                          size="md"
                          onClick={handleRefreshWhatsApp}
                          disabled={waBusy}
                        >
                          ↻ Refresh Status
                        </Btn>
                        <Link
                          to="/account/whatsapp"
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginLeft: 8 }}
                        >
                          Dedicated Connect Page →
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
                title="Gym-wide WhatsApp Quotas"
                sub="Aggregated message consumption against current billing entitlement"
              />
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  <span>Messages Sent This Month</span>
                  <span>{usage.whatsappMonthlyMessages ?? 0} / {limits.whatsappMonthlyMessages ?? 2000}</span>
                </div>
                <div style={{ height: 10, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: 'var(--green)',
                    width: `${Math.min(100, ((usage.whatsappMonthlyMessages || 0) / (limits.whatsappMonthlyMessages || 2000)) * 100)}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                  Quotas reset at the start of each calendar month based on your gym&rsquo;s current plan ({plan?.name || 'Standard'}).
                </div>
              </div>
            </Card>
          </div>
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
                    <span>{usage.storageGb ?? 0} GB / {limits.storageGb ?? 25} GB</span>
                  </div>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: (usage.storageGb || 0) > (limits.storageGb || 25) ? '#DC2626' : '#0284C7',
                      width: `${Math.min(100, ((usage.storageGb || 0) / (limits.storageGb || 25)) * 100)}%`,
                    }} />
                  </div>
                  {(usage.storageGb || 0) > (limits.storageGb || 25) && (
                    <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, marginTop: 4 }}>
                      Capacity limit exceeded. Please contact platform support or upgrade your plan.
                    </div>
                  )}
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
