"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type OmTheme = "light" | "dark";

const STORAGE_KEY = "om-theme";

function readDomTheme(): OmTheme {
  if (typeof document === "undefined") return "light";
  const a = document.documentElement.getAttribute("data-theme");
  return a === "dark" ? "dark" : "light";
}

function applyDomTheme(theme: OmTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

type ThemeContextValue = {
  theme: OmTheme;
  setTheme: (theme: OmTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Match SSR (always light); boot script + useLayoutEffect align client before paint.
  const [theme, setThemeState] = useState<OmTheme>("light");

  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial: OmTheme =
        stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
      setThemeState(initial);
      applyDomTheme(initial);
      if (stored !== "light" && stored !== "dark") {
        localStorage.setItem(STORAGE_KEY, initial);
      }
    } catch {
      const dom = readDomTheme();
      setThemeState(dom);
      applyDomTheme(dom);
    }
  }, []);

  const setTheme = useCallback((next: OmTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDomTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyDomTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
