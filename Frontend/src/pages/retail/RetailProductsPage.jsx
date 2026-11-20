import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Package, Plus } from 'lucide-react';
import { Btn, EmptyState, Input, MenuSelect, Modal, Spinner, Switch } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import {
  changeRetailStock,
  createRetailCategory,
  createRetailProduct,
  getRetailCategories,
  getRetailProducts,
  getRetailStockMovements,
  getRetailVendors,
  updateRetailCategory,
  updateRetailProduct,
} from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import {
  RetailLayout,
  SECTION_LABELS,
  cardStyle,
  errorMessage,
  pickValue,
  tdNum,
  tdStyle,
  thStyle,
  useMoney,
  useRetailBranch,
} from './retailShared';

const emptyProduct = {
  name: '',
  categoryId: '',
  vendorId: '',
  price: '',
  sku: '',
  trackStock: false,
  stockQty: '0',
  lowStockThreshold: '0',
};

const COLUMNS = [
  { key: 'product', label: tr('Product') },
  { key: 'category', label: tr('Category') },
  { key: 'vendor', label: tr('Vendor') },
  { key: 'price', label: tr('Price'), numeric: true },
  { key: 'stock', label: tr('Stock'), numeric: true },
  { key: 'status', label: tr('Status') },
  { key: 'actions', label: '' },
];

const MOVEMENT_LABELS = {
  restock: tr('Restock'),
  adjust: tr('Correct count'),
  sale: tr('Sale'),
  refund: tr('Refund'),
};

