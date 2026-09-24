import {useState} from 'react';
import type {Survivor} from '../types';
import {resolveSnapshotUrl} from '../services/api';
export function SurvivorSnapshot({survivor}:{survivor:Survivor}){
  const [mode,setMode]=useState<'rgb'|'preview'>('rgb');
  const path=mode==='rgb'?survivor.detection_frame_path:survivor.thermal_frame_path;
  const fallback=resolveSnapshotUrl(undefined);
  return <section aria-label="Selected survivor snapshot" className="theme-card p-4 rounded-xl border border-cyan-800 space-y-3">
    <div className="flex flex-wrap gap-2 justify-between text-xs"><strong className="break-all">{survivor.survivor_id}</strong><span>{survivor.status} · {Math.round(survivor.model_confidence*100)}%</span></div>
    <div className="flex flex-wrap gap-2"><button className="map-toolbar-button" aria-pressed={mode==='rgb'} onClick={()=>setMode('rgb')}>RGB snapshot</button><button className="map-toolbar-button" aria-pressed={mode==='preview'} onClick={()=>setMode('preview')}>False-color preview</button>{path&&<a className="map-toolbar-button" href={resolveSnapshotUrl(path)} download>Save snapshot</a>}</div>
    <img key={path||mode} src={resolveSnapshotUrl(path)} alt={`Saved ${mode} snapshot of ${survivor.survivor_id}`} onError={e=>{if(e.currentTarget.src!==fallback)e.currentTarget.src=fallback;}} className="w-full max-h-96 aspect-video object-contain rounded bg-black"/>
    <p className="text-xs text-slate-400 break-words">Source: {survivor.capture_source||'Server camera / historical'} · {survivor.location_source==='UNLOCATED'?'Location unavailable':`${survivor.location_source||'SIMULATION'}: ${survivor.latitude.toFixed(5)}, ${survivor.longitude.toFixed(5)}`} · {new Date(survivor.first_detected||survivor.timestamp).toLocaleString()}</p>
    {mode==='preview'&&<p className="text-xs text-amber-400">RGB-derived colors; this is not a temperature measurement.</p>}
  </section>;
}
