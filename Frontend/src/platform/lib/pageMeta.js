import { createContext, useContext, useEffect } from "react";

export const PageMetaContext = createContext({
  detailLabel: null,
  setDetailLabel: () => {},
});

export function usePageMeta() {
  return useContext(PageMetaContext);
}

export function useDetailCrumb(label) {
  const { setDetailLabel } = usePageMeta();

  useEffect(() => {
    // The shell breadcrumb sits above the route, so the page publishes its title after it renders.
    setDetailLabel(label || null);
    return () => setDetailLabel(null);
  }, [label, setDetailLabel]);
}
