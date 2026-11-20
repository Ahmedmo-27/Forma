import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, CardHeader, Btn, Input, Textarea,
  Spinner, Modal, ConfirmDialog, Table, EmptyState, CAIRO_ZONE, Pagination,
} from '../../components/ui';
import { MessageCircle } from 'lucide-react';
import {
  getWhatsAppTemplates, createWhatsAppTemplate, updateWhatsAppTemplate, deleteWhatsAppTemplate,
  getPackages,
} from '../../api/endpoints';
import { composeWhatsAppTemplateMessage } from '../../utils/whatsapp';
import { useTourReveal } from '../../tutorials/walkthrough-context';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const PAGE_SIZE = 15;
const ROLE_OPTIONS = [
  'Owner', 'General Manager', 'Sales Manager', 'Sales', 'Receptionist', 'Accountant',
  'Coach', 'Head Coach',
];

const TYPE_CARDS = [
  {
    value: 'packages',
    title: tr('Packages list'),
    desc: tr('Share gym packages and prices with a member.'),
  },
  {
    value: 'discounts',
    title: tr('Discount offer'),
    desc: tr('Offer a % off on one package. The new price is calculated automatically.'),
  },
  {
    value: 'custom',
    title: tr('Other message'),
    desc: tr('Write any free message (welcome, follow-up, reminder…).'),
  },
];

const EMPTY_FORM = {
  name: '',
  typeMode: 'packages',
  customType: '',
  introText: '',
  bodyText: '',
  introTextAr: '',
  bodyTextAr: '',
  includeLiveData: true,
  defaultPackageIds: [],
  defaultDiscountPercent: 50,
  allowedRoles: [],
  isDefault: false,
};

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

function resolveType(form) {
  if (form.typeMode === 'custom') return (form.customType || '').trim().toLowerCase();
  return form.typeMode;
}

function isBuiltinType(type) {
  return type === 'packages' || type === 'discounts';
}

/** Renders a translated sentence with a `{token}` placeholder swapped for a React node. */
function withNode(text, token, node) {
  const [before, after = ''] = text.split(token);
  return <>{before}{node}{after}</>;
}

function typeLabel(type, t) {
  if (type === 'packages') return t('Packages list');
  if (type === 'discounts') return t('Discount offer');
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : '—';
}

function previewSnippet(template, packages) {
  const pkgIds = (template.defaultPackageIds || []).map((p) => String(p._id ?? p));
  const msg = composeWhatsAppTemplateMessage(template, packages, {
    memberName: 'Ahmed',
    selectedPackageIds: pkgIds.length ? pkgIds : (packages[0] ? [String(packages[0]._id)] : []),
    discountPercent: template.defaultDiscountPercent || 50,
  });
  if (!msg) return '—';
  return msg.length > 90 ? `${msg.slice(0, 90)}…` : msg;
}

function insertNameToken(text) {
  const token = '{{name}}';
  if (!text) return `Hi ${token}! `;
  if (text.includes(token) || text.includes('{{firstName}}')) return text;
  return `${text.trim()} ${token}`.trim();
}

