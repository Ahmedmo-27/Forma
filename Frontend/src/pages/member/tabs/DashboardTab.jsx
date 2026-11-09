import { useNavigate } from 'react-router-dom';
import { Badge, fmtDate, fmtDateTime } from '../../../components/ui';
import { useTenant } from '../../../context/TenantContext';

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}
function daysAgo(d) {
  if (!d) return null;
  return Math.floor((new Date() - new Date(d)) / 86400000);
}
function thisMonthCount(logs = [], type) {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return logs.filter(l => l.type === type && new Date(l.createdAt) >= start).length;
}

function StatBox({ icon, label, value, sub, accent = '#44298C', onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderTop: `3px solid ${accent}`, borderRadius: 12, padding: '16px 18px',
      cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 14,
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)'; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${accent}18`, border: `1px solid ${accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--t4)', marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.3px', lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 5 }}>{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, action }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function InfoPair({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor || 'var(--t1)' }}>{value ?? '—'}</span>
    </div>
  );
}

function QuickActionBtn({ icon, label, sub, onClick, accent = '#44298C' }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px',
      cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 6, fontFamily: 'inherit', flex: 1, minWidth: 80,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = `${accent}12`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--t4)', textAlign: 'center' }}>{sub}</span>}
    </button>
  );
}

