import React, { createContext, useContext, useState, useEffect } from "react";

// Available themes
export const THEMES = {
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Classic dark theme with blue accents',
    isDark: true,
    preview: {
      bg: '#0f172a',
      accent: '#3b82f6',
      secondary: '#7c3aed'
    }
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon pink and cyan futuristic vibes',
    isDark: true,
    preview: {
      bg: '#0d0515',
      accent: '#ff4da6',
      secondary: '#00ffff'
    }
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights inspired greens and purples',
    isDark: true,
    preview: {
      bg: '#141b2d',
      accent: '#34d399',
      secondary: '#a855f7'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and red tones',
    isDark: true,
    preview: {
      bg: '#1a1008',
      accent: '#f97316',
      secondary: '#ef4444'
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep sea blues and teals',
    isDark: true,
    preview: {
      bg: '#042f2e',
      accent: '#14b8a6',
      secondary: '#3b82f6'
    }
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix',
    description: 'Classic green hacker aesthetic',
    isDark: true,
    preview: {
      bg: '#010a01',
      accent: '#00ff00',
      secondary: '#00cc66'
    }
  },
  neon: {
    id: 'neon',
    name: 'Neon Nights',
    description: 'Ultra vibrant neon with electric glows',
    isDark: true,
    preview: {
      bg: '#0a0014',
      accent: '#ff3399',
      secondary: '#00ffff'
    }
  },
  hologram: {
    id: 'hologram',
    name: 'Hologram',
    description: 'Translucent cyber holographic effect',
    isDark: true,
    preview: {
      bg: '#051419',
      accent: '#33ffaa',
      secondary: '#66d9ff'
    }
  },
  plasma: {
    id: 'plasma',
    name: 'Plasma',
    description: 'Hot plasma energy with dynamic flows',
    isDark: true,
    preview: {
      bg: '#140a1e',
      accent: '#ff9933',
      secondary: '#cc33ff'
    }
  },
  galaxy: {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Deep space with cosmic nebula colors',
    isDark: true,
    preview: {
      bg: '#0a0a1a',
      accent: '#cc66ff',
      secondary: '#3399ff'
    }
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    description: 'Ice blue crystalline elegance',
    isDark: true,
    preview: {
      bg: '#0a1520',
      accent: '#33ccff',
      secondary: '#6699ff'
    }
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Burning coal and fire aesthetic',
    isDark: true,
    preview: {
      bg: '#140a08',
      accent: '#ff6633',
      secondary: '#ff3333'
    }
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft purple light theme',
    isDark: false,
    preview: {
      bg: '#f8f5ff',
      accent: '#8b5cf6',
      secondary: '#ec4899'
    }
  },
  rosegold: {
    id: 'rosegold',
    name: 'Rose Gold',
    description: 'Elegant rose and gold tones',
    isDark: false,
    preview: {
      bg: '#fdf6f4',
      accent: '#e11d48',
      secondary: '#f59e0b'
    }
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Professional Discord-like dark theme',
    isDark: true,
    preview: {
      bg: '#313338',
      accent: '#5865f2',
      secondary: '#4752c4'
    }
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Discord-style midnight purple theme',
    isDark: true,
    preview: {
      bg: '#1a1a2e',
      accent: '#5865f2',
      secondary: '#9b59b6'
    }
  },
  onyx: {
    id: 'onyx',
    name: 'Onyx',
    description: 'True black AMOLED theme like Discord',
    isDark: true,
    preview: {
      bg: '#000000',
      accent: '#5865f2',
      secondary: '#4752c4'
    }
  }
} as const;

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
    return saved && THEMES[saved] ? saved : "midnight";
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
      setCurrentTheme("lavender"); // Switch to light
    } else {
      setCurrentTheme("midnight"); // Switch to dark
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