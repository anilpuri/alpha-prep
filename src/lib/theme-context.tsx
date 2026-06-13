import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { THEMES, DEFAULT_THEME, THEME_META, type Theme, type ThemeName } from "./theme";
import { saveUserTheme, loadUserTheme } from "./db";

interface ThemeCtx {
  theme: Theme;
  themeName: ThemeName;
  isDark: boolean;
  setTheme: (name: ThemeName) => void;
  // Legacy aliases
  dark: boolean;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: THEMES[DEFAULT_THEME],
  themeName: DEFAULT_THEME,
  isDark: false,
  setTheme: () => {},
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [uid, setUid] = useState<string | null>(null);

  // Listen for auth state and load persisted theme
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUid(firebaseUser.uid);
        try {
          const saved = await loadUserTheme(firebaseUser.uid);
          if (saved && saved in THEMES) {
            setThemeName(saved as ThemeName);
          }
        } catch {
          // Ignore load errors — keep current theme
        }
      } else {
        setUid(null);
      }
    });
    return () => unsub();
  }, []);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    if (uid) {
      saveUserTheme(uid, name).catch(() => {});
    }
  };

  const theme  = THEMES[themeName];
  const isDark = THEME_META[themeName].isDark;

  // Legacy toggle: switch between indigo (default) and midnight (best dark)
  const toggle = () => {
    setTheme(isDark ? "indigo" : "midnight");
  };

  return (
    <Ctx.Provider value={{ theme, themeName, isDark, setTheme, dark: isDark, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
