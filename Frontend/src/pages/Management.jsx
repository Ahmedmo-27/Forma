import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/ui';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { hasAccess } from '../lib/access';

function MgmtCard({ icon, title, sub, to, iconBg = '#F0F9FF' }) {
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
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--t3)' }}>{sub}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
  usePageTitle('Management');
  const { user } = useAuth();

  const allow = (key) => hasAccess(user, key);
  const show = {
    requests: allow(['approve_requests', 'request_assignment', 'request_takeover']),
    packages: allow('packages'),
    whatsapp: allow('whatsapp_templates'),
    salesTeam: allow('sales_team'),
    staff: allow('staff'),
    contracts: allow('contracts'),
    coachTeam: allow('coach_team'),
    coachStaff: allow('coach_staff'),
    coachTransfers: user?.role === 'Coach Manager' && allow('my_transfers'),
    teams: allow('teams_overview'),
    accessControl: allow('access_control'),
    packageRequests: allow('package_approvals'),
    quickTransfer: allow('transfer') || allow('coach_transfer'),
  };

  return (
    <Layout>
      <PageHeader walkthrough="management-header" title="Management" />
      <div className="page-wrap" data-walkthrough="management-board" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {/* ── Operations ──────────────────────────────────────── */}
        {(show.requests || show.packages || show.whatsapp) && (
          <Section title="Operations" sub="Requests, packages and templates">
            {show.requests && (
              <MgmtCard icon="📋" title="Requests"    sub="Package assignment requests"      to="/sales/requests"           iconBg="#F0F9FF" />
            )}
            {show.packages && (
              <MgmtCard icon="📦" title="Packages"    sub="Manage membership packages"       to="/sales/packages"           iconBg="#F0F9FF" />
            )}
            {show.whatsapp && (
              <MgmtCard icon="💬" title="WA Messages" sub="WhatsApp message templates"
                to={user?.role === 'Coach Manager' ? '/coach/whatsapp-templates' : '/sales/whatsapp-templates'}
                iconBg="#F0FDF4" />
            )}
          </Section>
        )}

        {(show.salesTeam || show.staff || show.contracts || show.coachTeam || show.coachStaff || show.coachTransfers) && (
          <Section title="Team & Staff" sub="Team members and staff accounts">
            {show.salesTeam && (
              <MgmtCard icon="👥" title="Sales Team"  sub="Sales team overview & stats"      to="/sales/team"   iconBg="#FFF7ED" />
            )}
            {show.staff && (
              <MgmtCard icon="🧑‍💼" title="Create Staff Account" sub="Create a new staff account" to="/sales/staff" iconBg="#FFF7ED" />
            )}
            {show.contracts && (
              <MgmtCard icon="📜" title="Contracts"   sub="All member contracts"             to="/accounting/contract-history" iconBg="#FFF7ED" />
            )}
            {show.coachTeam && (
              <MgmtCard icon="👥" title="Coach Team"  sub="Coach team overview & stats"      to="/coach/team"   iconBg="#FFF7ED" />
            )}
            {show.coachStaff && (
              <MgmtCard icon="🧑‍💼" title="Create Coach Account" sub="Create a new coach account" to="/coach/staff" iconBg="#FFF7ED" />
            )}
            {show.coachTransfers && (
              <MgmtCard icon="🔄" title="Transfers"   sub="Coach member transfers log"       to="/coach/my-transfers" iconBg="#FFF7ED" />
            )}
          </Section>
        )}

        {(show.teams || show.accessControl) && (
          <Section title="Admin" sub={user?.role === 'Owner' ? 'Owner tools and staff access' : 'Staff access for your team'}>
            {show.teams && (
              <MgmtCard icon="🏢" title="Teams Overview" sub="All teams at a glance"           to="/owner/teams"  iconBg="#F5F3FF" />
            )}
            {show.accessControl && (
              <MgmtCard icon="🛡️" title="Access Control" sub="Manage role defaults, staff roles, and individual permissions" to="/management/access" iconBg="#F5F3FF" />
            )}
          </Section>
        )}

        {show.packageRequests && (
          <Section title="Accounting" sub="Financial management tools">
            <MgmtCard icon="📨" title="Package Requests" sub="Pending package approvals"    to="/accounting/package-requests" iconBg="#F0FDF4" />
          </Section>
        )}

        {show.quickTransfer && (
          <Section title="Members" sub="Member management tools">
            <MgmtCard icon="🔄" title="Quick Transfer" sub="Transfer a member to a sales rep or coach" to="/management/quick-transfer" iconBg="#F0F9FF" />
          </Section>
        )}

      </div>
    </Layout>
  );
}
