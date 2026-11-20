import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { Btn, EmptyState, Input, Modal, Spinner } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import { createRetailSale, getRetailCatalog, searchMembersQuick } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import {
  PAYMENT_LABELS,
  RetailLayout,
  SECTION_LABELS,
  cardStyle,
  errorMessage,
  useMoney,
  useRetailBranch,
} from './retailShared';
import { printReceipt } from './receipt';

const SECTION_FILTERS = [
  { value: 'all', label: tr('All') },
  { value: 'bar', label: SECTION_LABELS.bar },
  { value: 'retail', label: SECTION_LABELS.retail },
];

// Member system id as shown on cards, e.g. S1042.
const systemTag = (m) => `S${m.systemId}`;

const chip = (active) => ({
  padding: '6px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  background: active ? 'var(--navy)' : 'var(--card)',
  color: active ? '#fff' : 'var(--t2)',
  border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
});

export default function RetailPosPage() {
  const { t, lang } = useI18n();
  const { fmtNumber } = useFormat();
  const money = useMoney();
  usePageTitle(t('Bar & Shop'));
  const branch = useRetailBranch();
  const { branchId } = branch;

  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState('cash');
  const [member, setMember] = useState(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const loadCatalog = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await getRetailCatalog({ locationId: branchId });
      setCatalog(data);
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to load products')));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    setCart({});
    setMember(null);
    setLoading(true);
    loadCatalog();
  }, [loadCatalog]);

  const debouncedMember = useDebounce(memberQuery, 300);
  useEffect(() => {
    const q = debouncedMember.trim();
    if (q.length < 2) {
      setMemberResults([]);
      return undefined;
    }
    const controller = new AbortController();
    searchMembersQuick(q, { signal: controller.signal })
      .then((res) => setMemberResults((res.data?.members ?? []).slice(0, 6)))
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedMember]);

  const categories = useMemo(() => catalog?.categories || [], [catalog]);
  const productsById = useMemo(
    () => new Map((catalog?.products || []).map((p) => [p._id, p])),
    [catalog],
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c._id, c])), [categories]);
  const vendorById = useMemo(
    () => new Map((catalog?.vendors || []).map((v) => [v._id, v])),
    [catalog],
  );

  const visibleCategories = categories.filter((c) => section === 'all' || c.section === section);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog?.products || []).filter((p) => {
      const cat = categoryById.get(p.categoryId);
      if (section !== 'all' && cat?.section !== section) return false;
      if (categoryId && p.categoryId !== categoryId) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, categoryById, section, categoryId, search]);

  const lines = Object.entries(cart)
    .map(([productId, qty]) => ({ product: productsById.get(productId), qty }))
    .filter((l) => l.product);
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.round((subtotal - discountValue) * 100) / 100;

  function maxQty(product) {
    return product.trackStock ? Math.max(product.stockQty, 0) : 999;
  }

  function add(product) {
    setCart((prev) => {
      const current = prev[product._id] || 0;
      if (current >= maxQty(product)) {
        toast.error(t('Only {qty} of {name} in stock', { qty: fmtNumber(product.stockQty), name: product.name }));
        return prev;
      }
      return { ...prev, [product._id]: current + 1 };
    });
  }

  function change(product, delta) {
    setCart((prev) => {
      const next = (prev[product._id] || 0) + delta;
      if (next <= 0) {
        const { [product._id]: _removed, ...rest } = prev;
        return rest;
      }
      if (next > maxQty(product)) return prev;
      return { ...prev, [product._id]: next };
    });
  }

  function clearCart() {
    setCart({});
    setDiscount('');
    setMember(null);
    setMemberQuery('');
    setPayment('cash');
  }

  async function checkout() {
    if (!lines.length || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await createRetailSale({
        items: lines.map((l) => ({ productId: l.product._id, qty: l.qty })),
        discount: discountValue,
        paymentMethod: payment,
        memberId: member?._id || null,
        locationId: branchId,
      });
      setReceipt(data.sale);
      clearCart();
      await loadCatalog();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not complete the sale')));
      await loadCatalog();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RetailLayout title={t('Bar & Shop')} branch={branch}>
      {!branchId && <EmptyState icon={ShoppingCart} message={t('Select a branch')} sub={t('Sales are recorded per branch.')} />}
      {branchId && loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>
      )}
      {branchId && !loading && catalog && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {SECTION_FILTERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  style={chip(section === s.value)}
                  onClick={() => { setSection(s.value); setCategoryId(''); }}
                >
                  {t(s.label)}
                </button>
              ))}
              <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
                <Search size={14} style={{ position: 'absolute', insetInlineStart: 10, top: 11, color: 'var(--t4)' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Search products')}
                  aria-label={t('Search products')}
                  style={{
                    width: '100%', padding: '8px 10px', paddingInlineStart: 30, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={chip(!categoryId)} onClick={() => setCategoryId('')}>{t('All items')}</button>
              {visibleCategories.map((c) => (
                <button key={c._id} type="button" style={chip(categoryId === c._id)} onClick={() => setCategoryId(c._id)}>
                  {c.name}
                </button>
              ))}
            </div>

            {visibleProducts.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                message={t('No products here yet')}
                sub={t('Add products from the Products page and they will show up for sale.')}
              />
            ) : (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {visibleProducts.map((p) => {
                  const inCart = cart[p._id] || 0;
                  const out = p.trackStock && p.stockQty <= 0;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => add(p)}
                      disabled={out}
                      style={{
                        ...cardStyle,
                        padding: 12,
                        textAlign: 'start',
                        cursor: out ? 'not-allowed' : 'pointer',
                        opacity: out ? 0.5 : 1,
                        fontFamily: 'inherit',
                        position: 'relative',
                        borderColor: inCart ? 'var(--navy)' : 'var(--border)',
                        minHeight: 92,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {inCart > 0 && (
                        <span style={{
                          position: 'absolute', top: 8, insetInlineEnd: 8, background: 'var(--navy)', color: '#fff',
                          borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px',
                        }}
                        >
                          {fmtNumber(inCart)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', paddingInlineEnd: inCart ? 24 : 0 }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--t4)' }}>{vendorById.get(p.vendorId)?.name || ''}</span>
                      <span style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{money(p.price)}</span>
                        {p.trackStock && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: out ? '#B91C1C' : p.lowStock ? '#B45309' : 'var(--t4)' }}>
                            {out ? t('Out of stock') : t('{qty} left', { qty: fmtNumber(p.stockQty) })}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, flex: '1 1 300px', maxWidth: 420, position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14, color: 'var(--t1)' }}>{t('Current sale')}</strong>
              {lines.length > 0 && <Btn variant="ghost" size="sm" onClick={clearCart}>{t('Clear')}</Btn>}
            </div>

            {lines.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--t4)', margin: 0 }}>{t('Tap a product to add it.')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lines.map(({ product, qty }) => (
                  <div key={product._id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>{t('{price} each', { price: money(product.price) })}</div>
                    </div>
                    <button type="button" aria-label={t('Remove one {name}', { name: product.name })} onClick={() => change(product, -1)} style={iconBtn}><Minus size={14} /></button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{fmtNumber(qty)}</span>
                    <button type="button" aria-label={t('Add one {name}', { name: product.name })} onClick={() => change(product, 1)} style={iconBtn}><Plus size={14} /></button>
                    <button type="button" aria-label={t('Remove {name}', { name: product.name })} onClick={() => change(product, -qty)} style={iconBtn}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                label={t('Discount (EGP)')}
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                disabled={!lines.length}
              />

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>{t('Payment')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <button key={value} type="button" style={chip(payment === value)} onClick={() => setPayment(value)}>{t(label)}</button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>{t('Member (optional)')}</div>
                {member ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--t1)' }}><bdi>{member.name}</bdi>{member.systemId ? <> · <span dir="ltr">{systemTag(member)}</span></> : null}</span>
                    <button type="button" aria-label={t('Remove member')} onClick={() => setMember(null)} style={iconBtn}><X size={14} /></button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder={t('Walk-in. Search name or phone to link a member')}
                      aria-label={t('Search member')}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--card)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                      }}
                    />
                    {memberResults.length > 0 && (
                      <div style={{
                        position: 'absolute', zIndex: 5, insetInlineStart: 0, insetInlineEnd: 0, top: '100%', marginTop: 4,
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
                      }}
                      >
                        {memberResults.map((m) => (
                          <button
                            key={m._id}
                            type="button"
                            onClick={() => { setMember(m); setMemberQuery(''); setMemberResults([]); }}
                            style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 10px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--t1)', fontFamily: 'inherit' }}
                          >
                            <bdi>{m.name}</bdi>{m.systemId ? <> · <span dir="ltr">{systemTag(m)}</span></> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Row label={t('Subtotal')} value={money(subtotal)} />
              {discountValue > 0 && <Row label={t('Discount')} value={`-${money(discountValue)}`} />}
              <Row label={t('Total')} value={money(total)} strong />
            </div>

            <Btn fullWidth disabled={!lines.length || submitting} onClick={checkout}>
              {submitting ? t('Processing…') : t('Charge {amount}', { amount: money(total) })}
            </Btn>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title={receipt ? t('Receipt #{number}', { number: receipt.receiptNumber }) : ''}
        size="sm"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => printReceipt(receipt, lang)}><Printer size={14} /> {t('Print')}</Btn>
            <Btn size="sm" onClick={() => setReceipt(null)}>{t('New sale')}</Btn>
          </>
        )}
      >
        {receipt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {receipt.items.map((item) => (
              <Row key={item._id} label={`${item.qty} × ${item.name}`} value={money(item.lineTotal)} />
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
            {receipt.discount > 0 && <Row label={t('Discount')} value={`-${money(receipt.discount)}`} />}
            <Row label={t('Total')} value={money(receipt.total)} strong />
            <Row label={t('Paid by')} value={PAYMENT_LABELS[receipt.paymentMethod] ? t(PAYMENT_LABELS[receipt.paymentMethod]) : receipt.paymentMethod} />
            {receipt.memberName && <Row label={t('Member')} value={receipt.memberName} />}
          </div>
        )}
      </Modal>
    </RetailLayout>
  );
}

const iconBtn = {
  width: 26,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--t2)',
  cursor: 'pointer',
  flexShrink: 0,
};

function Row({ label, value, strong = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 500, color: strong ? 'var(--t1)' : 'var(--t2)' }}>
      <span dir="auto">{label}</span>
      <span dir="auto" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
