import { AlertTriangle } from 'lucide-react';
import Layout from '../../components/Layout';
import { PageHeader, Spinner, EmptyState } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { ALL_LOCATIONS, useLocationScope } from '../../context/LocationContext';
import { useI18n } from '../../i18n/useI18n';

export default function ReportFrame({ title, definition, windowLabel, loading, error, toolbar, children, walkthrough = 'report' }) {
  const { t } = useI18n();
  usePageTitle(title);
  const { multiEnabled, selectedLocationId, selectedLocation } = useLocationScope();
  const branchLabel = !multiEnabled || selectedLocationId === ALL_LOCATIONS
    ? t('All locations')
    : (selectedLocation?.name || t('Selected branch'));
  return (
    <Layout>
      <PageHeader walkthrough={`${walkthrough}-header`} title={title}>
        {(multiEnabled || windowLabel) ? (
          <span style={{ fontSize: 12, color: 'var(--t4)', display: 'inline-flex', gap: 12 }}>
            {multiEnabled ? <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{branchLabel}</span> : null}
            {windowLabel ? <span dir="auto">{windowLabel}</span> : null}
          </span>
        ) : null}
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
