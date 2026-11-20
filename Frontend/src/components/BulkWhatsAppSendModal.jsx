import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Btn, Modal, Select, Textarea, Input, Spinner } from './ui';
import {
  getWhatsAppTemplates, getPackages, sendWhatsAppMessage, createWhatsAppTemplate,
} from '../api/endpoints';
import {
  applyWhatsAppPlaceholders,
  composeWhatsAppTemplateMessage,
  WHATSAPP_PLACEHOLDER_TOKENS,
  toWhatsAppUrl,
} from '../utils/whatsapp';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { hasAccess } from '../lib/access';
import { memberPhone } from '../pages/tasks/taskMembers';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';
import { tr } from '../i18n/translate';

const TEMPLATE_CREATE_ROLES = [
  'Owner', 'Sales Manager', 'Accountant', 'Head Coach', 'General Manager',
];

// Return source strings; callers translate with t() at render time.
function typeLabel(type) {
  if (type === 'packages') return tr('Packages list');
  if (type === 'discounts') return tr('Discount offer');
  if (type === 'custom') return tr('Custom');
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : tr('Other');
}

function typeHelp(type) {
  if (type === 'packages') return tr('Shows membership packages and prices in the message.');
  if (type === 'discounts') return tr('Pick a package and a %, and the new price is written for you.');
  return tr('A free-text message you can edit before sending.');
}

function defaultPackageIdsFrom(template) {
  const raw = template?.defaultPackageIds ?? [];
  return raw.map((p) => String(p._id ?? p)).filter(Boolean);
}

function calcNewPrice(price, percent) {
  const p = Number(price) || 0;
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return Math.round(p * (1 - pct / 100));
}

const tipBox = {
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 12,
  color: '#1e40af',
  lineHeight: 1.45,
};

const stepLabel = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: 'var(--t4)',
  marginBottom: 8,
};

const modeTabBase = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--t2)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--t2)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: '#2563eb',
  cursor: 'pointer',
};

/**
 * Bulk WhatsApp send for Filter Results: template campaign or custom message.
 */
