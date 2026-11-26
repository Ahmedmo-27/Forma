import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Receipt } from 'lucide-react';
import { Btn, EmptyState, Input, Modal, Spinner } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import { getRetailSales, refundRetailSale } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import {
  PAYMENT_LABELS,
  RetailLayout,
  cardStyle,
  dateKey,
  errorMessage,
  tdNum,
  tdStyle,
  thStyle,
  useMoney,
  useRetailBranch,
} from './retailShared';
import { printReceipt } from './receipt';

const STATUS_LABEL = { completed: tr('Completed'), partially_refunded: tr('Partly refunded'), refunded: tr('Refunded') };
const STATUS_COLOR = { completed: '#047857', partially_refunded: '#B45309', refunded: '#B91C1C' };

export default function RetailSalesPage() {
  const { t, lang } = useI18n();
  const { fmtNumber, fmtDateTime } = useFormat();
  const money = useMoney();
  usePageTitle(t('Sales'));
  const { user } = useAuth();
  const canRefund = hasAccess(user, 'retail_manage');
  const branch = useRetailBranch();
  const { branchId } = branch;

  const [dateFrom, setDateFrom] = useState(dateKey());
  const [dateTo, setDateTo] = useState(dateKey());
  const [receiptQuery, setReceiptQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ sales: [], pagination: null });

  const [selected, setSelected] = useState(null);
  const [refundQty, setRefundQty] = useState({});
  const [reason, setReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const params = { locationId: branchId, dateFrom, dateTo, page, limit: 25 };
      if (/^\d+$/.test(receiptQuery.trim())) params.receipt = receiptQuery.trim();
      const res = await getRetailSales(params);
      setData(res.data);
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to load sales')));
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, receiptQuery, page, t]);

  useEffect(() => { load(); }, [load]);

  function open(sale) {
    setSelected(sale);
    setRefundQty({});
    setReason('');
  }

  async function refund(full) {
    const items = full
      ? undefined
      : Object.entries(refundQty)
        .map(([itemId, qty]) => ({ itemId, qty: Math.trunc(Number(qty)) }))
        .filter((i) => i.qty > 0);
    if (!full && !items.length) {
      toast.error(t('Choose how many units to refund'));
      return;
    }
    setRefunding(true);
    try {
      const res = await refundRetailSale(selected._id, { ...(items ? { items } : {}), reason: reason.trim() });
      toast.success(t('Refund recorded'));
      setSelected(res.data.sale);
      setRefundQty({});
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not refund the sale')));
    } finally {
      setRefunding(false);
    }
  }

  const sales = data.sales || [];
  const pagination = data.pagination;
  const refundable = selected && selected.status !== 'refunded';

  return (
    <RetailLayout title={t('Sales')} branch={branch}>
      {!branchId && <EmptyState icon={Receipt} message={t('Select a branch')} sub={t('Sales are recorded per branch.')} />}
      {branchId && (
        <div data-walkthrough="retail-sales-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div data-walkthrough="retail-sales-filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 160 }}><Input label={t('From')} type="date" value={dateFrom} max={dateTo} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></div>
            <div style={{ width: 160 }}><Input label={t('To')} type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></div>
            <div style={{ width: 160 }}><Input label={t('Receipt #')} inputMode="numeric" value={receiptQuery} onChange={(e) => { setReceiptQuery(e.target.value); setPage(1); }} /></div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>
          ) : sales.length === 0 ? (
            <EmptyState icon={Receipt} message={t('No sales in this period')} />
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('Receipt')}</th>
                    <th style={thStyle}>{t('Time')}</th>
                    <th style={thStyle}>{t('Items')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('Total')}</th>
                    <th style={thStyle}>{t('Payment')}</th>
                    <th style={thStyle}>{t('Member')}</th>
                    <th style={thStyle}>{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s._id} onClick={() => open(s)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>#{s.receiptNumber}</td>
                      <td style={tdStyle}>{fmtDateTime(s.createdAt)}</td>
                      <td style={tdStyle}><bdi>{s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</bdi></td>
                      <td style={tdNum}>{money(s.total)}</td>
                      <td style={tdStyle}>{PAYMENT_LABELS[s.paymentMethod] ? t(PAYMENT_LABELS[s.paymentMethod]) : s.paymentMethod}</td>
                      <td style={tdStyle}>{s.memberName ? <bdi>{s.memberName}</bdi> : t('Walk-in')}</td>
                      <td style={{ ...tdStyle, color: STATUS_COLOR[s.status], fontWeight: 600 }}>{STATUS_LABEL[s.status] ? t(STATUS_LABEL[s.status]) : s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Btn variant="ghost" size="sm" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('Previous')}</Btn>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>{t('Page {page} of {total}', { page: fmtNumber(pagination.page), total: fmtNumber(pagination.totalPages) })}</span>
              <Btn variant="ghost" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Btn>
            </div>
          )}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? t('Receipt #{number}', { number: selected.receiptNumber }) : ''}
        footer={selected && (
          <Btn variant="ghost" size="sm" onClick={() => printReceipt(selected, lang)}><Printer size={14} /> {t('Print')}</Btn>
        )}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--t4)' }}>
              {fmtDateTime(selected.createdAt)} · {PAYMENT_LABELS[selected.paymentMethod] ? t(PAYMENT_LABELS[selected.paymentMethod]) : selected.paymentMethod}
              {selected.cashier?.name ? <> · <bdi>{selected.cashier.name}</bdi></> : null}
              {selected.memberName ? <> · <bdi>{selected.memberName}</bdi></> : null}
            </div>
            {selected.items.map((item) => {
              const left = item.qty - (item.refundedQty || 0);
              return (
                <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--t1)', fontWeight: 600 }}>{item.qty} × <bdi>{item.name}</bdi></div>
                    <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                      <bdi>{item.vendorName}</bdi>
                      {item.refundedQty > 0 ? ` · ${t('{qty} refunded ({amount})', { qty: fmtNumber(item.refundedQty), amount: money(item.refundedAmount) })}` : ''}
                    </div>
                  </div>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(item.lineTotal)}</span>
                  {canRefund && refundable && left > 0 && (
                    <input
                      type="number"
                      min="0"
                      max={left}
                      step="1"
                      value={refundQty[item._id] ?? ''}
                      placeholder={t('Refund')}
                      aria-label={t('Units to refund for {name}', { name: item.name })}
                      onChange={(e) => setRefundQty({ ...refundQty, [item._id]: Math.min(left, Math.max(0, Number(e.target.value) || 0)) || '' })}
                      style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 12 }}
                    />
                  )}
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              {selected.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('Discount')}</span><span dir="ltr">-{money(selected.discount)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--t1)' }}><span>{t('Total')}</span><span>{money(selected.total)}</span></div>
              {selected.refundedTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B91C1C' }}><span>{t('Refunded')}</span><span>{money(selected.refundedTotal)}</span></div>}
            </div>
            {canRefund && refundable && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input label={t('Refund reason (optional)')} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Btn variant="ghost" size="sm" disabled={refunding} onClick={() => refund(false)}>{t('Refund chosen units')}</Btn>
                  <Btn variant="danger" size="sm" disabled={refunding} onClick={() => refund(true)}>{t('Refund everything left')}</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </RetailLayout>
  );
}
