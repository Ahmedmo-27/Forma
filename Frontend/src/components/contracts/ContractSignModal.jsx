import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Btn, Input, Spinner, Alert, CAIRO_ZONE } from '../ui';
import SignaturePad from '../SignaturePad';
import { getContractSignature, signMemberContract } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { printContract } from './printContract';

const DATE_OPTIONS = { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' };
const DATE_TIME_OPTIONS = {
  timeZone: CAIRO_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

function ContractSummary({ contract }) {
  const { t } = useI18n();
  const { fmtDate, fmtNumber } = useFormat();
  if (!contract) return null;
  const day = (value) => (value ? fmtDate(value, DATE_OPTIONS) : '—');
  const rows = [
    ['Gym', contract.legalName ? `${contract.gymName} (${contract.legalName})` : contract.gymName],
    ['Member', `${contract.memberName}${contract.memberSystemId != null ? ` · #${contract.memberSystemId}` : ''}`],
    ['Package', [contract.packageName, contract.activityType].filter(Boolean).join(' · ')],
    ['Period', t('{start} to {end}', { start: day(contract.startDate), end: day(contract.endDate) })],
    ['Price paid', `${contract.currency} ${fmtNumber(contract.pricePaid ?? 0)}`],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', fontSize: 13, marginBottom: 14 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t(label)}</span>
          <span style={{ color: 'var(--t1)' }} dir="auto">{value || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function TermsBox({ terms }) {
  const { t } = useI18n();
  return (
    <div dir="auto" style={{
      maxHeight: 180, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6,
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', color: 'var(--t2)',
    }}>
      {terms || t('This gym has not added contract terms yet. The member is confirming the membership details above.')}
    </div>
  );
}

/** Shows a membership contract and captures or displays the member's signature. */
export default function ContractSignModal({ open, onClose, memberId, subscriptionId, defaultSignerName = '' }) {
  const { t, lang } = useI18n();
  const { fmtDateTime } = useFormat();
  const padRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [accepted, setAccepted] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !memberId || !subscriptionId) return undefined;
    let active = true;
    setLoading(true);
    setError(null);
    setAccepted(false);
    setPadEmpty(true);
    setSignerName(defaultSignerName);
    getContractSignature(memberId, subscriptionId)
      .then((res) => { if (active) setData(res.data); })
      .catch((e) => { if (active) setError(e.response?.data?.message || t('Could not load this contract.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, memberId, subscriptionId, defaultSignerName, t]);

  const submit = async () => {
    const image = padRef.current?.toDataURL();
    if (!image) { toast.error(t('Ask the member to sign inside the box.')); return; }
    if (signerName.trim().length < 2) { toast.error(t('Enter the full name of the person signing.')); return; }
    if (!accepted) { toast.error(t('The member must accept the terms first.')); return; }
    setSaving(true);
    try {
      const res = await signMemberContract(memberId, subscriptionId, { signerName: signerName.trim(), image, acceptTerms: true });
      setData(res.data);
      toast.success(t('Contract signed'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not save the signature.'));
    } finally {
      setSaving(false);
    }
  };

  const signed = data?.signed ? data.signature : null;

  const footer = signed ? (
    <>
      <Btn variant="outline" onClick={onClose}>{t('Close')}</Btn>
      <Btn onClick={() => printContract(signed, lang)}>{t('Print contract')}</Btn>
    </>
  ) : (
    <>
      <Btn variant="outline" onClick={onClose} disabled={saving}>{t('Cancel')}</Btn>
      <Btn onClick={submit} disabled={loading || !!error || padEmpty || !accepted || saving}>{saving ? t('Saving…') : t('Sign contract')}</Btn>
    </>
  );

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={signed ? t('Signed contract') : t('Sign membership contract')} size="lg" footer={footer}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : signed ? (
        <div>
          <ContractSummary contract={signed.contract} />
          <TermsBox terms={signed.terms} />
          <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <img src={signed.image} alt={t('Signature of {name}', { name: signed.signerName })} style={{ maxHeight: 90, maxWidth: 280, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
              <div><strong style={{ color: 'var(--t1)' }} dir="auto">{signed.signerName}</strong></div>
              <div>{t('Signed {date}', { date: signed.signedAt ? fmtDateTime(signed.signedAt, DATE_TIME_OPTIONS, 'en-US') : '—' })}</div>
              {signed.capturedBy?.name && <div>{t('Witnessed by {name}', { name: signed.capturedBy.name })}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <ContractSummary contract={data?.contract} />
          <TermsBox terms={data?.terms} />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{t('The member has read and accepts these terms.')}</span>
          </label>
          <Input label={t('Signed by (full name)')} value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} />
          <div style={{ marginTop: 12 }}>
            <SignaturePad ref={padRef} onChange={setPadEmpty} disabled={saving} />
          </div>
        </div>
      )}
    </Modal>
  );
}
