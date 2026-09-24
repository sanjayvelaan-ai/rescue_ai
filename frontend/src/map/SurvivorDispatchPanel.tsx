import {useState} from 'react';
import type {Survivor} from '../types';
import {resolveSnapshotUrl} from '../services/api';

export type TeamRecommendation={team_id:string;name:string;vehicle:string;distance_m:number;eta_seconds:number;hazard_penalty_applied:boolean;waypoints:[number,number][]};
export function SurvivorDispatchPanel({survivor,team,loading,error,busy,onDispatch,onRefresh,onMarkRescued}:{
  survivor:Survivor;team:TeamRecommendation|null;loading:boolean;error:string;busy:boolean;
  onDispatch?:()=>void;onRefresh:()=>void;onMarkRescued?:()=>void;
}){
  const [mode,setMode]=useState<'rgb'|'thermal'>('rgb');
  const path=mode==='rgb'?survivor.detection_frame_path:survivor.thermal_frame_path;
  const located=survivor.location_source!=='UNLOCATED';
  const available=['DETECTED','CONFIRMED'].includes(survivor.status);
  const fallback=resolveSnapshotUrl(undefined);
  return <section aria-label={`Map snapshot and dispatch ${survivor.survivor_id}`} className="space-y-4 text-xs min-w-0">
    <strong className="block break-all">{survivor.survivor_id} · {survivor.status}</strong>
    <div className="flex flex-wrap gap-2"><button className="map-toolbar-button" aria-pressed={mode==='rgb'} onClick={()=>setMode('rgb')}>RGB snapshot</button><button className="map-toolbar-button" aria-pressed={mode==='thermal'} disabled={!survivor.thermal_frame_path} onClick={()=>setMode('thermal')}>Thermal view</button></div>
    <a href={resolveSnapshotUrl(path)} target="_blank" rel="noreferrer" aria-label="Open full survivor snapshot"><img key={path} src={resolveSnapshotUrl(path)} onError={e=>{if(e.currentTarget.src!==fallback)e.currentTarget.src=fallback;}} alt={`Map survivor snapshot ${survivor.survivor_id}`} className="w-full aspect-video max-h-64 object-contain rounded bg-black"/></a>
    {mode==='thermal'&&<p className="text-amber-400">RGB-derived colors; no temperature measurement.</p>}
    <p className="break-words">{located?`${survivor.latitude.toFixed(5)}, ${survivor.longitude.toFixed(5)} · ${survivor.location_source==='DEVICE_LOCATION'?'Camera position':survivor.location_source==='USER_PIN'?'Operator pin':'Simulation'}`:'Location unavailable — dispatch needs a verified position.'}{survivor.location_accuracy_m!=null&&` · ±${Math.round(survivor.location_accuracy_m)} m`}</p>
    {loading?<p role="status">Comparing available teams and routes…</p>:error?<p role="alert" className="text-red-500">{error}</p>:team?<div className="rounded border border-emerald-600 p-4 space-y-3">
      <strong className="block">Recommended: {team.name}</strong><span>{team.vehicle}</span>
      <p>{Math.round(team.distance_m)} m route · {Math.ceil(team.eta_seconds/60)} min estimated</p>
      <p>{team.hazard_penalty_applied?'Route still intersects a modeled hazard — review before dispatch.':'No modeled hazard overlap on the sampled route.'}</p>
      {available&&onDispatch&&<button className="map-popup-action w-full" disabled={busy||loading} onClick={onDispatch}>{busy?'Dispatching…':`Simulate dispatch · ${team.name}`}</button>}
    </div>:located&&available?<p>No available rescue team.</p>:<p>{survivor.assigned_team?`Assigned: ${survivor.assigned_team}`:'This record does not need a new dispatch.'}</p>}
    {located&&available&&<button className="map-popup-action" disabled={loading||busy} onClick={onRefresh}>Refresh recommendation</button>}
    {survivor.status!=='RESCUED'&&onMarkRescued&&<button disabled={busy} onClick={onMarkRescued} className="map-toolbar-button w-full">Mark as rescued</button>}
    <p className="text-[10px] opacity-70">Team movement and route estimates are simulated; map hazards are not a verified road-safety assessment.</p>
  </section>;
}
