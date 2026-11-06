import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Btn, Input, Alert, Spinner, EmptyState, Badge, fmtDate, fmtDateTime } from '../../../components/ui';
import { freezeMember } from '../../../api/endpoints';

export default function FreezeTab({ member, user, onRefresh }) {
  const [startDate, setStart] = useState('');
  const [endDate,   setEnd]   = useState('');
  const [loading,   setLoading] = useState(false);

  const canFreeze = ['Receptionist', 'Owner', 'Sales', 'Sales Manager'].includes(user?.role);
  const isActive  = member.status === 'active';
  const isFrozen  = member.status === 'frozen';
  const freezes   = [...(member.freeze ?? [])].reverse();
  const sub       = member.subscriptions?.at(-1);
  const pkg       = sub?.package;
  const allowed   = pkg?.freezeLimitDays ?? 0;
  const used      = member.freezeDaysUsed ?? 0;
  const remaining = allowed - used;
  const reqDays   = startDate && endDate ? Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) : 0;

  const handleFreeze = async () => {
    if (!startDate || !endDate) { toast.error('Both dates required.'); return; }
    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
      toast.error('Please enter valid dates.');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) { toast.error('End must be after start.'); return; }
    if (reqDays > remaining) { toast.error(`Only ${remaining} days remaining.`); return; }
    setLoading(true);
    try { await freezeMember(member.systemId, { startDate, endDate }); toast.success('Member frozen.'); setStart(''); setEnd(''); onRefresh(); }
    catch (e) { toast.error(e.response?.data?.message ?? 'Failed.'); }
    finally { setLoading(false); }
  };

  const days = (s, e) => Math.ceil((new Date(e) - new Date(s)) / 86400000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader title="Freeze Management"><Badge status={member.status} /></CardHeader>

        {/* Quota row */}
        <div className="grid-stats-3" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
          {[{ l: 'Allowed', v: `${allowed}d`, c: 'var(--t1)' }, { l: 'Used', v: `${used}d`, c: 'var(--amber)' }, { l: 'Remaining', v: `${remaining}d`, c: remaining > 0 ? 'var(--green)' : 'var(--red)' }].map(s => (
            <div key={s.l} style={{ background: 'var(--card)', padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {canFreeze && isActive && remaining > 0 && (
          <>
            <div className="grid-2">
              <Input label="Start Date" type="date" value={startDate} onChange={e => setStart(e.target.value)} />
              <Input label="End Date"   type="date" value={endDate}   onChange={e => setEnd(e.target.value)} />
            </div>
            {reqDays > 0 && <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>This will use <strong>{reqDays}</strong> of {remaining} remaining days.</p>}
            <Btn onClick={handleFreeze} disabled={loading || !startDate || !endDate}>{loading ? <Spinner size="sm" /> : 'Freeze Member'}</Btn>
          </>
        )}
        {isFrozen    && <Alert type="info">Member is frozen. Check them in to end the freeze early.</Alert>}
        {canFreeze && !isActive && !isFrozen && <Alert type="warning">Cannot freeze — status is {member.status}.</Alert>}
        {canFreeze && isActive && remaining <= 0 && <Alert type="warning">Freeze limit reached for this package.</Alert>}
      </Card>

      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={`Freeze History (${member.freeze?.length ?? 0})`} />
        </div>
        {!freezes.length ? <EmptyState message="No freezes on record" /> :
          <div>
            {freezes.map(f => (
              <div key={f._id} className="freeze-history-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', gap: 16 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>{fmtDate(f.startDate)} → {fmtDate(f.endDate)}</p>
                  <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>By {f.createdBy?.name ?? '—'} · {fmtDateTime(f.createdAt)}{f.endedBy ? ` · Ended early by ${f.endedBy.name}` : ''}</p>
                  {f.note && <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, fontStyle: 'italic' }}>"{f.note}"</p>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sky)' }}>{days(f.startDate, f.endDate)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase' }}>days</div>
                </div>
              </div>
            ))}
          </div>
        }
      </Card>
    </div>
  );
}
