import { useEffect, useState } from 'react';
import { reportError } from './analyticsFormat';

export default function useAnalyticsReport(load) {
  const [state, setState] = useState({ data: null, error: '', request: null });

  useEffect(() => {
    let cancelled = false;
    load()
      .then((res) => {
        if (!cancelled) setState({ data: res.data, error: '', request: load });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, error: reportError(err), request: load });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loading = state.request !== load;
  return {
    data: loading ? null : state.data,
    loading,
    error: loading ? '' : state.error,
  };
}
