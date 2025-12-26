"use client"

import React, { createContext, useState, useContext, useEffect } from 'react';

// Define available themes
type ThemeType = 'theme-minimal';

// Define the context shape
interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

// Create context with default values
const ThemeContext = createContext<ThemeContextType>({
  theme: 'theme-minimal',
  setTheme: () => { },
});

// Custom hook for using the theme
export const useTheme = () => useContext(ThemeContext);

// Provider component
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with default theme - handle SSR case
  const [theme, setTheme] = useState<ThemeType>('theme-minimal');

  // Sync with localStorage when component mounts (client-side only)
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeType;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Update document body class and localStorage when theme changes
  useEffect(() => {
    if (theme) {
      document.body.className = theme;
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
