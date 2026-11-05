import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { Badge, Avatar, Spinner, fmtDate, EmptyState } from '../components/ui';
import { checkInMember, getMemberProfile, getTodayCheckIns } from '../api/endpoints';

// ── small stat pill ───────────────────────────────────────────────────────────
function StatPill({ label, value, color = 'var(--t1)' }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function CheckIn() {
  usePageTitle('Check In');
  const navigate  = useNavigate();
  const inputRef  = useRef(null);

  const [query,      setQuery]      = useState('');
  const [member,     setMember]     = useState(null);
  const [searching,  setSearching]  = useState(false);
  const [checking,   setChecking]   = useState(false);
  const [result,     setResult]     = useState(null); // {ok, msg}
  const [history,    setHistory]    = useState([]);
  const [histLoad,   setHistLoad]   = useState(true);
  const [alertPopup, setAlertPopup] = useState(null);

  const loadHistory = useCallback(async () => {
    setHistLoad(true);
    try { const r = await getTodayCheckIns(); setHistory(r.data.checkIns ?? []); }
    catch { /* silent */ }
    finally { setHistLoad(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setMember(null); setResult(null);
    try {
      const r = await getMemberProfile(query.trim());
      setMember(r.data.member);
      const alerts = (r.data.member?.alert || []).filter(a => a?.active);
      if (alerts.length) { setAlertPopup(alerts.map(a => a.text)); setTimeout(() => setAlertPopup(null), 5000); }
    } catch (err) {
      const msg = err.normalized?.message || err.response?.data?.message || 'Member not found.';
      toast.error(msg);
    }
    finally { setSearching(false); }
  };

  const handleCheckIn = async () => {
    if (!member) return;
    setChecking(true); setResult(null);
    try {
      const r = await checkInMember(member.systemId);
      setResult({ ok: true, msg: r.data.message });
      toast.success(r.data.message);
      const u = await getMemberProfile(member.systemId);
      setMember(u.data.member);
      loadHistory();
    } catch (err) {
      const msg = err.normalized?.message || err.response?.data?.message || 'Check-in failed.';
      setResult({ ok: false, msg });
    } finally { setChecking(false); }
  };

  const canCheckIn  = member && member.status !== 'expired' && member.status !== 'guest' && !member.isBlocked;
  const sub         = member?.subscriptions?.at(-1);
  const pkg         = sub?.packageSnapshot ?? sub?.package;
  const today       = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const todayCount  = history.length;
  const activeToday = history.filter(e => e.member?.status === 'active').length;

  const expiryDays  = sub?.endDate ? Math.ceil((new Date(sub.endDate) - new Date()) / 86400000) : null;

  return (
    <Layout>
      <div style={{ minHeight: 'calc(100svh - 112px)', display: 'flex', flexDirection: 'column' }}>

        {/* ── Hero header bar ─────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #1E1535 0%, #2D1B69 60%, #44298C 100%)',
          padding: '28px 32px 24px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', top: -100, right: -60, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,240,255,0.04)', bottom: -80, right: 200, pointerEvents: 'none' }} />

          <div style={{ position: 'relative', maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✅</div>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Check In</h1>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{today}</p>
            </div>

            {/* Today stats */}
            <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 0', minWidth: 220 }}>
              <StatPill label="Today" value={histLoad ? '…' : todayCount} color="#fff" />
              <div style={{ width: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />
              <StatPill label="Active" value={histLoad ? '…' : activeToday} color="#4ade80" />
              <div style={{ width: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />
              <StatPill label="This Month" value="—" color="rgba(255,255,255,0.55)" />
            </div>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────── */}
        <div style={{ flex: 1, background: 'var(--bg)', padding: '24px 32px 40px' }}>
          <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>

            {/* ── LEFT PANEL ─────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Search box */}
              <div style={{
                background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Find Member</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>Enter System ID, Member ID, or phone number</div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <form onSubmit={handleSearch}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)', pointerEvents: 'none' }}
                          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input
                          ref={inputRef}
                          value={query}
                          onChange={e => { setQuery(e.target.value); setMember(null); setResult(null); }}
                          placeholder="e.g. 100123 or 0101234…"
                          autoFocus
                          style={{
                            width: '100%', padding: '11px 12px 11px 36px', fontSize: 14,
                            border: '1.5px solid var(--border)', borderRadius: 10,
                            outline: 'none', color: 'var(--t1)', background: 'var(--bg)',
                            fontFamily: 'inherit', boxSizing: 'border-box',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                          }}
                          onFocus={e => { e.target.style.borderColor = '#44298C'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
                          onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>
                      <button type="submit" disabled={searching || !query.trim()} style={{
                        padding: '0 18px', borderRadius: 10, border: 'none', fontFamily: 'inherit',
                        background: 'linear-gradient(135deg,#44298C,#5B38BA)', color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
                        opacity: !query.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'opacity 0.15s',
                      }}>
                        {searching ? <Spinner size="sm" /> : 'Search'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Member card */}
              {member && (
                <div style={{
                  background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
                }}>
                  {/* Gradient header */}
                  <div style={{
                    background: 'linear-gradient(135deg,#1E1535 0%,#44298C 100%)',
                    padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 14,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', right: -30, top: -40 }} />
                    <div style={{ position: 'relative' }}>
                      <Avatar name={member.name} size="xl" photo={member.photo}
                        style={{ border: '3px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.30)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 6px', lineHeight: 1.2 }}>{member.name}</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Badge status={member.isBlocked ? 'blocked' : member.status} />
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>
                          #{member.systemId}{member.memberId ? ` · M${member.memberId}` : ''}
                        </span>
                      </div>
                      {member.phones && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>📞 {member.phones}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Package strip */}
                    {pkg ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>Package</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{pkg.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{pkg.activityType} · {pkg.duration}</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>Expires</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{fmtDate(sub?.endDate)}</div>
                          {expiryDays !== null && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: expiryDays < 0 ? 'var(--red)' : expiryDays <= 7 ? 'var(--amber)' : 'var(--green)' }}>
                              {expiryDays < 0 ? 'Expired' : expiryDays <= 7 ? `⚠ ${expiryDays}d left` : `${expiryDays}d remaining`}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: 'var(--t4)', background: 'var(--bg)', borderRadius: 10 }}>No active package</div>
                    )}

                    {/* Blocked banner */}
                    {member.isBlocked && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red-bd)', borderLeft: '4px solid var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>🚫</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Member is Blocked</div>
                          {member.blockedReason && <div style={{ fontSize: 11, color: 'var(--red)', opacity: 0.8, marginTop: 1 }}>Reason: {member.blockedReason}</div>}
                        </div>
                      </div>
                    )}

                    {/* Result */}
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

                    {/* Check-in button */}
                    <button
                      onClick={handleCheckIn}
                      disabled={checking || !canCheckIn}
                      style={{
                        width: '100%', padding: '15px', fontSize: 16, fontWeight: 800,
                        borderRadius: 12, border: 'none', fontFamily: 'inherit',
                        cursor: canCheckIn && !checking ? 'pointer' : 'not-allowed',
                        background: canCheckIn
                          ? 'linear-gradient(135deg,#16a34a,#22c55e)'
                          : 'var(--bg)',
                        color: canCheckIn ? '#fff' : 'var(--t4)',
                        boxShadow: canCheckIn ? '0 4px 20px rgba(34,197,94,0.35)' : 'none',
                        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        letterSpacing: '0.3px',
                      }}
                      onMouseEnter={e => { if (canCheckIn && !checking) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(34,197,94,0.45)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = canCheckIn ? '0 4px 20px rgba(34,197,94,0.35)' : 'none'; }}
                    >
                      {checking
                        ? <><Spinner size="sm" /> Processing…</>
                        : <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Check In Now
                          </>
                      }
                    </button>

                    {!canCheckIn && member.status && (
                      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', margin: 0 }}>
                        Cannot check in — member is <strong>{member.status}</strong>
                      </p>
                    )}

                    {/* Quick nav buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                      {[
                        { label: '👤 Profile',   to: `/members/${member.systemId}` },
                        { label: '🧊 Freeze',    to: `/members/${member.systemId}?tab=freeze` },
                        { label: '🎟️ Invitations', to: `/members/${member.systemId}?tab=invitations` },
                      ].map(({ label, to }) => (
                        <button key={to} onClick={() => navigate(to)} style={{
                          padding: '9px 6px', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--t2)', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', textAlign: 'center',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#44298C'; e.currentTarget.style.color = '#44298C'; e.currentTarget.style.background = 'rgba(68,41,140,0.05)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.background = 'var(--bg)'; }}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!member && !searching && (
                <div style={{ background: 'var(--card)', borderRadius: 16, border: '2px dashed var(--border)', padding: '40px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 12 }}>🔍</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>No member loaded</p>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>Search for a member above to check them in</p>
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL: Today's history ────────────────── */}
            <div style={{
              background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
              position: 'sticky', top: 20,
            }}>
              {/* Header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Today's Activity</h3>
                  <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{today}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    background: 'linear-gradient(135deg,#44298C,#5B38BA)',
                    color: '#fff', fontSize: 14, fontWeight: 800,
                    padding: '4px 14px', borderRadius: 20,
                    boxShadow: '0 2px 8px rgba(68,41,140,0.30)',
                  }}>
                    {histLoad ? '…' : `${todayCount} check-in${todayCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>

              {/* List */}
              <div style={{ maxHeight: 'calc(100svh - 280px)', overflowY: 'auto' }}>
                {histLoad ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
                ) : history.length === 0 ? (
                  <EmptyState icon="✅" message="No check-ins yet today" sub="Start checking in members using the panel on the left" />
                ) : (
                  history.map((entry, i) => (
                    <div
                      key={entry._id ?? i}
                      onClick={() => navigate(`/members/${entry.member.systemId}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 22px', cursor: 'pointer',
                        borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Serial number */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: i === 0 ? 'linear-gradient(135deg,#44298C,#5B38BA)' : 'var(--bg)',
                        border: `1px solid ${i === 0 ? 'transparent' : 'var(--border)'}`,
                        color: i === 0 ? '#fff' : 'var(--t4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {history.length - i}
                      </div>

                      <Avatar name={entry.member.name} size="sm" photo={entry.member.photo} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.member.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2, display: 'flex', gap: 6 }}>
                          <span style={{ fontFamily: 'monospace' }}>#{entry.member.systemId}</span>
                          {entry.member.package && <span>· {entry.member.package.name}</span>}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: 'var(--t1)',
                          background: i === 0 ? 'rgba(68,41,140,0.08)' : 'transparent',
                          padding: i === 0 ? '2px 8px' : '0',
                          borderRadius: i === 0 ? 6 : 0,
                        }}>
                          {new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {entry.checkedInBy?.name && (
                          <span style={{ fontSize: 10, color: 'var(--t4)' }}>by {entry.checkedInBy.name}</span>
                        )}
                        <Badge status={entry.member.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Alert popup ──────────────────────────────────────────── */}
      {alertPopup && (
        <div onClick={() => setAlertPopup(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, cursor: 'pointer',
        }}>
          <div className="fade-up" style={{
            background: '#fff', border: '2px solid var(--amber-bd)',
            borderRadius: 20, padding: '40px 48px', maxWidth: 480, width: '100%',
            textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#92400e', marginBottom: 16, letterSpacing: '-0.3px' }}>Member Alert</h2>
            {alertPopup.map((text, i) => (
              <p key={i} style={{ fontSize: 16, fontWeight: 600, color: '#78350f', lineHeight: 1.6, marginBottom: 8 }}>{text}</p>
            ))}
            <p style={{ fontSize: 12, color: '#b45309', marginTop: 20, opacity: 0.7 }}>Click anywhere to dismiss · Auto-closes in 5 seconds</p>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 960px) {
          .checkin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Layout>
  );
}
