import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Tabs, FilterTabs,
} from '../../components/ui';
import {
  getAssignedActiveTasks, getAssignedTaskHistory, completeMemberTask,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import {
  formatTaskDateTime, filterAssignedHistoryAdvanced, toLocalDateString,
} from './taskMembers';

export default function AssignedTasksPage({ embedded = false }) {
  usePageTitle('My Tasks');
  const navigate = useNavigate();
  const { user } = useAuth();

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
      toast.error('Failed to load assigned tasks');
    } finally {
      setLoadingAssigned(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignedHistory();
  }, [fetchAssignedHistory]);

  const handleCompleteMember = async (taskId, memberId) => {
    setCompletingId(memberId);
    try {
      await completeMemberTask(taskId, memberId);
      toast.success('Member task marked as completed');
      fetchAssignedHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to complete task');
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
    <div className={embedded ? '' : 'page-wrap'} style={{ paddingTop: embedded ? 0 : 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs
        tabs={[
          { id: 'active', label: `Active Tasks (${activeAssignedMembers.length})` },
          { id: 'history', label: `Tasks History (${assignedHistory.length})` },
        ]}
        active={assigneeTab}
        onChange={setAssigneeTab}
      />

      {assigneeTab === 'active' ? (
        <Card noPad>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Active Assigned Members</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                Members assigned to you by your manager. Contact or follow up with each member, then click &quot;Mark Completed&quot;.
              </p>
            </div>
          </div>

          {loadingAssigned ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
          ) : activeAssignedMembers.length === 0 ? (
            <EmptyState icon="🎉" message="No pending tasks" sub="You have no members waiting to be processed." />
          ) : (
            <div className="table-responsive-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned By</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned At</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Action</th>
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
                            <Avatar name={item.member?.name || 'Member'} size="sm" />
                            <span>{item.member?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          #{item.member?.systemId || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.member?.phone ? (
                            <a
                              href={`tel:${item.member.phone}`}
                              style={{ color: 'var(--primary)', textDecoration: 'none' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.member.phone}
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({item.assignedBy?.role || 'Manager'})</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {formatTaskDateTime(item.assignedAt)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge status="pending" />
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <Btn
                            size="xs"
                            variant="success"
                            disabled={completingId === (item.member?._id || item._id)}
                            onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                          >
                            {completingId === (item.member?._id || item._id) ? <Spinner size="sm" /> : '✓ Mark Completed'}
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card noPad>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Assigned Members History</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                  Complete history of members assigned to your account, with timestamps when marked as completed.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn size="xs" variant="outline" onClick={() => setHistoryMoreFiltersOpen((o) => !o)}>
                  {historyMoreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}
                </Btn>
                {hasActiveAssigneeFilters && (
                  <Btn size="xs" variant="ghost" onClick={resetAssigneeHistoryFilters}>
                    ✕ Reset Filters
                  </Btn>
                )}
              </div>
            </div>

            {/* Primary Filter Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Search Member</label>
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search member, phone, ID, notes…"
                  aria-label="Search task history"
                  style={{
                    width: '100%', padding: '7px 11px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                <Select
                  label="Assigned By"
                  value={historyAssignedBy}
                  onChange={(e) => setHistoryAssignedBy(e.target.value)}
                >
                  <option value="all">All Assigners</option>
                  {uniqueAssigners.map((assigner) => (
                    <option key={assigner._id} value={assigner._id}>
                      {assigner.name} ({assigner.role || 'Manager'})
                    </option>
                  ))}
                </Select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                <FilterTabs
                  options={[
                    { value: 'all', id: 'all', label: 'All' },
                    { value: 'completed', id: 'completed', label: 'Completed' },
                    { value: 'pending', id: 'pending', label: 'Pending' },
                  ]}
                  active={historyStatusFilter}
                  onChange={setHistoryStatusFilter}
                />
              </div>
            </div>

            {/* Secondary Advanced Filters */}
            {historyMoreFiltersOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label="Package"
                      value={historyPackageFilter}
                      onChange={(e) => setHistoryPackageFilter(e.target.value)}
                    >
                      <option value="all">All Packages</option>
                      {derivedPackages.map((pkg) => (
                        <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                      ))}
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label="Transfer Type"
                      value={historyTransferType}
                      onChange={(e) => setHistoryTransferType(e.target.value)}
                    >
                      <option value="all">All Types</option>
                      <option value="bulk">Bulk Transfer</option>
                      <option value="quick">Quick Transfer</option>
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label="Member Status"
                      value={historyMemberStatus}
                      onChange={(e) => setHistoryMemberStatus(e.target.value)}
                    >
                      <option value="all">All Member Statuses</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="frozen">Frozen</option>
                      <option value="guest">Guest</option>
                    </Select>
                  </div>
                </div>

                {/* Date Range Filter Row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <Select
                      label="Date Type"
                      value={historyDateField}
                      onChange={(e) => setHistoryDateField(e.target.value)}
                    >
                      <option value="assignedAt">Assigned Date</option>
                      <option value="completedAt">Completed Date</option>
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>From</label>
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
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>To</label>
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
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('last7')}>Last 7d</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('thisMonth')}>This Month</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('last30')}>Last 30d</Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('clear')}>Clear Dates</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>

          {loadingAssigned ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState icon="📂" message="No matching history items" sub="Try adjusting your filters or search terms." />
          ) : (
            <div className="table-responsive-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned By</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned At</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Completed Info</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Action</th>
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
                            <Avatar name={item.member?.name || 'Member'} size="sm" />
                            <span>{item.member?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          #{item.member?.systemId || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.member?.phone || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                          {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({item.assignedBy?.role || 'Manager'})</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {formatTaskDateTime(item.assignedAt)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge status={item.status === 'completed' ? 'active' : 'pending'} label={item.status === 'completed' ? 'Completed' : 'Pending'} />
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                          {item.status === 'completed' ? (
                            <div>
                              <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ {formatTaskDateTime(item.completedAt)}</span>
                              {item.completedBy?.name && (
                                <div style={{ fontSize: 10, color: 'var(--t4)' }}>by {item.completedBy.name}</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--amber)', fontSize: 11 }}>Awaiting action</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {isPending && (
                            <Btn
                              size="xs"
                              variant="success"
                              disabled={completingId === (item.member?._id || item._id)}
                              onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                            >
                              {completingId === (item.member?._id || item._id) ? <Spinner size="sm" /> : 'Mark Done'}
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
      <PageHeader title="My Tasks">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn size="sm" variant="outline" onClick={fetchAssignedHistory} disabled={loadingAssigned}>
            ↻ Refresh
          </Btn>
        </div>
      </PageHeader>
      {content}
    </Layout>
  );
}
