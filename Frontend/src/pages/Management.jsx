import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Mail,
  MessageCircle,
  Package,
  RefreshCw,
  ScrollText,
  Shield,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/ui';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { hasAccess } from '../lib/access';
import { useTenant } from '../context/TenantContext';
import { routeFeatureAllowed } from '../lib/canSeeRoute';
import { useI18n } from '../i18n/useI18n';

function MgmtCard({ icon: Icon, title, sub, to, iconBg = '#F0F9FF' }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(to)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        flex: '1 1 220px', minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.boxShadow = '0 4px 16px color-mix(in srgb, var(--navy) 12%, transparent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--icon, var(--navy))' }}>
        {Icon ? <Icon size={22} strokeWidth={1.75} aria-hidden="true" /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--t3)' }}>{sub}</p>
      </div>
      <svg className="rtl-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>{title}</h2>
        <p style={{ fontSize: 13, color: 'var(--t3)' }}>{sub}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

export default function Management() {
  const { t } = useI18n();
  usePageTitle(t('Management'));
  const { user } = useAuth();

  const { hasFeature } = useTenant();

  // Each card needs the person's access key AND the gym's plan feature for its page.
  const allow = (key, to) => hasAccess(user, key) && routeFeatureAllowed(hasFeature, to);
  const whatsappTo = user?.role === 'Head Coach' ? '/coach/whatsapp-templates' : '/sales/whatsapp-templates';
  const show = {
    requests: allow(['approve_requests', 'request_assignment', 'request_takeover'], '/sales/requests'),
    packages: allow('packages', '/sales/packages'),
    whatsapp: allow('whatsapp_templates', whatsappTo),
    salesTeam: allow('sales_team', '/sales/team'),
    staff: allow('staff', '/sales/staff'),
    contracts: allow('contracts', '/accounting/contract-history'),
    coachTeam: allow('coach_team', '/coach/team'),
    coachStaff: allow('coach_staff', '/coach/staff'),
    coachTransfers: user?.role === 'Head Coach' && allow('my_transfers', '/coach/my-transfers'),
    coachAttendance: allow('coach_attendance', '/coach/attendance'),
    assignCoaches: allow('coach_transfer', '/tasks'),
    teams: allow('teams_overview', '/owner/teams'),
    accessControl: allow('access_control', '/management/access'),
    packageRequests: allow('package_approvals', '/accounting/package-requests'),
    quickTransfer: (hasAccess(user, 'transfer') || hasAccess(user, 'coach_transfer')) && routeFeatureAllowed(hasFeature, '/management/quick-transfer'),
    maintenance: allow(['maintenance_checklist', 'manage_maintenance'], '/maintenance'),
  };
  return (
    <Layout>
      <PageHeader walkthrough="management-header" title={t('Management')} />
      <div className="page-wrap" data-walkthrough="management-board" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {/* ── Operations ──────────────────────────────────────── */}
        {(show.requests || show.packages || show.whatsapp || show.coachAttendance || show.assignCoaches || show.maintenance) && (
          <Section title={t('Operations')} sub={t('Requests, packages, attendance and assignments')}>
            {show.requests && (
              <MgmtCard icon={ClipboardList} title={t('Requests')}    sub={t('Package assignment requests')}      to="/sales/requests"           iconBg="#F0F9FF" />
            )}
            {show.packages && (
              <MgmtCard icon={Package} title={t('Packages')}    sub={t('Manage membership packages')}       to="/sales/packages"           iconBg="#F0F9FF" />
            )}
            {show.maintenance && (
              <MgmtCard icon={Wrench} title={t('Maintenance')} sub={t('Branch maintenance checklist')} to="/maintenance" iconBg="#F0F9FF" />
            )}
            {show.coachAttendance && (
              <MgmtCard icon={CalendarDays} title={t('Attendance')} sub={t('Peak check-in times by weekday and hour')} to="/coach/attendance" iconBg="#F0F9FF" />
            )}
            {show.assignCoaches && (
              <MgmtCard icon={Dumbbell} title={t('Assign Coaches')} sub={t('Quick or bulk assign members to coaches')} to="/tasks" iconBg="#F0F9FF" />
            )}
            {show.whatsapp && (
              <MgmtCard icon={MessageCircle} title={t('WA Messages')} sub={t('WhatsApp message templates')}
                to={whatsappTo}
                iconBg="#F0FDF4" />
            )}
          </Section>
        )}

        {(show.salesTeam || show.staff || show.contracts || show.coachTeam || show.coachStaff || show.coachTransfers) && (
          <Section title={t('Team & Staff')} sub={t('Team members and staff accounts')}>
            {show.salesTeam && (
              <MgmtCard icon={Users} title={t('Sales Team')}  sub={t('Sales team overview & stats')}      to="/sales/team"   iconBg="#FFF7ED" />
            )}
            {show.staff && (
              <MgmtCard icon={UserRound} title={t('Create Staff Account')} sub={t('Create a new staff account')} to="/sales/staff" iconBg="#FFF7ED" />
            )}
            {show.contracts && (
              <MgmtCard icon={ScrollText} title={t('Contracts')}   sub={t('All member contracts')}             to="/accounting/contract-history" iconBg="#FFF7ED" />
            )}
            {show.coachTeam && (
              <MgmtCard icon={Users} title={t('Coach Team')}  sub={t('Coach team overview & stats')}      to="/coach/team"   iconBg="#FFF7ED" />
            )}
            {show.coachStaff && (
              <MgmtCard icon={UserRound} title={t('Create Coach Account')} sub={t('Create a new coach account')} to="/coach/staff" iconBg="#FFF7ED" />
            )}
            {show.coachTransfers && (
              <MgmtCard icon={RefreshCw} title={t('Transfers')}   sub={t('Coach member transfers log')}       to="/coach/my-transfers" iconBg="#FFF7ED" />
            )}
          </Section>
        )}

        {(show.teams || show.accessControl) && (
          <Section title={t('Admin')} sub={user?.role === 'Owner' ? t('Owner tools and staff access') : t('Staff access for your team')}>
            {show.teams && (
              <MgmtCard icon={Building2} title={t('Teams Overview')} sub={t('All teams at a glance')}           to="/owner/teams"  iconBg="#F5F3FF" />
            )}
            {show.accessControl && (
              <MgmtCard icon={Shield} title={t('Access Control')} sub={t('Manage role defaults, staff roles, and individual permissions')} to="/management/access" iconBg="#F5F3FF" />
            )}
          </Section>
        )}

        {show.packageRequests && (
          <Section title={t('Accounting')} sub={t('Financial management tools')}>
            <MgmtCard icon={Mail} title={t('Package Requests')} sub={t('Pending package approvals')}    to="/accounting/package-requests" iconBg="#F0FDF4" />
          </Section>
        )}

        {show.quickTransfer && (
          <Section title={t('Members')} sub={t('Member management tools')}>
            <MgmtCard icon={RefreshCw} title={t('Quick Transfer')} sub={t('Transfer a member to a sales rep or coach')} to="/management/quick-transfer" iconBg="#F0F9FF" />
          </Section>
        )}

      </div>
    </Layout>
  );
}
