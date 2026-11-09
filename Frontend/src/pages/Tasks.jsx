import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Textarea, Modal, Input,
} from '../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getWhatsAppTemplates, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, switchSalesRep, switchCoach, sendWhatsAppMessage,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { applyWhatsAppPlaceholders, composeWhatsAppTemplateMessage, toWhatsAppUrl } from '../utils/whatsapp';
import {
  EXPORT_COLUMNS, buildExcel, columnsForExport,
  columnValue, filterMembers, memberPhone, taskPermissions, toggleId,
} from './tasks/taskMembers';

const DEFAULT_COLUMNS = ['name', 'systemId', 'phone', 'status', 'salesman', 'coach', 'package', 'endDate'];
const BULK_COOLDOWN_SECONDS = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadExcel(filename, columns, rows) {
  const blob = new Blob([buildExcel(columns, rows)], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadAssigned(kind, personId) {
  const members = [];
  let page = 1;
  for (;;) {
    const params = { page, limit: 100, sortBy: 'name', sortDir: 1 };
    if (kind === 'sales') params.assignedSales = personId;
    else params.currentCouch = personId;
    const res = await getAllMembers(params);
    members.push(...(res.data.members ?? []));
    const totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
    if (page > totalPages || page > 40) break;
  }
  return members;
}

export default function Tasks() {
  usePageTitle('Tasks');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const [kind, setKind] = useState('');
  const [personId, setPersonId] = useState('');
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(DEFAULT_COLUMNS);
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [quickId, setQuickId] = useState('');
  const [busy, setBusy] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  const { canSalesman, canCoach, canWhatsApp } = taskPermissions(user, hasFeature);

  useEffect(() => {
    getSalesUsers().then((res) => setSalesUsers(res.data.salesUsers ?? [])).catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((person) => ['Coach', 'Coach Manager'].includes(person.role)));
      })
      .catch(() => {});
  }, []);

  const people = kind === 'sales'
    ? salesUsers.filter((person) => person.role === 'Sales')
    : coaches;

  const show = useCallback(async (nextKind, nextPerson) => {
    if (!nextKind || !nextPerson) return;
    setLoading(true);
    setLoaded(true);
    try {
      setMembers(await loadAssigned(nextKind, nextPerson));
      setSelected(new Set());
    } catch {
      setMembers([]);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => filterMembers(members, search), [members, search]);
  const visibleColumns = EXPORT_COLUMNS.filter((col) => visibleKeys.includes(col.key));
  const selectedMembers = members.filter((member) => selected.has(member._id));
  const person = people.find((item) => item._id === personId);

  const exportSheet = () => {
    const columns = columnsForExport(visibleKeys);
    const rows = selectedMembers.length ? selectedMembers : filtered;
    if (!rows.length) {
      toast.error('Nothing to export');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    downloadExcel(`tasks-${person?.name || 'members'}-${day}.xls`, columns, rows);
    toast.success(`Exported ${rows.length} member(s)`);
  };

  const refresh = () => show(kind, personId);

  const transferBulk = async () => {
    if (!selected.size) {
      toast.error('Select at least one member');
      return;
    }
    if (!destId) {
      toast.error('Choose who receives the members');
      return;
    }
    setBusy(true);
    try {
      if (destKind === 'coach') {
        const res = await bulkTransferCoach({ coachId: destId, memberIds: [...selected] });
        toast.success(`Transferred ${res.data.transferredCount ?? selected.size} member(s) to a coach`);
      } else {
        const res = await bulkTransferSalesReps({ toSalesRepId: destId, memberIds: [...selected] });
        toast.success(`Transferred ${res.data.transferredCount} member(s)`);
      }
      setSelected(new Set());
      setTransferOpen(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const transferQuick = async () => {
    const id = quickId.trim();
    if (!id || !destId) {
      toast.error('Enter a system id and a destination');
      return;
    }
    setBusy(true);
    try {
      if (destKind === 'coach') {
        await switchCoach(id, destId);
        toast.success('Member transferred to the coach');
      } else {
        await switchSalesRep(id, destId);
        toast.success('Member transferred to the sales rep');
      }
      setQuickId('');
      setTransferOpen(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const destPeople = destKind === 'coach'
    ? coaches
    : salesUsers.filter((item) => item.role === 'Sales' || item.role === 'Sales Manager');

  return (
    <Layout>
      <PageHeader title="Tasks">
        {loaded && (
          <>
            <Btn variant="outline" size="sm" onClick={() => setColumnsOpen((open) => !open)}>Columns</Btn>
            <Btn variant="outline" size="sm" onClick={exportSheet} disabled={loading || !filtered.length}>Export Excel</Btn>
          </>
        )}
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 180px', minWidth: 160 }}>
              <Select
                label="Show members for"
                value={kind}
                onChange={(e) => { setKind(e.target.value); setPersonId(''); setLoaded(false); setMembers([]); }}
              >
                <option value="">Choose…</option>
                <option value="sales">A sales rep</option>
                <option value="coach">A coach</option>
              </Select>
            </div>
            {kind && (
              <div style={{ flex: '1 1 220px', minWidth: 160 }}>
                <Select
                  label={kind === 'sales' ? 'Sales rep' : 'Coach'}
                  value={personId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPersonId(next);
                    setSearch('');
                    if (next) show(kind, next);
                    else { setLoaded(false); setMembers([]); }
                  }}
                >
                  <option value="">Choose…</option>
                  {people.map((item) => (
                    <option key={item._id} value={item._id}>{item.name} ({item.role})</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </Card>

        {columnsOpen && (
          <Card>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginTop: 0 }}>Schedule columns</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 16px' }}>
              {EXPORT_COLUMNS.map((col) => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)' }}>
                  <input
                    type="checkbox"
                    checked={visibleKeys.includes(col.key)}
                    onChange={() => {
                      setVisibleKeys((prev) => (
                        prev.includes(col.key) ? prev.filter((key) => key !== col.key) : [...prev, col.key]
                      ));
                    }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </Card>
        )}

        {!loaded ? (
          <Card>
            <EmptyState icon="👥" message="Choose a sales rep or a coach" sub="Their members show up here as a schedule you can export or transfer." />
          </Card>
        ) : (
          <>
            <Card noPad>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '14px 14px 0' }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, phone, ID…"
                  aria-label="Search members"
                  style={{
                    width: 240, maxWidth: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {person ? `${person.name} · ${filtered.length} member(s)` : `${filtered.length} member(s)`}
                </span>
              </div>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
              ) : filtered.length === 0 ? (
                <EmptyState message="No members for this person" />
              ) : (
                <div className="table-responsive-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ padding: '9px 14px', width: 36 }} />
                        {visibleColumns.map((col) => (
                          <th key={col.key} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((member) => (
                        <tr
                          key={member._id}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => navigate(`/members/${member.systemId}`)}
                        >
                          <td style={{ padding: '10px 14px' }} onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(member._id)}
                              onChange={() => setSelected((prev) => toggleId(prev, member._id))}
                              aria-label={`Select ${member.name}`}
                            />
                          </td>
                          {visibleColumns.map((col) => (
                            <td key={col.key} style={{ padding: '10px 14px', color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                              {col.key === 'name' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)' }}>
                                  <Avatar name={member.name} size="sm" />
                                  {member.name}
                                  <Badge status={member.status} />
                                </span>
                              ) : (columnValue(member, col.key) || '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {canWhatsApp && (
                <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => setWaOpen(true)}>Send bulk WhatsApp</Btn>
              )}
              {(canSalesman || canCoach) && (
                <Btn size="sm" onClick={() => { setDestKind(canSalesman ? 'sales' : 'coach'); setTransferOpen(true); }}>
                  Transfer
                </Btn>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={transferOpen}
        onClose={() => !busy && setTransferOpen(false)}
        title="Transfer"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setTransferOpen(false)} disabled={busy}>Cancel</Btn>
            <Btn size="sm" variant="outline" onClick={transferQuick} disabled={busy}>Quick transfer</Btn>
            <Btn size="sm" onClick={transferBulk} disabled={busy}>{busy ? <Spinner size="sm" /> : `Bulk transfer (${selected.size})`}</Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>
          Move members between sales reps and coaches. Quick transfer uses one system id. Bulk transfer uses the members checked in the schedule.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Transfer to" value={destKind} onChange={(e) => { setDestKind(e.target.value); setDestId(''); }}>
            <option value="sales">A sales rep</option>
            <option value="coach">A coach</option>
          </Select>
          <Select label="Person" value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">Choose…</option>
            {destPeople.map((item) => (
              <option key={item._id} value={item._id}>{item.name} ({item.role})</option>
            ))}
          </Select>
          <Input label="Quick transfer system id" value={quickId} onChange={(e) => setQuickId(e.target.value)} placeholder="S100" />
        </div>
      </Modal>

      {waOpen && (
        <WhatsAppBulkModal members={selectedMembers} onClose={() => setWaOpen(false)} />
      )}
    </Layout>
  );
}

function WhatsAppBulkModal({ members, onClose }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [sending, setSending] = useState(false);
  const [running, setRunning] = useState(false);
  const [waitLeft, setWaitLeft] = useState(0);
  const [needsConnect, setNeedsConnect] = useState(false);
  const stopRef = useRef(false);

  const reachable = useMemo(
    () => members.filter((member) => toWhatsAppUrl(memberPhone(member))),
    [members],
  );
  const current = reachable[cursor] || null;
  const template = templates.find((item) => item._id === templateId) || null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWhatsAppTemplates({ limit: 100 }),
      getPackages({ limit: 100 }),
    ])
      .then(([templateRes, packageRes]) => {
        if (cancelled) return;
        const list = templateRes.data.templates ?? [];
        setTemplates(list);
        setPackages(packageRes.data.packages ?? []);
        const pick = list.find((item) => item.isDefault) || list[0] || null;
        if (pick) setTemplateId(pick._id);
      })
      .catch((err) => {
        if (!cancelled && err?.normalized?.status !== 403) toast.error('Could not load WhatsApp templates');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const composed = useMemo(() => {
    if (!template) return '';
    return composeWhatsAppTemplateMessage(template, packages, { memberName: '{{name}}', language: 'en' });
  }, [template, packages]);

  const draft = dirty ? message : composed;

  useEffect(() => () => { stopRef.current = true; }, []);

  const stopRun = () => { stopRef.current = true; };
  const closeModal = () => { stopRef.current = true; onClose(); };

  const sendAll = async () => {
    if (running || !draft.trim()) return;
    const queue = reachable.slice(cursor);
    const templateText = draft;
    if (!queue.length) return;
    stopRef.current = false;
    setRunning(true);
    setNeedsConnect(false);
    let sent = 0;
    let completed = true;
    for (let i = 0; i < queue.length; i += 1) {
      if (stopRef.current) {
        completed = false;
        break;
      }
      const member = queue[i];
      const text = applyWhatsAppPlaceholders(templateText, member?.name);
      if (!toWhatsAppUrl(memberPhone(member), text)) {
        toast.error(`${member.name} has no WhatsApp number`);
        setCursor((index) => index + 1);
        continue;
      }
      setSending(true);
      let failed = false;
      try {
        await sendWhatsAppMessage({
          phone: memberPhone(member),
          text,
          memberId: member.systemId || member._id,
          memberName: member.name,
          templateId: templateId || null,
        });
        sent += 1;
        toast.success(`Sent to ${member.name}`);
        setCursor((index) => index + 1);
      } catch (err) {
        failed = true;
        const code = err?.normalized?.code;
        if (code === 'WHATSAPP_NOT_CONNECTED') setNeedsConnect(true);
        if (code === 'WHATSAPP_NOT_ON_WHATSAPP') {
          setCursor((index) => index + 1);
          failed = false;
        }
      } finally {
        setSending(false);
      }
      if (failed || stopRef.current) {
        completed = false;
        break;
      }
      if (i >= queue.length - 1) break;
      const pause = BULK_COOLDOWN_SECONDS + Math.floor(Math.random() * 9);
      for (let left = pause; left > 0; left -= 1) {
        if (stopRef.current) break;
        setWaitLeft(left);
        await sleep(1000);
      }
      setWaitLeft(0);
      if (stopRef.current) completed = false;
    }
    setRunning(false);
    setSending(false);
    setWaitLeft(0);
    if (completed && sent > 0) toast.success(`Finished. Sent ${sent} message${sent === 1 ? '' : 's'}.`);
  };

  return (
    <Modal
      open
      onClose={closeModal}
      title="Send bulk WhatsApp"
      size="lg"
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={closeModal}>Close</Btn>
          {running && (
            <Btn variant="outline" size="sm" onClick={stopRun}>Stop</Btn>
          )}
          <Btn variant="success" size="sm" onClick={sendAll} disabled={loading || running || !current || !draft.trim()}>
            {waitLeft
              ? `Next in ${waitLeft}s`
              : sending
                ? `Sending to ${current?.name || 'member'}…`
                : current
                  ? `Send ${reachable.length - cursor} with pauses`
                  : (reachable.length ? 'All sent' : 'No numbers')}
          </Btn>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
            {reachable.length} of {members.length} selected member(s) have a phone number.
            {' '}Sent {Math.min(cursor, reachable.length)} of {reachable.length}. After each message Leap waits 20–28 seconds, then sends the next, so WhatsApp is less likely to treat the number as spam.
          </p>
          {waitLeft > 0 && (
            <p style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>
              Cooling down. Next message in {waitLeft}s.
            </p>
          )}
          {needsConnect && (
            <p style={{ fontSize: 13, margin: 0 }}>
              <Link to="/account/whatsapp">Connect WhatsApp</Link> before sending.
            </p>
          )}
          <Select label="Template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setDirty(false); }} disabled={running}>
            <option value="">Custom text</option>
            {templates.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </Select>
          <Textarea label="Message" value={draft} onChange={(e) => { setMessage(e.target.value); setDirty(true); }} rows={6} disabled={running} />
        </div>
      )}
    </Modal>
  );
}
