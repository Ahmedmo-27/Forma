import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "forma-mkt-theme";

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  // Brand default is the navy stage; visitors can switch and we persist.
  return "dark";
}

/**
 * Public marketing theme: "dark" (navy stage) or "light" (cream stage).
 * Defaults to dark; persists the visitor's choice in localStorage.
 */
export function useMarketingTheme() {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === "light" ? "light" : "dark";
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
