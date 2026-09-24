import {useState} from 'react';
import {DisasterMap} from '../map/DisasterMap';
import {CaptureStation} from '../components/CaptureStation';
import type {Survivor,Hazard,RescueTeam,DroneFleet} from '../types';

export function LiveMissionPage({survivors,hazards,teams,drone,onDispatchTeam}:{survivors:Survivor[];hazards:Hazard[];teams:RescueTeam[];drone?:DroneFleet;onDispatchTeam?:(s:Survivor,t:RescueTeam)=>void}){
  const [selected,setSelected]=useState<string>();
  const [query,setQuery]=useState(''),[status,setStatus]=useState('active');
  const records=survivors.filter(s=>(status==='all'||(status==='rescued'?s.status==='RESCUED':s.status!=='RESCUED'))&&`${s.survivor_id} ${s.priority} ${s.capture_source||''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-shell p-4 sm:p-6 space-y-5">
    <div><h1 className="text-lg font-bold">LIVE MISSION</h1><p className="text-xs text-slate-400">Capture on this device, review detections and inspect saved evidence.</p></div>
    <CaptureStation/>
    <div className="space-y-6">
      <div className="space-y-4 min-w-0"><div className="map-frame"><DisasterMap survivors={survivors} hazards={hazards} teams={teams} drone={drone} selectedSurvivorId={selected} onSelectSurvivor={s=>setSelected(s.survivor_id)} onDispatchTeam={onDispatchTeam}/></div></div>
      <section className="theme-card rounded-xl border border-slate-800 p-4 space-y-3 self-start">
        <h2 className="font-bold text-sm">DETECTION REVIEW QUEUE</h2>
        <input aria-label="Search mission detections" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ID, source or priority" className="w-full rounded bg-slate-950 border border-slate-700 p-2 text-xs"/>
        <select aria-label="Mission detection status" value={status} onChange={e=>setStatus(e.target.value)} className="w-full rounded bg-slate-950 border border-slate-700 p-2 text-xs"><option value="active">Active detections</option><option value="rescued">Marked rescued</option><option value="all">All detections</option></select>
        <p className="text-xs text-slate-400">{records.length} records · Select to inspect its snapshot.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto">{records.map(s=><button key={s.survivor_id} aria-pressed={selected===s.survivor_id} onClick={()=>setSelected(s.survivor_id)} className={`w-full text-left p-3 rounded border text-xs space-y-1 ${selected===s.survivor_id?'border-cyan-500 bg-cyan-950':'border-slate-700 bg-slate-950'}`}><strong className="block break-all">{s.survivor_id}</strong><span className="block">{s.status} · {Math.round(s.model_confidence*100)}% · {s.priority}</span><span className="block text-slate-400">{new Date(s.first_detected||s.timestamp).toLocaleString()}</span></button>)}{!records.length&&<p className="text-xs text-slate-400">No detections match these filters.</p>}</div>

      </section>
    </div>
  </div>;
}
