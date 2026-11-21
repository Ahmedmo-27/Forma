import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Clock3,
  Copy,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react';
import Layout from '../../components/Layout';
import {
  Btn,
  EmptyState,
  Input,
  MenuSelect,
  PageHeader,
  Spinner,
  Textarea,
  CAIRO_ZONE,
} from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { useAuth } from '../../context/AuthContext';
import { useLocationScope, ALL_LOCATIONS } from '../../context/LocationContext';
import { hasAccess } from '../../lib/access';
import {
  completeMaintenanceItem,
  copyMaintenanceItem,
  createMaintenanceItems,
  deleteMaintenanceItem,
  getMaintenanceBoard,
  getMaintenanceItems,
  listLocations,
} from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const INTERVAL_OPTIONS = [
  { value: 'hour', label: tr('Hour(s)') },
  { value: 'day', label: tr('Day(s)') },
  { value: 'week', label: tr('Week(s)') },
  { value: 'month', label: tr('Month(s)') },
];

const STATUS_META = {
  overdue: { label: tr('Overdue'), color: '#B91C1C', bg: '#FEF2F2' },
  due: { label: tr('Due'), color: '#B45309', bg: '#FFFBEB' },
  ok: { label: tr('Done'), color: '#047857', bg: '#ECFDF5' },
};

function formatInterval(value, unit, t) {
  const n = Number(value) || 1;
  const labels = n === 1
    ? { hour: tr('Every 1 hour'), day: tr('Every 1 day'), week: tr('Every 1 week'), month: tr('Every 1 month') }
    : { hour: tr('Every {count} hours'), day: tr('Every {count} days'), week: tr('Every {count} weeks'), month: tr('Every {count} months') };
  if (labels[unit]) return t(labels[unit], { count: n });
  return t('Every {count} {unit}', { count: n, unit });
}

function personName(user, t) {
  return user?.name || user?.username || t('Staff');
}

