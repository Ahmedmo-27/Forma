import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { fetchSiteConfig } from "./api";
import ComingSoonPage from "./pages/ComingSoonPage";

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
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#142843", color: "#FCF3E2", fontFamily: "Outfit, Geist, system-ui, sans-serif" }}
      >
        Loading Forma…
      </div>
    );
  }

  if (isError) {
    return (
      <ComingSoonPage message="We could not verify public site availability. Please try again shortly." />
    );
  }

  if (!data?.allowAccess) {
    return <ComingSoonPage message={data?.message} />;
  }

  return (
    <>
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
    </>
  );
}
