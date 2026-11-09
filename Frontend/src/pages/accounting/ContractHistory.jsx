import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Table, EmptyState, fmtDate, fmtDateTime, Pagination, toLocalDateString } from '../../components/ui';
import { getContracts } from '../../api/endpoints';
import { useTenant } from '../../context/TenantContext';
import ContractDetailModal from '../../components/accounting/ContractDetailModal';

const PAGE_SIZE = 10;
const fmt = (n) => Number(n ?? 0).toLocaleString('en-EG');

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toLocalDateString(d);
}

const TODAY = toLocalDateString();

export default function ContractHistory() {
  usePageTitle('Contract History');
  const { currency = 'EGP' } = useTenant() || {};

  const [contracts, setContracts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo());
  const [dateTo, setDateTo] = useState(TODAY);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await getContracts(params);
      setContracts(res.data.contracts ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
      setTotalRevenue(res.data.totalRevenue ?? 0);
    } catch {
      toast.error('Failed to load contract history.');
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const rowStyle = { borderBottom: '1px solid var(--border)', cursor: 'pointer' };
  const headers = ['Contract #', 'Member', 'Package', 'Price Paid', 'Start Date', 'Sales Manager', 'Processed By', 'Date Added'];

  return (
    <Layout>
      <PageHeader title="Contract History" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>From</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || TODAY}
                onChange={(e) => { setPage(1); setDateFrom(e.target.value); }}
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>To</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={TODAY}
                onChange={(e) => { setPage(1); setDateTo(e.target.value); }}
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
              />
            </div>
            <button
              type="button"
              onClick={() => { setPage(1); setDateFrom(''); setDateTo(''); }}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              All Time
            </button>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Contracts', value: pagination.total, color: 'var(--blue)', accent: 'var(--blue)' },
            { label: 'Total Revenue', value: `${fmt(totalRevenue)} ${currency}`, color: 'var(--green)', accent: 'var(--green)' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Contracts ({pagination.total})</span>
          </div>
          {!contracts.length && !loading
            ? <EmptyState message="No contracts in this period" sub="Try adjusting the date range or approve a package request" />
            : <>
              <Table loading={loading} skeletonRows={5} headers={headers}>
                {contracts.map((c) => (
                  <tr
                    key={c._id}
                    className="tbl-row"
                    style={rowStyle}
                    onClick={() => setSelected(c)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{c.subscriptionId ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{c.member?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                      {c.package?.name ?? '—'}
                      {c.hasException && (
                        <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, marginTop: 2 }}>Exception</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>EGP {c.pricePaid}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(c.startDate)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{c.salesManager?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{c.approvedBy?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(c.createdAt)}</td>
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
            </>
          }
        </Card>
      </div>

      <ContractDetailModal
        contract={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </Layout>
  );
}