function TemplateForm({ form, onChange, errors, packages }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const set = (key, value) => onChange({ ...form, [key]: value });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const builtin = form.typeMode !== 'custom';

  const togglePackage = (id) => {
    const sid = String(id);
    if (form.typeMode === 'discounts') {
      set('defaultPackageIds', [sid]);
      return;
    }
    const next = form.defaultPackageIds.includes(sid)
      ? form.defaultPackageIds.filter((x) => x !== sid)
      : [...form.defaultPackageIds, sid];
    set('defaultPackageIds', next);
  };

  const toggleRole = (role) => {
    const next = form.allowedRoles.includes(role)
      ? form.allowedRoles.filter((r) => r !== role)
      : [...form.allowedRoles, role];
    set('allowedRoles', next);
  };

  const livePreview = useMemo(() => composeWhatsAppTemplateMessage(
    {
      type: resolveType(form) || form.typeMode,
      introText: form.introText,
      bodyText: form.bodyText,
      introTextAr: form.introTextAr,
      bodyTextAr: form.bodyTextAr,
      includeLiveData: form.includeLiveData,
      defaultDiscountPercent: form.defaultDiscountPercent,
    },
    packages,
    {
      memberName: 'Ahmed Hassan',
      selectedPackageIds: form.defaultPackageIds.length
        ? form.defaultPackageIds
        : (form.typeMode === 'discounts' && packages[0] ? [String(packages[0]._id)] : undefined),
      discountPercent: form.defaultDiscountPercent,
    }
  ), [form, packages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={tipBox}>
        {t('A template is a ready-made WhatsApp message. Staff pick it on a member profile, edit if needed, then open WhatsApp with the message filled in.')}
      </div>

      <div>
        <div style={stepLabel}>{t('Step 1 — What is this message for?')}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {TYPE_CARDS.map((card) => {
            const active = form.typeMode === card.value;
            return (
              <button
                key={card.value}
                type="button"
                onClick={() => set('typeMode', card.value)}
                style={{
                  textAlign: 'start',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${active ? '#2563eb' : 'var(--border)'}`,
                  background: active ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#1d4ed8' : 'var(--t1)' }}>
                  {t(card.title)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{t(card.desc)}</div>
              </button>
            );
          })}
        </div>
        {form.typeMode === 'custom' && (
          <div style={{ marginTop: 10 }}>
            <Input
              label={t('Name this message type')}
              value={form.customType}
              onChange={(e) => set('customType', e.target.value)}
              error={errors.customType}
              placeholder={t('e.g. Welcome, Follow-up, Reminder')}
              hint={t('A short label so staff can find it later')}
            />
          </div>
        )}
      </div>

      <div data-walkthrough="template-name">
        <div style={stepLabel}>{t('Step 2 — Give it a clear title')}</div>
        <Input
          label={t('Template title')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          placeholder={
            form.typeMode === 'discounts'
              ? t('e.g. Summer 50% discount')
              : form.typeMode === 'packages'
                ? t('e.g. Current membership packages')
                : t('e.g. Welcome new member')
          }
        />
      </div>

      <div data-walkthrough="template-body">
        <div style={stepLabel}>{t('Step 3 — Write the message')}</div>
        <div style={{ ...tipBox, marginBottom: 10, background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--t2)' }}>
          {withNode(
            t('Tip: click {button} where you want their name to appear. When sending, it becomes the real name automatically.'),
            '{button}',
            <strong>{t('Add member’s name')}</strong>,
          )}
        </div>

        {builtin ? (
          <>
            <Textarea
              label={t('Opening line')}
              value={form.introText}
              onChange={(e) => set('introText', e.target.value)}
              rows={3}
              placeholder={t('Hi {{name}}! …')}
            />
            <div style={{ marginTop: -6, marginBottom: 10 }}>
              <Btn variant="outline" size="xs" onClick={() => set('introText', insertNameToken(form.introText))}>
                {t('Add member’s name')}
              </Btn>
            </div>
            <Textarea
              label={form.typeMode === 'discounts' ? t('Closing line (after the discount details)') : t('Closing line (after the package list)')}
              value={form.bodyText}
              onChange={(e) => set('bodyText', e.target.value)}
              rows={3}
              placeholder={
                form.typeMode === 'discounts'
                  ? t('This offer is available for a limited time…')
                  : t('Tell me which package you prefer…')
              }
            />
          </>
        ) : (
          <>
            <Textarea
              label={t('Full message')}
              value={form.bodyText}
              onChange={(e) => set('bodyText', e.target.value)}
              rows={6}
              error={errors.bodyText}
              placeholder={t('Write the full WhatsApp message…')}
            />
            <div style={{ marginTop: -6 }}>
              <Btn variant="outline" size="xs" onClick={() => set('bodyText', insertNameToken(form.bodyText))}>
                {t('Add member’s name')}
              </Btn>
            </div>
          </>
        )}
      </div>

      {form.typeMode === 'packages' && (
        <div>
          <div style={stepLabel}>{t('Step 4 — Which packages to show by default?')}</div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--t3)' }}>
            {t('Staff can still change this when sending. Leave empty to show all packages.')}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)', cursor: 'pointer', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.includeLiveData}
              onChange={(e) => set('includeLiveData', e.target.checked)}
            />
            {t('Automatically add package names and prices into the message')}
          </label>
          {form.includeLiveData && (
            <div style={{
              maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px',
            }}>
              {(packages || []).map((p) => {
                const id = String(p._id);
                return (
                  <label key={id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.defaultPackageIds.includes(id)}
                      onChange={() => togglePackage(id)}
                    />
                    {t('{name} — {duration} — {price} EGP', { name: p.name, duration: p.duration, price: fmtNumber(Number(p.price)) })}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {form.typeMode === 'discounts' && (
        <div>
          <div style={stepLabel}>{t('Step 4 — Default discount settings')}</div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--t3)' }}>
            {t('When someone sends this template, they will choose the package and percentage. You can set helpful defaults here.')}
          </p>
          <Input
            label={t('Suggested discount %')}
            type="number"
            min={1}
            max={100}
            value={form.defaultDiscountPercent}
            onChange={(e) => set('defaultDiscountPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            hint={t('Example: 50 means “price was 2000, now it’s 1000”')}
            error={errors.defaultDiscountPercent}
          />
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', margin: '10px 0 6px' }}>
            {t('Suggested package (optional)')}
          </div>
          <div style={{
            maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 10px',
          }}>
            {(packages || []).map((p) => {
              const id = String(p._id);
              return (
                <label key={id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    className="tenant-radio"
                    name="defaultDiscountPkg"
                    checked={form.defaultPackageIds[0] === id}
                    onChange={() => togglePackage(id)}
                  />
                  {t('{name} — {duration} — {price} EGP', { name: p.name, duration: p.duration, price: fmtNumber(Number(p.price)) })}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#2563eb',
          }}
        >
          {showAdvanced ? t('Hide extra options') : t('Show extra options (Arabic, who can use it, default)')}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {builtin && (
              <>
                <Textarea
                  label={t('Opening line (Arabic)')}
                  value={form.introTextAr}
                  onChange={(e) => set('introTextAr', e.target.value)}
                  rows={2}
                />
                <Textarea
                  label={t('Closing line (Arabic)')}
                  value={form.bodyTextAr}
                  onChange={(e) => set('bodyTextAr', e.target.value)}
                  rows={2}
                />
              </>
            )}
            {!builtin && (
              <Textarea
                label={t('Full message (Arabic)')}
                value={form.bodyTextAr}
                onChange={(e) => set('bodyTextAr', e.target.value)}
                rows={4}
              />
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>
                {t('Who can use this template?')}
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--t4)' }}>
                {t('Leave all unchecked so everyone with member WhatsApp access can use it.')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {ROLE_OPTIONS.map((role) => (
                  <label key={role} style={{ display: 'flex', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--t2)' }}>
                    <input
                      type="checkbox"
                      checked={form.allowedRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />
                    {t(role)}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => set('isDefault', e.target.checked)}
              />
              {t('Open this template first when sending this type of message')}
            </label>
          </div>
        )}
      </div>

      {livePreview && (
        <div>
          <div style={stepLabel}>{t('Example of what staff will see')}</div>
          <div style={{
            border: '1px solid #bbf7d0', borderRadius: 8, padding: 12,
            background: '#f0fdf4', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45, color: 'var(--t1)',
          }}>
            {livePreview}
          </div>
        </div>
      )}
    </div>
  );
}

function validateForm(form, t) {
  const errs = {};
  const nameTrim = (form.name || '').trim();
  if (!nameTrim) {
    errs.name = t('Please give this template a title');
  } else if (nameTrim.length > 120) {
    errs.name = t('Title must not exceed 120 characters');
  }

  const type = resolveType(form);
  if (!type) {
    errs[form.typeMode === 'custom' ? 'customType' : 'type'] = t('Please choose a type');
  } else if (type.length > 60) {
    errs[form.typeMode === 'custom' ? 'customType' : 'type'] = t('Type name must not exceed 60 characters');
  }

  if (form.typeMode === 'custom' && !form.bodyText.trim() && !form.bodyTextAr.trim()) {
    errs.bodyText = t('Please write the message');
  }
  if (form.introText && form.introText.trim().length > 2000) {
    errs.introText = t('Intro text must not exceed 2000 characters');
  }
  if (form.bodyText && form.bodyText.trim().length > 4000) {
    errs.bodyText = t('Body text must not exceed 4000 characters');
  }
  if (form.introTextAr && form.introTextAr.trim().length > 2000) {
    errs.introTextAr = t('Arabic intro text must not exceed 2000 characters');
  }
  if (form.bodyTextAr && form.bodyTextAr.trim().length > 4000) {
    errs.bodyTextAr = t('Arabic body text must not exceed 4000 characters');
  }

  if (form.typeMode === 'discounts') {
    const d = Number(form.defaultDiscountPercent);
    if (isNaN(d) || d <= 0 || d > 100) {
      errs.defaultDiscountPercent = t('Enter a valid discount percentage between 1 and 100');
    }
  }
  return errs;
}

function formToPayload(form) {
  const type = resolveType(form);
  return {
    name: form.name.trim(),
    type,
    introText: form.introText.trim() || null,
    bodyText: form.bodyText.trim() || null,
    introTextAr: form.introTextAr.trim() || null,
    bodyTextAr: form.bodyTextAr.trim() || null,
    includeLiveData: isBuiltinType(type) ? form.includeLiveData : false,
    defaultPackageIds: isBuiltinType(type) ? form.defaultPackageIds : [],
    defaultDiscountPercent: type === 'discounts' ? Number(form.defaultDiscountPercent) || 0 : 0,
    allowedRoles: form.allowedRoles,
    isDefault: form.isDefault,
  };
}

function templateToForm(tpl) {
  const builtin = isBuiltinType(tpl.type);
  return {
    name: tpl.name ?? '',
    typeMode: builtin ? tpl.type : 'custom',
    customType: builtin ? '' : (tpl.type ?? ''),
    introText: tpl.introText ?? '',
    bodyText: tpl.bodyText ?? '',
    introTextAr: tpl.introTextAr ?? '',
    bodyTextAr: tpl.bodyTextAr ?? '',
    includeLiveData: tpl.includeLiveData !== false,
    defaultPackageIds: (tpl.defaultPackageIds || []).map((p) => String(p._id ?? p)),
    defaultDiscountPercent: Number(tpl.defaultDiscountPercent) || 50,
    allowedRoles: tpl.allowedRoles || [],
    isDefault: Boolean(tpl.isDefault),
  };
}

export default function ManageWhatsAppTemplates() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  const fmtCreated = (d) => (d ? fmtDate(d, {
    timeZone: CAIRO_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }, 'en-GB') : '—');
  usePageTitle(t('WhatsApp Templates'));

  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });

  const [showCreate, setShowCreate] = useState(false);
  useTourReveal('new-template', () => setShowCreate(true), () => setShowCreate(false));
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState({});
  const [editing, setEditing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        getWhatsAppTemplates({ page, limit: PAGE_SIZE, all: 'true' }),
        getPackages({ limit: 100 }),
      ]);
      setTemplates(tRes.data.templates ?? []);
      setPagination(tRes.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
      setPackages(pRes.data.packages ?? []);
    } catch {
      toast.error(t('Failed to load templates'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const errs = validateForm(createForm, t);
    if (Object.keys(errs).length) { setCreateErrors(errs); return; }
    setCreating(true);
    try {
      await createWhatsAppTemplate(formToPayload(createForm));
      toast.success(t('Template saved'));
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      setCreateErrors({});
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to create template'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (tpl) => {
    setEditTarget(tpl);
    setEditForm(templateToForm(tpl));
    setEditErrors({});
  };

  const handleEdit = async () => {
    const errs = validateForm(editForm, t);
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    setEditing(true);
    try {
      await updateWhatsAppTemplate(editTarget._id, formToPayload(editForm));
      toast.success(t('Template updated'));
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to update template'));
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWhatsAppTemplate(deleteTarget._id);
      toast.success(t('Template removed from the send list'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to delete template'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <PageHeader walkthrough="wa-header" title={t('WhatsApp Templates')}>
        <span data-walkthrough="wa-new">
          <Btn
            variant="blue"
            size="sm"
            onClick={() => { setCreateForm(EMPTY_FORM); setCreateErrors({}); setShowCreate(true); }}
          >
            {t('Create template')}
          </Btn>
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="wa-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{
          ...tipBox,
          marginBottom: 16,
        }}>
          <strong>{t('How this works:')}</strong>{' '}
          {withNode(
            t('create ready messages here → on a member’s profile, click {action} → choose package/discount if needed → open WhatsApp with the text ready to send.'),
            '{action}',
            <em>{t('Send a template message')}</em>,
          )}
        </div>

        <Card noPad>
          <CardHeader title={t('Saved templates ({count})', { count: pagination.total })} />
          <Table
            headers={[t('Title'), t('Used for'), t('Quick look'), t('Created'), '']}
            loading={loading}
            skeletonRows={4}
          >
            {!loading && templates.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={MessageCircle}
                    message={t('No templates yet')}
                    sub={t('Create one for packages, discounts, or any other message')}
                  />
                </td>
              </tr>
            )}
            {templates.map((tpl) => (
              <tr
                key={tpl._id}
                style={{ borderBottom: '1px solid var(--border)', opacity: tpl.isActive ? 1 : 0.55 }}
              >
                <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--t1)', fontSize: 13 }}>
                  {tpl.name}
                  {tpl.isDefault && (
                    <span style={{ marginInlineStart: 8, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>{t('Suggested first')}</span>
                  )}
                  {!tpl.isActive && (
                    <span style={{ marginInlineStart: 8, fontSize: 11, color: 'var(--t4)', fontWeight: 500 }}>{t('Inactive')}</span>
                  )}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--t2)' }}>
                  {typeLabel(tpl.type, t)}
                  {tpl.type === 'discounts' && tpl.defaultDiscountPercent > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                      {t('Usually {percent}% off', { percent: tpl.defaultDiscountPercent })}
                    </div>
                  )}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--t3)', whiteSpace: 'pre-wrap', maxWidth: 280 }}>
                  {previewSnippet(tpl, packages)}
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--t4)', fontSize: 12 }}>{fmtCreated(tpl.createdAt)}</td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn variant="outline" size="xs" onClick={() => openEdit(tpl)}>{t('Edit')}</Btn>
                    {tpl.isActive && (
                      <Btn variant="danger" size="xs" onClick={() => setDeleteTarget(tpl)}>{t('Remove')}</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.limit ?? PAGE_SIZE}
            onPageChange={setPage}
          />
        </Card>
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('Create WhatsApp template')}
        size="lg"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>{t('Cancel')}</Btn>
          <Btn variant="blue" size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? <Spinner size="sm" /> : t('Save template')}
          </Btn>
        </>}
      >
        <TemplateForm form={createForm} onChange={setCreateForm} errors={createErrors} packages={packages} />
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={t('Edit template — {name}', { name: editTarget?.name ?? '' })}
        size="lg"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setEditTarget(null)} disabled={editing}>{t('Cancel')}</Btn>
          <Btn variant="blue" size="sm" onClick={handleEdit} disabled={editing}>
            {editing ? <Spinner size="sm" /> : t('Save changes')}
          </Btn>
        </>}
      >
        <TemplateForm form={editForm} onChange={setEditForm} errors={editErrors} packages={packages} />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('Remove template?')}
        message={t('Remove "{name}" from the send list? Staff will no longer see it when messaging members.', { name: deleteTarget?.name })}
        confirmLabel={t('Remove')}
        danger
        loading={deleting}
      />
    </Layout>
  );
}
