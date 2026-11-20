import { useState } from 'react';
import { reportError } from './analyticsFormat';
import useLocationEffect from '../../hooks/useLocationEffect';
import { useI18n } from '../../i18n/useI18n';

export default function useAnalyticsReport(load) {
  const { t } = useI18n();
  const [state, setState] = useState({ data: null, error: null, request: null });

  useLocationEffect(() => {
    let cancelled = false;
    load()
      .then((res) => {
        if (!cancelled) setState({ data: res.data, error: null, request: load });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, error: err, request: load });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loading = state.request !== load;
  return {
    data: loading ? null : state.data,
    loading,
    error: loading || !state.error ? '' : reportError(state.error, t),
  };
}
