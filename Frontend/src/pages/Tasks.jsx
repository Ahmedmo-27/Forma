import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import useDebounce from '../hooks/useDebounce';
import Layout from '../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  SearchInput, Select, Textarea, Modal, Pagination, fmtDate,
} from '../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getWhatsAppTemplates, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, logWhatsAppTemplateSend,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { applyWhatsAppPlaceholders, composeWhatsAppTemplateMessage, toWhatsAppUrl } from '../utils/whatsapp';
import {
  EXPORT_COLUMNS, GROUPS, assignChoices, buildCsv, coachName, columnsForExport,
  filterMembers, latestSubscription, memberPhone, packageName, rowsForExport,
  salesName, salesmanName, smsUrl, taskPermissions, toggleId, toggleIds,
} from './tasks/taskMembers';

const PAGE_SIZE = 25;

function downloadCsv(filename, columns, rows) {
  const blob = new Blob([buildCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadStatusMembers(status) {
  const limit = 100;
  const members = [];
  let page = 1;
  let stats = null;
  for (;;) {
    const res = await getAllMembers({ status, page, limit });
    members.push(...(res.data.members ?? []));
    stats = stats || res.data.stats || null;
    const totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
    if (page > totalPages || page > 50) break;
  }
  return { members, stats };
}

function GroupCard({ group, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: active ? 'rgba(68,41,140,0.08)' : 'var(--card)',
        border: `1px solid ${active ? '#44298C' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        minWidth: 160,
        flex: '1 1 160px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: active ? '#44298C' : 'var(--t3)' }}>
        {group.label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t1)', marginTop: 4, lineHeight: 1 }}>
        {count == null ? '—' : count}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 6 }}>{group.hint}</div>
    </button>
  );
}

function AssignModal({ open, onClose, title, hint, options, empty, busy, onConfirm }) {
  const [value, setValue] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" disabled={busy || !value} onClick={() => onConfirm(value)}>
            {busy ? <Spinner size="sm" /> : 'Apply to selected'}
          </Btn>
        </>
      )}
    >
      <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>{hint}</p>
      {options.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <Select label="Transfer to" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((person) => (
            <option key={person._id} value={person._id}>{person.name} ({person.role})</option>
          ))}
        </Select>
      )}
    </Modal>
  );
}

export default function Tasks() {
  usePageTitle('Tasks');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const [status, setStatus] = useState('');
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());

  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [assign, setAssign] = useState(null);
  const [busy, setBusy] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportKeys, setExportKeys] = useState(() => EXPORT_COLUMNS.map((col) => col.key));

  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState('');

  const [waOpen, setWaOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 250);
  const { canSalesman, canCoach, canSales, canWhatsApp } = taskPermissions(user, hasFeature);

  useEffect(() => {
    getAllMembers({ page: 1, limit: 1 })
      .then((res) => setStats(res.data.stats ?? null))
      .catch(() => {});
    getSalesUsers()
      .then((res) => setSalesUsers(res.data.salesUsers ?? []))
      .catch(() => {});
    getCoachTeam()
      .then((res) => {
        const team = (res.data.team ?? []).filter((person) => ['Coach', 'Coach Manager'].includes(person.role));
        setCoaches(team);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async (nextStatus) => {
    setLoading(true);
    try {
      const result = await loadStatusMembers(nextStatus);
      setMembers(result.members);
      if (result.stats) setStats(result.stats);
    } catch {
      setMembers([]);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  const chooseStatus = (next) => {
    setStatus(next);
    setSearch('');
    setPage(1);
    setSelected(new Set());
    load(next);
  };

  const filtered = useMemo(
    () => filterMembers(members, debouncedSearch),
    [members, debouncedSearch],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const selectedMembers = members.filter((member) => selected.has(member._id));
  const pageIds = pageRows.map((member) => member._id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => toggleId(prev, id));
  };

  const togglePage = () => {
    setSelected((prev) => toggleIds(prev, pageIds));
  };

  const toggleFiltered = () => {
    setSelected((prev) => toggleIds(prev, filtered.map((member) => member._id)));
  };

  const requireSelection = () => {
    if (selected.size) return true;
    toast.error('Select at least one member');
    return false;
  };

  const refresh = () => {
    if (status) load(status);
  };

  const handleAssign = async (destinationId) => {
    if (!requireSelection()) return;
    setBusy(true);
    try {
      if (assign === 'coach') {
        const res = await bulkTransferCoach({ coachId: destinationId, memberIds: [...selected] });
        toast.success(`Coach updated for ${res.data.transferredCount ?? selected.size} member(s)`);
      } else {
        const res = await bulkTransferSalesReps({ toSalesRepId: destinationId, memberIds: [...selected] });
        toast.success(`Transferred ${res.data.transferredCount} member(s)`);
      }
      setAssign(null);
      setSelected(new Set());
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const exportRows = rowsForExport(selectedMembers, filtered);

  const handleExport = () => {
    const columns = columnsForExport(exportKeys);
    if (!columns.length) {
      toast.error('Choose at least one column');
      return;
    }
    if (!exportRows.length) {
      toast.error('Nothing to export');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`tasks-${status || 'members'}-${day}.csv`, columns, exportRows);
    setExportOpen(false);
    toast.success(`Exported ${exportRows.length} row(s)`);
  };

  const openSms = () => {
    if (!requireSelection()) return;
    const reachable = selectedMembers.filter((member) => memberPhone(member));
    if (!reachable.length) {
      toast.error('None of the selected members have a visible phone number');
      return;
    }
    setSmsOpen(true);
  };

  const sendSms = () => {
    const phones = selectedMembers.map(memberPhone).filter(Boolean);
    const url = smsUrl(phones, smsText);
    if (!url) {
      toast.error('No phone numbers to message');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setSmsOpen(false);
  };

  const assignConfig = assignChoices(assign || 'coach', {
    salesUsers,
    coaches,
    selectedCount: selected.size,
  });

  const counts = {
    expired: stats?.expired,
    guest: stats?.guest,
    active: stats?.active,
    frozen: stats?.frozen,
  };

  return (
    <Layout>
      <PageHeader title="Tasks">
        <Btn variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={!status || loading}>
          Export
        </Btn>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {GROUPS.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              count={counts[group.id]}
              active={status === group.id}
              onClick={() => chooseStatus(group.id)}
            />
          ))}
        </div>

        {!status ? (
          <Card>
            <EmptyState
              icon="✅"
              message="Choose a member group"
              sub="Expired, guest, active, or freeze. Then select people to transfer, message, or export."
            />
          </Card>
        ) : (
          <>
            <Card>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginRight: 4 }}>
                  {selected.size} selected
                </span>
                {canSalesman && (
                  <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => setAssign('salesman')}>Change salesman</Btn>
                )}
                {canCoach && (
                  <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => setAssign('coach')}>Change coach</Btn>
                )}
                {canSales && (
                  <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => setAssign('sales')}>Change sales</Btn>
                )}
                <Btn size="sm" variant="outline" disabled={!selected.size} onClick={openSms}>Send SMS</Btn>
                {canWhatsApp && (
                  <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => { if (requireSelection()) setWaOpen(true); }}>
                    Send bulk WhatsApp
                  </Btn>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--t4)', margin: '10px 0 0' }}>
                Bulk actions apply to the checked members in this {GROUPS.find((group) => group.id === status)?.label.toLowerCase()} list.
              </p>
            </Card>

            <Card noPad>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '14px 14px 0' }}>
                <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Name, phone, ID…" width={240} />
                <button
                  type="button"
                  onClick={toggleFiltered}
                  style={{ background: 'none', border: 'none', color: '#44298C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {filtered.length > 0 && filtered.every((member) => selected.has(member._id)) ? 'Clear this list' : `Select all ${filtered.length}`}
                </button>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
              ) : filtered.length === 0 ? (
                <EmptyState message="No members in this group" sub="Try another status or clear the search" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ padding: '9px 14px', width: 36 }}>
                          <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select this page" />
                        </th>
                        {['Member', 'Phone', 'Salesman', 'Sales', 'Coach', 'Package', 'Ends'].map((heading) => (
                          <th key={heading} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((member) => {
                        const sub = latestSubscription(member);
                        return (
                          <tr
                            key={member._id}
                            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                            onClick={() => navigate(`/members/${member.systemId}`)}
                          >
                            <td style={{ padding: '10px 14px' }} onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selected.has(member._id)}
                                onChange={() => toggleOne(member._id)}
                                aria-label={`Select ${member.name}`}
                              />
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar name={member.name} size="sm" />
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{member.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{member.systemId} · <Badge status={member.status} /></div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{memberPhone(member) || '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{salesmanName(member) || '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{salesName(member) || '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{coachName(member) || '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{packageName(member) || '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtDate(sub?.endDate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={visiblePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </Card>
          </>
        )}
      </div>

      <AssignModal
        key={assign || 'none'}
        open={Boolean(assign)}
        onClose={() => setAssign(null)}
        title={assignConfig.title}
        hint={assignConfig.hint}
        options={assignConfig.options}
        empty={assignConfig.empty}
        busy={busy}
        onConfirm={handleAssign}
      />

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export columns"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setExportOpen(false)}>Cancel</Btn>
            <Btn size="sm" onClick={handleExport}>Download CSV ({exportRows.length})</Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>
          {selected.size
            ? `Exports the ${selected.size} selected member(s).`
            : `Nothing is selected, so this exports all ${filtered.length} member(s) in the current list.`}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          {EXPORT_COLUMNS.map((col) => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)' }}>
              <input
                type="checkbox"
                checked={exportKeys.includes(col.key)}
                onChange={() => {
                  setExportKeys((prev) => (
                    prev.includes(col.key) ? prev.filter((key) => key !== col.key) : [...prev, col.key]
                  ));
                }}
              />
              {col.label}
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        title="Send SMS"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setSmsOpen(false)}>Cancel</Btn>
            <Btn size="sm" onClick={sendSms}>Open SMS</Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>
          Opens your phone’s messages app with {selectedMembers.filter((member) => memberPhone(member)).length} number(s).
        </p>
        <Textarea
          label="Message"
          value={smsText}
          onChange={(e) => setSmsText(e.target.value)}
          rows={5}
          placeholder="Write the text to send"
        />
      </Modal>

      {waOpen && (
        <WhatsAppBulkModal
          members={selectedMembers}
          onClose={() => setWaOpen(false)}
        />
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
        if (!cancelled && err?.normalized?.status !== 403) {
          toast.error('Could not load WhatsApp templates');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const composed = useMemo(() => {
    if (!template) return '';
    return composeWhatsAppTemplateMessage(template, packages, {
      memberName: '{{name}}',
      language: 'en',
    });
  }, [template, packages]);

  const draft = dirty ? message : composed;
  const textFor = (member) => applyWhatsAppPlaceholders(draft, member?.name);

  const openCurrent = async () => {
    if (!current) return;
    const phone = memberPhone(current);
    const url = toWhatsAppUrl(phone, textFor(current));
    if (!url) {
      toast.error(`${current.name} has no WhatsApp number`);
      return;
    }
    try {
      await logWhatsAppTemplateSend({
        memberId: current.systemId || current._id,
        memberName: current.name,
        templateId: templateId || null,
      });
    } catch {
      // Opening WhatsApp still works if the log fails.
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setCursor((index) => index + 1);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Send bulk WhatsApp"
      size="lg"
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
          <Btn variant="success" size="sm" onClick={openCurrent} disabled={loading || !current || !draft.trim()}>
            {current ? `Open WhatsApp for ${current.name}` : (reachable.length ? 'All opened' : 'No numbers')}
          </Btn>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
            {reachable.length} of {members.length} selected member(s) have a phone number. WhatsApp opens one chat at a time so each message uses that person’s name. Use {'{{name}}'} where the name should appear.
          </p>
          <Select label="Template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setDirty(false); }}>
            <option value="">Custom text</option>
            {templates.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </Select>
          <Textarea
            label="Message"
            value={draft}
            onChange={(e) => { setMessage(e.target.value); setDirty(true); }}
            rows={6}
          />
          {current && (
            <div style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Next: {current.name} ({cursor + 1} of {reachable.length})</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{textFor(current)}</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
