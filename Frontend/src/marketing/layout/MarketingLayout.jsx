import { useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { appOrigin, SALES_MAILTO } from "../host";
import { useMarketingTheme } from "../hooks/useMarketingTheme";
import { gsap, ScrollTrigger, useGSAP, registerMarketingGsap } from "../gsap/register";
import "../styles/marketing.css";

registerMarketingGsap();

function ThemeIcon({ theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.5V3M12 21v-1.5M4.5 12H3M21 12h-1.5M6.4 6.4 5.3 5.3M18.7 18.7l-1.1-1.1M6.4 17.6l-1.1 1.1M18.7 5.3l-1.1 1.1"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 13.4A7.6 7.6 0 0 1 10.6 3.8 7.8 7.8 0 1 0 20.2 13.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getFocusable(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export default function MarketingLayout() {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useMarketingTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const navRef = useRef(null);
  const drawerRef = useRef(null);
  const toggleRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [pathname]);

  useEffect(() => {
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [theme]);

  // Mobile drawer: Escape, focus first link, trap Tab, restore focus on close
  useEffect(() => {
    if (!menuOpen) return;

    const drawer = drawerRef.current;
    const toggle = toggleRef.current;
    const previouslyFocused = document.activeElement;

    const focusables = () => {
      const items = getFocusable(drawer);
      if (toggle) items.unshift(toggle);
      return items;
    };

    requestAnimationFrame(() => {
      const firstLink = drawer?.querySelector("a, button");
      firstLink?.focus();
    });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const restore = toggle || previouslyFocused;
      if (restore && typeof restore.focus === "function") {
        restore.focus();
      }
    };
  }, [menuOpen]);

  useGSAP(
    () => {
      const nav = navRef.current;
      if (!nav) return;
      const logo = nav.querySelector(".marketing-nav-logo-chip");
      const links = nav.querySelectorAll(".marketing-nav-desktop a");

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(logo, {
          opacity: 0,
          y: -10,
          duration: 0.5,
          ease: "power2.out",
          clearProps: "opacity,transform",
        });
        gsap.from(links, {
          opacity: 0,
          y: -8,
          duration: 0.4,
          stagger: 0.05,
          delay: 0.12,
          ease: "power2.out",
          clearProps: "opacity,transform",
        });
      });
      return () => mm.revert();
    },
    { scope: rootRef }
  );

  return (
    <div className="marketing-root" data-theme={theme} ref={rootRef}>
      <Helmet>
        <meta name="color-scheme" content="dark light" />
      </Helmet>

      <a className="marketing-skip-link" href="#main">
        Skip to content
      </a>

      <header
        className={`marketing-nav${scrolled ? " is-scrolled" : ""}${menuOpen ? " is-menu-open" : ""}`}
        ref={navRef}
      >
        <div className="marketing-shell marketing-nav-inner">
          <Link to="/" className="marketing-nav-logo" aria-label="Forma home">
            <span className="marketing-nav-logo-chip">
              <img src="/forma-horizontal.jpeg" alt="forma" />
            </span>
          </Link>

          <nav className="marketing-nav-links marketing-nav-desktop" aria-label="Primary">
            <Link to="/why-forma" className="marketing-nav-link">
              Why Forma?
            </Link>
            <Link to="/plans" className="marketing-nav-link">
              Plans
            </Link>
            <Link to="/get-started" className="marketing-nav-link">
              Get started
            </Link>
            <a className="marketing-nav-link" href={SALES_MAILTO}>
              Contact sales
            </a>
            <a className="marketing-nav-link" href={`${appOrigin()}/login`}>
              Staff login
            </a>
          </nav>

          <div className="marketing-nav-actions">
            <button
              type="button"
              className="marketing-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              <ThemeIcon theme={theme} />
            </button>

            <button
              type="button"
              ref={toggleRef}
              className={`marketing-nav-toggle${menuOpen ? " is-open" : ""}`}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="marketing-nav-toggle-bar" aria-hidden="true" />
              <span className="marketing-nav-toggle-bar" aria-hidden="true" />
              <span className="marketing-nav-toggle-bar" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          id={menuId}
          ref={drawerRef}
          className={`marketing-nav-drawer${menuOpen ? " is-open" : ""}`}
          hidden={!menuOpen}
        >
          <nav className="marketing-shell marketing-nav-drawer-links" aria-label="Mobile">
            <Link to="/why-forma" className="marketing-nav-drawer-link" onClick={() => setMenuOpen(false)}>
              Why Forma?
            </Link>
            <Link to="/plans" className="marketing-nav-drawer-link" onClick={() => setMenuOpen(false)}>
              Plans
            </Link>
            <Link
              to="/get-started"
              className="marketing-nav-drawer-link"
              onClick={() => setMenuOpen(false)}
            >
              Get started
            </Link>
            <a className="marketing-nav-drawer-link" href={SALES_MAILTO}>
              Contact sales
            </a>
            <a className="marketing-nav-drawer-link" href={`${appOrigin()}/login`}>
              Staff login
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="marketing-footer">
        <div className="marketing-shell marketing-footer-inner">
          <p>© {new Date().getFullYear()} Forma. Gym & fitness management.</p>
          <nav aria-label="Footer">
            <Link to="/why-forma">Why Forma?</Link>
            <Link to="/plans">Plans</Link>
            <Link to="/get-started">Get started</Link>
            <a href={SALES_MAILTO}>sales@forma-official.com</a>
            <a href={`${appOrigin()}/login`}>Staff login</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
