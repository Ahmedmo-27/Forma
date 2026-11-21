/* eslint-disable react-refresh/only-export-components -- shared helpers, styles and the layout live together */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Layout from '../../components/Layout';
import { MenuSelect, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useLocationScope, ALL_LOCATIONS } from '../../context/LocationContext';
import { hasAccess } from '../../lib/access';
import { listLocations } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';
import { formatNumber } from '../../i18n/format';

/** MenuSelect passes either an event-like object or the raw value. */
export function pickValue(e) {
  return String(e?.target?.value ?? e ?? '');
}

export function money(value, lang = 'en') {
  const n = Number(value) || 0;
  return `${formatNumber(lang, n, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} EGP`;
}

/** `money` bound to the active language: `const money = useMoney();` */
export function useMoney() {
  const { lang } = useI18n();
  return useCallback((value) => money(value, lang), [lang]);
}

/** Server message when present, otherwise the (already translated) fallback. */
export function errorMessage(err, fallback = tr('Something went wrong')) {
  return err?.response?.data?.message || fallback;
}

export const PAYMENT_LABELS = { cash: tr('Cash'), card: tr('Card'), wallet: tr('Wallet') };

export const SECTION_LABELS = { bar: tr('Bar & Food'), retail: tr('Shop') };

/** YYYY-MM-DD for a Date in the browser's local zone. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/**
 * Branch used by every retail screen. Mirrors the Maintenance page: follows the
 * navbar branch, and falls back to the only / first branch the person can see.
 * The navbar selection is kept in sync so the API header matches the screen.
 */
export function useRetailBranch() {
  const { multiEnabled, locations: scoped, selectedLocationId, setSelectedLocationId } = useLocationScope();
  const [fetched, setFetched] = useState([]);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await listLocations();
        if (!cancelled) setFetched(data?.locations || []);
      } catch {
        if (!cancelled) setFetched([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const options = useMemo(() => (scoped?.length ? scoped : fetched), [scoped, fetched]);

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== ALL_LOCATIONS) {
      setBranchId(String(selectedLocationId));
      return;
    }
    if (options.length === 1) {
      setBranchId(String(options[0]._id));
      return;
    }
    if (!branchId && options.length) setBranchId(String(options[0]._id));
  }, [selectedLocationId, options, branchId]);

  const needsPicker = multiEnabled && (selectedLocationId === ALL_LOCATIONS || options.length > 1);

  function chooseBranch(value) {
    setBranchId(value);
    if (multiEnabled) setSelectedLocationId(value);
  }

  return { branchId, options, needsPicker, chooseBranch };
}

const TABS = [
  { to: '/retail/pos', label: tr('Bar & Shop POS'), access: 'retail_pos' },
  { to: '/retail/sales', label: tr('Sales'), access: ['retail_pos', 'retail_manage', 'retail_reports'] },
  { to: '/retail/products', label: tr('Products'), access: 'retail_manage' },
  { to: '/retail/vendors', label: tr('Vendors'), access: ['retail_manage', 'retail_reports'] },
  { to: '/retail/reports', label: tr('Revenue'), access: 'retail_reports' },
];

/** Page chrome shared by the retail screens: header tabs and the branch picker. */
export function RetailLayout({ title, branch, children, actions = null }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const tabs = TABS.filter((tab) => hasAccess(user, tab.access));
  return (
    <Layout>
      <PageHeader title={title}>
        <div data-walkthrough="retail-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={({ isActive }) => ({
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                background: isActive ? 'var(--navy)' : 'var(--card)',
                color: isActive ? '#fff' : 'var(--t2)',
                border: `1px solid ${isActive ? 'var(--navy)' : 'var(--border)'}`,
              })}
            >
              {t(tab.label)}
            </NavLink>
          ))}
          {actions}
        </div>
      </PageHeader>
      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
        {branch?.needsPicker && (
          <div
            style={{
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
                value={branch.branchId}
                onChange={(e) => branch.chooseBranch(pickValue(e))}
                options={branch.options.map((loc) => ({
                  value: String(loc._id),
                  label: loc.name || loc.locationId || t('Branch'),
                }))}
                placeholder={t('Select branch')}
              />
            </div>
          </div>
        )}
        {children}
      </div>
    </Layout>
  );
}

export const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
};

export const thStyle = {
  textAlign: 'start',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--t4)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

export const tdStyle = {
  padding: '10px 14px',
  fontSize: 13,
  color: 'var(--t2)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

export const tdNum = { ...tdStyle, textAlign: 'end', fontVariantNumeric: 'tabular-nums' };

/** Download rows (arrays of cells) as a CSV file. */
export function downloadCsv(filename, rows) {
  const escape = (cell) => {
    const text = String(cell ?? '');
    // Neutralise spreadsheet formulas.
    const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const body = rows.map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
