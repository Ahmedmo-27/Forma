import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Store } from 'lucide-react';
import { Btn, ConfirmDialog, EmptyState, Input, Modal, Spinner, Textarea } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import {
  createRetailPayout,
  createRetailVendor,
  deleteRetailPayout,
  deleteRetailVendor,
  getRetailPayouts,
  getRetailSummary,
  getRetailVendors,
  settleRetailPayout,
  updateRetailVendor,
} from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import {
  RetailLayout,
  addDays,
  cardStyle,
  dateKey,
  errorMessage,
  tdNum,
  tdStyle,
  thStyle,
  useMoney,
  useRetailBranch,
} from './retailShared';

const emptyVendor = { name: '', contactName: '', phone: '', email: '', notes: '', commissionPercent: '20' };

export default function RetailVendorsPage() {
  const { t } = useI18n();
  const { fmtNumber, fmtDate } = useFormat();
  const money = useMoney();
  usePageTitle(t('Vendors'));
  const { user } = useAuth();
  const canManage = hasAccess(user, 'retail_manage');
  const canMoney = hasAccess(user, 'retail_reports');
  const branch = useRetailBranch();
  const { branchId } = branch;

  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [monthly, setMonthly] = useState(new Map());
  const [owed, setOwed] = useState(new Map());
  const [payouts, setPayouts] = useState([]);

  const [editing, setEditing] = useState(null); // null | 'new' | vendor
  const [form, setForm] = useState(emptyVendor);
  const [saving, setSaving] = useState(false);
  const [deactivate, setDeactivate] = useState(null);

  const [payoutFor, setPayoutFor] = useState(null);
  const [payoutForm, setPayoutForm] = useState({ periodFrom: '', periodTo: '', note: '' });
  const [payoutSaving, setPayoutSaving] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { data } = await getRetailVendors({ locationId: branchId });
      setVendors(data?.vendors || []);

      if (canMoney) {
        const today = dateKey();
        const [summary, payoutData] = await Promise.all([
          getRetailSummary({ locationId: branchId, dateFrom: `${today.slice(0, 8)}01`, dateTo: today }),
          getRetailPayouts({ locationId: branchId }),
        ]);
        setMonthly(new Map((summary.data?.vendors || []).map((v) => [v.vendorId, v])));
        setOwed(new Map((payoutData.data?.vendors || []).map((v) => [v.vendorId, v])));
        setPayouts(payoutData.data?.payouts || []);
      }
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to load vendors')));
    } finally {
      setLoading(false);
    }
  }, [branchId, canMoney, t]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let net = 0;
    for (const row of monthly.values()) net += row.net || 0;
    return net;
  }, [monthly]);

  function openNew() {
    setForm(emptyVendor);
    setEditing('new');
  }

  function openEdit(vendor) {
    setForm({
      name: vendor.name,
      contactName: vendor.contactName,
      phone: vendor.phone,
      email: vendor.email,
      notes: vendor.notes,
      commissionPercent: String(vendor.commissionPercent),
    });
    setEditing(vendor);
  }

  async function saveVendor(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('Vendor name is required'));
      return;
    }
    const commission = Number(form.commissionPercent);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast.error(t('Commission must be between 0 and 100'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
        commissionPercent: commission,
      };
      if (editing === 'new') {
        await createRetailVendor({ ...body, type: 'external', locationId: branchId });
        toast.success(t('Vendor added'));
      } else {
        await updateRetailVendor(editing._id, body);
        toast.success(t('Vendor updated'));
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not save the vendor')));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    try {
      await deleteRetailVendor(deactivate._id);
      toast.success(t('Vendor deactivated'));
      setDeactivate(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not deactivate the vendor')));
    }
  }

  async function reactivate(vendor) {
    try {
      await updateRetailVendor(vendor._id, { active: true });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not reactivate the vendor')));
    }
  }

  function openPayout(vendor) {
    const info = owed.get(vendor._id);
    const yesterday = addDays(dateKey(), -1);
    const from = info?.lastPaidThrough ? addDays(info.lastPaidThrough, 1) : addDays(yesterday, -29);
    setPayoutForm({ periodFrom: from > yesterday ? yesterday : from, periodTo: yesterday, note: '' });
    setPayoutFor(vendor);
  }

  async function savePayout(e) {
    e.preventDefault();
    setPayoutSaving(true);
    try {
      await createRetailPayout({ vendorId: payoutFor._id, ...payoutForm, note: payoutForm.note.trim() });
      toast.success(t('Payout created. Mark it settled once you have paid the vendor.'));
      setPayoutFor(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not create the payout')));
    } finally {
      setPayoutSaving(false);
    }
  }

  async function settle(payout) {
    try {
      await settleRetailPayout(payout._id);
      toast.success(t('Payout marked as settled'));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not settle the payout')));
    }
  }

  async function removePayout(payout) {
    try {
      await deleteRetailPayout(payout._id);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not remove the payout')));
    }
  }

  return (
    <RetailLayout
      title={t('Vendors')}
      branch={branch}
      actions={canManage ? <Btn size="sm" onClick={openNew}><Plus size={14} /> {t('Add vendor')}</Btn> : null}
    >
      {!branchId && <EmptyState icon={Store} message={t('Select a branch')} sub={t('Vendors are set up per branch.')} />}
      {branchId && loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>}

      {branchId && !loading && (
        <div data-walkthrough="retail-vendors-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {canMoney && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
              {t('Month to date, all vendors:')} <strong style={{ color: 'var(--t1)' }}>{money(totals)}</strong>
            </p>
          )}

          <div data-walkthrough="retail-vendors-list" style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t('Vendor')}</th>
                  <th style={{ ...thStyle, textAlign: 'end' }}>{t('Gym share')}</th>
                  {canMoney && (
                    <>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Sales (month)')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Gym earns')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Vendor earns')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Unbilled')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Pending')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Paid')}</th>
                    </>
                  )}
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const m = monthly.get(v._id);
                  const o = owed.get(v._id);
                  const external = v.type === 'external';
                  return (
                    <tr key={v._id} style={{ opacity: v.active ? 1 : 0.55 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                          {external ? t('External vendor') : t('Gym-run bar')}
                          {v.phone ? <> · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{v.phone}</span></> : null}
                          {!v.active ? ` · ${t('Inactive')}` : ''}
                        </div>
                      </td>
                      <td style={tdNum}>{fmtNumber(v.commissionPercent)}%</td>
                      {canMoney && (
                        <>
                          <td style={tdNum}>{money(m?.net || 0)}</td>
                          <td style={tdNum}>{money(m?.gymShare || 0)}</td>
                          <td style={tdNum}>{external ? money(m?.vendorShare || 0) : '-'}</td>
                          <td style={{ ...tdNum, fontWeight: 700, color: o?.unbilled > 0 ? '#B45309' : undefined }}>{external ? money(o?.unbilled || 0) : '-'}</td>
                          <td style={tdNum}>{external ? money(o?.pending || 0) : '-'}</td>
                          <td style={tdNum}>{external ? money(o?.settled || 0) : '-'}</td>
                        </>
                      )}
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'end' }}>
                        {canMoney && external && v.active && (
                          <><Btn variant="ghost" size="sm" onClick={() => openPayout(v)}>{t('Payout')}</Btn>{' '}</>
                        )}
                        {canManage && <Btn variant="ghost" size="sm" onClick={() => openEdit(v)}>{t('Edit')}</Btn>}{' '}
                        {canManage && external && (v.active
                          ? <Btn variant="ghost" size="sm" onClick={() => setDeactivate(v)}>{t('Deactivate')}</Btn>
                          : <Btn variant="ghost" size="sm" onClick={() => reactivate(v)}>{t('Activate')}</Btn>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canMoney && payouts.length > 0 && (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{t('Payouts')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('Vendor')}</th>
                    <th style={thStyle}>{t('Period')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('Vendor owed')}</th>
                    <th style={thStyle}>{t('Status')}</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p._id}>
                      <td style={tdStyle}>{p.vendorName}</td>
                      <td style={tdStyle}>{t('{start} to {end}', { start: p.periodFrom, end: p.periodTo })}</td>
                      <td style={tdNum}>{money(p.amount)}</td>
                      <td style={tdStyle}>{p.status === 'settled' ? t('Settled {date}', { date: fmtDate(p.settledAt) }) : t('Pending')}</td>
                      <td style={{ ...tdStyle, textAlign: 'end', whiteSpace: 'nowrap' }}>
                        {p.status === 'pending' && (
                          <>
                            <Btn size="sm" onClick={() => settle(p)}>{t('Mark settled')}</Btn>{' '}
                            <Btn variant="ghost" size="sm" onClick={() => removePayout(p)}>{t('Remove')}</Btn>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? t('Add vendor') : t('Edit vendor')}>
        <form onSubmit={saveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label={t('Vendor name')} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {(editing === 'new' || editing?.type === 'external') && (
            <Input
              label={t('Gym share of each sale (%)')}
              hint={t('The gym keeps this percent. The vendor receives the rest.')}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.commissionPercent}
              onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
            />
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><Input label={t('Contact name')} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            <div style={{ flex: 1 }}><Input label={t('Phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <Input label={t('Email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Textarea label={t('Notes')} rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setEditing(null)}>{t('Cancel')}</Btn>
            <Btn type="submit" disabled={saving}>{saving ? t('Saving…') : t('Save')}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(payoutFor)} onClose={() => setPayoutFor(null)} title={payoutFor ? t('Payout: {name}', { name: payoutFor.name }) : ''}>
        {payoutFor && (
          <form onSubmit={savePayout} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
              {t('Pays the vendor their share of sales in the period, net of refunds. Only finished days can be included, and periods cannot overlap an earlier payout.')}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}><Input label={t('From')} type="date" value={payoutForm.periodFrom} onChange={(e) => setPayoutForm({ ...payoutForm, periodFrom: e.target.value })} /></div>
              <div style={{ flex: 1 }}><Input label={t('To')} type="date" max={addDays(dateKey(), -1)} value={payoutForm.periodTo} onChange={(e) => setPayoutForm({ ...payoutForm, periodTo: e.target.value })} /></div>
            </div>
            <Input label={t('Note (optional)')} value={payoutForm.note} maxLength={300} onChange={(e) => setPayoutForm({ ...payoutForm, note: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setPayoutFor(null)}>{t('Cancel')}</Btn>
              <Btn type="submit" disabled={payoutSaving}>{payoutSaving ? t('Creating…') : t('Create payout')}</Btn>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivate)}
        onClose={() => setDeactivate(null)}
        onConfirm={confirmDeactivate}
        title={t('Deactivate vendor')}
        message={deactivate ? t('{name} and all of their products will stop appearing at the POS. Past sales and payouts are kept.', { name: deactivate.name }) : ''}
        confirmLabel={t('Deactivate')}
        danger
      />
    </RetailLayout>
  );
}
