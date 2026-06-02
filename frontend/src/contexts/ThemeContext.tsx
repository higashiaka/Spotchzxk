import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

/** 지원하는 테마 타입 / Supported theme types */
export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  /** 현재 테마 / Current theme */
  theme: Theme;
  /** 테마 토글 함수 / Theme toggle function */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

/** 테마 프로바이더 컴포넌트.
 *  localStorage에서 초기값을 읽어 html 요소에 .light-mode 클래스를 토글하고
 *  변경을 localStorage에 저장
 *
 *  Theme provider component.
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

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/** useTheme 훅 — 현재 테마와 토글 함수를 반환
 *  useTheme hook — returns current theme and toggle function */
export const useTheme = () => useContext(ThemeContext);
