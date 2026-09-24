import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className="theme-control inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200"
    aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
    onClick={() => { applyTheme(next); setTheme(next); }}>
    {theme === 'dark' ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
    <span>{next === 'light' ? 'Light' : 'Dark'}</span>
  </button>;
}
