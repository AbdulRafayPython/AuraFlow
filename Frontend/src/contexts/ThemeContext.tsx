import React, { createContext, useContext, useState, useEffect } from "react";

// Available themes. All share one accent and flat surfaces (styles/themes.css).
export const THEMES = {
  aura: {
    id: 'aura',
    name: 'Aura Dark',
    description: 'Neutral dark, one indigo accent (default)',
    isDark: true,
    preview: {
      bg: '#171819',
      accent: '#5a5fe0',
      secondary: '#5a5fe0'
    }
  },
  'aura-light': {
    id: 'aura-light',
    name: 'Aura Light',
    description: 'Neutral light, same accent',
    isDark: false,
    preview: {
      bg: '#ffffff',
      accent: '#4b4fd1',
      secondary: '#4b4fd1'
    }
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Flat Discord-style dark',
    isDark: true,
    preview: {
      bg: '#313338',
      accent: '#5865f2',
      secondary: '#5865f2'
    }
  },
  onyx: {
    id: 'onyx',
    name: 'Onyx',
    description: 'True black for OLED screens',
    isDark: true,
    preview: {
      bg: '#000000',
      accent: '#5a5fe0',
      secondary: '#5a5fe0'
    }
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Black and white light theme',
    isDark: false,
    preview: {
      bg: '#ffffff',
      accent: '#141414',
      secondary: '#141414'
    }
  }
} as const;

const DEFAULT_THEME: ThemeId = 'aura';
const DEFAULT_LIGHT_THEME: ThemeId = 'aura-light';

export type ThemeId = keyof typeof THEMES;

interface ThemeContextType {
  isDarkMode: boolean;
  currentTheme: ThemeId;
  setTheme: (themeId: ThemeId) => void;
  toggleTheme: () => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem("auraflow-theme") as ThemeId | null;
    return saved && THEMES[saved] ? saved : DEFAULT_THEME;
  });

  const isDarkMode = THEMES[currentTheme].isDark;

  useEffect(() => {
    // Update localStorage
    localStorage.setItem("auraflow-theme", currentTheme);
    
    // Apply theme attribute to document root
    const root = document.documentElement;
    root.setAttribute('data-theme', currentTheme);
    
    // Also apply dark class for tailwind compatibility
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [currentTheme, isDarkMode]);

  const setTheme = (themeId: ThemeId) => {
    if (THEMES[themeId]) {
      setCurrentTheme(themeId);
    }
  };

  const toggleTheme = () => {
    // Toggle between dark and light themes
    if (isDarkMode) {
      setCurrentTheme(DEFAULT_LIGHT_THEME); // Switch to light
    } else {
      setCurrentTheme(DEFAULT_THEME); // Switch to dark
    }
  };

  return (
    <ThemeContext.Provider value={{ 
      isDarkMode, 
      currentTheme, 
      setTheme, 
      toggleTheme,
      themes: THEMES 
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}