export default function DashboardTab({ member, user, data, onTabChange }) {
  const navigate = useNavigate();
  const { currency = 'EGP' } = useTenant() || {};

  const subs = member.subscriptions ?? [];
  const now  = new Date();
  const activeSub = subs.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now) || subs.at(-1);
  const pkg       = activeSub?.packageSnapshot ?? activeSub?.package;

  const isExpired    = member.status === 'expired';
  const isActive     = member.status === 'active';
  const expiryDays   = activeSub?.endDate ? daysUntil(activeSub.endDate) : null;
  const expiringSoon = isActive && expiryDays !== null && expiryDays <= 7;

  const allLogs          = member.userlog ?? [];
  const logCheckIns      = allLogs.filter(l => l.type === 'check-in');
  const checkInTotal     = data?.stats?.totalCheckIns ?? logCheckIns.length;
  const thisMonthCheckIns = data?.stats?.thisMonthCheckIns ?? thisMonthCount(allLogs, 'check-in');
  const lastCheckIn      = data?.checkIns?.[0] ?? [...logCheckIns].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  const totalPT  = member.PT_sessions ?? 0;
  const usedPT   = member.used_PT_sessions ?? 0;
  const remainPT = totalPT - usedPT;
  const hasPT    = totalPT > 0;
  const ptSubs   = member.pt_subscriptions ?? [];
  const latestPT = ptSubs.at(-1);
  const ptExpired = latestPT?.endDate ? new Date(latestPT.endDate) < now : true;

  const freezeUsed    = member.freezeDaysUsed ?? 0;
  const freezeLimit   = pkg?.freezeLimitDays ?? 0;
  const freezeRemain  = Math.max(0, freezeLimit - freezeUsed);
  const activeFreeze  = (member.freeze ?? []).find(f => !f.endedBy && new Date(f.endDate) > now);

  const invitationsUsed   = member.invitationsUsed ?? 0;
  const invitationLimit   = pkg?.invitationLimit ?? 0;
  const invitationsRemain = Math.max(0, invitationLimit - invitationsUsed);

  const isCoach  = ['Coach', 'Coach Manager'].includes(user?.role);
  const notes    = isCoach ? (member.couch_notes ?? []) : (member.notes ?? []);
  const lastNote = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  const statusColor = { active: '#22c55e', frozen: '#38bdf8', expired: '#ef4444', guest: '#A6A0C2' }[member.status] || '#A6A0C2';
  const go = (tab) => onTabChange?.(tab);

  const viewBtn = (tab) => (
    <button onClick={() => go(tab)} style={{
      marginTop: 4, padding: '9px', borderRadius: 8, background: 'transparent',
      border: '1px solid var(--border-md)', color: 'var(--t2)', fontSize: 12,
      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', width: '100%',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#44298C'; e.currentTarget.style.color = '#44298C'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.color = 'var(--t2)'; }}
    >View Package Details →</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Row 1: Stats ──────────────────────────────────────── */}
      <div className="dash-stats">
        <StatBox icon="🏅" label="Membership Status"
          value={member.status ? member.status.charAt(0).toUpperCase() + member.status.slice(1) : '—'}
          sub={activeSub?.startDate ? `Since ${fmtDate(activeSub.startDate)}` : undefined}
          accent={statusColor} onClick={() => go('packages')} />
        <StatBox icon="📅" label="Package Expiry"
          value={activeSub?.endDate ? fmtDate(activeSub.endDate) : '—'}
          sub={expiryDays === null ? undefined : expiryDays < 0 ? `Expired ${Math.abs(expiryDays)}d ago` : expiringSoon ? `⚠ ${expiryDays}d left` : `${expiryDays}d remaining`}
          accent={expiringSoon || isExpired ? '#ef4444' : '#44298C'} onClick={() => go('packages')} />
        <StatBox icon="✅" label="Total Check-Ins"
          value={checkInTotal} sub={`${thisMonthCheckIns} this month`}
          accent="#22c55e" onClick={() => go('checkins')} />
        <StatBox icon="💪" label="PT Sessions"
          value={hasPT ? remainPT : 0} sub={hasPT ? `${usedPT} used · ${totalPT} total` : 'No active PT'}
          accent="#f59e0b" onClick={() => go('packages')} />
      </div>

      {/* ── Row 2: Package · Quick Actions · Call Center ──────── */}
      <div className="dash-row2">

        {/* My Package */}
        <SectionCard title="My Package" icon="📦">
          {pkg ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge status={member.status} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{pkg.name}</span>
              </div>
              <div className="dash-info-grid">
                <InfoPair label="Activity"    value={pkg.activityType} />
                <InfoPair label="Duration"    value={pkg.duration} />
                <InfoPair label="Price Paid"  value={activeSub?.pricePaid ? `${currency} ${activeSub.pricePaid}` : '—'} />
                <InfoPair label="Discount"    value={activeSub?.discountPercent ? `${activeSub.discountPercent}%` : 'None'} />
                <InfoPair label="Freeze Limit" value={`${freezeLimit} days`} />
                <InfoPair label="Freeze Used"  value={`${freezeUsed} days`} />
                <InfoPair label="Invitations"  value={`${invitationsUsed} / ${invitationLimit}`} />
                <InfoPair label="Freeze Left"  value={`${freezeRemain} days`} valueColor={freezeRemain > 0 ? 'var(--sky)' : 'var(--t4)'} />
              </div>
              {activeFreeze && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', fontSize: 12, color: 'var(--sky)' }}>
                  🧊 Frozen until {fmtDate(activeFreeze.endDate)}
                </div>
              )}
              {viewBtn('packages')}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t3)', marginBottom: 12 }}>No active package</p>
              {viewBtn('packages')}
            </div>
          )}
        </SectionCard>

        {/* Quick Actions + PT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionCard title="Quick Actions" icon="⚡">
            <div className="dash-quick-actions">
              <QuickActionBtn icon="🎟️" label="Invitations"   sub={`${invitationsRemain} left`}    onClick={() => go('invitations')} accent="#22c55e" />
              <QuickActionBtn icon="✅" label="Check-Ins"     sub={`${checkInTotal} total`}      onClick={() => go('checkins')}    accent="#22c55e" />
              <QuickActionBtn icon="�" label="Packages"                                             onClick={() => go('packages')}   accent="#44298C" />
              <QuickActionBtn icon="🧊" label="Freeze"        sub={`${freezeRemain}d left`}          onClick={() => go('freeze')}     accent="#38bdf8" />
              <QuickActionBtn icon="💬" label="Call Center"   sub={`${notes.length} notes`}          onClick={() => go('callcenter')} accent="#f59e0b" />
              <QuickActionBtn icon="📁" label="Files"                                                 onClick={() => go('files')}     accent="#A6A0C2" />
            </div>
          </SectionCard>

          {/* PT Sessions card */}
          <div style={{ background: 'linear-gradient(135deg,#44298C,#5B38BA)', border: '1px solid rgba(91,56,186,0.4)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 4px 20px rgba(68,41,140,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>💪</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>PT Sessions</span>
              {hasPT && !ptExpired && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>ACTIVE</span>}
            </div>
            <div className="dash-pt-grid">
              {[{ label: 'Total', value: totalPT }, { label: 'Free', value: latestPT?.pricePaid === 0 ? totalPT : 0 }, { label: 'Taken', value: usedPT }, { label: 'Remaining', value: remainPT }].map(item => (
                <div key={item.label} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{item.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{item.value}</p>
                </div>
              ))}
            </div>
            {hasPT && latestPT?.endDate && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 11, color: 'rgba(255,255,255,0.55)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <span>Expires: {fmtDate(latestPT.endDate)}</span>
                <span>Coach: {member.current_couch?.name ?? '—'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Call Center */}
        <SectionCard
          title={isCoach ? `Coach Notes (${notes.length})` : `Call Center (${notes.length})`}
          icon="📞"
          action={<button onClick={() => go('callcenter')} style={{ fontSize: 11, fontWeight: 600, color: '#44298C', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>}
        >
          {lastNote ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Last Note</span>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>{fmtDateTime(lastNote.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.5 }}>{lastNote.text}</p>
                {lastNote.createdBy?.name && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 6 }}>— {lastNote.createdBy.name}</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Total Notes</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>{notes.length}</p>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Last Active</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{daysAgo(lastNote.createdAt)}d ago</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {notes.slice(0, 3).map((n, i) => (
                  <div key={n._id ?? i} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: 10 }}>{n.createdBy?.name ?? '—'}</span>
                      <span style={{ color: 'var(--t4)', fontSize: 10 }}>{fmtDate(n.createdAt)}</span>
                    </div>
                    <p style={{ color: 'var(--t2)' }}>{n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 14, color: 'var(--t4)' }}>No notes yet</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 3: Last Check-In · Alerts · Member Info ────────── */}
      <div className="dash-row3">

        {/* Last Check-In */}
        <SectionCard title="Last Check-In" icon="🕐">
          {lastCheckIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 2 }}>{fmtDateTime(lastCheckIn.createdAt)}</p>
                {lastCheckIn.createdBy?.name && <p style={{ fontSize: 11, color: 'var(--t4)' }}>By {lastCheckIn.createdBy.name}</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Total</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{checkInTotal}</p>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>This Month</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{thisMonthCheckIns}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}><p style={{ fontSize: 14, color: 'var(--t4)' }}>No check-ins yet</p></div>
          )}
        </SectionCard>

        {/* Alerts */}
        <SectionCard title="Alerts" icon="🚨"
          action={<button onClick={() => go('alerts')} style={{ fontSize: 11, fontWeight: 600, color: '#44298C', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Manage →</button>}
        >
          {(member.alert ?? []).filter(a => a.active).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(member.alert ?? []).filter(a => a.active).slice(0, 3).map((a, i) => (
                <div key={a._id ?? i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12, color: 'var(--amber)' }}>⚠ {a.text}</div>
              ))}
              {(member.alert ?? []).filter(a => a.active).length > 3 && (
                <p style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center' }}>+{(member.alert ?? []).filter(a => a.active).length - 3} more</p>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 22, opacity: 0.2, marginBottom: 6 }}>🚨</p>
              <p style={{ fontSize: 13, color: 'var(--t4)' }}>No active alerts</p>
            </div>
          )}
        </SectionCard>

        {/* Member Info */}
        <SectionCard title="Member Info" icon="👤">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="dash-info-grid">
              <InfoPair label="Member ID"     value={member.memberId ? `M${member.memberId}` : '—'} />
              <InfoPair label="System ID"     value={member.systemId ? `#${member.systemId}` : '—'} />
              <InfoPair label="Status"        value={<Badge status={member.status} />} />
              <InfoPair label="Gender"        value={member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : '—'} />
              <InfoPair label="Sales Rep"     value={member.assignedSales?.name ?? '—'} />
              <InfoPair label="Coach"         value={member.current_couch?.name ?? '—'} />
              <InfoPair label="Total Subs"    value={subs.length} />
              <InfoPair label="Joined"        value={member.createdAt ? fmtDate(member.createdAt) : '—'} />
            </div>
            {member.isBlocked && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: 'var(--red)' }}>
                🚫 Blocked{member.blockedReason ? `: ${member.blockedReason}` : ''}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Responsive styles ───────────────────────────────────── */}
      <style>{`
        .dash-stats         { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
        .dash-row2          { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 12px; }
        .dash-row3          { display: grid; grid-template-columns: 1fr 1fr 1fr;   gap: 12px; }
        .dash-info-grid     { display: grid; grid-template-columns: 1fr 1fr;       gap: 10px; }
        .dash-quick-actions { display: flex;  flex-wrap: wrap; gap: 8px; }
        .dash-pt-grid       { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }

        @media (max-width: 1024px) {
          .dash-stats   { grid-template-columns: repeat(2,1fr); }
          .dash-row2    { grid-template-columns: 1fr 1fr; }
          .dash-row3    { grid-template-columns: 1fr 1fr; }
          .dash-pt-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 640px) {
          .dash-stats   { grid-template-columns: 1fr 1fr; }
          .dash-row2    { grid-template-columns: 1fr; }
          .dash-row3    { grid-template-columns: 1fr; }
          .dash-pt-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 380px) {
          .dash-stats { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
