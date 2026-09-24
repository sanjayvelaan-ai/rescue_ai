import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {backendOrigin} from './backend-url';
import {api} from '../services/api';
import {DeviceLocationContext as Context,type DeviceFix} from './device-location-context';

export function DeviceLocationProvider({children}:{children:ReactNode}) {
  const [fix,setFix]=useState<DeviceFix|null>(null);
  const [active,setActive]=useState(false);
  const [error,setError]=useState('');
  const [permission,setPermission]=useState('not checked');
  const [attempt,setAttempt]=useState(0);
  const [teamStaging,setTeamStaging]=useState('');
  const [stagingRevision,setStagingRevision]=useState(0);
  const stageNextFix=useRef(false);
  const precise=useRef(false);
  const lastSync=useRef(0);
  const generation=useRef(0);
  const pendingSync=useRef<Promise<unknown>>(Promise.resolve());
  const pendingStage=useRef<Promise<unknown>>(Promise.resolve());
  const localBackend=!backendOrigin&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  const sync=useCallback((next:DeviceFix)=>{
    setFix(next);setError('');
    if(stageNextFix.current){
      stageNextFix.current=false;
      const requestGeneration=generation.current;
      setStagingRevision(n=>n+1);
      setTeamStaging('Staging available simulated teams near your location…');
      pendingStage.current=pendingStage.current.then(()=>requestGeneration===generation.current?api.alignTeams(next):undefined).then(result=>{
        if(!result||requestGeneration!==generation.current)return;
        setTeamStaging(result.message);setStagingRevision(n=>n+1);
      }).catch(e=>{if(requestGeneration===generation.current)setTeamStaging(e instanceof Error?e.message:'Automatic team staging failed. Use Stage simulated teams here to retry.');});
    }
    // Remote browser cameras attach their own location to each frame, never a global fix.
    if(localBackend && Date.now()-lastSync.current>5000){
      lastSync.current=Date.now();
      pendingSync.current=pendingSync.current.then(()=>api.updateDeviceLocation(next)).catch(()=>{});
    }
  },[localBackend]);
  useEffect(()=>{
    let live=true;
    let state:PermissionStatus|undefined;
    navigator.permissions?.query({name:'geolocation'}).then(result=>{
      state=result;
      const update=()=>{if(live)setPermission(result.state);};
      update();result.onchange=update;
    }).catch(()=>{if(live)setPermission('browser does not expose permission status');});
    return()=>{live=false;if(state)state.onchange=null;};
  },[]);
  useEffect(()=>{
    if(!active || !navigator.geolocation)return;
    let live=true;
    const current=generation.current;
    const success=(p:GeolocationPosition)=>{if(live&&current===generation.current)sync({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy,observed_at:p.timestamp/1000,source:'DEVICE_LOCATION'});};
    const failure=(e:GeolocationPositionError)=>{
      if(!live||current!==generation.current)return;
      setError(e.code===1?'Location denied. Allow location for this site and enable your device Location services.':e.code===3?'Location timed out. Try network location, open this page in your regular browser, or set a verified capture pin.':'Location unavailable from this device. Check Location services or set a verified capture pin.');
    };
    const options={enableHighAccuracy:precise.current,maximumAge:10000,timeout:15000};
    const watch=navigator.geolocation.watchPosition(success,failure,options);
    const timer=setInterval(()=>navigator.geolocation.getCurrentPosition(success,failure,options),30000);
    return()=>{live=false;navigator.geolocation.clearWatch(watch);clearInterval(timer);};
  },[active,attempt,sync]);
  const request=(highAccuracy=false)=>{
    if(!window.isSecureContext || !navigator.geolocation){setError('Location requires HTTPS or localhost and a supported browser.');return;}
    generation.current++;stageNextFix.current=true;setTeamStaging('Teams will stage after a fresh location arrives.');precise.current=highAccuracy;lastSync.current=0;setError('');setActive(true);setAttempt(n=>n+1);
  };
  const stop=()=>{generation.current++;stageNextFix.current=false;setTeamStaging('');setActive(false);setFix(null);setError('');if(localBackend)pendingSync.current=pendingSync.current.then(()=>api.clearDeviceLocation()).catch(()=>{});};
  const setManualFix=(latitude:number,longitude:number)=>{
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){setError('Enter valid latitude and longitude.');return;}
    generation.current++;stageNextFix.current=true;setActive(false);lastSync.current=0;
    sync({latitude,longitude,accuracy_m:null,observed_at:Date.now()/1000,source:'USER_PIN'});
  };
  return <Context.Provider value={{fix,active,error,permission,request,stop,setManualFix,teamStaging,stagingRevision}}>{children}</Context.Provider>;
}
