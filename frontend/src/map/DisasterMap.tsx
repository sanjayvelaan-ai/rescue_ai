import React, {useEffect, useRef, useState} from 'react';
import {MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, Polyline, useMapEvents, ScaleControl, ZoomControl} from 'react-leaflet';
import L from 'leaflet';
import {createPortal} from 'react-dom';
import 'leaflet/dist/leaflet.css';
import {Crosshair, Maximize2, MapPin, Layers, Target} from 'lucide-react';
import type {Survivor, Hazard, RescueTeam, DroneFleet} from '../types';
import {useDeviceLocation} from '../lib/device-location-context';
import {useBrowserCamera} from '../lib/browser-camera-context';
import {validCoordinates} from './clusters';
import {individualTags} from './tags';
import {api} from '../services/api';
import {SurvivorDispatchPanel,type TeamRecommendation} from './SurvivorDispatchPanel';

type LatLng=[number,number];
type View='streets'|'satellite'|'topographic'|'dark';
const layers:Record<View,{url:string;attribution:string;maxNativeZoom:number}>={
  streets:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxNativeZoom:19},
  dark:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxNativeZoom:19},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',maxNativeZoom:19},
  topographic:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles &copy; Esri — Esri, HERE, Garmin, USGS, NGA, EPA, NPS, and the GIS User Community',maxNativeZoom:19},
};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function icon(label:string,color:string,cluster=false) {
  return L.divIcon({html:`<span class="rescue-map-pin ${cluster?'rescue-map-cluster':''}" style="--pin-color:${color}">${escape(label)}</span>`,className:'rescue-marker',iconSize:[36,36],iconAnchor:[18,18],popupAnchor:[0,-20]});
}
const deviceIcon=icon('●','#0284c7');
const shortId=(s:Survivor)=>s.survivor_id.slice(-4).toUpperCase();
type Command={points:LatLng[];zoom?:number;serial:number};
function MapBehavior({command,onZoom,onClick}:{command:Command|null;onZoom:(zoom:number)=>void;onClick:(p:LatLng)=>void}) {
  const map=useMapEvents({zoomend:()=>onZoom(map.getZoom()),click:e=>onClick([e.latlng.lat,e.latlng.lng])});
  useEffect(()=>{
    onZoom(map.getZoom());
    const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());
    return()=>observer.disconnect();
  },[map,onZoom]);
  useEffect(()=>{
    if(!command?.points.length)return;
    if(command.points.length===1) map.setView(command.points[0],command.zoom??17);
    else map.fitBounds(command.points,{padding:[45,45],maxZoom:18});
  },[command,map]);
  return null;
}
interface DisasterMapProps {
  survivors:Survivor[];hazards:Hazard[];teams:RescueTeam[];drone?:DroneFleet;
  selectedSurvivorId?:string;onSelectSurvivor?:(s:Survivor)=>void;
  onDispatchTeam?:(s:Survivor,t:RescueTeam)=>void;
  onAutonomousDetection?:(result:any)=>void;onRepositionTeams?:()=>void;
}
export function DisasterMap({survivors,hazards,teams,drone,selectedSurvivorId,onSelectSurvivor,onDispatchTeam,onAutonomousDetection,onRepositionTeams}:DisasterMapProps) {
  const location=useDeviceLocation();
  const camera=useBrowserCamera();
  const [view,setView]=useState<View>('streets');
  const [showSimulation,setShowSimulation]=useState(false);
  const [showRescued,setShowRescued]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [zoom,setZoom]=useState(location.fix?17:3);
  const [command,setCommand]=useState<Command|null>(null);
  const [locating,setLocating]=useState(false);
  const [tileError,setTileError]=useState(false);
  const [actionError,setActionError]=useState('');
  const [busy,setBusy]=useState(false);
  const [marking,setMarking]=useState(false);
  const [picking,setPicking]=useState(false);
  const [capturePin,setCapturePin]=useState<LatLng|null>(null);
  const [showTeams,setShowTeams]=useState(true);
  const [zone,setZone]=useState<LatLng|null>(null);
  const [radius,setRadius]=useState(120);
  const [expanded,setExpanded]=useState(false);
  const [recommendation,setRecommendation]=useState<{key:string;id:string;team:TeamRecommendation|null;error:string}|null>(null);
  const [recommendationRevision,setRecommendationRevision]=useState(0);
  const locatedFrom=useRef(location.fix);
  const stagedRevision=useRef(location.stagingRevision);
  const serial=useRef(0);
  const inspector=useRef<HTMLElement>(null);
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),10000);return()=>clearInterval(timer);},[]);
  const fix=location.fix && clock/1000-location.fix.observed_at<(location.fix.source==='USER_PIN'?600:120) ? location.fix:null;
  const move=(points:LatLng[],level?:number)=>setCommand({points,zoom:level,serial:++serial.current});
  useEffect(()=>{
    if(fix&&((locating&&fix!==locatedFrom.current)||stagedRevision.current!==location.stagingRevision)){
      setCommand({points:[[fix.latitude,fix.longitude]],zoom:(fix.accuracy_m??0)>1000?12:(fix.accuracy_m??0)>150?15:17,serial:++serial.current});setLocating(false);stagedRevision.current=location.stagingRevision;
    }
  },[fix,locating,location.stagingRevision]);

  const visible=survivors.filter(s=>validCoordinates(s)&&(showSimulation&&s.location_source!=='UNLOCATED'||s.location_source==='DEVICE_LOCATION'||s.location_source==='USER_PIN')&&(showRescued||s.status!=='RESCUED'));
  const tags=individualTags(visible,zoom);
  const target=survivors.find(s=>s.survivor_id===(onSelectSurvivor ? selectedSurvivorId : selected));
  const simulatedCount=survivors.filter(s=>!['DEVICE_LOCATION','USER_PIN','UNLOCATED'].includes(s.location_source||'SIMULATION')).length;
  const select=(s:Survivor)=>{setSelected(s.survivor_id);onSelectSurvivor?.(s);};
  const fitAll=()=>{const points=visible.map(s=>[s.latitude,s.longitude] as LatLng);if(fix)points.push([fix.latitude,fix.longitude]);move(points);};
  const alignTeams=async()=>{if(!fix)return;setBusy(true);try{const result=await api.alignTeams(fix);setActionError(result.message);setRecommendationRevision(n=>n+1);}catch(e){setActionError(e instanceof Error?e.message:'Team staging failed.');}finally{setBusy(false);}};
  const locate=()=>{locatedFrom.current=location.fix;setLocating(true);setShowTeams(true);location.request();};
  const targetId=target?.survivor_id,targetStatus=target?.status,targetSource=target?.location_source;
  useEffect(()=>{if(targetId&&(inspector.current?.closest('.rescue-map-shell')?.clientWidth??0)<850)inspector.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[targetId]);
  const targetPosition=target?`${target.latitude},${target.longitude}`:'';
  const teamKey=teams.map(t=>`${t.team_id}:${t.status}:${['AVAILABLE','STANDBY'].includes(t.status)?`${t.latitude.toFixed(5)},${t.longitude.toFixed(5)}`:''}`).sort().join('|');
  const eligible=!!targetId&&targetSource!=='UNLOCATED'&&['DETECTED','CONFIRMED'].includes(targetStatus||'');
  const recommendationKey=JSON.stringify([targetId,targetStatus,targetSource,targetPosition,teamKey,recommendationRevision,location.stagingRevision]);
  const currentRecommendation=recommendation?.key===recommendationKey?recommendation:null;
  const recommendationLoading=eligible&&!currentRecommendation;
  const route=currentRecommendation?.team?.waypoints||[];
  useEffect(()=>{
    if(!eligible||!targetId)return;
    const controller=new AbortController();let current=true;
    void api.getNearestTeamDijkstra(targetId,controller.signal).then(result=>{
      if(!current)return;
      setRecommendation({key:recommendationKey,id:targetId,team:result.recommended_team,error:''});
    }).catch(e=>{if(current)setRecommendation({key:recommendationKey,id:targetId,team:null,error:e instanceof Error?e.message:'Could not recommend a team.'});});
    return()=>{current=false;controller.abort();};
  },[targetId,eligible,recommendationKey]);
  const dispatch=async(s:Survivor)=>{
    setBusy(true);setActionError('');
    try {
      const result=await api.getNearestTeamDijkstra(s.survivor_id);
      const team=teams.find(t=>t.team_id===result.recommended_team?.team_id);
      if(!team)throw new Error('No available rescue team.');
      if(onDispatchTeam)await onDispatchTeam(s,team);else await api.assignTeam(team.team_id,s.survivor_id);
      setRecommendationRevision(n=>n+1);
    }catch(e){setActionError(e instanceof Error?e.message:'Dispatch failed.');}finally{setBusy(false);}
  };
  const markRescued=async(survivor:Survivor)=>{setBusy(true);setActionError('');try{await api.updateSurvivorStatus(survivor.survivor_id,'RESCUED');setRecommendationRevision(n=>n+1);}catch(e){setActionError(e instanceof Error?e.message:'Could not update rescue status.');}finally{setBusy(false);}};
  const details=(survivor:Survivor)=><SurvivorDispatchPanel key={survivor.survivor_id} survivor={survivor} onMarkRescued={()=>void markRescued(survivor)} team={currentRecommendation?.id===survivor.survivor_id?currentRecommendation.team:null} loading={recommendationLoading} error={currentRecommendation?.id===survivor.survivor_id?currentRecommendation.error:''} busy={busy} onDispatch={()=>void dispatch(survivor)} onRefresh={()=>setRecommendationRevision(n=>n+1)}/>;
  const reviewZone=async()=>{
    if(!zone)return;setBusy(true);setActionError('');
    try{
      if(camera.active){
        if(!camera.lastFrameAt||Date.now()-camera.lastFrameAt>10000||camera.error)throw new Error('Waiting for a fresh processed camera frame.');
        const ids=new Set(camera.tracks.map(t=>t.survivor_id));
        const survivor=survivors.find(s=>ids.has(s.survivor_id)&&['DEVICE_LOCATION','USER_PIN'].includes(s.location_source||'')&&L.latLng(zone).distanceTo([s.latitude,s.longitude])<=radius);
        if(!survivor)throw new Error('No confirmed device-camera track has a capture position inside this zone.');
        select(survivor);onAutonomousDetection?.({survivor,assigned_team:null});
      }else{
        const result=await api.triggerAutonomousZoneDetection({center_lat:zone[0],center_lng:zone[1],radius_m:radius,auto_dispatch:false});select(result.survivor);onAutonomousDetection?.(result);
      }
    }
    catch(e){setActionError(e instanceof Error?e.message:'No live target in the selected zone.');}finally{setBusy(false);}
  };
  const content = <section aria-label="Interactive disaster map" style={{position:expanded?'fixed':'relative'}} className={`rescue-map-shell theme-card border border-slate-800 rounded-xl flex flex-col overflow-hidden ${expanded?'fixed inset-3 z-[100] h-auto':'relative h-auto min-h-[440px]'}`}>
    <div className="shrink-0 p-3 space-y-2 bg-slate-900 border-b border-slate-800">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className="map-toolbar-button" onClick={locate}><Crosshair size={14}/>{locating && !location.error && location.active?'Locating…':'My location'}</button>
        {location.active&&<button className="map-toolbar-button" onClick={location.stop}>Stop location</button>}
        <button className="map-toolbar-button" onClick={()=>{setPicking(!picking);setMarking(false);}}>Set capture pin</button>
        <button className="map-toolbar-button" disabled={!fix||busy} onClick={alignTeams}>Stage simulated teams here</button>
        <button className="map-toolbar-button" onClick={fitAll} disabled={!visible.length}>Fit detections ({visible.length})</button>
        <label className="flex items-center gap-1"><Layers size={14}/><span className="sr-only">Map view</span><select aria-label="Map view" value={view} onChange={e=>{setView(e.target.value as View);setTileError(false);}} className="rounded border border-slate-700 bg-slate-950 px-2 py-2">
          <option value="streets">Streets</option><option value="satellite">Satellite imagery</option><option value="topographic">Topographic</option><option value="dark">Dark streets</option>
        </select></label>
        <button aria-label={expanded?'Exit expanded map':'Expand map'} className="map-toolbar-button" onClick={()=>setExpanded(!expanded)}><Maximize2 size={14}/></button>
        <button className="map-toolbar-button" aria-pressed={marking} onClick={()=>setMarking(!marking)}><Target size={14}/>Mark zone</button>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
        <label><input type="checkbox" checked={showSimulation} onChange={e=>setShowSimulation(e.target.checked)}/> Simulation / older positions ({simulatedCount})</label>
        <label><input type="checkbox" checked={showTeams} onChange={e=>setShowTeams(e.target.checked)}/> Simulated teams</label>
        <label><input type="checkbox" checked={showRescued} onChange={e=>setShowRescued(e.target.checked)}/> Include rescued</label>
        <span>Blue: system · Orange: survivor · Cyan: selected</span>
      </div>
      <p role="status" className="text-[11px] text-slate-300 break-words">{location.error || (fix ? `${fix.source==='USER_PIN'?'Operator capture pin':'Device'}: ${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)} · ${fix.accuracy_m!=null?`accuracy ±${Math.round(fix.accuracy_m??0)} m`:'accuracy not measured'} · updated ${new Date(fix.observed_at*1000).toLocaleTimeString()}` : location.active?'Waiting for a fresh device position…':'Select My location and allow browser location access. No laptop position is assumed.')}</p>
      {fix&&<p className="text-[10px] text-slate-500">Capture location only; the camera does not measure the subject’s GPS. {(fix.accuracy_m??0)>1000?'Your device reports a broad, approximate location.':''}</p>}
      {location.teamStaging&&<p role="status" className="text-xs text-cyan-400">{location.teamStaging}</p>}
      {picking&&<p className="text-xs text-cyan-400">Click your verified capture location on the map, then confirm the pin. This is an operator position, not GPS.</p>}
      {capturePin&&<div className="flex flex-wrap gap-2 items-center text-xs"><span>{capturePin[0].toFixed(5)}, {capturePin[1].toFixed(5)}</span><button className="map-toolbar-button" onClick={()=>{location.setManualFix(...capturePin);move([capturePin],17);setCapturePin(null);}}>Use as capture position (10 min)</button><button className="map-toolbar-button" onClick={()=>setCapturePin(null)}>Cancel pin</button></div>}
      {marking&&<p className="text-xs text-cyan-400">Click the map to place a search zone.</p>}
      {zone&&<div className="flex flex-wrap gap-2 items-center text-xs"><label>Zone radius <input aria-label="Zone radius" type="range" min="50" max="1000" step="50" value={radius} onChange={e=>setRadius(+e.target.value)}/>{radius} m</label><button className="map-toolbar-button" disabled={busy} onClick={reviewZone}>Review live camera target</button><button className="map-toolbar-button" onClick={()=>setZone(null)}>Clear zone</button></div>}
      {actionError&&<p role="alert" className="text-xs text-red-400">{actionError}</p>}
      {tileError&&<p role="status" className="text-xs text-amber-400">Some map tiles could not load. Check the connection or select another map view.</p>}
    </div>
    <p className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-800">Each tag is a survivor record. Overlapping tags are spaced around their capture location for selection; saved coordinates and dispatch destinations stay unchanged.</p>
    <div className={`map-workspace ${target?'has-selection':''}`}>
    <div className="map-canvas relative min-w-0">
      <MapContainer center={fix?[fix.latitude,fix.longitude]:[20,0]} zoom={fix?17:3} maxZoom={20} zoomControl={false} className="h-full w-full" style={{position:'absolute',inset:0}}>
        <MapBehavior command={command} onZoom={setZoom} onClick={p=>{if(picking){setCapturePin(p);setPicking(false);}else if(marking){setZone(p);setMarking(false);}}}/>
        <ZoomControl position="topright"/><ScaleControl position="bottomleft"/>
        <TileLayer key={view} {...layers[view]} maxZoom={20} className={view==='dark'?'map-dark-tiles':''} eventHandlers={{tileerror:()=>setTileError(true)}}/>
        {fix&&<>{fix.accuracy_m!=null&&<Circle center={[fix.latitude,fix.longitude]} radius={Math.max(fix.accuracy_m??0,2)} pathOptions={{color:'#0284c7',weight:1,fillOpacity:.12}}/>}
          <Marker position={[fix.latitude,fix.longitude]} icon={deviceIcon} zIndexOffset={-100}><Tooltip>{fix.source==='USER_PIN'?'Operator capture pin · accuracy not measured':`Device capture location · ±${Math.round(fix.accuracy_m??0)} m`}</Tooltip><Popup><strong>Capture device</strong><p>{fix.source==='USER_PIN'?'Operator-set position; not a GPS measurement.':`Device-reported accuracy ±${Math.round(fix.accuracy_m??0)} m.`}</p></Popup></Marker></>}
        {tags.map(tag=><React.Fragment key={tag.record.survivor_id}>
          {tag.offset&&<Polyline positions={[[tag.record.latitude,tag.record.longitude],[tag.latitude,tag.longitude]]} interactive={false} pathOptions={{color:'#d97706',weight:1,opacity:.35,dashArray:'2 5'}}/>}
          <Marker position={[tag.latitude,tag.longitude]} title={`Survivor ${tag.record.survivor_id}`} alt={`Survivor ${tag.record.survivor_id}`} eventHandlers={{click:()=>select(tag.record)}} zIndexOffset={tag.record.survivor_id===targetId?1000:100} icon={icon(shortId(tag.record),tag.record.survivor_id===targetId?'#0891b2':tag.record.priority==='CRITICAL'?'#e11d48':'#d97706')}>
            <Tooltip>{tag.record.survivor_id}{tag.offset?' · select to review capture position':''}</Tooltip>
          </Marker>
        </React.Fragment>)}
        {showSimulation&&hazards.filter(validCoordinates).map(h=><Circle key={h.hazard_id} center={[h.latitude,h.longitude]} radius={h.radius_m} pathOptions={{color:'#ef4444',fillOpacity:.08}}><Popup>Simulated hazard: {h.type}</Popup></Circle>)}
        {showTeams&&teams.filter(validCoordinates).map((t,i)=><Marker key={t.team_id} position={[t.latitude,t.longitude]} icon={icon(`T${i+1}`,'#2563eb')}><Tooltip>{t.name} · simulated position</Tooltip><Popup>{t.name} · {t.status}<p>Simulated team location</p></Popup></Marker>)}
        {showSimulation&&drone&&validCoordinates(drone)&&<Marker position={[drone.latitude,drone.longitude]} icon={icon('D','#0891b2')}><Tooltip>Drone telemetry simulation</Tooltip></Marker>}
        {zone&&<Circle center={zone} radius={radius} pathOptions={{color:'#06b6d4',dashArray:'5 5',fillOpacity:.05}}/>}
        {target?.location_accuracy_m!=null&&target.location_source==='DEVICE_LOCATION'&&<Circle center={[target.latitude,target.longitude]} radius={target.location_accuracy_m} pathOptions={{color:'#f59e0b',fillOpacity:.04,weight:1,dashArray:'3 5'}}/>}
        {route.length>0&&showTeams&&<Polyline positions={route} pathOptions={{color:'#10b981',weight:3,dashArray:'6 6'}}/>}
      </MapContainer>
    </div>
    {target&&<aside ref={inspector} aria-label="Selected survivor and dispatch" className="map-inspector bg-slate-900 border-slate-800 p-5 space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">SURVIVOR DETAILS</h3><button className="map-toolbar-button" disabled={target.location_source==='UNLOCATED'} onClick={()=>move([[target.latitude,target.longitude]],18)}>Locate</button></div>{details(target)}</aside>}
    </div>
    <div className="shrink-0 border-t border-slate-800 px-4 py-3 text-xs flex flex-wrap items-center gap-3 text-slate-400"><MapPin size={14}/><span>{visible.length?`${visible.length} individual survivor tags · Select any tag to review its snapshot and team recommendation.`:'No located survivors in this view.'}</span>{showSimulation&&onRepositionTeams&&<button className="map-toolbar-button" onClick={onRepositionTeams}>Reposition simulated teams</button>}</div>
  </section>;
  return expanded ? createPortal(content,document.body) : content;
}
