import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, Btn, Spinner, Badge, Avatar, Input, EmptyState } from '../../components/ui';
import { getMemberProfile, getAllMembers } from '../../api/endpoints';
import api from '../../api/axios';

export default function CoachCheckin() {
  usePageTitle('Session Check-In');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Coach Manager';

  // Search state
  const [query, setQuery]           = useState('');
  const [member, setMember]         = useState(null);
  const [searching, setSearching]   = useState(false);
  const [checking, setChecking]     = useState(false);
  const [sessions, setSessions]     = useState('1');
  const [result, setResult]         = useState(null);

  // Today's history
  const [todaySessions, setTodaySessions] = useState([]);
  const [historyLoad, setHistoryLoad]     = useState(true);

  // Load today's session check-ins
  const loadHistory = useCallback(async () => {
    setHistoryLoad(true);
    try {
      const res = await getAllMembers();
      const members = res.data.members ?? [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find members who had PT sessions checked today (via userlog)
      const sessionEntries = [];
      members.forEach(m => {
        const coachId = m.current_couch?._id || m.current_couch;
        // For coach: only their members. For manager: all
        if (!isManager && String(coachId) !== String(user?._id)) return;

        (m.userlog || []).forEach(log => {
          if (log.type === 'check-in' && log.text?.includes('PT session') && new Date(log.createdAt) >= today) {
            sessionEntries.push({
              _id: log._id,
              member: m,
              text: log.text,
              time: log.createdAt,
              by: log.createdBy?.name,
            });
          }
        });
      });

      // Also count by used_PT_sessions changes — simpler: just show members with sessions used today
      // Since we don't have per-session logs yet, let's show based on the check-in endpoint response
      sessionEntries.sort((a, b) => new Date(b.time) - new Date(a.time));
      setTodaySessions(sessionEntries);
    } catch { /* silent */ }
    finally { setHistoryLoad(false); }
  }, [user?._id, isManager]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Search
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

  // Check-in
  const handleCheckIn = async () => {
    if (!member) return;
    setChecking(true); setResult(null);
    try {
      const payload = { memberId: String(member.systemId) };
      if (isManager) payload.numberOfSessions = Number(sessions);
      const res = await api.post('/members/PTcheckin', payload);
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

  const remaining = (member?.PT_sessions || 0) - (member?.used_PT_sessions || 0);
  const canCheckIn = member && member.couch_subscription_status === 'active' && remaining > 0;

  return (
    <Layout>
      <PageHeader title="Session Check-In" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div className="grid-checkin">

          {/* ── Left: Search + Member ──────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Search */}
            <Card>
              <CardHeader title="Find Member" />
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="System ID, Member ID, or phone…"
                  autoFocus
                  style={{
                    flex: 1, padding: '10px 13px', fontSize: 14,
                    border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none', color: 'var(--t1)', background: 'var(--card)', fontFamily: 'inherit',
                    transition: 'border-color 0.12s, box-shadow 0.12s',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
                <Btn type="submit" disabled={searching || !query.trim()} size="md">
                  {searching ? <Spinner size="sm" /> : 'Search'}
                </Btn>
              </form>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8 }}>
                Accepts system ID, member ID, or phone number.
              </p>
            </Card>

            {/* Member card */}
            {member && (
              <Card>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <Avatar name={member.name} size="lg" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{member.name}</h2>
                      <Badge status={member.couch_subscription_status || 'guest'} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      #{member.systemId} · {member.current_couch?.name ? `Coach: ${member.current_couch.name}` : 'No coach'}
                    </div>
                  </div>
                </div>

                {/* Sessions strip */}
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

                {/* Coach Manager: sessions input */}
                {isManager && (
                  <div style={{ marginBottom: 14 }}>
                    <Input
                      label="Number of Sessions"
                      type="number" min="1" max={remaining}
                      value={sessions}
                      onChange={e => setSessions(e.target.value)}
                    />
                  </div>
                )}

                {/* Result */}
                {result && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600, textAlign: 'center',
                    background: result.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: result.ok ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${result.ok ? 'var(--green-bd)' : 'var(--red-bd)'}`,
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
                    fullWidth size="lg"
                  >
                    {checking ? <><Spinner size="sm" /> Processing…</> : `✓ Check In ${isManager ? sessions + ' Session(s)' : '1 Session'}`}
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}`)}>
                    Profile
                  </Btn>
                </div>

                {!canCheckIn && member.couch_subscription_status && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', marginTop: 10 }}>
                    {remaining <= 0 ? 'No sessions remaining' : `Status: ${member.couch_subscription_status}`}
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* ── Right: Today's sessions ────────────────────────────── */}
          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Today's Sessions</h3>
                <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 16,
                background: 'var(--navy)', color: '#fff',
                fontSize: 13, fontWeight: 800,
              }}>
                {historyLoad ? '…' : todaySessions.length}
              </div>
            </div>

            <div style={{ maxHeight: 'calc(100svh - 220px)', overflowY: 'auto' }}>
              {historyLoad ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
              ) : todaySessions.length === 0 ? (
                <EmptyState icon="🏋️" message="No sessions checked today" sub="Check in a member using the search on the left" />
              ) : (
                <div>
                  {todaySessions.map((entry, i) => (
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
                          #{entry.member.systemId} · {(entry.member.PT_sessions || 0) - (entry.member.used_PT_sessions || 0)} left
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                          {new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
    </Layout>
  );
}