export default function RetailProductsPage() {
  const { t } = useI18n();
  const { fmtNumber, fmtDate } = useFormat();
  const money = useMoney();
  usePageTitle(t('Products'));
  const branch = useRetailBranch();
  const { branchId } = branch;

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);

  const [section, setSection] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);

  const [quick, setQuick] = useState({ name: '', categoryId: '', price: '' });
  const [quickSaving, setQuickSaving] = useState(false);

  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm, setStockForm] = useState({ mode: 'restock', qty: '', reason: '' });
  const [movements, setMovements] = useState([]);
  const [stockSaving, setStockSaving] = useState(false);

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', section: 'bar' });

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [cats, vend, prods] = await Promise.all([
        getRetailCategories(),
        getRetailVendors({ locationId: branchId, active: 'true' }),
        getRetailProducts({ locationId: branchId }),
      ]);
      setCategories(cats.data?.categories || []);
      setVendors(vend.data?.vendors || []);
      setProducts(prods.data?.products || []);
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to load products')));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => { load(); }, [load]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c._id, c])), [categories]);
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v._id, v])), [vendors]);
  const activeCategories = categories.filter((c) => c.active);
  const barCategories = activeCategories.filter((c) => c.section === 'bar');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (section !== 'all' && categoryById.get(p.categoryId)?.section !== section) return false;
      if (categoryFilter && p.categoryId !== categoryFilter) return false;
      if (vendorFilter && p.vendorId !== vendorFilter) return false;
      if (lowOnly && !p.lowStock) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, categoryById, section, categoryFilter, vendorFilter, search, showInactive, lowOnly]);

  function openNew() {
    const first = activeCategories[0];
    setForm({ ...emptyProduct, categoryId: first?._id || '', trackStock: first?.section === 'retail' });
    setEditing('new');
  }

  function openEdit(product) {
    setForm({
      name: product.name,
      categoryId: product.categoryId,
      vendorId: product.vendorId,
      price: String(product.price),
      sku: product.sku || '',
      trackStock: product.trackStock,
      stockQty: String(product.stockQty),
      lowStockThreshold: String(product.lowStockThreshold),
    });
    setEditing(product);
  }

  async function saveProduct(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.categoryId || form.price === '') {
      toast.error(t('Name, category and price are required'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        price: Number(form.price),
        sku: form.sku.trim(),
        trackStock: form.trackStock,
        lowStockThreshold: Number(form.lowStockThreshold) || 0,
      };
      if (form.vendorId) body.vendorId = form.vendorId;
      if (editing === 'new') {
        await createRetailProduct({ ...body, stockQty: Number(form.stockQty) || 0, locationId: branchId });
        toast.success(t('Product added'));
      } else {
        await updateRetailProduct(editing._id, body);
        toast.success(t('Product updated'));
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not save the product')));
    } finally {
      setSaving(false);
    }
  }

  async function quickAdd(e) {
    e.preventDefault();
    if (!quick.name.trim() || !quick.categoryId || quick.price === '') {
      toast.error(t('Name, category and price are required'));
      return;
    }
    setQuickSaving(true);
    try {
      await createRetailProduct({
        name: quick.name.trim(),
        categoryId: quick.categoryId,
        price: Number(quick.price),
        locationId: branchId,
      });
      setQuick((q) => ({ ...q, name: '', price: '' }));
      toast.success(t('Added to the bar menu'));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not add the item')));
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleActive(product) {
    try {
      await updateRetailProduct(product._id, { active: !product.active });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not update the product')));
    }
  }

  async function openStock(product) {
    setStockTarget(product);
    setStockForm({ mode: 'restock', qty: '', reason: '' });
    setMovements([]);
    try {
      const { data } = await getRetailStockMovements(product._id);
      setMovements(data?.movements || []);
    } catch {
      setMovements([]);
    }
  }

  async function saveStock(e) {
    e.preventDefault();
    const qty = Math.trunc(Number(stockForm.qty));
    if (!qty) {
      toast.error(t('Enter a quantity'));
      return;
    }
    setStockSaving(true);
    try {
      await changeRetailStock(stockTarget._id, { mode: stockForm.mode, qty, reason: stockForm.reason.trim() });
      toast.success(t('Stock updated'));
      setStockTarget(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not update stock')));
    } finally {
      setStockSaving(false);
    }
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    try {
      await createRetailCategory({ name: catForm.name.trim(), section: catForm.section });
      setCatForm((f) => ({ ...f, name: '' }));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not add the category')));
    }
  }

  async function toggleCategory(category) {
    try {
      await updateRetailCategory(category._id, { active: !category.active });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('Could not update the category')));
    }
  }

  const sectionName = (key) => (SECTION_LABELS[key] ? t(SECTION_LABELS[key]) : '');
  const categoryOptions = activeCategories.map((c) => ({ value: c._id, label: `${c.name} (${sectionName(c.section)})` }));
  const vendorOptions = vendors.map((v) => ({ value: v._id, label: v.name }));

  return (
    <RetailLayout
      title={t('Products')}
      branch={branch}
      actions={<Btn size="sm" onClick={openNew}><Plus size={14} /> {t('Add product')}</Btn>}
    >
      {!branchId && <EmptyState icon={Package} message={t('Select a branch')} sub={t('Products and stock are kept per branch.')} />}
      {branchId && loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>}

      {branchId && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form onSubmit={quickAdd} style={{ ...cardStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px' }}>
              <Input label={t('Quick add to bar menu')} placeholder={t('e.g. Protein shake')} value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>{t('Category')}</div>
              <MenuSelect
                value={quick.categoryId}
                onChange={(e) => setQuick({ ...quick, categoryId: pickValue(e) })}
                options={barCategories.map((c) => ({ value: c._id, label: c.name }))}
                placeholder={t('Choose category')}
              />
            </div>
            <div style={{ flex: '0 1 120px' }}>
              <Input label={t('Price (EGP)')} type="number" min="0" step="0.01" value={quick.price} onChange={(e) => setQuick({ ...quick, price: e.target.value })} />
            </div>
            <Btn type="submit" disabled={quickSaving}>{quickSaving ? t('Adding…') : t('Add')}</Btn>
          </form>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 150 }}>
              <MenuSelect
                value={section}
                onChange={(e) => { setSection(pickValue(e)); setCategoryFilter(''); }}
                options={[{ value: 'all', label: t('All sections') }, { value: 'bar', label: sectionName('bar') }, { value: 'retail', label: sectionName('retail') }]}
              />
            </div>
            <div style={{ minWidth: 170 }}>
              <MenuSelect
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(pickValue(e))}
                options={[{ value: '', label: t('All categories') }, ...activeCategories.filter((c) => section === 'all' || c.section === section).map((c) => ({ value: c._id, label: c.name }))]}
              />
            </div>
            <div style={{ minWidth: 170 }}>
              <MenuSelect
                value={vendorFilter}
                onChange={(e) => setVendorFilter(pickValue(e))}
                options={[{ value: '', label: t('All vendors') }, ...vendorOptions]}
              />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search name or SKU')}
              aria-label={t('Search products')}
              style={{ flex: '1 1 160px', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
            />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> {t('Low stock')}
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('Show inactive')}
            </label>
            <Btn variant="ghost" size="sm" onClick={() => setCatOpen(true)}>{t('Categories')}</Btn>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Package} message={t('No products found')} sub={t('Add your first product above, or adjust the filters.')} />
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} style={{ ...thStyle, textAlign: col.numeric ? 'end' : 'start' }}>{col.label ? t(col.label) : ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p._id} style={{ opacity: p.active ? 1 : 0.55 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{p.name}</div>
                        {p.sku && <div style={{ fontSize: 11, color: 'var(--t4)' }}>{t('SKU {sku}', { sku: p.sku })}</div>}
                      </td>
                      <td style={tdStyle}>{categoryById.get(p.categoryId)?.name || '-'}</td>
                      <td style={tdStyle}>{vendorById.get(p.vendorId)?.name || '-'}</td>
                      <td style={tdNum}>{money(p.price)}</td>
                      <td style={{ ...tdNum, color: p.outOfStock ? '#B91C1C' : p.lowStock ? '#B45309' : undefined }}>
                        {p.trackStock ? fmtNumber(p.stockQty) : t('Not tracked')}
                      </td>
                      <td style={tdStyle}>{p.active ? t('Active') : t('Inactive')}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'end' }}>
                        {p.trackStock && <Btn variant="ghost" size="sm" onClick={() => openStock(p)}>{t('Stock')}</Btn>}{' '}
                        <Btn variant="ghost" size="sm" onClick={() => openEdit(p)}>{t('Edit')}</Btn>{' '}
                        <Btn variant="ghost" size="sm" onClick={() => toggleActive(p)}>{p.active ? t('Deactivate') : t('Activate')}</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Add product') : t('Edit product')}
      >
        <form onSubmit={saveProduct} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label={t('Name')} value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>{t('Category')}</div>
            <MenuSelect value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: pickValue(e) })} options={categoryOptions} placeholder={t('Choose category')} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>{t('Vendor')}</div>
            <MenuSelect
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: pickValue(e) })}
              options={[{ value: '', label: editing === 'new' ? t('Gym bar (default)') : t('Keep current vendor') }, ...vendorOptions]}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><Input label={t('Price (EGP)')} type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div style={{ flex: 1 }}><Input label={t('SKU (optional)')} value={form.sku} maxLength={64} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          </div>
          <Switch label={t('Track stock')} hint={t('Counts units and blocks sales when empty. Leave off for made-to-order drinks.')} checked={form.trackStock} onChange={(v) => setForm({ ...form, trackStock: v })} />
          {form.trackStock && (
            <div style={{ display: 'flex', gap: 12 }}>
              {editing === 'new' && (
                <div style={{ flex: 1 }}><Input label={t('Opening stock')} type="number" min="0" step="1" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></div>
              )}
              <div style={{ flex: 1 }}><Input label={t('Low stock alert at')} type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /></div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setEditing(null)}>{t('Cancel')}</Btn>
            <Btn type="submit" disabled={saving}>{saving ? t('Saving…') : t('Save')}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(stockTarget)} onClose={() => setStockTarget(null)} title={stockTarget ? t('Stock: {name}', { name: stockTarget.name }) : ''}>
        {stockTarget && (
          <form onSubmit={saveStock} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>{t('Currently {qty} in stock.', { qty: fmtNumber(stockTarget.stockQty) })}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant={stockForm.mode === 'restock' ? 'primary' : 'ghost'} onClick={() => setStockForm({ ...stockForm, mode: 'restock' })}>{t('Restock')}</Btn>
              <Btn size="sm" variant={stockForm.mode === 'adjust' ? 'primary' : 'ghost'} onClick={() => setStockForm({ ...stockForm, mode: 'adjust' })}>{t('Correct count')}</Btn>
            </div>
            <Input
              label={stockForm.mode === 'restock' ? t('Units received') : t('Change (use a minus to remove)')}
              type="number"
              step="1"
              value={stockForm.qty}
              onChange={(e) => setStockForm({ ...stockForm, qty: e.target.value })}
            />
            <Input label={t('Reason (optional)')} value={stockForm.reason} maxLength={300} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setStockTarget(null)}>{t('Cancel')}</Btn>
              <Btn type="submit" disabled={stockSaving}>{stockSaving ? t('Saving…') : t('Update stock')}</Btn>
            </div>
            {movements.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, maxHeight: 180, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>{t('Recent movements')}</div>
                {movements.slice(0, 20).map((m) => (
                  <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0', color: 'var(--t2)' }}>
                    <span>{fmtDate(m.createdAt)} · {MOVEMENT_LABELS[m.type] ? t(MOVEMENT_LABELS[m.type]) : m.type}{m.reason ? <> · <bdi>{m.reason}</bdi></> : null}</span>
                    <span dir="ltr" style={{ fontWeight: 700, color: m.qty < 0 ? '#B91C1C' : '#047857' }}>{m.qty > 0 ? `+${fmtNumber(m.qty)}` : fmtNumber(m.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={t('Categories')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map((c) => (
            <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, opacity: c.active ? 1 : 0.55 }}>
              <span>{c.name} <span style={{ color: 'var(--t4)' }}>({sectionName(c.section)})</span></span>
              <Btn variant="ghost" size="sm" onClick={() => toggleCategory(c)}>{c.active ? t('Hide') : t('Show')}</Btn>
            </div>
          ))}
          <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ flex: 1 }}><Input label={t('New category')} value={catForm.name} maxLength={80} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
            <div style={{ width: 140 }}>
              <MenuSelect value={catForm.section} onChange={(e) => setCatForm({ ...catForm, section: pickValue(e) })} options={[{ value: 'bar', label: sectionName('bar') }, { value: 'retail', label: sectionName('retail') }]} />
            </div>
            <Btn type="submit">{t('Add')}</Btn>
          </form>
        </div>
      </Modal>
    </RetailLayout>
  );
}
