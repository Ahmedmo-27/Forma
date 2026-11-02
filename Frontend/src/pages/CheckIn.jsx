import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { PageHeader, Btn, Spinner, Badge, Avatar, fmtDate, fmtDateTime, EmptyState } from '../components/ui';
import { checkInMember, getMemberProfile, getTodayCheckIns } from '../api/endpoints';

export default function CheckIn() {
  usePageTitle('Check In');
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query,     setQuery]     = useState('');
  const [member,    setMember]    = useState(null);
  const [searching, setSearching] = useState(false);
  const [checking,  setChecking]  = useState(false);
  const [result,    setResult]    = useState(null);
  const [history,   setHistory]   = useState([]);
  const [histLoad,  setHistLoad]  = useState(true);
  const [alertPopup,setAlertPopup]= useState(null);

  const loadHistory = useCallback(async () => {
    setHistLoad(true);
    try {
      const res = await getTodayCheckIns();
      setHistory(res.data.checkIns ?? []);
    } catch { /* silent */ }
    finally { setHistLoad(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setMember(null); setResult(null);
    try {
      const res = await getMemberProfile(query.trim());
      setMember(res.data.member);
      const alerts = (res.data.member?.alert || []).filter(a => a?.active);
      if (alerts.length > 0) {
        setAlertPopup(alerts.map(a => a.text));
        setTimeout(() => setAlertPopup(null), 5000);
      }
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Member not found.');
    } finally { setSearching(false); }
  };

  const handleCheckIn = async () => {
    if (!member) return;
    setChecking(true); setResult(null);
    try {
      const res = await checkInMember(member.systemId);
      setResult({ ok: true, msg: res.data.message });
      toast.success(res.data.message);
      const updated = await getMemberProfile(member.systemId);
      setMember(updated.data.member);
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Check-in failed.';
      setResult({ ok: false, msg });
      toast.error(msg);
    } finally { setChecking(false); }
  };

  const canCheckIn = member && member.status !== 'expired' && member.status !== 'guest' && !member.isBlocked;
  const sub = member?.subscriptions?.at(-1);
  const pkg = sub?.packageSnapshot ?? sub?.package;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Layout>
      <PageHeader title="Check In">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>{today}</span>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── LEFT: Search + Member card ─────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Search card */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '22px 22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Find Member</h3>
              <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 14 }}>Enter System ID, Member ID, or phone number</p>

              <form onSubmit={handleSearch}>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <svg style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)', pointerEvents: 'none' }}
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setMember(null); setResult(null); }}
                    placeholder="e.g. 100123 or 01012345678"
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px 12px 42px', fontSize: 14,
                      border: '1.5px solid var(--border)', borderRadius: 10,
                      outline: 'none', color: 'var(--t1)', background: 'var(--bg)',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <Btn type="submit" disabled={searching || !query.trim()} fullWidth size="md">
                  {searching ? <><Spinner size="sm" /> Searching…</> : 'Search Member'}
                </Btn>
              </form>
            </div>

            {/* Member result card */}
            {member && (
              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {/* Member header */}
                <div style={{
                  padding: '20px 22px',
                  background: 'linear-gradient(135deg, #44298C 0%, #5B38BA 100%)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <Avatar name={member.name} size="lg" photo={member.photo} style={{ border: '3px solid rgba(255,255,255,0.3)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 5px' }}>{member.name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Badge status={member.isBlocked ? 'blocked' : member.status} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>
                        #{member.systemId}{member.memberId ? ` · M${member.memberId}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Package info */}
                  {pkg ? (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
                      background: 'var(--border)', borderRadius: 10, overflow: 'hidden',
                    }}>
                      {[
                        { label: 'Package', value: pkg.name, sub: `${pkg.activityType} · ${pkg.duration}` },
                        { label: 'Expires', value: fmtDate(sub?.endDate), sub: (() => {
                          const days = sub?.endDate ? Math.ceil((new Date(sub.endDate) - new Date()) / 86400000) : null;
                          if (days === null) return null;
                          if (days < 0) return <span style={{ color: 'var(--red)', fontSize: 10, fontWeight: 700 }}>Expired</span>;
                          if (days <= 7) return <span style={{ color: 'var(--amber)', fontSize: 10, fontWeight: 700 }}>⚠ {days}d left</span>;
                          return <span style={{ color: 'var(--green)', fontSize: 10 }}>{days}d remaining</span>;
                        })() },
                      ].map(({ label, value, sub: s }) => (
                        <div key={label} style={{ background: 'var(--card)', padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{value}</div>
                          {s && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 13, color: 'var(--t4)' }}>No active package</div>
                  )}

                  {/* Blocked banner */}
                  {member.isBlocked && (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-bd)', borderLeft: '4px solid var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>🚫</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Member is Blocked</div>
                        {member.blockedReason && <div style={{ fontSize: 11, color: 'var(--red)', opacity: 0.8, marginTop: 2 }}>Reason: {member.blockedReason}</div>}
                      </div>
                    </div>
                  )}

                  {/* Result banner */}
                  {result && (
                    <div style={{
                      padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: 'center',
                      background: result.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                      color: result.ok ? 'var(--green)' : 'var(--red)',
                      border: `1px solid ${result.ok ? 'var(--green-bd)' : 'var(--red-bd)'}`,
                    }}>
                      {result.ok ? '✓ ' : '✗ '}{result.msg}
                    </div>
                  )}

                  {/* Action buttons */}
                  <button
                    onClick={handleCheckIn}
                    disabled={checking || !canCheckIn}
                    style={{
                      width: '100%', padding: '14px', fontSize: 15, fontWeight: 800,
                      borderRadius: 10, border: 'none', cursor: canCheckIn && !checking ? 'pointer' : 'not-allowed',
                      background: canCheckIn ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'var(--bg)',
                      color: canCheckIn ? '#fff' : 'var(--t4)',
                      boxShadow: canCheckIn ? '0 4px 16px rgba(34,197,94,0.30)' : 'none',
                      transition: 'all 0.15s', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (canCheckIn && !checking) e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                  >
                    {checking
                      ? <><Spinner size="sm" /> Processing…</>
                      : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Check In</>
                    }
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="outline" size="sm" fullWidth onClick={() => navigate(`/members/${member.systemId}`)}>Profile</Btn>
                    <Btn variant="outline" size="sm" fullWidth onClick={() => navigate(`/members/${member.systemId}?tab=freeze`)}>Freeze</Btn>
                    <Btn variant="outline" size="sm" fullWidth onClick={() => navigate(`/members/${member.systemId}?tab=invitations`)}>Invite</Btn>
                  </div>

                  {!canCheckIn && member.status && (
                    <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', margin: 0 }}>
                      Cannot check in — member is <strong>{member.status}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Today's history ──────────────────────────── */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            position: 'sticky', top: 76,
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Today's Check-Ins</h3>
                <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{today}</p>
              </div>
              <div style={{
                minWidth: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg,#44298C,#5B38BA)',
                color: '#fff', fontSize: 14, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(68,41,140,0.30)',
              }}>
                {histLoad ? '…' : history.length}
              </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 'calc(100svh - 240px)', overflowY: 'auto' }}>
              {histLoad ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
              ) : history.length === 0 ? (
                <EmptyState icon="✅" message="No check-ins yet today" sub="Checked-in members will appear here" />
              ) : (
                history.map((entry, i) => (
                  <div
                    key={entry._id ?? i}
                    onClick={() => navigate(`/members/${entry.member.systemId}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 20px', cursor: 'pointer',
                      borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Index */}
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--t4)', flexShrink: 0 }}>
                      {history.length - i}
                    </div>

                    <Avatar name={entry.member.name} size="sm" photo={entry.member.photo} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.member.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t4)', display: 'flex', gap: 6, marginTop: 2 }}>
                        <span style={{ fontFamily: 'monospace' }}>#{entry.member.systemId}</span>
                        {entry.member.package && <span>· {entry.member.package.name}</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        {new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {entry.checkedInBy?.name && (
                        <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>by {entry.checkedInBy.name}</div>
                      )}
                    </div>

                    <Badge status={entry.member.status} />
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Alert popup ──────────────────────────────────────────── */}
      {alertPopup && (
        <div onClick={() => setAlertPopup(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, cursor: 'pointer',
        }}>
          <div style={{
            background: 'var(--amber-bg)', border: '2px solid var(--amber-bd)',
            borderRadius: 20, padding: '36px 44px', maxWidth: 480, width: '100%',
            textAlign: 'center', boxShadow: '0 24px 64px rgba(245,158,11,0.20)',
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#92400e', marginBottom: 16 }}>Member Alert</h2>
            {alertPopup.map((text, i) => (
              <p key={i} style={{ fontSize: 16, fontWeight: 600, color: '#78350f', lineHeight: 1.6, marginBottom: 8 }}>{text}</p>
            ))}
            <p style={{ fontSize: 12, color: '#b45309', marginTop: 16 }}>Click anywhere to dismiss · Auto-closes in 5 seconds</p>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .page-wrap > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Layout>
  );
}