function whenLabel(date, t, fmt) {
  if (!date) return t('Never');
  const day = fmt.fmtDate(date, { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
  const time = fmt.fmtTime(date, { timeZone: CAIRO_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }, 'en-US');
  return `${day} ${time}`;
}

const emptyForm = {
  title: '',
  description: '',
  intervalValue: 1,
  intervalUnit: 'day',
  applyMode: 'this',
  targetLocationIds: [],
};

export default function MaintenancePage() {
  const { t } = useI18n();
  usePageTitle(t('Maintenance'));
  const { user } = useAuth();
  const {
    multiEnabled,
    locations: scopedLocations,
    selectedLocationId,
    setSelectedLocationId,
  } = useLocationScope();

  const canChecklist = hasAccess(user, 'maintenance_checklist');
  const canManage = hasAccess(user, 'manage_maintenance');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');

  const [tab, setTab] = useState(() => {
    if (requestedTab === 'manage' && canManage) return 'manage';
    if (requestedTab === 'board' && canChecklist) return 'board';
    return canChecklist ? 'board' : 'manage';
  });
  const [allLocations, setAllLocations] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [copyTarget, setCopyTarget] = useState(null);
  const [copyMode, setCopyMode] = useState('all');
  const [copyLocationIds, setCopyLocationIds] = useState([]);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (requestedTab === 'manage' && canManage) setTab('manage');
    else if (requestedTab === 'board' && canChecklist) setTab('board');
  }, [requestedTab, canManage, canChecklist]);

  function switchTab(next) {
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'manage') nextParams.set('tab', 'manage');
    else nextParams.delete('tab');
    setSearchParams(nextParams, { replace: true });
  }

  const locationOptions = useMemo(() => {
    if (scopedLocations?.length) return scopedLocations;
    return allLocations;
  }, [scopedLocations, allLocations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await listLocations();
        if (!cancelled) setAllLocations(data?.locations || []);
      } catch {
        if (!cancelled) setAllLocations([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reminder notifications deep-link to a branch: /maintenance?locationId=<id>
  const requestedBranch = searchParams.get('locationId');
  useEffect(() => {
    if (!requestedBranch) return;
    setSelectedLocationId(requestedBranch);
    setBranchId(requestedBranch);
  }, [requestedBranch, setSelectedLocationId]);

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== ALL_LOCATIONS) {
      setBranchId(String(selectedLocationId));
      return;
    }
    if (locationOptions.length === 1) {
      setBranchId(String(locationOptions[0]._id));
      return;
    }
    if (!branchId && locationOptions.length) {
      setBranchId(String(locationOptions[0]._id));
    }
  }, [selectedLocationId, locationOptions, branchId]);

  const needsBranchPicker = multiEnabled && (selectedLocationId === ALL_LOCATIONS || locationOptions.length > 1);

  const loadBoard = useCallback(async () => {
    if (!canChecklist || !branchId) {
      setBoard([]);
      return;
    }
    const { data } = await getMaintenanceBoard({ locationId: branchId });
    setBoard(data?.items || []);
  }, [canChecklist, branchId]);

  const loadItems = useCallback(async () => {
    if (!canManage || !branchId) {
      setItems([]);
      return;
    }
    const { data } = await getMaintenanceItems({ locationId: branchId, active: 'true' });
    setItems(data?.items || []);
  }, [canManage, branchId]);

  const refresh = useCallback(async () => {
    if (!branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await Promise.all([
        tab === 'board' || canChecklist ? loadBoard() : Promise.resolve(),
        tab === 'manage' || canManage ? loadItems() : Promise.resolve(),
      ]);
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to load maintenance'));
    } finally {
      setLoading(false);
    }
  }, [branchId, tab, canChecklist, canManage, loadBoard, loadItems, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error(t('Title is required'));
      return;
    }
    if (!branchId) {
      toast.error(t('Select a branch first'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        intervalValue: Number(form.intervalValue) || 1,
        intervalUnit: form.intervalUnit,
      };
      if (form.applyMode === 'all') {
        payload.allLocations = true;
        payload.locationId = branchId;
      } else if (form.applyMode === 'selected') {
        const ids = [...new Set([branchId, ...form.targetLocationIds.map(String)])];
        payload.targetLocationIds = ids;
      } else {
        payload.locationId = branchId;
      }
      await createMaintenanceItems(payload);
      toast.success(t('Maintenance item added'));
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to create item'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item) {
    try {
      await deleteMaintenanceItem(item._id);
      toast.success(t('Item removed'));
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to remove item'));
    }
  }

  async function handleComplete(e) {
    e.preventDefault();
    if (!completeTarget) return;
    setCompleting(true);
    try {
      await completeMaintenanceItem(completeTarget._id, { notes: completeNotes.trim() });
      toast.success(t('Marked complete'));
      setCompleteTarget(null);
      setCompleteNotes('');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to complete item'));
    } finally {
      setCompleting(false);
    }
  }

  async function handleCopy(e) {
    e.preventDefault();
    if (!copyTarget) return;
    setCopying(true);
    try {
      const payload = copyMode === 'all'
        ? { allLocations: true }
        : { targetLocationIds: copyLocationIds };
      if (copyMode !== 'all' && !copyLocationIds.length) {
        toast.error(t('Select at least one branch'));
        setCopying(false);
        return;
      }
      await copyMaintenanceItem(copyTarget._id, payload);
      toast.success(t('Copied to other branches'));
      setCopyTarget(null);
      setCopyLocationIds([]);
      setCopyMode('all');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to copy item'));
    } finally {
      setCopying(false);
    }
  }

  const otherLocations = locationOptions.filter((loc) => String(loc._id) !== String(branchId));

  return (
    <Layout>
      <PageHeader title={t('Maintenance')}>
        <div data-walkthrough="maintenance-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canChecklist && (
            <Btn
              variant={tab === 'board' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => switchTab('board')}
            >
              {t('Checklist')}
            </Btn>
          )}
          {canManage && (
            <Btn
              variant={tab === 'manage' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => switchTab('manage')}
            >
              {t('Manage')}
            </Btn>
          )}
        </div>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
        {needsBranchPicker && (
          <div style={{
            marginBottom: 18,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--card)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
          >
            <span style={{ fontSize: 13, color: 'var(--t3)', fontWeight: 600 }}>{t('Branch')}</span>
            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <MenuSelect
                value={branchId}
                onChange={(e) => {
                  const value = String(e?.target?.value ?? e ?? '');
                  setBranchId(value);
                  if (multiEnabled) setSelectedLocationId(value);
                }}
                options={locationOptions.map((loc) => ({
                  value: String(loc._id),
                  label: loc.name || loc.locationId || t('Branch'),
                }))}
                placeholder={t('Select branch')}
              />
            </div>
          </div>
        )}

        {!branchId && (
          <EmptyState icon={Wrench} message={t('Select a branch')} sub={t('Maintenance is tracked per branch.')} />
        )}

        {branchId && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size="lg" />
          </div>
        )}

        {branchId && !loading && tab === 'board' && canChecklist && (
          <BoardSection
            board={board}
            onComplete={(item) => {
              setCompleteTarget(item);
              setCompleteNotes('');
            }}
          />
        )}

        {branchId && !loading && tab === 'manage' && canManage && (
          <ManageSection
            items={items}
            form={form}
            setForm={setForm}
            saving={saving}
            onCreate={handleCreate}
            onDeactivate={handleDeactivate}
            onCopy={(item) => {
              setCopyTarget(item);
              setCopyMode(otherLocations.length ? 'selected' : 'all');
              setCopyLocationIds([]);
            }}
            otherLocations={otherLocations}
            multiEnabled={multiEnabled || locationOptions.length > 1}
          />
        )}
      </div>

      {completeTarget && (
        <ModalShell title={t('Complete: {title}', { title: completeTarget.title })} onClose={() => setCompleteTarget(null)}>
          <form onSubmit={handleComplete} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
              {formatInterval(completeTarget.intervalValue, completeTarget.intervalUnit, t)}
            </p>
            <Textarea
              label={t('Notes (optional)')}
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setCompleteTarget(null)}>{t('Cancel')}</Btn>
              <Btn type="submit" disabled={completing}>{completing ? t('Saving…') : t('Mark complete')}</Btn>
            </div>
          </form>
        </ModalShell>
      )}

      {copyTarget && (
        <ModalShell title={t('Copy: {title}', { title: copyTarget.title })} onClose={() => setCopyTarget(null)}>
          <form onSubmit={handleCopy} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn
                size="sm"
                variant={copyMode === 'all' ? 'primary' : 'ghost'}
                onClick={() => setCopyMode('all')}
              >
                {t('All branches')}
              </Btn>
              <Btn
                size="sm"
                variant={copyMode === 'selected' ? 'primary' : 'ghost'}
                onClick={() => setCopyMode('selected')}
                disabled={!otherLocations.length}
              >
                {t('Selected branches')}
              </Btn>
            </div>
            {copyMode === 'selected' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {otherLocations.map((loc) => {
                  const id = String(loc._id);
                  const checked = copyLocationIds.includes(id);
                  return (
                    <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setCopyLocationIds((prev) => (
                            e.target.checked
                              ? [...prev, id]
                              : prev.filter((x) => x !== id)
                          ));
                        }}
                      />
                      {loc.name || loc.locationId}
                    </label>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setCopyTarget(null)}>{t('Cancel')}</Btn>
              <Btn type="submit" disabled={copying}>{copying ? t('Copying…') : t('Copy')}</Btn>
            </div>
          </form>
        </ModalShell>
      )}
    </Layout>
  );
}

function BoardSection({ board, onComplete }) {
  const { t } = useI18n();
  if (!board.length) {
    return (
      <EmptyState
        icon={Wrench}
        message={t('No maintenance items')}
        sub={t('Ask an owner or general manager to define the checklist for this branch.')}
      />
    );
  }

  const groups = [
    { key: 'overdue', title: t('Overdue'), items: board.filter((i) => i.status === 'overdue') },
    { key: 'due', title: t('Due now'), items: board.filter((i) => i.status === 'due') },
    { key: 'ok', title: t('Up to date'), items: board.filter((i) => i.status === 'ok') },
  ];

  return (
    <div data-walkthrough="maintenance-board" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {groups.map((group) => (
        group.items.length ? (
          <div key={group.key}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>
              {group.title}
              <span style={{ marginInlineStart: 8, color: 'var(--t4)', fontWeight: 600 }}>{group.items.length}</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.items.map((item) => (
                <BoardCard key={item._id} item={item} onComplete={onComplete} />
              ))}
            </div>
          </div>
        ) : null
      ))}
    </div>
  );
}

