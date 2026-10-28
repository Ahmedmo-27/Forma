import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { PageHeader, Card, CardHeader, Btn, Spinner, Badge, Avatar, fmtDate, fmtDateTime, EmptyState } from '../components/ui';
import { checkInMember, getMemberProfile, getTodayCheckIns } from '../api/endpoints';
import BarcodeScanner from '../components/BarcodeScanner';

export default function CheckIn() {
  usePageTitle('Check In');
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Search & check-in state
  const [query,     setQuery]     = useState('');
  const [member,    setMember]    = useState(null);
  const [searching, setSearching] = useState(false);
  const [checking,  setChecking]  = useState(false);
  const [result,    setResult]    = useState(null);

  // Today's history
  const [history,      setHistory]      = useState([]);
  const [historyLoad,  setHistoryLoad]  = useState(true);
  const [alertPopup,   setAlertPopup]   = useState(null);

  // ── Load today's check-ins ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoad(true);
    try {
      const res = await getTodayCheckIns();
      setHistory(res.data.checkIns ?? []);
    } catch { /* silent */ }
    finally { setHistoryLoad(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setMember(null); setResult(null);
    try {
      const res = await getMemberProfile(query.trim());
      setMember(res.data.member);

      // Show active alerts as big centered popup (5 sec auto-dismiss)
      const activeAlerts = (res.data.member?.alert || []).filter(a => a?.active);
      if (activeAlerts.length > 0) {
        setAlertPopup(activeAlerts.map(a => a.text));
        setTimeout(() => setAlertPopup(null), 5000);
      }
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Member not found.');
    } finally { setSearching(false); }
  };

  // ── Check-in ──────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!member) return;
    setChecking(true); setResult(null);
    try {
      const res = await checkInMember(member.systemId);
      setResult({ ok: true, msg: res.data.message });
      toast.success(res.data.message);
      // Refresh member data and history
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
  const pkg = sub?.package;

  return (
    <Layout>
      <PageHeader title="Check In" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div className="grid-checkin">

          {/* ── Left column: Search + Member card ──────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Search */}
            <Card>
              <CardHeader title="Find Member" />
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={inputRef}
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="System ID, Member ID, or phone…"
                  autoFocus
                  style={{
                    flex: 1, padding: '10px 13px', fontSize: 14,
                    border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none', color: 'var(--t1)', background: 'var(--card)',
                    fontFamily: 'inherit', transition: 'border-color 0.12s, box-shadow 0.12s',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
                <Btn type="submit" disabled={searching || !query.trim()} size="md">
                  {searching ? <Spinner size="sm" /> : 'Search'}
                </Btn>
              </form>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8 }}>
                Enter Member ID, scan barcode, or type phone number.
              </p>
            </Card>

            {/* Barcode Scanner */}
            <Card>
              <BarcodeScanner inputRef={inputRef} />
            </Card>

            {/* Member result */}
            {member && (
              <Card>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <Avatar name={member.name} size="lg" photo={member.photo} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{member.name}</h2>
                      <Badge status={member.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--t3)', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--t4)' }}>
                        #{member.systemId}{member.memberId ? ` / M${member.memberId}` : ''}
                      </span>
                      <span>{member.phones}</span>
                    </div>
                  </div>
                </div>

                {/* Package strip */}
                {pkg && (
                  <div                     className="grid-2"
                    style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
                    background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 18,
                  }}>
                    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 3 }}>Package</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{pkg.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{pkg.activityType} · {pkg.duration}</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 3 }}>Expires</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{fmtDate(sub?.endDate)}</div>
                    </div>
                  </div>
                )}

                {/* Result */}
                {/* Blocked banner */}
                {member.isBlocked && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 6, marginBottom: 16,
                    background: 'var(--red-bg)', border: '1px solid var(--red-bd)',
                    borderLeft: '4px solid var(--red)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>🚫</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Member is Blocked</div>
                      {member.blockedReason && (
                        <div style={{ fontSize: 12, color: 'var(--red)', opacity: 0.8, marginTop: 2 }}>Reason: {member.blockedReason}</div>
                      )}
                    </div>
                  </div>
                )}

                {result && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600,
                    background: result.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: result.ok ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${result.ok ? 'var(--green-bd)' : 'var(--red-bd)'}`,
                    textAlign: 'center',
                  }}>
                    {result.ok ? '✓ ' : '✗ '}{result.msg}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn
                    variant={canCheckIn ? 'success' : 'outline'}
                    onClick={handleCheckIn}
                    disabled={checking || !canCheckIn}
                    fullWidth
                    size="lg"
                  >
                    {checking ? <><Spinner size="sm" /> Processing…</> : '✓ Check In'}
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}?tab=freeze`)}>
                    Freeze
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}?tab=invitations`)}>
                    Invitations
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}`)}>
                    Profile
                  </Btn>
                </div>

                {!canCheckIn && member.status && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', marginTop: 10 }}>
                    Cannot check in — member is <strong>{member.status}</strong>
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* ── Right column: Today's history ──────────────────────── */}
          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Today's Check-Ins</h3>
                <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 16,
                background: 'var(--navy)', color: '#fff',
                fontSize: 13, fontWeight: 800,
              }}>
                {historyLoad ? '…' : history.length}
              </div>
            </div>

            <div style={{ maxHeight: 'calc(100svh - 220px)', overflowY: 'auto' }}>
              {historyLoad ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
              ) : history.length === 0 ? (
                <EmptyState icon="📋" message="No check-ins yet today" sub="Check in a member using the search on the left" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {history.map((entry, i) => (
                    <div key={entry._id ?? i}
                      onClick={() => navigate(`/members/${entry.member.systemId}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 18px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar name={entry.member.name} size="sm" photo={entry.member.photo} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{entry.member.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>#{entry.member.systemId}</span>
                          {entry.member.package && <span>{entry.member.package.name}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                          {new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        {entry.checkedInBy?.name && (
                          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>by {entry.checkedInBy.name}</div>
                        )}
                        <Badge status={entry.member.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

        </div>
      </div>
      {/* ── Alert Popup (big centered, auto-dismiss 5s) ──────────── */}
      {alertPopup && (
        <div
          onClick={() => setAlertPopup(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'pointer',
          }}
        >
          <div style={{
            background: 'var(--amber-bg)', border: '2px solid var(--amber-bd)',
            borderRadius: 16, padding: '32px 40px', maxWidth: 500, width: '100%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(245,158,11,0.2)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#92400e', marginBottom: 16 }}>
              Member Alert
            </h2>
            {alertPopup.map((text, i) => (
              <p key={i} style={{ fontSize: 18, fontWeight: 600, color: '#78350f', lineHeight: 1.6, marginBottom: 8 }}>
                {text}
              </p>
            ))}
            <p style={{ fontSize: 12, color: '#b45309', marginTop: 16 }}>
              Click anywhere to dismiss · Auto-closes in 5 seconds
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
