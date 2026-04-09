"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export const THEMES = [
  "slate",
  "nord",
  "tokyo-night",
  "monokai",
  "simple-dark",
  "simple-light",
] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  slate: "Slate",
  nord: "Nord",
  "tokyo-night": "Tokyo Night",
  monokai: "Monokai",
  "simple-dark": "Simple Dark",
  "simple-light": "Simple Light",
};

export const THEME_SWATCHES: Record<
  Theme,
  { bg: string; surface: string; accent: string; text: string }
> = {
  slate: { bg: "#0f172a", surface: "#1e293b", accent: "#2563eb", text: "#ffffff" },
  nord: { bg: "#2e3440", surface: "#3b4252", accent: "#5e81ac", text: "#eceff4" },
  "tokyo-night": { bg: "#1a1b2e", surface: "#16213e", accent: "#ff007c", text: "#c0caf5" },
  monokai: { bg: "#272822", surface: "#3e3d32", accent: "#f92672", text: "#f8f8f2" },
  "simple-dark": { bg: "#000000", surface: "#111111", accent: "#555555", text: "#ffffff" },
  "simple-light": { bg: "#ffffff", surface: "#f4f4f5", accent: "#3b82f6", text: "#0f172a" },
};

const STORAGE_KEY = "lockhub-theme";

function applyTheme(theme: Theme) {
  if (theme === "slate") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "slate",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("slate");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved && (THEMES as readonly string[]).includes(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(saved);
      applyTheme(saved);
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
