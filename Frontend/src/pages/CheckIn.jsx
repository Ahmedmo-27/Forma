import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import { Badge, Avatar, Spinner, fmtDate, fmtTime, EmptyState, Pagination, CardListSkeleton, MenuSelect } from '../components/ui';
import { formatSystemId } from '../lib/systemId';
import { checkInByBarcode, checkInMember, getMemberProfile, getTodayCheckIns } from '../api/endpoints';
import { subscribeLiveEvents } from '../api/live';
import QrCheckInCamera from '../components/QrCheckInCamera';
import CheckInScanner from '../components/CheckInScanner';
import { parseScannedIdentifier } from '../lib/scannerParser';
import useHardwareScanner from '../hooks/useHardwareScanner';
import useLocationEffect from '../hooks/useLocationEffect';
import { useLocationScope, ALL_LOCATIONS } from '../context/LocationContext';
import { playCheckInSound } from '../lib/audioFeedback';
import {
  AlertTriangle,
  Ban,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  Snowflake,
  Ticket,
  User,
  XCircle,
} from 'lucide-react';

const CHECKIN_DESK_KEY = 'ff_checkin_location_id';

// ── small stat pill ───────────────────────────────────────────────────────────
function StatPill({ label, value, color = 'var(--t1)' }) {
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--t4)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function isHardwareScan(burst) {
  if (!burst || burst.count < 4) return false;
  const span = burst.last - burst.start;
  const gaps = burst.count - 1;
  const average = span / gaps;
  return average < 35 && span < 300 && (performance.now() - burst.last) < 250;
}

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function CheckIn() {
  usePageTitle('Check In');
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef  = useRef(null);
  const checkInMode = searchParams.get('mode');
  const {
    multiEnabled,
    locations,
    canAccessAllLocations,
    selectedLocationId,
  } = useLocationScope();

  const needsDeskPicker = multiEnabled && (canAccessAllLocations || locations.length > 1);

  const [query,      setQuery]      = useState('');
  const [member,     setMember]     = useState(null);
  const [searching,  setSearching]  = useState(false);
  const [checking,   setChecking]   = useState(false);
  const [result,     setResult]     = useState(null); // {ok, msg}
  const [history,    setHistory]    = useState([]);
  const [histLoad,   setHistLoad]   = useState(true);
  const [alertPopup, setAlertPopup] = useState(null);
  const [live,       setLive]       = useState('connecting');
  const [freshIds,   setFreshIds]   = useState(() => new Set());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [activeTab,  setActiveTab]  = useState(() => (
    checkInMode === 'lookup' || checkInMode === 'scanner' ? checkInMode : 'scanner'
  ));
  const [lastScannedResult, setLastScannedResult] = useState(null);
  const [deskLocationId, setDeskLocationId] = useState(() => {
    try {
      return localStorage.getItem(CHECKIN_DESK_KEY) || '';
    } catch {
      return '';
    }
  });

  // Pagination for Today's Activity
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('checkin_activity_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  const historyRef = useRef([]);
  const queryRef   = useRef('');
  const burstRef   = useRef({ count: 0, start: 0, last: 0 });
  const memberRef  = useRef(null);
  const seenRef    = useRef(new Set());
  const readyRef   = useRef(false);
  const liveRef    = useRef('connecting');

  // Resolve / persist which desk branch stamps each check-in
  useEffect(() => {
    if (!multiEnabled || !locations.length) return;

    const allowed = new Set(locations.map((loc) => String(loc._id)));
    const navbarOne =
      selectedLocationId && selectedLocationId !== ALL_LOCATIONS
        ? String(selectedLocationId)
        : '';

    let next = deskLocationId && allowed.has(String(deskLocationId))
      ? String(deskLocationId)
      : '';
    if (!next && navbarOne && allowed.has(navbarOne)) next = navbarOne;
    if (!next) next = String(locations[0]._id);

    if (next !== deskLocationId) {
      setDeskLocationId(next);
      try { localStorage.setItem(CHECKIN_DESK_KEY, next); } catch { /* ignore */ }
    }
  }, [multiEnabled, locations, selectedLocationId, deskLocationId]);

  const setDeskBranch = useCallback((id) => {
    const next = String(id || '');
    setDeskLocationId(next);
    try { localStorage.setItem(CHECKIN_DESK_KEY, next); } catch { /* ignore */ }
  }, []);

  const checkInPayload = useCallback(() => {
    if (!multiEnabled) return {};
    const id = deskLocationId
      || (selectedLocationId !== ALL_LOCATIONS ? selectedLocationId : '')
      || (locations[0] && String(locations[0]._id))
      || '';
    return id ? { locationId: id } : {};
  }, [multiEnabled, deskLocationId, selectedLocationId, locations]);

  const deskLocationName = useMemo(() => {
    if (!deskLocationId) return '';
    return locations.find((loc) => String(loc._id) === String(deskLocationId))?.name || '';
  }, [locations, deskLocationId]);

  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return history.slice(start, start + pageSize);
  }, [history, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  useEffect(() => {
    if (checkInMode !== 'scanner' && checkInMode !== 'lookup') return undefined;
    const frame = requestAnimationFrame(() => setActiveTab(checkInMode));
    return () => cancelAnimationFrame(frame);
  }, [checkInMode]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(500, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('checkin_activity_page_size', String(valid));
    } catch {
      // ignore
    }
  };

  const announce = useCallback((key, message, icon) => {
    if (!key || !message || seenRef.current.has(key)) return;
    seenRef.current.add(key);
    toast(message, { icon: icon ?? <Bell size={16} /> });
  }, []);

  const applyHistory = useCallback((next, { notify }) => {
    const prev = historyRef.current;
    if (notify && readyRef.current) {
      const prevByMember = new Map();
      prev.forEach((entry) => {
        const id = String(entry.member?.systemId ?? '');
        if (!prevByMember.has(id)) prevByMember.set(id, entry);
      });
      const known = new Set(prev.map((entry) => String(entry._id)));
      const arrived = [];
      next.forEach((entry) => {
        const id = String(entry._id);
        const systemId = String(entry.member?.systemId ?? '');
        if (!known.has(id)) {
          announce(`in:${id}`, `${entry.member?.name || 'A member'} checked in`, <CheckCircle2 size={16} />);
          arrived.push(id);
          return;
        }
        const before = prevByMember.get(systemId);
        if (!before) return;
        if (before.member?.status !== entry.member?.status) {
          announce(
            `status:${systemId}:${entry.member?.status}`,
            `${entry.member?.name || 'A member'} is now ${entry.member?.status}`,
            <RefreshCw size={16} />,
          );
        }
        const beforePkg = before.member?.package?.name || '';
        const nextPkg = entry.member?.package?.name || '';
        if (beforePkg !== nextPkg) {
          announce(
            `pkg:${systemId}:${nextPkg}`,
            `${entry.member?.name || 'A member'}'s package is now ${nextPkg || 'none'}`,
            <Package size={16} />,
          );
        }
      });
      if (arrived.length) {
        setFreshIds(new Set(arrived));
        setTimeout(() => setFreshIds(new Set()), 6000);
      }
    }
    historyRef.current = next;
    setHistory(next);
  }, [announce]);

  const refreshBoard = useCallback(async ({ notify = false, memberId = null } = {}) => {
    let next = null;
    const prev = historyRef.current;
    try {
      const r = await getTodayCheckIns();
      next = r.data.checkIns ?? [];
      applyHistory(next, { notify });
    } catch { /* keep the list already on screen */ }

    const openId = memberRef.current?.systemId;
    const targeted = memberId && String(memberId) === String(openId);
    const rowChanged = next && openId && next.some((entry) => {
      if (String(entry.member?.systemId) !== String(openId)) return false;
      const before = prev.find((item) => String(item.member?.systemId) === String(openId));
      if (!before) return true;
      return before.member?.status !== entry.member?.status
        || (before.member?.package?.name || '') !== (entry.member?.package?.name || '');
    });
    if (!openId || (!targeted && !rowChanged)) return;
    try {
      const profile = await getMemberProfile(openId);
      if (String(memberRef.current?.systemId) === String(openId)) {
        setMember(profile.data.member);
      }
    } catch { /* the card stays as it was */ }
  }, [applyHistory]);

  const loadHistory = useCallback(async () => {
    setHistLoad(true);
    try { await refreshBoard({ notify: false }); }
    finally {
      readyRef.current = true;
      setHistLoad(false);
    }
  }, [refreshBoard]);

  useLocationEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { memberRef.current = member; }, [member]);

  useEffect(() => {
    const stop = subscribeLiveEvents((event) => {
      if (!event || event.type === 'ready') return;
      if (event.type === 'check-in' && event.checkInId) {
        announce(`in:${event.checkInId}`, event.message, <CheckCircle2 size={16} />);
      } else if (event.type === 'member') {
        announce(
          `status:${event.systemId}:${event.status}:${event.packageName || ''}`,
          event.message,
          <RefreshCw size={16} />,
        );
      } else if (event.type === 'package') {
        announce(`catalog:${event.packageId}:${event.packageName}`, event.message, <Package size={16} />);
      }
      refreshBoard({
        notify: false,
        memberId: event.systemId || null,
      });
    }, (status) => {
      liveRef.current = status;
      setLive(status);
    });
    const poll = setInterval(() => {
      refreshBoard({ notify: liveRef.current !== 'live' });
    }, 4000);
    return () => { stop(); clearInterval(poll); };
  }, [announce, refreshBoard]);

  const showMemberAlerts = (profileMember) => {
    const alerts = (profileMember?.alert || []).filter(a => a?.active);
    if (alerts.length) { setAlertPopup(alerts.map(a => a.text)); setTimeout(() => setAlertPopup(null), 5000); }
  };

  const recordScan = useCallback(async (raw, sourceRaw, mode = 'auto') => {
    const identifier = parseScannedIdentifier(raw, mode);
    if (!identifier) return;
    setSearching(true);
    setMember(null);
    setResult(null);
    queryRef.current = identifier;
    setQuery(identifier);
    try {
      if (needsDeskPicker && !checkInPayload().locationId) {
        toast.error('Select which branch this check-in is for');
        setSearching(false);
        return;
      }
      const r = await checkInByBarcode(identifier, checkInPayload());
      const okMsg = r.data.message || 'Check-in recorded';
      setResult({ ok: true, msg: okMsg });
      toast.success(okMsg);
      playCheckInSound('success');

      let profileData = null;
      try {
        const profile = await getMemberProfile(identifier);
        profileData = profile.data.member;
        setMember(profileData);
        showMemberAlerts(profileData);
        refreshBoard({ notify: false, memberId: profileData?.systemId });
      } catch { /* the result message already says why */ }

      setLastScannedResult({
        ok: true,
        identifier,
        name: profileData?.name || r.data.memberName || identifier,
        status: profileData?.status || r.data.status,
        systemId: profileData?.systemId || r.data.systemId,
        memberId: profileData?.memberId || r.data.memberId,
        msg: okMsg,
        time: new Date(),
      });
    } catch (err) {
      const msg = err.normalized?.message || err.response?.data?.message || 'Check-in failed.';
      setResult({ ok: false, msg });
      toast.error(msg);
      playCheckInSound('error');
      setLastScannedResult({
        ok: false,
        identifier,
        msg,
        time: new Date(),
      });
    }
    finally {
      setSearching(false);
      queryRef.current = '';
      burstRef.current = { count: 0, start: 0, last: 0 };
      setQuery('');
      if (activeTab === 'lookup') {
        inputRef.current?.focus();
      }
    }
  }, [activeTab, refreshBoard, needsDeskPicker, checkInPayload]);

  // Global hardware scanner listener: automatically detects scans from any USB / Bluetooth barcode & QR scanner
  useHardwareScanner({
    onScan: (scannedCode) => {
      recordScan(scannedCode, scannedCode, 'auto');
    },
    enabled: true,
  });

  const handleSearch = async (e) => {
    e.preventDefault();
    const raw = (queryRef.current || query).trim();
    if (!raw) return;
    const identifier = parseScannedIdentifier(raw, 'auto');
    if (isHardwareScan(burstRef.current) || /^(?:FF\d+|[SM]\d+)$/i.test(raw)) {
      await recordScan(identifier);
      return;
    }
    setSearching(true); setMember(null); setResult(null);
    try {
      const r = await getMemberProfile(identifier);
      setMember(r.data.member);
      showMemberAlerts(r.data.member);
    } catch (err) {
      const msg = err.normalized?.message || err.response?.data?.message || 'Member not found.';
      toast.error(msg);
    }
    finally { setSearching(false); }
  };

  const noteScanKey = (e) => {
    if (e.key.length !== 1) return;
    const now = performance.now();
    const burst = burstRef.current;
    if (!burst.start || now - burst.last > 45) {
      burstRef.current = { count: 1, start: now, last: now };
    } else {
      burstRef.current = { count: burst.count + 1, start: burst.start, last: now };
    }
  };

  const sub         = member?.subscriptions?.at(-1);
  const pkg         = sub?.packageSnapshot ?? sub?.package;
  const expiryDays  = sub?.endDate ? Math.ceil((new Date(sub.endDate) - new Date()) / 86400000) : null;
  const isGuest     = member?.status === 'guest' || member?.isMember === false;
  const hasExpired  = member?.status === 'expired' || (expiryDays !== null && expiryDays < 0);
  const hasPackage  = Boolean(pkg);
  const canCheckIn  = Boolean(member && !member.isBlocked && !isGuest && hasPackage && (!hasExpired || member.status === 'frozen'));
  const today       = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const todayCount  = history.length;
  const activeToday = history.filter(e => String(e.member?.status).toLowerCase() === 'active' && !e.member?.isBlocked).length;

  const handleCheckIn = async () => {
    if (!member || !canCheckIn) return;
    if (needsDeskPicker && !checkInPayload().locationId) {
      toast.error('Select which branch this check-in is for');
      return;
    }
    setChecking(true); setResult(null);
    try {
      const r = await checkInMember(member.systemId, checkInPayload());
      setResult({ ok: true, msg: r.data.message });
      const u = await getMemberProfile(member.systemId);
      setMember(u.data.member);
      refreshBoard({ notify: false, memberId: member.systemId });
    } catch (err) {
      const msg = err.normalized?.message || err.response?.data?.message || 'Check-in failed.';
      setResult({ ok: false, msg });
    } finally { setChecking(false); }
  };

  return (
    <Layout>
      <div style={{ minHeight: 'calc(100svh - 112px)', display: 'flex', flexDirection: 'column' }}>

        {/* ── Main content ─────────────────────────────────────── */}
        <div style={{ flex: 1, background: 'var(--bg)', padding: 'clamp(14px, 3vw, 24px) clamp(12px, 3vw, 32px) 40px' }}>
          <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Check In on the left, Scanner / Search centered, stats on the right */}
            <div className="checkin-top">
              <div className="checkin-side" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'color-mix(in srgb, var(--navy) 10%, transparent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}><CheckCircle2 size={20} color="var(--navy)" aria-hidden /></div>
                    <div>
                      <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)', margin: 0, letterSpacing: '-0.3px' }}>Check In</h1>
                      <p style={{ fontSize: 12, color: 'var(--t4)', margin: '2px 0 0' }}>{today}</p>
                    </div>
                  </div>
                  {needsDeskPicker && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6,
                    }}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11, fontWeight: 700, color: 'var(--t3)',
                        textTransform: 'uppercase', letterSpacing: '0.4px',
                      }}>
                        <MapPin size={12} aria-hidden />
                        Checking in at
                      </label>
                      <MenuSelect
                        aria-label="Check-in branch"
                        value={deskLocationId}
                        onChange={(e) => setDeskBranch(e.target.value)}
                        style={{ minWidth: 180 }}
                        size="sm"
                      >
                        {locations.map((loc) => (
                          <option key={loc._id} value={loc._id}>{loc.name}</option>
                        ))}
                      </MenuSelect>
                      {deskLocationName && (
                        <span style={{ fontSize: 11, color: 'var(--t4)' }}>
                          Scans stamp <strong style={{ color: 'var(--t2)' }}>{deskLocationName}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{
                background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
                border: '1px solid var(--border)',
              }}>
                {/* ── Mode Tabs: Scanner vs Manual Search ───────────── */}
                <div data-walkthrough="checkin-modes" style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('scanner')}
                    style={{
                      flex: 1,
                      padding: '13px 16px',
                      border: 'none',
                      borderBottom: activeTab === 'scanner' ? '2.5px solid var(--navy)' : '2.5px solid transparent',
                      background: activeTab === 'scanner' ? 'var(--card)' : 'transparent',
                      color: activeTab === 'scanner' ? 'var(--navy)' : 'var(--t3)',
                      fontWeight: activeTab === 'scanner' ? 800 : 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Camera size={16} aria-hidden />
                    <span>Scanner</span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      background: activeTab === 'scanner' ? 'color-mix(in srgb, var(--navy) 12%, transparent)' : 'rgba(0,0,0,0.05)',
                      color: activeTab === 'scanner' ? 'var(--navy)' : 'var(--t4)',
                      padding: '2px 6px',
                      borderRadius: 10,
                    }}>
                      Camera
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('lookup');
                      setTimeout(() => inputRef.current?.focus(), 80);
                    }}
                    style={{
                      flex: 1,
                      padding: '13px 16px',
                      border: 'none',
                      borderBottom: activeTab === 'lookup' ? '2.5px solid var(--navy)' : '2.5px solid transparent',
                      background: activeTab === 'lookup' ? 'var(--card)' : 'transparent',
                      color: activeTab === 'lookup' ? 'var(--navy)' : 'var(--t3)',
                      fontWeight: activeTab === 'lookup' ? 800 : 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Search size={16} aria-hidden />
                    <span>Manual Search</span>
                  </button>
                </div>

                {/* ── Tab Content ──────────────────────────────────── */}
                {activeTab === 'scanner' ? (
                  <div data-walkthrough="checkin-scanner" style={{ padding: '18px 20px' }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>
                        Scanner
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                        Opens camera to scan members and check them in (System ID or Member ID)
                      </div>
                    </div>
                    <CheckInScanner
                      onScan={recordScan}
                      lastScannedResult={lastScannedResult}
                      autoStart={false}
                    />
                  </div>
                ) : (
                  <div data-walkthrough="checkin-search">
                    <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Manual Lookup & USB Scanner</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>Type System ID (S100), Member ID (M100 or number), or scan with a USB scanner</div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      <form onSubmit={handleSearch}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
                            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)', pointerEvents: 'none' }}
                              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input
                              ref={inputRef}
                              value={query}
                              onChange={e => { queryRef.current = e.target.value; setQuery(e.target.value); setMember(null); setResult(null); }}
                              onKeyDown={noteScanKey}
                              placeholder="Scan QR/barcode or type ID…"
                              autoFocus
                              style={{
                                width: '100%', height: 44, padding: '0 12px 0 36px', fontSize: 14,
                                border: '1.5px solid var(--border)', borderRadius: 10,
                                outline: 'none', color: 'var(--t1)', background: 'var(--bg)',
                                fontFamily: 'inherit', boxSizing: 'border-box',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                              }}
                              onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
                              onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                            />
                          </div>
                          <button type="submit" disabled={searching || !query.trim()} style={{
                            padding: '0 18px', minHeight: 44, borderRadius: 10, border: 'none', fontFamily: 'inherit',
                            background: 'linear-gradient(135deg,var(--navy),var(--navy-2))', color: '#fff',
                            fontSize: 13, fontWeight: 700, cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
                            opacity: !query.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'opacity 0.15s',
                          }}>
                            {searching ? <Spinner size="sm" /> : <><Search size={15} aria-hidden /> Search</>}
                          </button>
                          <button type="button" onClick={() => setActiveTab('scanner')} style={{
                            padding: '0 14px', minHeight: 44, borderRadius: 10, fontFamily: 'inherit',
                            background: 'var(--bg)', color: 'var(--t1)',
                            border: '1.5px solid var(--border)',
                            fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            <Camera size={15} aria-hidden /> Open Camera
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              <div className="checkin-side" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  background: 'var(--card)', borderRadius: 12, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  display: 'flex', gap: 0, padding: '10px 6px',
                  width: '100%', maxWidth: 240,
                }}>
                  <StatPill label="Today" value={histLoad ? '…' : todayCount} />
                  <div style={{ width: 1, background: 'var(--border)', margin: '2px 0' }} />
                  <StatPill label="Active" value={histLoad ? '…' : activeToday} color="var(--green)" />
                  <div style={{ width: 1, background: 'var(--border)', margin: '2px 0' }} />
                  <StatPill label="This Month" value="—" color="var(--t4)" />
                </div>
              </div>
            </div>

            {/* Member card */}
              {member && (
                <div style={{
                  background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
                  width: '100%', maxWidth: 520, margin: '0 auto',
                }}>
                  {/* Gradient header */}
                  <div style={{
                    background: 'linear-gradient(135deg,var(--nav-bg),var(--navy))',
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
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: 'monospace' }}>
                          {formatSystemId(member.systemId)}{member.memberId ? ` · Member #${member.memberId}` : ''}
                        </span>
                        {member.status === 'guest' && (
                          <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.18)', color: '#fff', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                            Non-Member
                          </span>
                        )}
                      </div>
                      {member.phones && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={12} aria-hidden /> {member.phones}
                        </div>
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
                              {expiryDays < 0 ? 'Expired' : expiryDays <= 7 ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} aria-hidden /> {expiryDays}d left</span>
                              ) : `${expiryDays}d remaining`}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : member.status === 'guest' ? (
                      <div style={{ textAlign: 'center', padding: '12px 14px', fontSize: 13, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Non-Member / Guest</div>
                        <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>This member is a guest and does not have a package</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '12px 14px', fontSize: 13, color: 'var(--red)', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', fontWeight: 600 }}>
                        This member does not have a package
                      </div>
                    )}

                    {/* Blocked banner */}
                    {member.isBlocked && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red-bd)', borderLeft: '4px solid var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Ban size={20} color="var(--red)" aria-hidden />
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          {result.ok ? <Check size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
                          {result.msg}
                        </span>
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
                            {isGuest || !hasPackage ? 'Cannot Check In (No Package)' : 'Check In Now'}
                          </>
                      }
                    </button>

                    {!canCheckIn && (
                      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)', margin: 0, fontWeight: 600 }}>
                        Cannot check in — {
                          member.isBlocked
                            ? 'member is blocked'
                            : isGuest
                            ? 'this member is a guest and does not have a package'
                            : !hasPackage
                            ? 'this member does not have a package'
                            : hasExpired
                            ? 'this member has an expired package'
                            : `member is ${member.status}`
                        }
                      </p>
                    )}

                    {/* Quick nav buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                      {[
                        { label: 'Profile', Icon: User, to: `/members/${member.systemId}` },
                        { label: 'Freeze', Icon: Snowflake, to: `/members/${member.systemId}?tab=freeze` },
                        { label: 'Invitations', Icon: Ticket, to: `/members/${member.systemId}?tab=invitations` },
                      ].map(({ label, Icon, to }) => (
                        <button key={to} onClick={() => navigate(to)} style={{
                          padding: '9px 6px', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--t2)', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', textAlign: 'center',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.color = 'var(--navy)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--navy) 5%, transparent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.background = 'var(--bg)'; }}
                        ><Icon size={14} aria-hidden /><span>{label}</span></button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            {/* Today's Activity spans the content width */}
            <div data-walkthrough="checkin-board" style={{
              background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
              width: '100%',
            }}>
              {/* Header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Today's Activity
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: live === 'live' ? 'var(--green)' : 'var(--amber)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: live === 'live' ? '#22c55e' : '#f59e0b', boxShadow: live === 'live' ? '0 0 0 3px rgba(34,197,94,0.18)' : 'none' }} />
                      {live === 'live' ? 'Live' : 'Reconnecting'}
                    </span>
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{today}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    background: 'linear-gradient(135deg,var(--navy),var(--navy-2))',
                    color: '#fff', fontSize: 14, fontWeight: 800,
                    padding: '4px 14px', borderRadius: 20,
                    boxShadow: '0 2px 8px color-mix(in srgb, var(--navy) 30%, transparent)',
                  }}>
                    {histLoad ? '…' : `${todayCount} check-in${todayCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>

              {/* List */}
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {histLoad ? (
                  <div style={{ padding: 16 }}>
                    <CardListSkeleton rows={6} />
                  </div>
                ) : history.length === 0 ? (
                  <EmptyState icon={CheckCircle2} message="No check-ins yet today" sub="Search for a member above to check them in" />
                ) : (
                  paginatedHistory.map((entry, i) => {
                    const globalIndex = (page - 1) * pageSize + i;
                    const isLatest = globalIndex === 0;
                    const serialNumber = history.length - globalIndex;
                    return (
                      <div
                        key={entry._id ?? globalIndex}
                        onClick={() => navigate(`/members/${entry.member.systemId}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 22px', cursor: 'pointer',
                          borderBottom: i < paginatedHistory.length - 1 ? '1px solid var(--border)' : 'none',
                          background: freshIds.has(String(entry._id)) ? 'rgba(34,197,94,0.10)' : 'transparent',
                          transition: 'background 0.3s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => { e.currentTarget.style.background = freshIds.has(String(entry._id)) ? 'rgba(34,197,94,0.10)' : 'transparent'; }}
                      >
                        {/* Serial number */}
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: isLatest ? 'linear-gradient(135deg,var(--navy),var(--navy-2))' : 'var(--bg)',
                          border: `1px solid ${isLatest ? 'transparent' : 'var(--border)'}`,
                          color: isLatest ? '#fff' : 'var(--t4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {serialNumber}
                        </div>

                        <Avatar name={entry.member.name} size="sm" photo={entry.member.photo} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.member.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2, display: 'flex', gap: 6 }}>
                            <span style={{ fontFamily: 'monospace' }}>{formatSystemId(entry.member.systemId)}</span>
                            {entry.member.package && <span>· {entry.member.package.name}</span>}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--t1)',
                            background: isLatest ? 'color-mix(in srgb, var(--navy) 8%, transparent)' : 'transparent',
                            padding: isLatest ? '2px 8px' : '0',
                            borderRadius: isLatest ? 6 : 0,
                          }}>
                            {fmtTime(entry.time)}
                          </span>
                          {entry.checkedInBy?.name && (
                            <span style={{ fontSize: 10, color: 'var(--t4)' }}>by {entry.checkedInBy.name}</span>
                          )}
                          <Badge status={entry.member.status} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!histLoad && history.length > 0 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={history.length}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}
            </div>

          </div>
        </div>
      </div>

      <QrCheckInCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={recordScan}
        lastScannedResult={lastScannedResult}
      />

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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: '#92400e' }}>
              <AlertTriangle size={56} strokeWidth={1.5} aria-hidden />
            </div>
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
          .checkin-top { grid-template-columns: 1fr !important; }
          .checkin-side { justify-content: flex-start !important; }
        }
      `}</style>
    </Layout>
  );
}
