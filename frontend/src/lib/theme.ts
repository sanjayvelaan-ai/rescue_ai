export type Theme = 'light' | 'dark';
const storageKey = 'rescue-ai-theme';

export function readTheme(): Theme {
  try { return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(storageKey, theme); } catch { /* Storage may be disabled. */ }
}
