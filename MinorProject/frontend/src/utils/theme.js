/**
 * Theme controller — premium light/dark with persistence.
 * Applies data-theme on <html> and broadcasts changes so all
 * mounted components (and the map) can react.
 */
const KEY = 'waste-theme';
const EVENT = 'waste-theme-changed';

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  // Default to the OS preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme } }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Subscribe to theme changes. Returns an unsubscribe fn. */
export function onThemeChange(cb) {
  const handler = (e) => cb(e.detail?.theme || getTheme());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Call once at boot (before React renders) to avoid a flash. */
export function initTheme() {
  applyTheme(getTheme());
}
