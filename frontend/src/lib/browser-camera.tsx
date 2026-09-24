import {useRef,useState,useEffect,type ReactNode} from 'react';
import {BrowserCameraContext,type CameraTrack} from './browser-camera-context';
import {useDeviceLocation,freshFix} from './device-location-context';
import {api} from '../services/api';
import {backendUrl,backendOrigin} from './backend-url';
import {createNoDetectionMonitor} from './no-detection';

class CameraRequestError extends Error {
  status:number;
  constructor(message:string,status:number){super(message);this.status=status;}
}
async function cameraRequest(path:string,options:RequestInit={}) {
  const response=await fetch(backendUrl('/api/camera/'+path),{...options,headers:{'Content-Type':'application/json'},signal:options.signal??AbortSignal.timeout(30000)});
  const result=await response.json().catch(()=>({detail:'Camera service did not respond.'}));
  if(!response.ok)throw new CameraRequestError(result.detail||`Camera service error ${response.status}`,response.status);
  return result;
}
export function BrowserCameraProvider({children}:{children:ReactNode}) {
  const location=useDeviceLocation();
  const quietMonitor=useRef(createNoDetectionMonitor());
  const [quietNotice,setQuietNotice]=useState(false);
  useEffect(()=>{if(!quietNotice)return;const timer=setTimeout(()=>setQuietNotice(false),9000);return()=>clearTimeout(timer);},[quietNotice]);
  const fix=useRef(location.fix);
  useEffect(()=>{fix.current=location.fix;},[location.fix]);
  const video=useRef<HTMLVideoElement>(null);
  const runtime=useRef<{generation:number;stream:MediaStream|null;session:string;timer:ReturnType<typeof setTimeout>|null;abort:AbortController|null}>({generation:0,stream:null,session:'',timer:null,abort:null});
  const [active,setActive]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState('');
  const [sourceId,setSourceId]=useState(''),[preview,setPreview]=useState(''),[tracks,setTracks]=useState<CameraTrack[]>([]);
  const [thermalPreview,setThermalPreview]=useState(''),[inferenceSize,setInferenceSize]=useState<416|640>(416);
  const [fps,setFps]=useState(0),[latencyMs,setLatencyMs]=useState(0);
  const sizeRef=useRef(inferenceSize);
  useEffect(()=>{sizeRef.current=inferenceSize;},[inferenceSize]);
  const [stream,setStream]=useState<MediaStream|null>(null),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState('');
  const [processingMs,setProcessingMs]=useState(0),[frameCount,setFrameCount]=useState(0),[lastFrameAt,setLastFrameAt]=useState<number|null>(null);
  const release=()=>{
    const r=runtime.current;r.generation++;if(r.timer)clearTimeout(r.timer);r.abort?.abort();
    r.stream?.getTracks().forEach(t=>t.stop());r.stream=null;
    if(r.session)void cameraRequest('sessions/'+r.session,{method:'DELETE'}).catch(()=>{});
    r.session='';if(video.current)video.current.srcObject=null;
  };
  const stop=()=>{release();quietMonitor.current.reset();setQuietNotice(false);setActive(false);setStarting(false);setStream(null);setTracks([]);setPreview('');setThermalPreview('');setFps(0);setSourceId('');};
  useEffect(()=>()=>release(),[]);
  const start=async()=>{
    stop();setError('');setStarting(true);setFrameCount(0);setLastFrameAt(null);
    const generation=runtime.current.generation;
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Device camera requires HTTPS or localhost. Open the deployed HTTPS address in your browser.');
      if(!backendOrigin&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))await api.toggleCamera(false);
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:deviceId?{deviceId:{exact:deviceId},width:{ideal:960},height:{ideal:540}}:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:540}}});
      if(generation!==runtime.current.generation){media.getTracks().forEach(t=>t.stop());return;}
      runtime.current.stream=media;setStream(media);
      media.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(generation===runtime.current.generation){stop();setError('Camera disconnected. Reconnect the device and start again.');}}));
      if(!video.current)throw new Error('Camera preview is unavailable.');
      video.current.srcObject=media;await video.current.play();
      let session=await cameraRequest('sessions',{method:'POST'});
      if(generation!==runtime.current.generation){void cameraRequest('sessions/'+session.session_id,{method:'DELETE'});return;}
      runtime.current.session=session.session_id;setSourceId(session.source_id);
      const list=await navigator.mediaDevices.enumerateDevices();
      if(generation!==runtime.current.generation)return;
      setDevices(list.filter(d=>d.kind==='videoinput'));
      setStarting(false);setActive(true);
      const canvas=document.createElement('canvas');let frame=0,lastVideoTime=-1,lastResult=0;
      const send=async()=>{
        if(generation!==runtime.current.generation)return;
        const started=performance.now();let retryDelay=0;
        try{
          const el=video.current;
          if(!el||!el.videoWidth)throw new Error('Waiting for camera frames.');
          if(el.currentTime===lastVideoTime){runtime.current.timer=setTimeout(send,16);return;}
          lastVideoTime=el.currentTime;
          // Keep tracker coordinates stable when changing the inference resolution.
          const size=sizeRef.current,edge=640;
          const scale=Math.min(1,edge/el.videoWidth,edge/el.videoHeight);
          canvas.width=Math.round(el.videoWidth*scale);canvas.height=Math.round(el.videoHeight*scale);
          canvas.getContext('2d')!.drawImage(el,0,0,canvas.width,canvas.height);
          const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.75));
          if(!blob||generation!==runtime.current.generation)return;
          const jpeg=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
          if(generation!==runtime.current.generation)return;
          const controller=new AbortController();runtime.current.abort=controller;
          const timeout=setTimeout(()=>controller.abort(),30000);
          let result;
          try{result=await cameraRequest('sessions/'+session.session_id+'/frames',{method:'POST',signal:controller.signal,body:JSON.stringify({jpeg,frame_id:++frame,location:freshFix(fix.current),inference_size:size})});}
          finally{clearTimeout(timeout);}
          if(generation!==runtime.current.generation)return;
          const now=performance.now();
          if(result.tracks.length)setQuietNotice(false);
          if(quietMonitor.current.observe(now,result.tracks.length))setQuietNotice(true);
          setLatencyMs(Math.round(now-started));
          if(lastResult)setFps(Math.round(10000/(now-lastResult))/10);lastResult=now;
          setPreview(result.preview);setThermalPreview(result.thermal_preview||'');setTracks(result.tracks);setProcessingMs(result.processing_ms);setFrameCount(n=>n+1);setLastFrameAt(Date.now());setError('');
        }catch(e){
          retryDelay=350;
          if(generation===runtime.current.generation){
            quietMonitor.current.observe(performance.now(),0,false);setQuietNotice(false);
            setTracks([]);setFps(0);lastResult=0;setError(e instanceof Error?e.message:'Frame upload failed.');
            if(e instanceof CameraRequestError&&e.status===410){
              try{
                const replacement=await cameraRequest('sessions',{method:'POST'});
                if(generation!==runtime.current.generation){void cameraRequest('sessions/'+replacement.session_id,{method:'DELETE'}).catch(()=>{});return;}
                session=replacement;frame=0;runtime.current.session=session.session_id;setSourceId(session.source_id);
              }catch{setError('Reconnecting to the camera service. Capture will retry.');}
            }
          }
        }
        if(generation===runtime.current.generation)runtime.current.timer=setTimeout(send,Math.max(retryDelay,33-(performance.now()-started)));
      };
      void send();
    }catch(e){
      if(generation!==runtime.current.generation)return;
      stop();const name=e instanceof DOMException?e.name:'';
      setError(name==='NotAllowedError'?'Camera access denied. Allow camera for this site in your browser.':name==='NotFoundError'?'No camera detected. Connect a camera or choose another device.':name==='NotReadableError'?'Camera is busy. Close other camera apps and stop the server camera in Settings.':e instanceof Error?e.message:'Camera could not start.');
    }
  };
  return <BrowserCameraContext.Provider value={{active,starting,error,sourceId,preview,thermalPreview,stream,tracks,devices,deviceId,setDeviceId,start,stop,processingMs,frameCount,lastFrameAt,inferenceSize,setInferenceSize,fps,latencyMs}}>
    {quietNotice&&<div role="status" aria-live="polite" className="detection-notice rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl"><div className="flex items-start gap-3"><div><strong className="block text-sm">No survivors detected recently</strong><p className="mt-1 text-xs text-slate-400">No person candidates in 45 seconds of live detection. Scanning continues.</p></div><button aria-label="Dismiss no-detection notice" className="map-toolbar-button shrink-0" onClick={()=>setQuietNotice(false)}>×</button></div></div>}
    <video ref={video} muted playsInline aria-hidden="true" className="hidden"/>{children}
  </BrowserCameraContext.Provider>;
}