export default function BulkWhatsAppSendModal({ open, onClose, members = [] }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const { currency = 'EGP', countryCode = '20' } = useTenant() || {};
  const { user } = useAuth();
  const canSaveTemplate = TEMPLATE_CREATE_ROLES.includes(user?.role)
    && hasAccess(user, 'whatsapp_templates');

  const [mode, setMode] = useState('campaign'); // campaign | custom
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedPackageIds, setSelectedPackageIds] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [language, setLanguage] = useState('en');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [campaignDirty, setCampaignDirty] = useState(false);
  const [customMessage, setCustomMessage] = useState(
    'Hi {{name}}, we wanted to reach out to you about your membership.'
  );
  const [saveName, setSaveName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, failed: 0, skipped: 0, total: 0 });
  const [needsConnect, setNeedsConnect] = useState(false);
  const customTextareaRef = useRef(null);

  const previewMember = members[0] || null;
  const previewMemberId = previewMember?._id;
  const sendableCount = useMemo(
    () => members.filter((m) => Boolean(memberPhone(m)) && toWhatsAppUrl(m.phones, null, countryCode)).length,
    [members, countryCode]
  );

  const buildCampaignMessage = useCallback((template, pkgs, pkgIds, percent, lang, member) => {
    if (!template) return '';
    return composeWhatsAppTemplateMessage(template, pkgs, {
      member: member || undefined,
      memberName: member?.name,
      selectedPackageIds: pkgIds,
      discountPercent: percent,
      language: lang,
      currency,
    });
  }, [currency]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMode('campaign');
    setLoading(true);
    setTypeFilter('');
    setTemplateId('');
    setSelectedPackageIds([]);
    setDiscountPercent(0);
    setLanguage('en');
    setCampaignDraft('');
    setCampaignDirty(false);
    setCustomMessage('Hi {{name}}, we wanted to reach out to you about your membership.');
    setSaveName('');
    setShowSaveForm(false);
    setSending(false);
    setProgress({ sent: 0, failed: 0, skipped: 0, total: 0 });
    setNeedsConnect(false);

    Promise.all([
      getWhatsAppTemplates({ limit: 100 }),
      getPackages({ limit: 100 }),
    ])
      .then(([tRes, pRes]) => {
        if (cancelled) return;
        const list = tRes.data.templates ?? [];
        const pkgs = pRes.data.packages ?? [];
        setTemplates(list);
        setPackages(pkgs);

        const pick = list.find((tpl) => tpl.isDefault) || (list.length === 1 ? list[0] : null);
        if (pick) {
          const pkgIds = defaultPackageIdsFrom(pick);
          const percent = Number(pick.defaultDiscountPercent) || (pick.type === 'discounts' ? 50 : 0);
          let nextIds;
          if (pick.type === 'discounts') {
            nextIds = pkgIds.length ? [pkgIds[0]] : (pkgs[0] ? [String(pkgs[0]._id)] : []);
          } else if (pick.type === 'packages') {
            nextIds = pkgIds.length ? pkgIds : pkgs.map((p) => String(p._id));
          } else {
            nextIds = [];
          }
          setTemplateId(pick._id);
          setTypeFilter(pick.type);
          setSelectedPackageIds(nextIds);
          setDiscountPercent(percent);
          setCampaignDraft(buildCampaignMessage(pick, pkgs, nextIds, percent, 'en', previewMember));
        }
      })
      .catch((err) => {
        if (!cancelled && err?.normalized?.status !== 403) {
          toast.error(err?.normalized?.message || t('Could not load message templates'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // Only re-fetch when the modal opens or the first selected member changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewMember object identity is unstable
  }, [open, buildCampaignMessage, previewMemberId, t]);

  const types = useMemo(() => {
    const set = new Set(templates.map((tpl) => tpl.type));
    return Array.from(set).sort((a, b) => {
      const order = { packages: 0, discounts: 1, custom: 2 };
      return (order[a] ?? 99) - (order[b] ?? 99) || a.localeCompare(b);
    });
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (!typeFilter) return templates;
    return templates.filter((tpl) => tpl.type === typeFilter);
  }, [templates, typeFilter]);

  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl._id === templateId) ?? null,
    [templates, templateId]
  );

  const selectedDiscountPkg = useMemo(() => {
    if (!selectedPackageIds[0]) return null;
    return packages.find((p) => String(p._id) === String(selectedPackageIds[0])) || null;
  }, [packages, selectedPackageIds]);

  const hasArabic = Boolean(
    selectedTemplate &&
    ((selectedTemplate.introTextAr || '').trim() || (selectedTemplate.bodyTextAr || '').trim())
  );

  const recomposed = useMemo(() => {
    if (!selectedTemplate) return '';
    return buildCampaignMessage(
      selectedTemplate,
      packages,
      selectedPackageIds,
      discountPercent,
      language,
      previewMember
    );
  }, [
    selectedTemplate, packages, selectedPackageIds, discountPercent,
    language, previewMember, buildCampaignMessage,
  ]);

  useEffect(() => {
    if (!selectedTemplate || campaignDirty) return;
    setCampaignDraft(recomposed);
  }, [recomposed, selectedTemplate, campaignDirty]);

  const applyTemplateSelection = (id) => {
    const tpl = templates.find((x) => x._id === id);
    setTemplateId(id);
    setCampaignDirty(false);
    if (!tpl) {
      setCampaignDraft('');
      return;
    }
    const pkgIds = defaultPackageIdsFrom(tpl);
    let nextIds;
    if (tpl.type === 'discounts') {
      nextIds = pkgIds.length ? [pkgIds[0]] : (packages[0] ? [String(packages[0]._id)] : []);
    } else if (tpl.type === 'packages') {
      nextIds = pkgIds.length ? pkgIds : packages.map((p) => String(p._id));
    } else {
      nextIds = [];
    }
    const percent = Number(tpl.defaultDiscountPercent) || (tpl.type === 'discounts' ? 50 : 0);
    setSelectedPackageIds(nextIds);
    setDiscountPercent(percent);
    setCampaignDraft(buildCampaignMessage(tpl, packages, nextIds, percent, language, previewMember));
  };

  const handleTypeChange = (value) => {
    setTypeFilter(value);
    setTemplateId('');
    setCampaignDraft('');
    setCampaignDirty(false);
    setSelectedPackageIds([]);
    setDiscountPercent(0);
    const first = templates.find((tpl) => !value || tpl.type === value);
    if (first) applyTemplateSelection(first._id);
  };

  const togglePackage = (id) => {
    const sid = String(id);
    setCampaignDirty(false);
    setSelectedPackageIds((prev) => (
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    ));
  };

  const insertPlaceholder = (token) => {
    const el = customTextareaRef.current;
    const current = customMessage || '';
    if (!el) {
      setCustomMessage(`${current}${token}`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setCustomMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const customPreview = useMemo(
    () => applyWhatsAppPlaceholders(customMessage, previewMember),
    [customMessage, previewMember]
  );

  const campaignPreview = useMemo(() => {
    if (!campaignDraft) return '';
    // Draft from packages/discounts is already personalized for previewMember;
    // re-apply in case user edited and left tokens.
    return applyWhatsAppPlaceholders(campaignDraft, previewMember);
  }, [campaignDraft, previewMember]);

  const resolveMemberText = useCallback((member) => {
    if (mode === 'custom') {
      return applyWhatsAppPlaceholders(customMessage, member).trim();
    }
    if (!selectedTemplate) {
      return applyWhatsAppPlaceholders(campaignDraft, member).trim();
    }
    // Rebuild per member so {{name}} / member fields stay correct for packages/discounts.
    // If the user edited the draft, use the draft as a template with placeholders restored
    // only when still clean; when dirty, substitute against the edited draft.
    if (campaignDirty) {
      return applyWhatsAppPlaceholders(campaignDraft, member).trim();
    }
    return buildCampaignMessage(
      selectedTemplate,
      packages,
      selectedPackageIds,
      discountPercent,
      language,
      member
    ).trim();
  }, [
    mode, customMessage, selectedTemplate, campaignDraft, campaignDirty,
    packages, selectedPackageIds, discountPercent, language, buildCampaignMessage,
  ]);

  const handleSaveTemplate = async () => {
    const title = saveName.trim();
    const body = customMessage.trim();
    if (!title) {
      toast.error(t('Give the template a title'));
      return;
    }
    if (!body) {
      toast.error(t('Write a message before saving'));
      return;
    }
    setSavingTemplate(true);
    try {
      await createWhatsAppTemplate({
        name: title,
        type: 'custom',
        bodyText: body,
      });
      toast.success(t('Template saved'));
      setShowSaveForm(false);
      setSaveName('');
      const tRes = await getWhatsAppTemplates({ limit: 100 });
      setTemplates(tRes.data.templates ?? []);
    } catch (err) {
      toast.error(err?.normalized?.message || err?.response?.data?.message || t('Could not save template'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSend = async () => {
    if (!members.length) {
      toast.error(t('Select at least one member'));
      return;
    }
    if (mode === 'campaign') {
      if (!selectedTemplate && !campaignDraft.trim()) {
        toast.error(t('Choose a template campaign first'));
        return;
      }
      if (selectedTemplate?.type === 'discounts') {
        if (!selectedPackageIds.length) {
          toast.error(t('Choose which package the discount is for'));
          return;
        }
        const dp = Number(discountPercent);
        if (isNaN(dp) || dp <= 0 || dp > 100) {
          toast.error(t('Enter a valid discount percentage between 1 and 100'));
          return;
        }
      }
    } else if (!customMessage.trim()) {
      toast.error(t('Write a custom message first'));
      return;
    }

    setSending(true);
    setNeedsConnect(false);
    const total = members.length;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let disconnected = false;
    setProgress({ sent: 0, failed: 0, skipped: 0, total });

    for (const member of members) {
      const phone = memberPhone(member);
      if (!phone || !toWhatsAppUrl(phone, null, countryCode)) {
        skipped += 1;
        setProgress({ sent, failed, skipped, total });
        continue;
      }
      const text = resolveMemberText(member);
      if (!text) {
        skipped += 1;
        setProgress({ sent, failed, skipped, total });
        continue;
      }
      if (text.length > 4000) {
        failed += 1;
        setProgress({ sent, failed, skipped, total });
        continue;
      }
      try {
        await sendWhatsAppMessage({
          phone,
          text,
          memberId: member._id || null,
          memberName: member.name || null,
          templateId: mode === 'campaign' ? (templateId || null) : null,
        });
        sent += 1;
      } catch (err) {
        if (err?.normalized?.code === 'WHATSAPP_NOT_CONNECTED') {
          disconnected = true;
          setNeedsConnect(true);
          failed += 1;
          setProgress({ sent, failed, skipped, total });
          break;
        }
        failed += 1;
      }
      setProgress({ sent, failed, skipped, total });
    }

    setSending(false);
    if (sent > 0 && failed === 0 && skipped === 0) {
      toast.success(t('Sent WhatsApp to {count} member(s)', { count: sent }));
      onClose();
    } else if (sent > 0) {
      toast.success(t('Sent {sent}. Failed {failed}. Skipped {skipped}.', { sent, failed, skipped }));
    } else if (disconnected || failed > 0) {
      toast.error(disconnected
        ? t('WhatsApp is not connected')
        : t('Could not send. Failed {failed}, skipped {skipped}.', { failed, skipped }));
    } else {
      toast.error(t('No members had a usable phone number'));
    }
  };

  const showPackagePicker = selectedTemplate?.type === 'packages';
  const showDiscountPercent = selectedTemplate?.type === 'discounts';
  const activePreview = mode === 'custom' ? customPreview : campaignPreview;
  const canSend = mode === 'custom'
    ? Boolean(customMessage.trim())
    : Boolean(campaignDraft.trim() || selectedTemplate);

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title={t('Send WhatsApp to {count} Member(s)', { count: members.length })}
      size="lg"
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={sending}>{t('Cancel')}</Btn>
          <Btn
            variant="success"
            size="sm"
            onClick={handleSend}
            disabled={loading || sending || !canSend || !members.length}
          >
            {sending
              ? t('Sending… {done}/{total}', { done: progress.sent + progress.failed + progress.skipped, total: progress.total })
              : t('Send to {count} Members', { count: sendableCount || members.length })}
          </Btn>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={tipBox}>
            {members.length === 1
              ? t('Sending to {count} selected member.', { count: members.length })
              : t('Sending to {count} selected members.', { count: members.length })}
            {sendableCount < members.length
              ? ` ${t('{count} with a usable WhatsApp number.', { count: sendableCount })}`
              : ''}
            {' '}
            {t('Large batches are paced by WhatsApp (~20s between messages).')}
          </div>

          {needsConnect && (
            <div style={tipBox}>
              {t('Connect WhatsApp before sending.')}{' '}
              <Link to="/account/whatsapp" style={{ fontWeight: 700 }}>{t('Open Connect WhatsApp')}</Link>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                ...modeTabBase,
                ...(mode === 'campaign'
                  ? { borderColor: '#2563eb', background: '#eff6ff', color: '#1e40af' }
                  : {}),
              }}
              onClick={() => setMode('campaign')}
              disabled={sending}
            >
              {t('Template campaign')}
            </button>
            <button
              type="button"
              style={{
                ...modeTabBase,
                ...(mode === 'custom'
                  ? { borderColor: '#2563eb', background: '#eff6ff', color: '#1e40af' }
                  : {}),
              }}
              onClick={() => setMode('custom')}
              disabled={sending}
            >
              {t('Custom message')}
            </button>
          </div>

          {mode === 'campaign' ? (
            templates.length === 0 ? (
              <div style={tipBox}>
                {t('No ready campaigns yet. Ask an Owner, Sales Manager, Accountant, or Head Coach to create templates from the WA Messages page — or switch to Custom message.')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={stepLabel}>{t('Step 1 — Choose a campaign')}</div>
                  <Select
                    label={t('Message type')}
                    value={typeFilter}
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    <option value="">{t('Show all')}</option>
                    {types.map((type) => (
                      <option key={type} value={type}>{t(typeLabel(type))}</option>
                    ))}
                  </Select>
                  <Select
                    label={t('Ready message')}
                    value={templateId}
                    onChange={(e) => applyTemplateSelection(e.target.value)}
                    hint={selectedTemplate ? t(typeHelp(selectedTemplate.type)) : t('Pick a saved campaign')}
                  >
                    <option value="">{t('— Choose a message —')}</option>
                    {filteredTemplates.map((tpl) => (
                      <option key={tpl._id} value={tpl._id}>
                        {tpl.isDefault ? `${tpl.name} ${t('(suggested)')}` : tpl.name}
                      </option>
                    ))}
                  </Select>
                  {hasArabic && (
                    <Select
                      label={t('Language')}
                      value={language}
                      onChange={(e) => { setLanguage(e.target.value); setCampaignDirty(false); }}
                    >
                      <option value="en">{t('English')}</option>
                      <option value="ar">{t('Arabic')}</option>
                    </Select>
                  )}
                </div>

                {showDiscountPercent && (
                  <div>
                    <div style={stepLabel}>{t('Step 2 — Choose the discount')}</div>
                    <Select
                      label={t('Which package is discounted?')}
                      value={selectedPackageIds[0] || ''}
                      onChange={(e) => {
                        setCampaignDirty(false);
                        setSelectedPackageIds(e.target.value ? [e.target.value] : []);
                      }}
                    >
                      <option value="">{t('— Choose a package —')}</option>
                      {packages.map((p) => (
                        <option key={p._id} value={p._id}>
                          {`${p.name} (${t(p.duration)}) — ${fmtNumber(p.price)} ${currency}`}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label={t('Discount %')}
                      type="number"
                      min={1}
                      max={100}
                      value={discountPercent}
                      onChange={(e) => {
                        setCampaignDirty(false);
                        setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)));
                      }}
                    />
                    {selectedDiscountPkg && Number(discountPercent) > 0 && (
                      <div style={{
                        marginTop: 4,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        fontSize: 13,
                        color: '#166534',
                        fontWeight: 600,
                      }}>
                        {t('{name}: price was {oldPrice} {currency}, now it’s {newPrice} {currency} ({percent}% off)', {
                          name: selectedDiscountPkg.name,
                          oldPrice: fmtNumber(selectedDiscountPkg.price),
                          newPrice: fmtNumber(calcNewPrice(selectedDiscountPkg.price, discountPercent)),
                          currency,
                          percent: discountPercent,
                        })}
                      </div>
                    )}
                  </div>
                )}

                {showPackagePicker && (
                  <div>
                    <div style={stepLabel}>{t('Step 2 — Which packages to include?')}</div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setCampaignDirty(false);
                          setSelectedPackageIds(packages.map((p) => String(p._id)));
                        }}
                        style={linkBtnStyle}
                      >
                        {t('Select all')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCampaignDirty(false);
                          setSelectedPackageIds([]);
                        }}
                        style={linkBtnStyle}
                      >
                        {t('Clear')}
                      </button>
                    </div>
                    <div style={{
                      maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '8px 10px', background: 'var(--bg)',
                    }}>
                      {packages.map((p) => {
                        const id = String(p._id);
                        return (
                          <label key={id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 13, color: 'var(--t2)', padding: '4px 0', cursor: 'pointer',
                          }}>
                            <input
                              type="checkbox"
                              checked={selectedPackageIds.includes(id)}
                              onChange={() => togglePackage(id)}
                            />
                            <span>{`${p.name} — ${t(p.duration)} — ${fmtNumber(p.price)} ${currency}`}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedTemplate && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={stepLabel}>
                        {showDiscountPercent || showPackagePicker
                          ? t('Step 3 — Check & edit')
                          : t('Step 2 — Check & edit')}
                      </div>
                      <Btn
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setCampaignDirty(false);
                          setCampaignDraft(recomposed);
                        }}
                      >
                        {t('Rebuild from choices')}
                      </Btn>
                    </div>
                    <Textarea
                      value={campaignDraft}
                      onChange={(e) => { setCampaignDirty(true); setCampaignDraft(e.target.value); }}
                      rows={7}
                      dir="auto"
                      hint={t('Edits apply to every recipient; name placeholders still resolve per member when possible.')}
                    />
                  </div>
                )}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={stepLabel}>{t('Write your message')}</div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--t3)' }}>
                {t('Click a placeholder to insert it. Each member gets their own values when you send.')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {WHATSAPP_PLACEHOLDER_TOKENS.map(({ token, label }) => (
                  <button
                    key={token}
                    type="button"
                    style={chipStyle}
                    onClick={() => insertPlaceholder(token)}
                    disabled={sending}
                    title={token}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              <textarea
                ref={customTextareaRef}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={7}
                dir="auto"
                disabled={sending}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                  outline: 'none', resize: 'vertical',
                }}
              />

              {canSaveTemplate ? (
                showSaveForm ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    padding: 12, border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--bg)',
                  }}>
                    <Input
                      label={t('Template title')}
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder={t('e.g. Renewal reminder')}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Btn variant="ghost" size="sm" onClick={() => setShowSaveForm(false)} disabled={savingTemplate}>
                        {t('Cancel')}
                      </Btn>
                      <Btn variant="outline" size="sm" onClick={handleSaveTemplate} disabled={savingTemplate}>
                        {savingTemplate ? <Spinner size="sm" /> : t('Save template')}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSaveForm(true)}
                      disabled={!customMessage.trim() || sending}
                    >
                      {t('Save as new template')}
                    </Btn>
                  </div>
                )
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--t4)' }}>
                  {t('To save templates for your team, ask an Owner or Sales Manager (WA Messages page).')}
                </p>
              )}
            </div>
          )}

          {(mode === 'custom' || selectedTemplate) && (
            <div style={{
              border: '1px solid #bbf7d0', borderRadius: 8, padding: 12,
              background: '#f0fdf4',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                {t('PREVIEW')}
                {previewMember?.name ? ' — ' : ''}
                {previewMember?.name ? <bdi>{previewMember.name}</bdi> : null}
              </div>
              <pre dir="auto" style={{
                margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                fontSize: 13, color: 'var(--t1)', lineHeight: 1.45,
              }}>
                {activePreview || '—'}
              </pre>
            </div>
          )}

          {sending && (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>
              {t('Sent {sent} · Failed {failed} · Skipped {skipped} of {total}', {
                sent: progress.sent,
                failed: progress.failed,
                skipped: progress.skipped,
                total: progress.total,
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
