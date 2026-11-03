import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/ui';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';

// ── Card ──────────────────────────────────────────────────────────────────────
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
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#44298C'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(68,41,140,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
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

// ── Section ───────────────────────────────────────────────────────────────────
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

// ── Management page ───────────────────────────────────────────────────────────
export default function Management() {
  usePageTitle('Management');
  const { user } = useAuth();

  const isSales       = user?.role === 'Sales';
  const isManager     = ['Sales Manager', 'Owner'].includes(user?.role);
  const isAccountant  = user?.role === 'Accountant';
  const isCoachMgr    = user?.role === 'Coach Manager';

  return (
    <Layout>
      <PageHeader title="Management" />
      <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {/* ── Operations ──────────────────────────────────────── */}
        <Section title="Operations" sub="Requests, transfers and configuration">
          {(isSales || isManager) && (
            <MgmtCard icon="📋" title="Requests"     sub="Package assignment requests"       to="/sales/requests"           iconBg="#F0F9FF" />
          )}
          {isManager && (
            <MgmtCard icon="🔄" title="Transfer"     sub="Transfer members between reps"     to="/sales/transfer"           iconBg="#F0F9FF" />
          )}
          {isManager && (
            <MgmtCard icon="📦" title="Packages"     sub="Manage membership packages"        to="/sales/packages"           iconBg="#F0F9FF" />
          )}
          {(isManager || isAccountant) && (
            <MgmtCard icon="🎯" title="Targets"      sub="Revenue targets & performance"     to="/sales/targets"            iconBg="#F0F9FF" />
          )}
          {(isManager || isAccountant || isCoachMgr) && (
            <MgmtCard icon="💬" title="WA Messages"  sub="WhatsApp message templates"
              to={isCoachMgr ? '/coach/whatsapp-templates' : '/sales/whatsapp-templates'}
              iconBg="#F0FDF4" />
          )}
        </Section>

        {/* ── Team & Staff ─────────────────────────────────────── */}
        {(isManager || isAccountant || isCoachMgr) && (
          <Section title="Team & Staff" sub="Team members and staff accounts">
            {isManager && (
              <MgmtCard icon="👥" title="Sales Team"   sub="Sales team overview & stats"       to="/sales/team"   iconBg="#FFF7ED" />
            )}
            {isManager && (
              <MgmtCard icon="🧑‍💼" title="Staff"    sub="Manage staff accounts"             to="/sales/staff"  iconBg="#FFF7ED" />
            )}
            {(isManager || isAccountant) && (
              <MgmtCard icon="📊" title="Revenue"      sub="Sales revenue & contracts"         to="/accounting/contract-history" iconBg="#FFF7ED" />
            )}
            {isCoachMgr && (
              <MgmtCard icon="👥" title="Coach Team"   sub="Coach team overview & stats"       to="/coach/team"   iconBg="#FFF7ED" />
            )}
            {isCoachMgr && (
              <MgmtCard icon="🧑‍💼" title="Staff"    sub="Manage coach staff accounts"       to="/coach/staff"  iconBg="#FFF7ED" />
            )}
            {isCoachMgr && (
              <MgmtCard icon="🔄" title="Transfers"    sub="Coach member transfers log"        to="/coach/my-transfers" iconBg="#FFF7ED" />
            )}
          </Section>
        )}

        {/* ── Owner extras ─────────────────────────────────────── */}
        {user?.role === 'Owner' && (
          <Section title="Admin" sub="Owner-only management tools">
            <MgmtCard icon="🏢" title="Teams Overview"  sub="All teams at a glance"            to="/owner/teams"  iconBg="#F5F3FF" />
            <MgmtCard icon="📜" title="Contracts"        sub="All contract history"             to="/accounting/contract-history" iconBg="#F5F3FF" />
          </Section>
        )}

        {/* ── Accountant extras ────────────────────────────────── */}
        {isAccountant && (
          <Section title="Accounting" sub="Financial management tools">
            <MgmtCard icon="📨" title="Package Requests" sub="Pending package approvals"       to="/accounting/package-requests" iconBg="#F0FDF4" />
            <MgmtCard icon="📜" title="Contract History" sub="All member contracts"            to="/accounting/contract-history" iconBg="#F0FDF4" />
          </Section>
        )}

      </div>
    </Layout>
  );
}
