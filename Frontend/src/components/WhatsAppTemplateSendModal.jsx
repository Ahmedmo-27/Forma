import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Btn, Modal, Select, Textarea, Input, Spinner } from './ui';
import { getWhatsAppTemplates, getPackages, sendWhatsAppMessage } from '../api/endpoints';
import { composeWhatsAppTemplateMessage, toWhatsAppUrl } from '../utils/whatsapp';
import { useTenant } from '../context/TenantContext';

function typeLabel(type) {
  if (type === 'packages') return 'Packages list';
  if (type === 'discounts') return 'Discount offer';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other';
}

function typeHelp(type) {
  if (type === 'packages') return 'Shows membership packages and prices in the message.';
  if (type === 'discounts') return 'Pick a package and a %, and the new price is written for you.';
  return 'A free-text message you can edit before sending.';
}

function defaultPackageIdsFrom(template) {
  const raw = template?.defaultPackageIds ?? [];
  return raw.map((p) => String(p._id ?? p)).filter(Boolean);
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

function calcNewPrice(price, percent) {
  const p = Number(price) || 0;
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return Math.round(p * (1 - pct / 100));
}

export default function WhatsAppTemplateSendModal({ open, onClose, phone, memberName, memberId }) {
  const { currency = 'EGP', countryCode = '20' } = useTenant() || {};
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedPackageIds, setSelectedPackageIds] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [language, setLanguage] = useState('en');
  const [message, setMessage] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);

  const buildMessage = useCallback((template, pkgs, pkgIds, percent, lang, name) => {
    if (!template) return '';
    return composeWhatsAppTemplateMessage(template, pkgs, {
      memberName: name,
      selectedPackageIds: pkgIds,
      discountPercent: percent,
      language: lang,
      currency,
    });
  }, [currency]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setTypeFilter('');
    setTemplateId('');
    setSelectedPackageIds([]);
    setDiscountPercent(0);
    setLanguage('en');
    setMessage('');
    setMessageDirty(false);
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

        const pick = list.find((t) => t.isDefault) || (list.length === 1 ? list[0] : null);
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
          setMessage(buildMessage(pick, pkgs, nextIds, percent, 'en', memberName));
        }
      })
      .catch((err) => {
        if (!cancelled && err?.normalized?.status !== 403) {
          toast.error(err?.normalized?.message || 'Could not load message templates');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, memberName, buildMessage]);

  const types = useMemo(() => {
    const set = new Set(templates.map((t) => t.type));
    return Array.from(set).sort((a, b) => {
      const order = { packages: 0, discounts: 1 };
      return (order[a] ?? 99) - (order[b] ?? 99) || a.localeCompare(b);
    });
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (!typeFilter) return templates;
    return templates.filter((t) => t.type === typeFilter);
  }, [templates, typeFilter]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) ?? null,
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
    return buildMessage(
      selectedTemplate,
      packages,
      selectedPackageIds,
      discountPercent,
      language,
      memberName
    );
  }, [selectedTemplate, packages, selectedPackageIds, discountPercent, language, memberName, buildMessage]);

  useEffect(() => {
    if (!selectedTemplate || messageDirty) return;
    setMessage(recomposed);
  }, [recomposed, selectedTemplate, messageDirty]);

  const applyTemplateSelection = (id) => {
    const t = templates.find((x) => x._id === id);
    setTemplateId(id);
    setMessageDirty(false);
    if (!t) {
      setMessage('');
      return;
    }
    const pkgIds = defaultPackageIdsFrom(t);
    let nextIds;
    if (t.type === 'discounts') {
      nextIds = pkgIds.length ? [pkgIds[0]] : (packages[0] ? [String(packages[0]._id)] : []);
    } else if (t.type === 'packages') {
      nextIds = pkgIds.length ? pkgIds : packages.map((p) => String(p._id));
    } else {
      nextIds = [];
    }
    const percent = Number(t.defaultDiscountPercent) || (t.type === 'discounts' ? 50 : 0);
    setSelectedPackageIds(nextIds);
    setDiscountPercent(percent);
    setMessage(buildMessage(t, packages, nextIds, percent, language, memberName));
  };

  const handleTypeChange = (value) => {
    setTypeFilter(value);
    setTemplateId('');
    setMessage('');
    setMessageDirty(false);
    setSelectedPackageIds([]);
    setDiscountPercent(0);
    const first = templates.find((t) => !value || t.type === value);
    if (first) applyTemplateSelection(first._id);
  };

  const togglePackage = (id) => {
    const sid = String(id);
    setMessageDirty(false);
    setSelectedPackageIds((prev) => (
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    ));
  };

  const selectAllPackages = () => {
    setMessageDirty(false);
    setSelectedPackageIds(packages.map((p) => String(p._id)));
  };

  const clearPackages = () => {
    setMessageDirty(false);
    setSelectedPackageIds([]);
  };

  const handleReset = () => {
    setMessageDirty(false);
    setMessage(recomposed);
  };

  const handleCopy = async () => {
    if (!message.trim()) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Message copied — you can paste it in WhatsApp');
    } catch {
      toast.error('Could not copy the message');
    }
  };

  const handleSend = async () => {
    const trimmedMsg = message.trim();
    if (!trimmedMsg) {
      toast.error('Please write or choose a message first');
      return;
    }
    if (trimmedMsg.length > 4000) {
      toast.error('Message content must not exceed 4000 characters');
      return;
    }
    if (selectedTemplate?.type === 'discounts') {
      if (!selectedPackageIds.length) {
        toast.error('Choose which package the discount is for');
        return;
      }
      const dp = Number(discountPercent);
      if (isNaN(dp) || dp <= 0 || dp > 100) {
        toast.error('Enter a valid discount percentage between 1 and 100');
        return;
      }
    }
    if (!toWhatsAppUrl(phone, message, countryCode)) {
      toast.error('This member’s phone number is not valid for WhatsApp');
      return;
    }
    setSending(true);
    setNeedsConnect(false);
    try {
      await sendWhatsAppMessage({
        phone,
        text: trimmedMsg,
        memberId: memberId || null,
        memberName: memberName || null,
        templateId: templateId || null,
      });
      toast.success('WhatsApp message sent');
      onClose();
    } catch (err) {
      if (err?.normalized?.code === 'WHATSAPP_NOT_CONNECTED') setNeedsConnect(true);
    } finally {
      setSending(false);
    }
  };

  const showPackagePicker = selectedTemplate?.type === 'packages';
  const showDiscountPercent = selectedTemplate?.type === 'discounts';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send WhatsApp message"
      size="lg"
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        <Btn variant="outline" size="sm" onClick={handleCopy} disabled={!message.trim()}>
          Copy text
        </Btn>
        <Btn
          variant="success"
          size="sm"
          onClick={handleSend}
          disabled={loading || sending || !message.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </Btn>
      </>}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <div style={tipBox}>
          No ready messages yet. Ask an Owner, Sales Manager, Accountant, or Head Coach to create templates from the <strong>WA Messages</strong> page.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={tipBox}>
            Messaging <strong>{memberName || 'this member'}</strong>. Follow the steps below, check the preview, then click <strong>Send</strong>. The message goes out from your linked WhatsApp.
          </div>
          {needsConnect && (
            <div style={tipBox}>
              Connect WhatsApp before sending. <Link to="/account/whatsapp" style={{ fontWeight: 700 }}>Open Connect WhatsApp</Link>
            </div>
          )}

          <div>
            <div style={stepLabel}>Step 1 — What do you want to send?</div>
            <Select
              label="Message type"
              value={typeFilter}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="">Show all</option>
              {types.map((t) => (
                <option key={t} value={t}>{typeLabel(t)}</option>
              ))}
            </Select>
            <Select
              label="Ready message"
              value={templateId}
              onChange={(e) => applyTemplateSelection(e.target.value)}
              hint={selectedTemplate ? typeHelp(selectedTemplate.type) : 'Pick a saved message'}
            >
              <option value="">— Choose a message —</option>
              {filteredTemplates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}{t.isDefault ? ' (suggested)' : ''}
                </option>
              ))}
            </Select>
            {hasArabic && (
              <Select
                label="Language"
                value={language}
                onChange={(e) => { setLanguage(e.target.value); setMessageDirty(false); }}
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </Select>
            )}
          </div>

          {showDiscountPercent && (
            <div>
              <div style={stepLabel}>Step 2 — Choose the discount</div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--t3)' }}>
                Select the package and how much % off. We will write the old and new price in the message for you.
              </p>
              <Select
                label="Which package is discounted?"
                value={selectedPackageIds[0] || ''}
                onChange={(e) => {
                  setMessageDirty(false);
                  setSelectedPackageIds(e.target.value ? [e.target.value] : []);
                }}
              >
                <option value="">— Choose a package —</option>
                {packages.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.duration}) — {Number(p.price).toLocaleString()} {currency}
                  </option>
                ))}
              </Select>
              <Input
                label="Discount %"
                type="number"
                min={1}
                max={100}
                value={discountPercent}
                onChange={(e) => {
                  setMessageDirty(false);
                  setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)));
                }}
                hint="Example: 50 means half price"
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
                  {selectedDiscountPkg.name}: price was {Number(selectedDiscountPkg.price).toLocaleString()} {currency},
                  now it’s {calcNewPrice(selectedDiscountPkg.price, discountPercent).toLocaleString()} {currency}
                  {' '}({discountPercent}% off)
                </div>
              )}
            </div>
          )}

          {showPackagePicker && (
            <div>
              <div style={stepLabel}>Step 2 — Which packages to include?</div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--t3)' }}>
                Tick the packages you want listed in the WhatsApp message.
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <button type="button" onClick={selectAllPackages} style={linkBtnStyle}>Select all</button>
                <button type="button" onClick={clearPackages} style={linkBtnStyle}>Clear</button>
              </div>
              <div style={{
                maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px', background: 'var(--bg)',
              }}>
                {packages.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--t4)' }}>No packages found</p>
                ) : packages.map((p) => {
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
                      <span>{p.name} — {p.duration} — {Number(p.price).toLocaleString()} {currency}</span>
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
                  {showDiscountPercent || showPackagePicker ? 'Step 3' : 'Step 2'} — Check & edit the message
                </div>
                <Btn variant="ghost" size="xs" onClick={handleReset}>
                  Rebuild from choices
                </Btn>
              </div>
              <Textarea
                value={message}
                onChange={(e) => { setMessageDirty(true); setMessage(e.target.value); }}
                rows={8}
                hint="You can edit any wording before opening WhatsApp"
              />
              <div style={{
                border: '1px solid #bbf7d0', borderRadius: 8, padding: 12,
                background: '#f0fdf4', marginTop: 4,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                  HOW IT WILL LOOK IN WHATSAPP
                </div>
                <pre style={{
                  margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                  fontSize: 13, color: 'var(--t1)', lineHeight: 1.45,
                }}>
                  {message || '—'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: '#2563eb',
  cursor: 'pointer',
};
