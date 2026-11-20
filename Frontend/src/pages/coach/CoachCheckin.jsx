import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import QrCheckInCamera from '../../components/QrCheckInCamera';
import { PageHeader, Card, CardHeader, Btn, Spinner, Badge, Avatar, Input, EmptyState, CAIRO_ZONE } from '../../components/ui';
import { getMemberProfile, getAllMembers } from '../../api/endpoints';
import { parseScannedIdentifier } from '../../lib/scannerParser';
import api from '../../api/axios';
import { Camera, Check, Dumbbell, XCircle } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const STATUS_LABELS = {
  active: tr('active'),
  expired: tr('expired'),
  frozen: tr('frozen'),
  guest: tr('guest'),
  pending: tr('pending'),
  interested: tr('interested'),
  transferred: tr('transferred'),
};

// Coaches only check in PT sessions. Regular gym check-in is a front-desk job.
export default function CoachCheckin() {
  const { t } = useI18n();
  const { fmtDate, fmtTime } = useFormat();
  const fmtTimeWithSeconds = (v) => (v
    ? fmtTime(v, { timeZone: CAIRO_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }, 'en-US')
    : '—');
  usePageTitle(t('Check-In'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Head Coach';

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

  const sessionsRef = useRef(sessions);
  const isManagerRef = useRef(isManager);
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

          // Older PT sessions were stored as a "check-in" whose text mentions the PT session.
          const isPt = log.type === 'pt-session' || (log.type === 'check-in' && log.text?.includes('PT session'));
          if (!isPt) return;

          entries.push({
            _id: log._id,
            member: m,
            text: log.text,
            time: log.createdAt,
            by: log.createdBy?.name,
          });
        });
      });

      entries.sort((a, b) => new Date(b.time) - new Date(a.time));
      setTodayEntries(entries);
    } catch { /* silent */ }
    finally { setHistoryLoad(false); }
  }, [user?._id, isManager]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runCheckInForMember = useCallback(async (foundMember) => {
    if (!foundMember) return;
    setChecking(true);
    setResult(null);
    try {
      const payload = { memberId: String(foundMember.systemId) };
      if (isManagerRef.current) {
        const s = Number(sessionsRef.current);
        if (!s || s <= 0 || !Number.isInteger(s)) {
          toast.error(t('Number of sessions must be a positive whole number'));
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
      const updated = await getMemberProfile(foundMember.systemId);
      setMember(updated.data.member);
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message ?? t('Check-in failed.');
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
  }, [loadHistory, t]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setMember(null); setResult(null);
    try {
      const res = await getMemberProfile(query.trim());
      setMember(res.data.member);
    } catch (err) {
      toast.error(err.response?.data?.message ?? t('Member not found.'));
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
      const msg = err.response?.data?.message ?? t('Member not found.');
      toast.error(msg);
      setLastScannedResult({ ok: false, identifier, msg, time: new Date() });
    } finally {
      setSearching(false);
    }
  }, [runCheckInForMember, t]);

  const remaining = (member?.PT_sessions || 0) - (member?.used_PT_sessions || 0);
  const canCheckIn = Boolean(member && member.couch_subscription_status === 'active' && remaining > 0);

  const handleCheckIn = async () => {
    if (!member) return;
    await runCheckInForMember(member);
  };

  return (
    <Layout>
      <PageHeader walkthrough="coach-checkin-header" title={t('Check-In')} />

      <div className="page-wrap" data-walkthrough="coach-checkin-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div className="grid-checkin">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card>
              <CardHeader title={t('Find Member')} />
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder={t('System ID, Member ID, or phone…')}
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
                  {searching ? <Spinner size="sm" /> : t('Search')}
                </Btn>
                <Btn
                  type="button"
                  variant="outline"
                  size="md"
                  style={{ minHeight: 44 }}
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera size={15} aria-hidden /> {t('Open Camera')}
                </Btn>
              </form>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8 }}>
                {t('Accepts system ID, member ID, or phone number. Camera scan checks in a PT session.')}
              </p>
            </Card>

            {member && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <Avatar name={member.name} size="lg" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{member.name}</h2>
                      <Badge status={member.couch_subscription_status || 'guest'} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      #{member.systemId} · {member.current_couch?.name ? t('Coach: {name}', { name: member.current_couch.name }) : t('No coach')}
                    </div>
                  </div>
                </div>

                <div className="grid-stats-3" style={{ background: 'var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
                  <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{member.PT_sessions || 0}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>{t('Total')}</div>
                  </div>
                  <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t2)' }}>{member.used_PT_sessions || 0}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>{t('Used')}</div>
                  </div>
                  <div style={{ background: 'var(--card)', padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: remaining > 0 ? 'var(--green)' : 'var(--red)' }}>{remaining}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>{t('Remaining')}</div>
                  </div>
                </div>

                {isManager && (
                  <div style={{ marginBottom: 14 }}>
                    <Input
                      label={t('Number of Sessions')}
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
                      <><Spinner size="sm" /> {t('Processing…')}</>
                    ) : (
                      <><Check size={16} aria-hidden /> {isManager ? t('Check In {count} Session(s)', { count: sessions }) : t('Check In 1 Session')}</>
                    )}
                  </Btn>
                  <Btn variant="outline" size="lg" onClick={() => navigate(`/members/${member.systemId}`)}>
                    {t('Profile')}
                  </Btn>
                </div>

                {!canCheckIn && member.couch_subscription_status && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', marginTop: 10 }}>
                    {remaining <= 0
                      ? t('No sessions remaining')
                      : t('Status: {status}', { status: STATUS_LABELS[member.couch_subscription_status] ? t(STATUS_LABELS[member.couch_subscription_status]) : member.couch_subscription_status })}
                  </p>
                )}
              </Card>
            )}
          </div>

          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  {t("Today's PT Sessions")}
                </h3>
                <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                  {fmtDate(new Date(), { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB')}
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
                  icon={Dumbbell}
                  message={t('No sessions checked today')}
                  sub={t('Check in a member using search or Open Camera')}
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
                          {` · ${t('{count} left', { count: (entry.member.PT_sessions || 0) - (entry.member.used_PT_sessions || 0) })}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'end', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                          {fmtTimeWithSeconds(entry.time)}
                        </div>
                        {entry.by && <div style={{ fontSize: 10, color: 'var(--t4)' }}>{t('by {name}', { name: entry.by })}</div>}
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
