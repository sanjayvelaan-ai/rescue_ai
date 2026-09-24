import {useState} from 'react';
import {DisasterMap} from '../map/DisasterMap';
import type {Survivor,Hazard,RescueTeam,DroneFleet} from '../types';
import {api} from '../services/api';

export function DisasterMapPage({survivors,hazards,teams,drone,onRefresh}:{survivors:Survivor[];hazards:Hazard[];teams:RescueTeam[];drone?:DroneFleet;onRefresh?:()=>void}){
  const [selected,setSelected]=useState<string>();
  const [message,setMessage]=useState('');
  const active=survivors.filter(s=>s.status!=='RESCUED');
  return <div className="page-shell p-4 sm:p-6 space-y-6">
    <header className="space-y-2"><h1 className="text-lg font-bold">LIVE DISASTER MAP</h1><p className="text-sm text-slate-400">Locate your capture device, select an individual survivor tag, and review the recommended rescue team.</p></header>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[['Active records',active.length],['Available teams',teams.filter(t=>['AVAILABLE','STANDBY'].includes(t.status)).length],['Marked rescued',survivors.length-active.length]].map(([label,value])=><section key={label} className="theme-card rounded-xl border border-slate-800 p-4"><p className="text-xs text-slate-400">{label}</p><strong className="block mt-2 text-2xl">{value}</strong></section>)}</div>
    {message&&<p role="status" className="rounded-lg border border-cyan-800 p-3 text-xs text-cyan-400">{message}</p>}
    <div className="map-frame"><DisasterMap survivors={survivors} hazards={hazards} teams={teams} drone={drone} selectedSurvivorId={selected} onSelectSurvivor={s=>setSelected(s.survivor_id)} onDispatchTeam={async(s,t)=>{await api.dispatchMission(s.mission_id||'M-101',s.survivor_id,t.team_id);setMessage(`${t.name} assigned to ${s.survivor_id}. Simulated rescue is underway.`);onRefresh?.();}} onAutonomousDetection={result=>{setSelected(result.survivor.survivor_id);onRefresh?.();}}/></div>
  </div>;
}
