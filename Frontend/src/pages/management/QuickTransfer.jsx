import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, Select } from '../../components/ui';
import { getSalesUsers, getCoachTeam, switchSalesRep, switchCoach } from '../../api/endpoints';
import { CheckCircle2, Zap } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';

const iStyle = {
  width: '100%', height: 38, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', padding: '0 12px', transition: 'border-color 0.15s, box-shadow 0.15s',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: 6,
};

const STAFF_GROUPS = [
  { key: 'Sales Representatives', label: tr('Sales Representatives') },
  { key: 'Sales Managers', label: tr('Sales Managers') },
  { key: 'Coaches', label: tr('Coaches') },
];

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function QuickTransfer() {
  const { t } = useI18n();
  usePageTitle(t('Quick Transfer'));
  const navigate = useNavigate();
  const { user: _user } = useAuth();

  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const [systemId, setSystemId] = useState('');
  const [destId, setDestId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState(null); // { memberLabel, destName, destRole }

  useEffect(() => {
    setLoadingStaff(true);
    Promise.all([
      getSalesUsers().then((r) => r.data.salesUsers ?? []).catch(() => []),
      getCoachTeam().then((r) => (r.data.team ?? []).filter((p) => ['Coach', 'Head Coach'].includes(p.role))).catch(() => []),
    ]).then(([sales, coachList]) => {
      setSalesUsers(sales);
      setCoaches(coachList);
    }).finally(() => setLoadingStaff(false));
  }, []);

  const allStaff = [
    ...salesUsers.filter((u) => u.role === 'Sales').map((u) => ({ ...u, _group: 'Sales Representatives' })),
    ...salesUsers.filter((u) => u.role === 'Sales Manager').map((u) => ({ ...u, _group: 'Sales Managers' })),
    ...coaches.map((c) => ({ ...c, _group: 'Coaches' })),
  ];

  const destPerson = allStaff.find((p) => p._id === destId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = systemId.trim();
    if (!id) { toast.error(t('Enter a System ID')); return; }
    if (!destId) { toast.error(t('Choose a destination staff member')); return; }
    setBusy(true);
    try {
      const isSales = salesUsers.some((u) => u._id === destId);
      if (isSales) {
        await switchSalesRep(id, destId, { reason: reason.trim() || 'Quick Transfer from Management' });
      } else {
        await switchCoach(id, destId, { reason: reason.trim() || 'Quick Transfer from Management' });
      }
      setResult({
        memberLabel: `#${id}`,
        destName: destPerson?.name || destId,
        destRole: isSales ? tr('Sales') : tr('Coach'),
      });
      toast.success(t('Transfer successful!'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('Transfer failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setSystemId('');
    setDestId('');
    setReason('');
    setResult(null);
  };

  return (
    <Layout>
      <PageHeader walkthrough="quick-transfer-header" title={t('Quick Transfer')}>
        <Btn variant="ghost" size="sm" onClick={() => navigate('/management')}>
          <span className="rtl-flip" style={{ display: 'inline-block' }} aria-hidden>←</span> {t('Back to Management')}
        </Btn>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="quick-transfer-board" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 680 }}>
        <p style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 24 }}>
          {t('Transfer an individual member to a sales representative or coach by their System ID.')}
        </p>

        {result ? (
          /* ── Success State ── */
          <Card style={{ padding: '36px 32px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--green)' }}><CheckCircle2 size={48} strokeWidth={1.5} aria-hidden /></div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
              {t('Transfer Complete')}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 24 }}>
              {t('Member {member} was successfully transferred to {name}', { member: `\u2066${result.memberLabel}\u2069`, name: `\u2068${result.destName}\u2069` })}{' '}
              <span style={{ color: 'var(--t3)', fontSize: 12 }}>({t(result.destRole)})</span>
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={handleReset}><Zap size={14} aria-hidden /> {t('Transfer Another')}</Btn>
              <Btn variant="outline" onClick={() => navigate(`/members/${systemId}`)}>{t('View Member Profile')}</Btn>
            </div>
          </Card>
        ) : (
          /* ── Transfer Form ── */
          <Card style={{ padding: '28px 28px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              <Field label={t('System ID')}>
                <div dir="ltr" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute', insetInlineStart: 12, color: 'var(--t3)',
                    fontWeight: 700, fontSize: 14, pointerEvents: 'none',
                  }}>#</span>
                  <input
                    value={systemId}
                    onChange={(e) => setSystemId(e.target.value)}
                    placeholder={t('e.g. {example}', { example: '104' })}
                    autoFocus
                    style={{ ...iStyle, paddingInlineStart: 26 }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--navy, var(--navy))'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy, var(--navy)) 10%, transparent)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </Field>

              <Field label={t('Assign To')}>
                {loadingStaff ? (
                  <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t3)', fontSize: 13 }}>
                    <Spinner size="sm" /> {t('Loading staff…')}
                  </div>
                ) : (
                  <Select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                  >
                    <option value="">{t('Select destination…')}</option>
                    {STAFF_GROUPS.map(({ key: group, label }) => {
                      const members = allStaff.filter((p) => p._group === group);
                      if (!members.length) return null;
                      return (
                        <optgroup key={group} label={t(label)}>
                          {members.map((p) => (
                            <option key={p._id} value={p._id}>{p.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                )}
              </Field>

              <Field label={t('Reason (optional)')}>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('e.g. Member requested change')}
                  style={iStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--navy, var(--navy))'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy, var(--navy)) 10%, transparent)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </Field>

              <div style={{
                paddingTop: 12, borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'flex-end', gap: 10,
              }}>
                <Btn
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={busy || (!systemId && !destId && !reason)}
                >
                  ↺ {t('Clear')}
                </Btn>
                <button
                  type="submit"
                  disabled={busy || !systemId.trim() || !destId}
                  style={{
                    height: 38, padding: '0 22px', borderRadius: 8, border: 'none',
                    background: busy || !systemId.trim() || !destId ? 'var(--border)' : 'var(--navy, var(--navy))',
                    color: busy || !systemId.trim() || !destId ? 'var(--t4)' : '#fff',
                    fontSize: 13, fontWeight: 700, cursor: busy || !systemId.trim() || !destId ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {busy ? <Spinner size="sm" /> : <><Zap size={14} aria-hidden /> {t('Transfer Member')}</>}
                </button>
              </div>

            </form>
          </Card>
        )}
      </div>
    </Layout>
  );
}
