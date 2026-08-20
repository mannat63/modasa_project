import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getTheme, toggleTheme, onThemeChange } from '../utils/theme';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);

  useEffect(() => onThemeChange(setThemeState), []);

  const isDark = theme === 'dark';
  return (
    <button
      className="icon-btn"
      onClick={() => setThemeState(toggleTheme())}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
