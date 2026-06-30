import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

/** Supported theme types */
export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  /** Current theme */
  theme: Theme;
  /** Theme toggle function */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

/** Theme provider component.
 *  Reads initial value from localStorage, toggles .light-mode on the html element,
 *  and persists changes to localStorage */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('spotchzxk-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.add('light-mode');
    } else {
      html.classList.remove('light-mode');
    }
    localStorage.setItem('spotchzxk-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/** useTheme hook — returns current theme and toggle function */
export const useTheme = () => useContext(ThemeContext);
