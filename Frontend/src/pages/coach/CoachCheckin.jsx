import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import QrCheckInCamera from '../../components/QrCheckInCamera';
import { PageHeader, Card, CardHeader, Btn, Spinner, Badge, Avatar, Input, EmptyState, fmtTimeWithSeconds } from '../../components/ui';
import { getMemberProfile, getAllMembers, checkInMember } from '../../api/endpoints';
import { parseScannedIdentifier } from '../../lib/scannerParser';
import api from '../../api/axios';
import { Camera, Check, Dumbbell, DoorOpen, XCircle } from 'lucide-react';

const MODE_GYM = 'gym';
const MODE_PT = 'pt';

export default function CoachCheckin() {
  usePageTitle('Check-In');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Head Coach';

  const [mode, setMode] = useState(MODE_PT);
  const [query, setQuery] = useState('');
  const [member, setMember] = useState(null);
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sessions, setSessions] = useState('1');
  const [result, setResult] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState(null);

  const [todayEntries, setTodayEntries] = useState([]);
  const [historyLoad, setHistoryLoad] = useState(true);

  const modeRef = useRef(mode);
  const sessionsRef = useRef(sessions);
  const isManagerRef = useRef(isManager);
  modeRef.current = mode;
  sessionsRef.current = sessions;
  isManagerRef.current = isManager;

  const loadHistory = useCallback(async () => {
    setHistoryLoad(true);
    try {
      const res = await getAllMembers();
      const members = res.data.members ?? [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const entries = [];
      members.forEach((m) => {
        const coachId = m.current_couch?._id || m.current_couch;
        if (!isManager && String(coachId) !== String(user?._id)) return;

        (m.userlog || []).forEach((log) => {
          const at = new Date(log.createdAt);
          if (at < today) return;

          const isPt = log.type === 'pt-session' || (log.type === 'check-in' && log.text?.includes('PT session'));
          const isGym = log.type === 'check-in' && !log.text?.includes('PT session');

          if (mode === MODE_PT && !isPt) return;
          if (mode === MODE_GYM && !isGym) return;

          entries.push({
            _id: log._id,
            member: m,
            text: log.text,
            time: log.createdAt,
            by: log.createdBy?.name,
            kind: isPt ? 'pt' : 'gym',
          });
        });
      });

      entries.sort((a, b) => new Date(b.time) - new Date(a.time));
      setTodayEntries(entries);
    } catch { /* silent */ }
    finally { setHistoryLoad(false); }
  }, [user?._id, isManager, mode]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runCheckInForMember = useCallback(async (foundMember) => {
    if (!foundMember) return;
    const currentMode = modeRef.current;
    setChecking(true);
    setResult(null);
    try {
      if (currentMode === MODE_GYM) {
        const res = await checkInMember(String(foundMember.systemId));
        const msg = res.data?.message || 'Member checked in';
        setResult({ ok: true, msg });
        toast.success(msg);
        setLastScannedResult({
          ok: true,
          name: foundMember.name,
          systemId: foundMember.systemId,
          memberId: foundMember.memberId,
          msg,
          time: new Date(),
        });
      } else {
        const payload = { memberId: String(foundMember.systemId) };
        if (isManagerRef.current) {
          const s = Number(sessionsRef.current);
          if (!s || s <= 0 || !Number.isInteger(s)) {
            toast.error('Number of sessions must be a positive whole number');
            setChecking(false);
            return;
          }
          payload.numberOfSessions = s;
        }
        const res = await api.post('/members/PTcheckin', payload);
        setResult({ ok: true, msg: res.data.message });
        toast.success(res.data.message);
        setLastScannedResult({
          ok: true,
          name: foundMember.name,
          systemId: foundMember.systemId,
          memberId: foundMember.memberId,
          msg: res.data.message,
          time: new Date(),
        });
      }
      const updated = await getMemberProfile(foundMember.systemId);
      setMember(updated.data.member);
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Check-in failed.';
      setResult({ ok: false, msg });
      toast.error(msg);
      setLastScannedResult({
        ok: false,
        name: foundMember.name,
        msg,
        time: new Date(),
      });
    } finally {
      setChecking(false);
    }
  }, [loadHistory]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setMember(null); setResult(null);
    try {
      const res = await getMemberProfile(query.trim());
      setMember(res.data.member);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Member not found.');
    } finally { setSearching(false); }
  };

  const handleCameraScan = useCallback(async (raw, _source, scanMode = 'auto') => {
    const identifier = parseScannedIdentifier(raw, scanMode);
    if (!identifier) return;
    setQuery(identifier);
    setSearching(true);
    setMember(null);
    setResult(null);
    try {
      const res = await getMemberProfile(identifier);
      const found = res.data.member;
      setMember(found);
      await runCheckInForMember(found);
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Member not found.';
      toast.error(msg);
      setLastScannedResult({ ok: false, identifier, msg, time: new Date() });
    } finally {
      setSearching(false);
    }
  }, [runCheckInForMember]);

  const remaining = (member?.PT_sessions || 0) - (member?.used_PT_sessions || 0);
  const canPtCheckIn = member && member.couch_subscription_status === 'active' && remaining > 0;
  const canGymCheckIn = Boolean(member);
  const canCheckIn = mode === MODE_PT ? canPtCheckIn : canGymCheckIn;

  const handleCheckIn = async () => {
    if (!member) return;
    await runCheckInForMember(member);
  };

  const modeBtnStyle = (active) => ({
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
    background: active ? 'rgba(37,99,235,0.08)' : 'var(--card)',
    color: active ? 'var(--blue)' : 'var(--t2)',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontFamily: 'inherit',
  });

  return (
    <Layout>
      <PageHeader walkthrough="coach-checkin-header" title="Check-In" />

      <div className="page-wrap" data-walkthrough="coach-checkin-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div className="grid-checkin">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card>
              <CardHeader title="Check-in type" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={modeBtnStyle(mode === MODE_GYM)} onClick={() => { setMode(MODE_GYM); setResult(null); }}>
                  <DoorOpen size={15} aria-hidden /> Gym check-in
                </button>
                <button type="button" style={modeBtnStyle(mode === MODE_PT)} onClick={() => { setMode(MODE_PT); setResult(null); }}>
                  <Dumbbell size={15} aria-hidden /> PT session
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 10, marginBottom: 0 }}>
                {mode === MODE_GYM
                  ? 'Logs a normal gym visit. Does not deduct PT sessions.'
                  : 'Deducts from the member’s private training balance.'}
              </p>
            </Card>

            <Card>
              <CardHeader title="Find Member" />
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="System ID, Member ID, or phone…"
                  autoFocus
                  style={{
                    flex: '1 1 200px', minWidth: 150, padding: '10px 13px', fontSize: 14, minHeight: 44,
                    border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none', color: 'var(--t1)', background: 'var(--card)', fontFamily: 'inherit',
                    transition: 'border-color 0.12s, box-shadow 0.12s',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
                <Btn type="submit" disabled={searching || !query.trim()} size="md" style={{ minHeight: 44 }}>
                  {searching ? <Spinner size="sm" /> : 'Search'}
                </Btn>
                <Btn
                  type="button"
                  variant="outline"
                  size="md"
                  style={{ minHeight: 44 }}
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera size={15} aria-hidden /> Open Camera
                </Btn>
              </form>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8 }}>
                Accepts system ID, member ID, or phone number. Camera scan checks in using the selected type above.
              </p>
            </Card>

            {member && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <Avatar name={member.name} size="lg" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{member.name}</h2>
                      <Badge status={mode === MODE_PT ? (member.couch_subscription_status || 'guest') : (member.status || 'guest')} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      #{member.systemId} · {member.current_couch?.name ? `Coach: ${member.current_couch.name}` : 'No coach'}
                    </div>
                  </div>
                </div>

                {mode === MODE_PT && (
                  <div className="grid-stats-3" style={{ background: 'var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
                    <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{member.PT_sessions || 0}</div>
                      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>Total</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t2)' }}>{member.used_PT_sessions || 0}</div>
                      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>Used</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: remaining > 0 ? 'var(--green)' : 'var(--red)' }}>{remaining}</div>
                      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>Remaining</div>
                    </div>
                  </div>
                )}

                {mode === MODE_PT && isManager && (
                  <div style={{ marginBottom: 14 }}>
                    <Input
                      label="Number of Sessions"
                      type="number" min="1" max={remaining}
                      value={sessions}
                      onChange={e => setSessions(e.target.value)}
                    />
                  </div>
                )}

                {result && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600, textAlign: 'center',
                    background: result.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: result.ok ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${result.ok ? 'var(--green-bd)' : 'var(--red-bd)'}`,
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {result.ok ? <Check size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
                      {result.msg}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn
                    variant={canCheckIn ? 'success' : 'outline'}
                    onClick={handleCheckIn}
                    disabled={checking || !canCheckIn}
                    fullWidth size="lg"
                  >
                    {checking ? (
                      <><Spinner size="sm" /> Processing…</>
                    ) : mode === MODE_GYM ? (
                      <><DoorOpen size={16} aria-hidden /> Gym Check-In</>
                    ) : (
                      <><Check size={16} aria-hidden /> Check In {isManager ? `${sessions} Session(s)` : '1 Session'}</>
                    )}
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}`)}>
                    Profile
                  </Btn>
                </div>

                {mode === MODE_PT && !canCheckIn && member.couch_subscription_status && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', marginTop: 10 }}>
                    {remaining <= 0 ? 'No sessions remaining' : `Status: ${member.couch_subscription_status}`}
                  </p>
                )}
              </Card>
            )}
          </div>

          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  {mode === MODE_GYM ? "Today's Gym Check-Ins" : "Today's PT Sessions"}
                </h3>
                <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 16,
                background: 'var(--navy)', color: '#fff',
                fontSize: 13, fontWeight: 800,
              }}>
                {historyLoad ? '…' : todayEntries.length}
              </div>
            </div>

            <div style={{ maxHeight: 'calc(100svh - 220px)', overflowY: 'auto' }}>
              {historyLoad ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
              ) : todayEntries.length === 0 ? (
                <EmptyState
                  icon={mode === MODE_GYM ? DoorOpen : Dumbbell}
                  message={mode === MODE_GYM ? 'No gym check-ins today' : 'No sessions checked today'}
                  sub="Check in a member using search or Open Camera"
                />
              ) : (
                <div>
                  {todayEntries.map((entry, i) => (
                    <div key={entry._id ?? i}
                      onClick={() => navigate(`/members/${entry.member.systemId}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 18px', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar name={entry.member.name} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{entry.member.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                          #{entry.member.systemId}
                          {mode === MODE_PT
                            ? ` · ${(entry.member.PT_sessions || 0) - (entry.member.used_PT_sessions || 0)} left`
                            : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                          {fmtTimeWithSeconds(entry.time)}
                        </div>
                        {entry.by && <div style={{ fontSize: 10, color: 'var(--t4)' }}>by {entry.by}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

        </div>
      </div>

      <QrCheckInCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={handleCameraScan}
        lastScannedResult={lastScannedResult}
      />
    </Layout>
  );
}
