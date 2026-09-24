import {useState,useEffect} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import type {DroneFleet} from '../types';
import {api} from '../services/api';
import {useBrowserCamera} from '../lib/browser-camera-context';
import {useDeviceLocation,freshFix} from '../lib/device-location-context';
export function DroneFleetPage({drone,onRefresh,lastUpdated}:{drone?:DroneFleet;onRefresh?:()=>void;lastUpdated?:string|null}){
 const camera=useBrowserCamera(),location=useDeviceLocation();
 const fix=freshFix(location.fix);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [history,setHistory]=useState<{time:number;battery:number;signal:number}[]>([]);
 const battery=drone?.battery_pct,signal=drone?.signal_strength_pct;
 useEffect(()=>{
   if(battery===undefined||signal===undefined||!lastUpdated)return;
   const time=Date.parse(lastUpdated);
   // Retain each distinct server poll as a bounded historical sample.
   // oxlint-disable-next-line react-hooks-js/set-state-in-effect
   setHistory(rows=>rows.at(-1)?.time===time?rows:[...rows,{time,battery,signal}].slice(-150));
 },[lastUpdated,battery,signal]);
 const command=async(cmd:string)=>{if(!drone)return;setBusy(true);try{const res=await api.sendDroneCommand(drone.drone_id,cmd);setMessage(res.message);onRefresh?.();}catch(e){setMessage(e instanceof Error?e.message:'Command failed.');}finally{setBusy(false);}};
 const checks=[['Device camera',camera.active?'Connected':'Not connected'],['YOLO result',camera.lastFrameAt?new Date(camera.lastFrameAt).toLocaleTimeString():'No processed frame'],['Capture location',fix?fix.source==='USER_PIN'?'Operator pin':'Device fix':'Missing / expired'],['Battery reserve',drone?drone.battery_pct<20?'LOW — return recommended':`${drone.battery_pct}%`:'Unavailable'],['Signal',drone?drone.signal_strength_pct<30?'WEAK':`${drone.signal_strength_pct}%`:'Unavailable']];
 return <div className="page-shell p-4 sm:p-6 space-y-5"><h1 className="text-lg font-bold">FLEET READINESS & TELEMETRY</h1><p className="text-xs text-amber-400">Drone telemetry and flight commands are simulated. No flight controller is connected. Device camera status below is real.</p>
 <div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{drone?.drone_id||'No fleet record'} · {drone?.status||'UNAVAILABLE'}</strong><span>{lastUpdated?`Data received ${new Date(lastUpdated).toLocaleTimeString()}`:'Waiting for telemetry'}</span><button className="map-toolbar-button" onClick={onRefresh}>Refresh telemetry</button></div>
 {drone&&(drone.battery_pct<20||drone.signal_strength_pct<30)&&<p role="alert" className="rounded border border-red-700 p-3 text-red-400 text-sm">Simulated unit needs attention: {drone.battery_pct<20?'low battery ':''}{drone.signal_strength_pct<30?'weak signal':''}.</p>}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Battery',drone?`${drone.battery_pct}%`:'—'],['Altitude',drone?`${drone.altitude_m} m`:'—'],['Ground speed',drone?`${drone.speed_m_s} m/s`:'—'],['Temperature',drone?`${drone.temperature_c} °C`:'—']].map(([label,value])=><div key={label} className="theme-card border border-slate-800 rounded p-4"><p className="text-xs text-slate-400">{label}</p><strong className="text-xl">{value}</strong></div>)}</div>
 <section className="theme-card border border-slate-800 rounded-xl p-4 space-y-3"><h2 className="text-sm font-bold">CAPTURE READINESS CHECKLIST</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">{checks.map(([name,value])=><div key={name} className="flex justify-between gap-2 border-b border-slate-800 py-2"><span>{name}</span><strong>{value}</strong></div>)}</div><a className="map-toolbar-button" href="/live-mission">Open capture station</a></section>
 <section className="theme-card border border-slate-800 rounded-xl p-4 space-y-3"><h2 className="text-sm font-bold">OBSERVED SIMULATOR TELEMETRY · THIS PAGE SESSION</h2><div className="h-56">{history.length?<ResponsiveContainer width="100%" height="100%"><LineChart data={history}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="time" tickFormatter={v=>new Date(v).toLocaleTimeString()} fontSize={10}/><YAxis domain={[0,100]}/><Tooltip labelFormatter={v=>new Date(Number(v)).toLocaleTimeString()} contentStyle={{background:'var(--card)'}}/><Line dataKey="battery" name="Battery %" stroke="#06b6d4" isAnimationActive={false}/><Line dataKey="signal" name="Signal %" stroke="#10b981" isAnimationActive={false}/></LineChart></ResponsiveContainer>:<p className="text-xs text-slate-400">Waiting for observed telemetry samples.</p>}</div></section>
 <section className="theme-card border border-slate-800 rounded-xl p-4 space-y-3"><h2 className="text-sm font-bold">SIMULATED FLIGHT COMMANDS</h2><div className="flex flex-wrap gap-2">{[['RETURN_TO_BASE','Return to base'],['PAUSE_SEARCH','Pause scan'],['RESUME_SEARCH','Resume scan']].map(([cmd,label])=><button key={cmd} className="map-toolbar-button" disabled={busy||!drone} onClick={()=>void command(cmd)}>{label}</button>)}</div>{message&&<p role="status" className="text-xs text-cyan-400">{message}</p>}</section>
 </div>;
}
