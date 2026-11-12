import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { appOrigin } from "./host";

/** Hard-navigate staff/unknown paths from www → app host. */
export default function RedirectToApp() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    const target = `${appOrigin()}${pathname}${search}${hash}`;
    window.location.replace(target);
  }, [pathname, search, hash]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#142843", color: "#FCF3E2", fontFamily: "Outfit, Geist, system-ui, sans-serif" }}
    >
      Opening the staff app…
    </div>
  );
}