function BoardCard({ item, onComplete }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const meta = STATUS_META[item.status] || STATUS_META.due;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{item.title}</p>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: meta.color,
            background: meta.bg,
            borderRadius: 999,
            padding: '2px 8px',
          }}
          >
            {t(meta.label)}
          </span>
        </div>
        {item.description ? (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--t3)' }}>{item.description}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--t4)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock3 size={13} /> {formatInterval(item.intervalValue, item.intervalUnit, t)}
          </span>
          <span>
            {t('Last: {value}', {
              value: item.lastCompletion
                ? `${personName(item.lastCompletion.completedBy, t)} · ${whenLabel(item.lastCompletedAt, t, fmt)}`
                : t('Never'),
            })}
          </span>
          <span>{t('Next due: {date}', { date: whenLabel(item.nextDueAt, t, fmt) })}</span>
        </div>
      </div>
      <Btn size="sm" onClick={() => onComplete(item)}>
        <CheckCircle2 size={14} style={{ marginInlineEnd: 6 }} />
        {t('Complete')}
      </Btn>
    </div>
  );
}

function ManageSection({
  items,
  form,
  setForm,
  saving,
  onCreate,
  onDeactivate,
  onCopy,
  otherLocations,
  multiEnabled,
}) {
  const { t } = useI18n();
  return (
    <div data-walkthrough="maintenance-manage" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <form
        onSubmit={onCreate}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div data-walkthrough="maintenance-add" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('Add maintenance item')}</h2>
        </div>
        <Input
          label={t('Title')}
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t('Clean equipment')}
          required
        />
        <Textarea
          label={t('Description (optional)')}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px' }}>
            <Input
              label={t('Every')}
              type="number"
              min={1}
              value={form.intervalValue}
              onChange={(e) => setForm((prev) => ({ ...prev, intervalValue: e.target.value }))}
            />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>
              {t('Interval')}
            </label>
            <MenuSelect
              value={form.intervalUnit}
              onChange={(e) => setForm((prev) => ({
                ...prev,
                intervalUnit: String(e?.target?.value ?? e ?? 'day'),
              }))}
              options={INTERVAL_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }))}
            />
          </div>
        </div>

        {multiEnabled && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
              {t('Also create on')}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                { id: 'this', label: t('This branch only') },
                { id: 'all', label: t('All branches') },
                { id: 'selected', label: t('This + other branches') },
              ].map((opt) => (
                <Btn
                  key={opt.id}
                  size="sm"
                  variant={form.applyMode === opt.id ? 'primary' : 'ghost'}
                  onClick={() => setForm((prev) => ({ ...prev, applyMode: opt.id }))}
                >
                  {opt.label}
                </Btn>
              ))}
            </div>
            {form.applyMode === 'selected' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {otherLocations.map((loc) => {
                  const id = String(loc._id);
                  const checked = form.targetLocationIds.includes(id);
                  return (
                    <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            targetLocationIds: e.target.checked
                              ? [...prev.targetLocationIds, id]
                              : prev.targetLocationIds.filter((x) => x !== id),
                          }));
                        }}
                      />
                      {loc.name || loc.locationId}
                    </label>
                  );
                })}
                {!otherLocations.length && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--t4)' }}>{t('No other branches available.')}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn type="submit" disabled={saving}>{saving ? t('Saving…') : t('Add item')}</Btn>
        </div>
      </form>

      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('Items for this branch')}</h2>
        {!items.length ? (
          <EmptyState icon={Wrench} message={t('No items yet')} sub={t('Add the first maintenance task above.')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item._id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{item.title}</p>
                  {item.description ? (
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t3)' }}>{item.description}</p>
                  ) : null}
                  <div style={{
                    marginTop: 6,
                    display: 'inline-flex',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--t3)',
                    background: 'var(--bg, #F8FAFC)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '3px 8px',
                  }}
                  >
                    {formatInterval(item.intervalValue, item.intervalUnit, t)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(multiEnabled || otherLocations.length > 0) && (
                    <Btn size="sm" variant="ghost" onClick={() => onCopy(item)}>
                      <Copy size={14} style={{ marginInlineEnd: 6 }} />
                      {t('Copy')}
                    </Btn>
                  )}
                  <Btn size="sm" variant="ghost" onClick={() => onDeactivate(item)}>
                    <Trash2 size={14} style={{ marginInlineEnd: 6 }} />
                    {t('Remove')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-backdrop-in"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 80,
      }}
      onClick={onClose}
    >
      <div
        className="modal-panel-in"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--card)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          padding: 18,
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
