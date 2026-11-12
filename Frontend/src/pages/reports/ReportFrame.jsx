import { AlertTriangle } from 'lucide-react';
import Layout from '../../components/Layout';
import { PageHeader, Spinner, EmptyState } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';

export default function ReportFrame({ title, definition, windowLabel, loading, error, toolbar, children, walkthrough = 'report' }) {
  usePageTitle(title);
  return (
    <Layout>
      <PageHeader walkthrough={`${walkthrough}-header`} title={title}>
        {windowLabel ? <span style={{ fontSize: 12, color: 'var(--t4)' }}>{windowLabel}</span> : null}
      </PageHeader>
      <div className="page-wrap" data-walkthrough={`${walkthrough}-body`} style={{ paddingTop: 20, paddingBottom: 40 }}>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, maxWidth: 760, lineHeight: 1.5 }}>
          {definition}
        </p>
        {toolbar}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} message={error} />
        ) : children}
      </div>
    </Layout>
  );
}
