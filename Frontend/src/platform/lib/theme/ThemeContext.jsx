import { createContext, useContext, useState, useEffect, useCallback } from "react";

const PlatformThemeContext = createContext(null);

const STORAGE_KEY_THEME = "platform_theme";
const STORAGE_KEY_DENSITY = "platform_density";

export function PlatformThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_THEME) || "system";
  });

  const [density, setDensityState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_DENSITY) || "comfortable";
  });

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (theme === "dark") return "dark";
    if (theme === "light") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // Handle system color scheme change
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      if (theme === "system") {
        setResolvedTheme(mediaQuery.matches ? "dark" : "light");
      }
    };

    if (theme === "system") {
      setResolvedTheme(mediaQuery.matches ? "dark" : "light");
    } else {
      setResolvedTheme(theme);
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // Synchronize with DOM attributes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-platform-theme", resolvedTheme);
    root.setAttribute("data-platform-density", density);
  }, [resolvedTheme, density]);

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY_THEME, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  const setDensity = useCallback((newDensity) => {
    setDensityState(newDensity);
    localStorage.setItem(STORAGE_KEY_DENSITY, newDensity);
  }, []);

  const toggleDensity = useCallback(() => {
    const next = density === "comfortable" ? "compact" : "comfortable";
    setDensity(next);
  }, [density, setDensity]);

  const value = {
    theme,
    resolvedTheme,
    density,
    setTheme,
    toggleTheme,
    setDensity,
    toggleDensity,
  };

  return (
    <PlatformThemeContext.Provider value={value}>
      <div
        className="platform-root"
        data-platform-theme={resolvedTheme}
        data-platform-density={density}
      >
        {children}
      </div>
    </PlatformThemeContext.Provider>
  );
}

export function usePlatformTheme() {
  const ctx = useContext(PlatformThemeContext);
  if (!ctx) {
    throw new Error("usePlatformTheme must be used within a PlatformThemeProvider");
  }
  return ctx;
}
