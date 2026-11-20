import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, Table, Badge, StatCard, EmptyState, SearchInput, Avatar, formatSystemId } from '../../components/ui';
import { getAllMembers } from '../../api/endpoints';
import { Dumbbell } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';

export default function CoachMembers() {
  const { t } = useI18n();
  usePageTitle(t('Members'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Head Coach';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllMembers();
      setMembers(res.data.members ?? []);
    } catch {
      toast.error(t('Failed to load members'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLocationEffect(() => { load(); }, [load]);

  // Filter to coach's members (Coach sees only theirs, Head Coach sees ALL)
  const coachMembers = isManager
    ? members
    : members.filter(m => {
        const coachId = m.current_couch?._id || m.current_couch;
        return String(coachId) === String(user?._id);
      });

  // Apply status filter and search
  const filtered = coachMembers.filter(m => {
    const memberStatus = (m.couch_subscription_status || 'guest').toLowerCase();
    if (filter !== 'all' && memberStatus !== filter.toLowerCase()) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase().trim();
      const sId = String(m.systemId ?? '').toLowerCase();
      const fId = formatSystemId(m.systemId).toLowerCase();
      const mId = String(m.memberId ?? '').toLowerCase();
      const match =
        m.name?.toLowerCase().includes(q) ||
        m.phones?.toLowerCase().includes(q) ||
        sId.includes(q) ||
        fId.includes(q) ||
        mId.includes(q);
      if (!match) return false;
    }
    return true;
  });

  const stats = {
    total: coachMembers.length,
    active: coachMembers.filter(m => (m.couch_subscription_status || 'guest').toLowerCase() === 'active').length,
    transferred: coachMembers.filter(m => (m.couch_subscription_status || '').toLowerCase() === 'transferred').length,
    interested: coachMembers.filter(m => (m.couch_subscription_status || '').toLowerCase() === 'interested').length,
    expired: coachMembers.filter(m => (m.couch_subscription_status || '').toLowerCase() === 'expired').length,
  };

  return (
    <Layout>
      <PageHeader walkthrough="coach-members-header" title={t('Members')}>
        <SearchInput value={search} onChange={setSearch} placeholder={t('Name, phone, ID…')} width={200} />
      </PageHeader>

      <div className="page-wrap" data-walkthrough="coach-members-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div className="grid-stats-5" style={{ marginBottom: 16 }}>
          <StatCard label={t('Total')} value={stats.total} color="brand" />
          <StatCard label={t('Active')} value={stats.active} color="success" />
          <StatCard label={t('Transferred')} value={stats.transferred} color="info" />
          <StatCard label={t('Interested')} value={stats.interested} color="warning" />
          <StatCard label={t('Expired')} value={stats.expired} color="danger" />
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { value: 'all', label: t('All ({count})', { count: stats.total }) },
            { value: 'active', label: t('Active ({count})', { count: stats.active }) },
            { value: 'transferred', label: t('Transferred ({count})', { count: stats.transferred }) },
            { value: 'interested', label: t('Interested ({count})', { count: stats.interested }) },
            { value: 'expired', label: t('Expired ({count})', { count: stats.expired }) },
          ].map(o => (
            <button key={o.value} onClick={() => setFilter(o.value)} style={{
              padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: filter === o.value ? 'var(--navy)' : '#fff',
              border: `1px solid ${filter === o.value ? 'var(--navy)' : 'var(--border-md)'}`,
              color: filter === o.value ? '#fff' : 'var(--t2)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{o.label}</button>
          ))}
        </div>

        <Card noPad>
          {!loading && filtered.length === 0 ? (
            <EmptyState icon={Dumbbell} message={t('No members match')} />
          ) : (
            <Table
              loading={loading}
              skeletonRows={8}
              headers={[t('ID'), t('Name'), ...(isManager ? [t('Coach')] : []), t('Status'), t('Sessions'), t('Used'), t('Remaining')]}
            >
              {filtered.map(m => (
                <tr key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={m.name} size="sm" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                    </div>
                  </td>
                  {isManager && (
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                      {m.current_couch?.name || (isManager ? user?.name : '—')}
                    </td>
                  )}
                  <td style={{ padding: '10px 14px' }}><Badge status={m.couch_subscription_status || 'guest'} /></td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{m.PT_sessions || 0}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--t2)' }}>{m.used_PT_sessions || 0}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: (m.PT_sessions - m.used_PT_sessions) > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {(m.PT_sessions || 0) - (m.used_PT_sessions || 0)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </Layout>
  );
}
