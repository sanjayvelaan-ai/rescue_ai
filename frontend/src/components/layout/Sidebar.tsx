import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Eye,
  Map,
  Plane,
  ListTodo,
  Bell,
  Users,
  Package,
  BarChart3,
  Settings
} from 'lucide-react';

const navItems = [
  { path: '/', label: '1. Command Center', icon: LayoutDashboard },
  { path: '/live-mission', label: '2. Live Mission', icon: Radio },
  { path: '/ai-detection', label: '3. AI Detection', icon: Eye },
  { path: '/disaster-map', label: '4. Disaster Map', icon: Map },
  { path: '/drone-fleet', label: '5. Drone Fleet', icon: Plane },
  { path: '/missions', label: '6. Missions', icon: ListTodo },
  { path: '/alerts', label: '7. Alert Center', icon: Bell },
  { path: '/rescue-ops', label: '8. Rescue Operations', icon: Users },
  { path: '/emergency-payload', label: '9. Emergency Payload', icon: Package },
  { path: '/analytics', label: '10. Analytics', icon: BarChart3 },
  { path: '/settings', label: '11. Settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="app-sidebar w-16 xl:w-64 border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-full sticky top-0 z-40 font-mono select-none">
      <div className="flex flex-col min-h-0 flex-1">
        {/* Logo / Header */}
        <div className="p-3 xl:p-4 shrink-0 border-b border-slate-800/80 flex items-center gap-3 bg-slate-900/40">
          <img src="/rescue-ai-logo.png" alt="Rescue AI — Smarter Response, Safer Tomorrows" className="brand-logo w-10 xl:w-full h-12 xl:h-36 object-contain" />
        </div>

        {/* Navigation Items */}
        <nav aria-label="Main navigation" className="p-2 xl:p-3 space-y-1 overflow-y-auto min-h-0 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-b from-zinc-800 to-zinc-950 text-white border border-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer System Version */}
      <div className="shrink-0 p-3 border-t border-slate-800/80 bg-slate-900/30 text-[10px] text-slate-500 flex items-center justify-between">
        <span className="hidden xl:inline">V1.0 HACKATHON PROT</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>
    </aside>
  );
};
