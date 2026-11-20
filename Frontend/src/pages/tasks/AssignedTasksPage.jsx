import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Tabs, FilterTabs, Table,
} from '../../components/ui';
import {
   getAssignedTaskHistory, completeMemberTask,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n.js';
import { useFormat } from '../../i18n/useFormat.js';
import {
  Check, ChevronDown, ChevronUp, FolderOpen, PartyPopper, RefreshCw, X,
} from 'lucide-react';
import {
  formatTaskDateTime, filterAssignedHistoryAdvanced, toLocalDateString,
} from './taskMembers';

export default function AssignedTasksPage({ embedded = false }) {
  const { t } = useI18n();
  const { lang } = useFormat();
  usePageTitle(t('My Tasks'));
  const navigate = useNavigate();
  const { user: _user } = useAuth();

  const [assigneeTab, setAssigneeTab] = useState('active'); // 'active' | 'history'
  const [assignedHistory, setAssignedHistory] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [completingId, setCompletingId] = useState(null);

  // ── History Filter State ──
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyAssignedBy, setHistoryAssignedBy] = useState('all');
  const [historyPackageFilter, setHistoryPackageFilter] = useState('all');
  const [historyTransferType, setHistoryTransferType] = useState('all');
  const [historyMemberStatus, setHistoryMemberStatus] = useState('all');
  const [historyDateField, setHistoryDateField] = useState('assignedAt');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMoreFiltersOpen, setHistoryMoreFiltersOpen] = useState(false);

  const fetchAssignedHistory = useCallback(async () => {
    setLoadingAssigned(true);
    try {
      const res = await getAssignedTaskHistory();
      setAssignedHistory(res.data.history ?? []);
    } catch {
      toast.error(t('Failed to load assigned tasks'));
    } finally {
      setLoadingAssigned(false);
    }
  }, [t]);

  useLocationEffect(() => { fetchAssignedHistory(); }, [fetchAssignedHistory]);

  const handleCompleteMember = async (taskId, memberId) => {
    setCompletingId(memberId);
    try {
      await completeMemberTask(taskId, memberId);
      toast.success(t('Member task marked as completed'));
      fetchAssignedHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to complete task'));
    } finally {
      setCompletingId(null);
    }
  };

  // Derive unique assigners from history records
  const uniqueAssigners = useMemo(() => {
    const map = new Map();
    assignedHistory.forEach((item) => {
      if (item.assignedBy?._id) {
        map.set(String(item.assignedBy._id), item.assignedBy);
      }
    });
    return Array.from(map.values());
  }, [assignedHistory]);

  // Derive unique packages from history records without calling unauthorized /packages endpoint
  const derivedPackages = useMemo(() => {
    const map = new Map();
    assignedHistory.forEach((item) => {
      if (item.member?.package) {
        const id = item.member.packageId || item.member.package;
        map.set(id, { _id: id, name: item.member.package });
      }
    });
    return Array.from(map.values());
  }, [assignedHistory]);

  const setHistoryQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') {
      setHistoryDateFrom('');
      setHistoryDateTo('');
      return;
    }
    if (preset === 'last7') {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      setHistoryDateFrom(toLocalDateString(from));
      setHistoryDateTo(toLocalDateString(now));
    } else if (preset === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setHistoryDateFrom(toLocalDateString(from));
      setHistoryDateTo(toLocalDateString(to));
    } else if (preset === 'last30') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      setHistoryDateFrom(toLocalDateString(from));
      setHistoryDateTo(toLocalDateString(now));
    }
  };

  const resetAssigneeHistoryFilters = () => {
    setHistorySearch('');
    setHistoryStatusFilter('all');
    setHistoryAssignedBy('all');
    setHistoryPackageFilter('all');
    setHistoryTransferType('all');
    setHistoryMemberStatus('all');
    setHistoryDateField('assignedAt');
    setHistoryDateFrom('');
    setHistoryDateTo('');
  };

  const hasActiveAssigneeFilters = (
    historySearch.trim() !== ''
    || historyStatusFilter !== 'all'
    || historyAssignedBy !== 'all'
    || historyPackageFilter !== 'all'
    || historyTransferType !== 'all'
    || historyMemberStatus !== 'all'
    || Boolean(historyDateFrom)
    || Boolean(historyDateTo)
  );

  const activeAssignedMembers = useMemo(() => (
    assignedHistory.filter((item) => item.status === 'pending')
  ), [assignedHistory]);

  const filteredHistory = useMemo(() => (
    filterAssignedHistoryAdvanced(assignedHistory, {
      assignedBy: historyAssignedBy,
      status: historyStatusFilter,
      packageId: historyPackageFilter,
      transferType: historyTransferType,
      memberStatus: historyMemberStatus,
      dateField: historyDateField,
      dateFrom: historyDateFrom,
      dateTo: historyDateTo,
      search: historySearch,
    })
  ), [
    assignedHistory,
    historyAssignedBy,
    historyStatusFilter,
    historyPackageFilter,
    historyTransferType,
    historyMemberStatus,
    historyDateField,
    historyDateFrom,
    historyDateTo,
    historySearch,
  ]);

  const content = (
    <div className={embedded ? '' : 'page-wrap'} data-walkthrough={embedded ? undefined : 'my-tasks-board'} style={{ paddingTop: embedded ? 0 : 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs
        tabs={[
          { id: 'active', label: t('Active Tasks ({count})', { count: activeAssignedMembers.length }) },
          { id: 'history', label: t('Tasks History ({count})', { count: assignedHistory.length }) },
        ]}
        active={assigneeTab}
        onChange={setAssigneeTab}
      />

      {assigneeTab === 'active' ? (
        <div data-walkthrough="my-tasks-active">
        <Card noPad>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{t('Active Assigned Members')}</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                {t('Members assigned to you by your manager. Contact or follow up with each member, then click "Mark Completed".')}
              </p>
            </div>
          </div>

          {loadingAssigned ? (
            <Table loading skeletonRows={6} headers={[t('Member'), t('Member ID'), t('Phone'), t('Assigned By'), t('Assigned At'), t('Status'), '']} />
          ) : activeAssignedMembers.length === 0 ? (
            <EmptyState icon={PartyPopper} message={t('No pending tasks')} sub={t('You have no members waiting to be processed.')} />
          ) : (
            <div className="table-responsive-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Member')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Member ID')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Phone')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Assigned By')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Assigned At')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Status')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'end', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAssignedMembers.map((item) => {
                    const sid = item.member?.systemId;
                    return (
                      <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: sid ? 'pointer' : 'default' }}
                            onClick={() => sid && navigate(`/members/${sid}`)}
                          >
                            <Avatar name={item.member?.name || t('Member')} size="sm" />
                            <span>{item.member?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)', fontFamily: 'monospace' }}>
                          {item.member?.memberId ? `#${item.member.memberId}` : (item.member?.systemId ? `#${item.member.systemId}` : '—')}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.member?.phone ? (
                            <a
                              dir="ltr"
                              href={`tel:${item.member.phone}`}
                              style={{ color: 'var(--primary)', textDecoration: 'none', unicodeBidi: 'isolate' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.member.phone}
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({t(item.assignedBy?.role || 'Manager')})</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {formatTaskDateTime(item.assignedAt, lang)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge status="pending" />
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'end' }}>
                          <span data-walkthrough="my-tasks-complete">
                          <Btn
                            size="xs"
                            variant="success"
                            disabled={completingId === (item.member?._id || item._id)}
                            onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                          >
                            {completingId === (item.member?._id || item._id) ? <Spinner size="sm" /> : <><Check size={14} aria-hidden /> {t('Mark Completed')}</>}
                          </Btn>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>
      ) : (
        <Card noPad>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{t('Assigned Members History')}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                  {t('Complete history of members assigned to your account, with timestamps when marked as completed.')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn size="xs" variant="outline" onClick={() => setHistoryMoreFiltersOpen((o) => !o)}>
                  {historyMoreFiltersOpen ? <><ChevronUp size={12} aria-hidden /> {t('Less Filters')}</> : <><ChevronDown size={12} aria-hidden /> {t('More Filters')}</>}
                </Btn>
                {hasActiveAssigneeFilters && (
                  <Btn size="xs" variant="ghost" onClick={resetAssigneeHistoryFilters}>
                    <X size={14} aria-hidden /> {t('Reset Filters')}
                  </Btn>
                )}
              </div>
            </div>

            {/* Primary Filter Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>{t('Search Member')}</label>
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder={t('Search member, phone, ID, notes…')}
                  aria-label={t('Search task history')}
                  style={{
                    width: '100%', padding: '7px 11px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                <Select
                  label={t('Assigned By')}
                  value={historyAssignedBy}
                  onChange={(e) => setHistoryAssignedBy(e.target.value)}
                >
                  <option value="all">{t('All Assigners')}</option>
                  {uniqueAssigners.map((assigner) => (
                    <option key={assigner._id} value={assigner._id}>
                      {assigner.name} ({t(assigner.role || 'Manager')})
                    </option>
                  ))}
                </Select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                <FilterTabs
                  options={[
                    { value: 'all', id: 'all', label: t('All') },
                    { value: 'completed', id: 'completed', label: t('Completed') },
                    { value: 'pending', id: 'pending', label: t('Pending') },
                  ]}
                  active={historyStatusFilter}
                  onChange={setHistoryStatusFilter}
                />
              </div>
            </div>

            {/* Secondary Advanced Filters */}
            {historyMoreFiltersOpen && (
              <div className="overlay-in" style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label={t('Package')}
                      value={historyPackageFilter}
                      onChange={(e) => setHistoryPackageFilter(e.target.value)}
                    >
                      <option value="all">{t('All Packages')}</option>
                      {derivedPackages.map((pkg) => (
                        <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                      ))}
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label={t('Transfer Type')}
                      value={historyTransferType}
                      onChange={(e) => setHistoryTransferType(e.target.value)}
                    >
                      <option value="all">{t('All Types')}</option>
                      <option value="bulk">{t('Bulk Transfer')}</option>
                      <option value="quick">{t('Quick Transfer')}</option>
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label={t('Member Status')}
                      value={historyMemberStatus}
                      onChange={(e) => setHistoryMemberStatus(e.target.value)}
                    >
                      <option value="all">{t('All Member Statuses')}</option>
                      <option value="active">{t('Active')}</option>
                      <option value="expired">{t('Expired')}</option>
                      <option value="frozen">{t('Frozen')}</option>
                      <option value="guest">{t('Guest')}</option>
                    </Select>
                  </div>
                </div>

                {/* Date Range Filter Row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <Select
                      label={t('Date Type')}
                      value={historyDateField}
                      onChange={(e) => setHistoryDateField(e.target.value)}
                    >
                      <option value="assignedAt">{t('Assigned Date')}</option>
                      <option value="completedAt">{t('Completed Date')}</option>
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>{t('From')}</label>
                    <input
                      type="date"
                      value={historyDateFrom}
                      onChange={(e) => setHistoryDateFrom(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>{t('To')}</label>
                    <input
                      type="date"
                      value={historyDateTo}
                      onChange={(e) => setHistoryDateTo(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 2 }}>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('last7')}>{t('Last 7d')}</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('thisMonth')}>{t('This Month')}</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('last30')}>{t('Last 30d')}</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('clear')}>{t('Clear Dates')}</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>

          {loadingAssigned ? (
            <Table loading skeletonRows={6} headers={[t('Member'), t('System ID'), t('Phone'), t('Assigned By'), t('Assigned At'), t('Status'), '']} />
          ) : filteredHistory.length === 0 ? (
            <EmptyState icon={FolderOpen} message={t('No matching history items')} sub={t('Try adjusting your filters or search terms.')} />
          ) : (
            <div className="table-responsive-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Member')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('System ID')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Phone')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Assigned By')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Assigned At')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Status')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Completed Info')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'end', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => {
                    const sid = item.member?.systemId;
                    const isPending = item.status === 'pending';
                    return (
                      <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: sid ? 'pointer' : 'default' }}
                            onClick={() => sid && navigate(`/members/${sid}`)}
                          >
                            <Avatar name={item.member?.name || t('Member')} size="sm" />
                            <span>{item.member?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.member?.memberId ? `#${item.member.memberId}` : (item.member?.systemId ? `#${item.member.systemId}` : '—')}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.member?.phone ? <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{item.member.phone}</span> : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({t(item.assignedBy?.role || 'Manager')})</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {formatTaskDateTime(item.assignedAt, lang)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge status={item.status === 'completed' ? 'active' : 'pending'} label={item.status === 'completed' ? t('Completed') : t('Pending')} />
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {item.status === 'completed' ? (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontWeight: 600 }}><Check size={12} aria-hidden /> {formatTaskDateTime(item.completedAt, lang)}</span>
                              {item.completedBy?.name && (
                                <div style={{ fontSize: 10, color: 'var(--t4)' }}>{t('by {name}', { name: item.completedBy.name })}</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--amber)', fontSize: 11 }}>{t('Awaiting action')}</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'end' }}>
                          {isPending && (
                            <Btn
                              size="xs"
                              variant="success"
                              disabled={completingId === (item.member?._id || item._id)}
                              onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                            >
                              {completingId === (item.member?._id || item._id) ? <Spinner size="sm" /> : t('Mark Done')}
                            </Btn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Layout>
      <PageHeader walkthrough="my-tasks-header" title={t('My Tasks')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn size="sm" variant="outline" onClick={fetchAssignedHistory} disabled={loadingAssigned}>
            <RefreshCw size={14} aria-hidden /> {t('Refresh')}
          </Btn>
        </div>
      </PageHeader>
      {content}
    </Layout>
  );
}
