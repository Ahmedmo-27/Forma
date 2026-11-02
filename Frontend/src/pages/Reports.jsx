import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/ui';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';

// ── Single report card ────────────────────────────────────────────────────────
function ReportCard({ icon, title, sub, to, iconBg = '#FEF2F2' }) {
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

// ── Report section ────────────────────────────────────────────────────────────
function ReportSection({ title, sub, children }) {
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

// ── Reports page ──────────────────────────────────────────────────────────────
export default function Reports() {
  usePageTitle('Reports');
  const { user } = useAuth();
  const isDataManager = ['Sales Manager', 'Owner'].includes(user?.role);
  const isSales       = user?.role === 'Sales';
  const isManager     = ['Sales Manager', 'Owner'].includes(user?.role);

  return (
    <Layout>
      <PageHeader title="Reports" />
      <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {/* ── Members ─────────────────────────────────────────── */}
        <ReportSection title="Members" sub="Member status and activity">
          <ReportCard icon="👥" title="Guest Members"    sub="Guest member list"     to="/reports/guests"  iconBg="#FEF2F2" />
          <ReportCard icon="📅" title="Expired Members"  sub="Expired memberships"   to="/reports/expired" iconBg="#FEF2F2" />
        </ReportSection>

        {/* ── Operations ──────────────────────────────────────── */}
        <ReportSection title="Operations" sub="Requests, transfers and configuration">
          {(isSales || isManager) && (
            <ReportCard icon="📋" title="Requests"    sub="Package assignment requests"      to="/sales/requests"           iconBg="#F0F9FF" />
          )}
          {isManager && (
            <ReportCard icon="🔄" title="Transfer"    sub="Transfer members between reps"    to="/sales/transfer"           iconBg="#F0F9FF" />
          )}
          {isManager && (
            <ReportCard icon="📦" title="Packages"    sub="Manage membership packages"       to="/sales/packages"           iconBg="#F0F9FF" />
          )}
          {isManager && (
            <ReportCard icon="💬" title="WA Messages" sub="WhatsApp message templates"       to="/sales/whatsapp-templates" iconBg="#F0FDF4" />
          )}
          {user?.role === 'Coach Manager' && (
            <ReportCard icon="💬" title="WA Messages" sub="WhatsApp message templates"       to="/coach/whatsapp-templates" iconBg="#F0FDF4" />
          )}
          {user?.role === 'Accountant' && (
            <ReportCard icon="💬" title="WA Messages" sub="WhatsApp message templates"       to="/sales/whatsapp-templates" iconBg="#F0FDF4" />
          )}
        </ReportSection>

        {/* ── Management — Team & Staff ────────────────────────── */}
        {(isManager || user?.role === 'Accountant' || user?.role === 'Coach Manager') && (
          <ReportSection title="Management" sub="Team members and staff accounts">
            {isManager && (
              <ReportCard icon="👥" title="Team"        sub="Sales team overview & stats"      to="/sales/team"   iconBg="#FFF7ED" />
            )}
            {isManager && (
              <ReportCard icon="🧑‍💼" title="Staff"   sub="Manage staff accounts"            to="/sales/staff"  iconBg="#FFF7ED" />
            )}
            {user?.role === 'Accountant' && (
              <ReportCard icon="👥" title="Team"        sub="Sales team overview"              to="/sales/team"   iconBg="#FFF7ED" />
            )}
            {user?.role === 'Coach Manager' && (
              <ReportCard icon="👥" title="Coach Team"  sub="Coach team overview & stats"      to="/coach/team"   iconBg="#FFF7ED" />
            )}
            {user?.role === 'Coach Manager' && (
              <ReportCard icon="🧑‍💼" title="Staff"   sub="Manage coach staff accounts"      to="/coach/staff"  iconBg="#FFF7ED" />
            )}
          </ReportSection>
        )}

        {/* ── Data — Sales Manager & Owner only ───────────────── */}
        {isDataManager && (
          <ReportSection title="Data" sub="Import and manage bulk data">
            <ReportCard icon="📥" title="Import Members"   sub="Upload Excel sheet of names & numbers"  to="/sales/import"     iconBg="rgba(68,41,140,0.08)" />
            <ReportCard icon="📋" title="Imported Members" sub="View all members added via Excel import" to="/reports/imported" iconBg="rgba(68,41,140,0.08)" />
          </ReportSection>
        )}

      </div>
    </Layout>
  );
}
