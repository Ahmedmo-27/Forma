import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  ClipboardList,
  Download,
  Flame,
  Magnet,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/ui';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { hasAccess } from '../lib/access';
import { useTenant } from '../context/TenantContext';

const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];

// ── Card ──────────────────────────────────────────────────────────────────────
function ReportCard({ icon: Icon, title, sub, to, iconBg = '#FEF2F2' }) {
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
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
  const { hasFeature } = useTenant();
  const isDataManager = ['Sales Manager', 'Owner'].includes(user?.role);
  const canSeeAnalytics = ANALYTICS_ROLES.includes(user?.role);

  return (
    <Layout>
      <PageHeader walkthrough="reports-header" title="Reports" />
      <div className="page-wrap" data-walkthrough="reports-board" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {canSeeAnalytics && (hasFeature('business_intelligence') || hasFeature('exec_analytics') || hasFeature('funnels')) && (
          <ReportSection title="Platinum" sub="Whole-gym figures from members, subscriptions, and check-ins">
            {hasFeature('business_intelligence') && (
              <ReportCard icon={TrendingUp} title="Executive Summary" sub="Active members, churn, forecast, and conversion" to="/reports/executive" iconBg="color-mix(in srgb, var(--navy) 8%, transparent)" />
            )}
            {hasFeature('exec_analytics') && (
              <>
                <ReportCard icon={TrendingDown} title="Churn" sub="Lapses, reactivations, and expiring coverage" to="/reports/churn" iconBg="#FEF2F2" />
                <ReportCard icon={Wallet} title="Revenue Forecast" sub="Collected revenue and a three-month average" to="/reports/forecast" iconBg="#F0FFF4" />
                <ReportCard icon={Calendar} title="Retention Cohorts" sub="Share of each joining month still covered" to="/reports/cohorts" iconBg="#F0FFF4" />
                <ReportCard icon={Flame} title="Attendance" sub="Check-ins by weekday and hour" to="/reports/attendance" iconBg="#FEF2F2" />
              </>
            )}
            {hasFeature('funnels') && (
              <ReportCard icon={Magnet} title="Conversion Funnel" sub="Lead to member, drop-off, and revenue by source" to="/reports/funnel" iconBg="color-mix(in srgb, var(--navy) 8%, transparent)" />
            )}
          </ReportSection>
        )}
        {hasAccess(user, 'reports') && (
          <ReportSection title="Members" sub="Member status and activity">
            <ReportCard icon={Users} title="Guest Members"   sub="Guest member list"            to="/reports/guests"  iconBg="#FEF2F2" />
            <ReportCard icon={Calendar} title="Members" sub="Member records"                       to="/reports/expired" iconBg="#FEF2F2" />
          </ReportSection>
        )}

        {/* ── Revenue & Performance ───────────────────────────── */}
        {hasAccess(user, 'targets') && (
          <ReportSection title="Revenue & Performance" sub="Targets and financial reports">
            <ReportCard icon={Target} title="Targets"       sub="Revenue targets & performance" to="/sales/targets"   iconBg="#F0FFF4" />
          </ReportSection>
        )}

        {/* ── Data — Sales Manager & Owner only ───────────────── */}
        {isDataManager && hasAccess(user, 'import_members') && (
          <ReportSection title="Data" sub="Import and manage bulk data">
            <ReportCard icon={Download} title="Import Members"   sub="Upload Excel sheet of names & numbers"  to="/sales/import"     iconBg="color-mix(in srgb, var(--navy) 8%, transparent)" />
            <ReportCard icon={ClipboardList} title="Imported Members" sub="View all members added via Excel import" to="/reports/imported" iconBg="color-mix(in srgb, var(--navy) 8%, transparent)" />
          </ReportSection>
        )}

      </div>
    </Layout>
  );
}
