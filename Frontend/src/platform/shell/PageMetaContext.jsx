import { useMemo, useState } from "react";
import { PageMetaContext } from "../lib/pageMeta";

export function PageMetaProvider({ children }) {
  const [detailLabel, setDetailLabel] = useState(null);
  const value = useMemo(() => ({ detailLabel, setDetailLabel }), [detailLabel]);

  return <PageMetaContext.Provider value={value}>{children}</PageMetaContext.Provider>;
}
