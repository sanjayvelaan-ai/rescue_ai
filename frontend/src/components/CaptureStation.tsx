import {useEffect,useRef} from 'react';
import {useBrowserCamera} from '../lib/browser-camera-context';
import {useDeviceLocation,freshFix} from '../lib/device-location-context';
export function CaptureStation(){
  const camera=useBrowserCamera(),location=useDeviceLocation();
  const raw=useRef<HTMLVideoElement>(null);
  useEffect(()=>{if(raw.current){raw.current.srcObject=camera.stream;if(camera.stream)void raw.current.play().catch(()=>{});}},[camera.stream]);
  const fix=freshFix(location.fix);
  return <section className="theme-card rounded-xl border border-slate-800 p-4 space-y-3" aria-label="Device capture station">
    <div className="flex flex-wrap gap-2 items-center justify-between"><h2 className="text-sm font-bold">DEVICE CAMERA & LOCATION</h2><span className="text-xs text-slate-400">{camera.sourceId||'No device source connected'}</span></div>
    <p className="text-xs text-slate-400">Use this laptop, phone or tablet camera. Frames go to this application's YOLO server while capture is running; confirmed tracks save snapshots.</p>
    <div className="capture-controls grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
      <select aria-label="Capture camera" value={camera.deviceId} disabled={camera.active||camera.starting} onChange={e=>camera.setDeviceId(e.target.value)} className="rounded bg-slate-900 border border-slate-700 p-2 max-w-full"><option value="">Default / rear camera</option>{camera.devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select>
      <button className="map-toolbar-button" disabled={camera.starting} onClick={()=>void camera.start()}>{camera.starting?'Connecting camera…':camera.active?'Restart device camera':'Start device camera'}</button>
      {(camera.active||camera.starting)&&<button className="map-toolbar-button" onClick={camera.stop}>Stop device camera</button>}
      <label className="flex items-center justify-between gap-3">Detection mode <select aria-label="Detection mode" value={camera.inferenceSize} onChange={e=>camera.setInferenceSize(Number(e.target.value) as 416|640)} className="rounded bg-slate-900 border border-slate-700 p-2"><option value={416}>Fast · 416</option><option value={640}>Detail · 640</option></select></label>
      <button className="map-toolbar-button" onClick={()=>location.request(false)}>Find device location</button>
      <button className="map-toolbar-button" onClick={()=>location.request(true)}>Refine GPS accuracy</button>
      {(location.active||location.fix)&&<button className="map-toolbar-button" onClick={location.stop}>Clear location</button>}
    </div>
    <p className="text-xs text-slate-400">Location permission: {location.permission}. {fix?`${fix.source==='USER_PIN'?'Operator capture pin':'Device fix'}: ${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}${fix.accuracy_m!=null?` · ±${Math.round(fix.accuracy_m)} m`:''}`:'No fresh location — detections will be saved without a real map position.'}</p>
    {location.teamStaging&&<p role="status" className="text-xs text-cyan-400">{location.teamStaging}</p>}
    {(camera.error||location.error)&&<p role="alert" className="text-xs text-amber-400">{camera.error} {location.error}</p>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[{title:'RGB detection',src:camera.preview},{title:'Thermal view',src:camera.thermalPreview}].map(view=><div key={view.title}><p className="text-xs text-slate-300 mb-1 font-bold">{view.title} · frame {camera.frameCount}</p>{view.src?<img src={view.src} alt={view.title+' live detection'} className="aspect-video w-full rounded bg-black object-contain"/>:<div className="aspect-video flex items-center justify-center rounded bg-slate-950 text-xs text-slate-400 p-4">Start the device camera to run detection.</div>}</div>)}
    </div>
    <p className="text-xs text-slate-400">{camera.tracks.length} visible candidates · {camera.lastFrameAt?`Last result ${new Date(camera.lastFrameAt).toLocaleTimeString()}`:'Waiting for first result'}</p>
    <p className="text-[11px] text-slate-500">Both views share the same RGB frame and tracked detections. Thermal colors do not measure temperature. Fast mode favors speed; Detail helps with small or distant subjects.</p>
    <details className="text-xs text-slate-400"><summary className="cursor-pointer">Unprocessed camera preview</summary><video ref={raw} muted playsInline className="mt-2 aspect-video w-full max-w-xl rounded bg-black object-contain"/></details>
  </section>;
}
