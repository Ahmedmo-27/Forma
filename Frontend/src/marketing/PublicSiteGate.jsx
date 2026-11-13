import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { fetchSiteConfig } from "./api";
import ComingSoonPage from "./pages/ComingSoonPage";
import { MarketingI18nProvider } from "./i18n";
import { MarketingBootScreen } from "./components/MarketingSkeleton";

/**
 * When public_site.published is false, only platform super_admin (preview cookie / token) may view marketing.
 */
export default function PublicSiteGate() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-site-config"],
    queryFn: fetchSiteConfig,
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return <MarketingBootScreen />;
  }

  if (isError) {
    return (
      <MarketingI18nProvider>
        <ComingSoonPage message="We could not verify public site availability. Please try again shortly." />
      </MarketingI18nProvider>
    );
  }

  if (!data?.allowAccess) {
    return (
      <MarketingI18nProvider>
        <ComingSoonPage message={data?.message} />
      </MarketingI18nProvider>
    );
  }

  return (
    <MarketingI18nProvider>
      {!data.published && data.canPreview ? (
        <div
          role="status"
          style={{
            background: "#1E3A5F",
            color: "#FCF3E2",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textAlign: "center",
            padding: "0.55rem 1rem",
            fontFamily: "Outfit, Geist, system-ui, sans-serif",
          }}
        >
          Preview mode — public site is under development (super admin only)
          {data.previewAs?.email ? ` · ${data.previewAs.email}` : ""}
        </div>
      ) : null}
      <Outlet />
    </MarketingI18nProvider>
  );
}
