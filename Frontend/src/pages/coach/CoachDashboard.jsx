import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, StatCard, Avatar, Badge, EmptyState, DashboardSkeleton } from '../../components/ui';
import { getAllMembers } from '../../api/endpoints';
import { Check, Dumbbell, Users } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

export default function CoachDashboard() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  usePageTitle(t('Coach Dashboard'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'Head Coach';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    try {
      const res = await getAllMembers();
      setMembers(res.data.members ?? []);
    } catch (_err) {
      // Retry once on transient Atlas connection failures
      if (attempt === 0) {
        await new Promise(res => setTimeout(res, 3000));
        return load(1);
      }
      toast.error(t('Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLocationEffect(() => { load(); }, [load]);

  // Filter members that have coach subscription
  const coachMembers = isManager
    ? members.filter(m => m.current_couch || m.couch_subscription_status)
    : members.filter(m => {
        const coachId = m.current_couch?._id || m.current_couch;
        return String(coachId) === String(user?._id);
      });

  const activeCount = coachMembers.filter(m => m.couch_subscription_status === 'active').length;
  const interestedCount = coachMembers.filter(m => m.couch_subscription_status === 'interested').length;
  const totalSessions = coachMembers.reduce((s, m) => s + (m.PT_sessions || 0), 0);
  const usedSessions = coachMembers.reduce((s, m) => s + (m.used_PT_sessions || 0), 0);

  return (
    <Layout>
      <PageHeader walkthrough="coach-dash-header" title={t('Dashboard')}>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {fmtDate(new Date(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }, 'en-GB')}
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="coach-dash-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <DashboardSkeleton stats={4} listRows={5} />
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label={t('My Members')} value={coachMembers.length} color="brand" onClick={() => navigate('/coach/members')} />
              <StatCard label={t('Active')} value={activeCount} color="success" />
              <StatCard label={t('Interested')} value={interestedCount} color="warning" />
              <StatCard label={t('Total Sessions')} value={totalSessions} color="blue" />
              <StatCard label={t('Used Sessions')} value={usedSessions} color="info" />
              <StatCard label={t('Remaining')} value={totalSessions - usedSessions} color="danger" />
            </div>

            {/* Recent members */}
            <Card noPad>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('My Members ({count})', { count: coachMembers.length })}</span>
                <span onClick={() => navigate('/coach/members')} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>{t('View all')} <span className="rtl-flip" style={{ display: 'inline-block' }}>→</span></span>
              </div>
              {coachMembers.length === 0 ? (
                <EmptyState icon={Dumbbell} message={t('No members assigned')} sub={t('Members will appear here once assigned')} />
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {coachMembers.slice(0, 10).map(m => (
                    <div key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar name={m.name} size="sm" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{m.systemId} · {t('{count} sessions left', { count: m.PT_sessions - m.used_PT_sessions })}</div>
                      </div>
                      <Badge status={m.couch_subscription_status || 'guest'} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 16 }}>
              {[
                { label: tr('Session Check-in'), icon: Check, to: '/coach/checkin', access: 'coach_checkin' },
                { label: tr('My Members'), icon: Users, to: '/coach/members', access: 'coach_members' },
              ].filter((c) => hasAccess(user, c.access)).map(c => {
                const ActionIcon = c.icon;
                return (
                <button key={c.to} onClick={() => navigate(c.to)} style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '16px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: 'var(--icon, var(--navy))' }}>
                    <ActionIcon size={24} aria-hidden />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t(c.label)}</div>
                </button>
              );})}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
