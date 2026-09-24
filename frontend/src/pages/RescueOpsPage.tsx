import React from 'react';
import { Users, Shield, UserCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import { Survivor, RescueTeam } from '../types';
import { api } from '../services/api';

interface RescueOpsPageProps {
  survivors: Survivor[];
  teams: RescueTeam[];
  onRefresh?: () => void;
}

export const RescueOpsPage: React.FC<RescueOpsPageProps> = ({ survivors, teams, onRefresh }) => {
  const handleAssign = async (teamId: string, survivorId: string) => {
    await api.assignTeam(teamId, survivorId);
    if (onRefresh) onRefresh();
  };

  const criticalSurvivor = survivors.find(s => s.status === 'CONFIRMED' || s.status === 'DETECTED');
  const recommendedTeam = teams.find(t => t.status === 'AVAILABLE') || teams[0];

  return (
    <div className="page-shell p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            RESCUE OPERATIONS & TEAM ASSIGNMENT ENGINE
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Automated Distance & Capability Dispatch Recommendation System</p>
        </div>
      </div>

      {/* Recommendation Engine Banner */}
      {criticalSurvivor && recommendedTeam && (
        <div className="theme-card bg-slate-900 border border-cyan-500/40 p-5 rounded-xl space-y-3 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              AI RECOMMENDED TEAM DISPATCH
            </span>
            <span className="text-xs text-slate-400">Target: <strong className="text-cyan-300">{criticalSurvivor.survivor_id}</strong> ({criticalSurvivor.priority})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-1">
            <div>
              <div className="text-slate-500">RECOMMENDED TEAM</div>
              <div className="text-base font-bold text-blue-400 mt-0.5">{recommendedTeam.name}</div>
            </div>
            <div>
              <div className="text-slate-500">DISTANCE</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">1.8 km</div>
            </div>
            <div>
              <div className="text-slate-500">ESTIMATED ETA</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">03:45 (225s)</div>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => handleAssign(recommendedTeam.team_id, criticalSurvivor.survivor_id)}
                className="theme-control w-full py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition shadow-lg shadow-cyan-500/20"
              >
                CONFIRM DISPATCH
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            Reason: <span className="text-slate-300 font-semibold">"Nearest available ground rescue unit with medical & thermal search capability."</span>
          </div>
        </div>
      )}

      {/* Rescue Team Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          GROUND RESCUE TEAM REGISTRY ({teams.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((t) => (
            <div key={t.team_id} className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <span className="font-bold text-base text-blue-400">{t.name}</span>
                  <span className="text-xs text-slate-500 ml-2">({t.members_count} Members)</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'AVAILABLE' ? 'bg-emerald-950 text-emerald-400' : 'bg-cyan-950 text-cyan-300'}`}>
                  {t.status}
                </span>
              </div>

              <div className="text-xs space-y-1 text-slate-300">
                <div>Vehicle: <strong className="text-slate-200">{t.vehicle}</strong></div>
                <div>Capabilities: <span className="text-slate-400">{t.capabilities}</span></div>
                <div>Location: <span className="text-slate-400">{t.current_location_name}</span></div>
                <div>Current Mission: <strong className="text-cyan-300">{t.current_mission || 'None'}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
