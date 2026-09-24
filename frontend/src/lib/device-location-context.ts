import {createContext, useContext} from 'react';
export type DeviceFix = {latitude:number; longitude:number; accuracy_m:number|null; observed_at:number; source?:'DEVICE_LOCATION'|'USER_PIN'};
export const DeviceLocationContext = createContext<{
  fix:DeviceFix|null; active:boolean; error:string; permission:string;
  teamStaging:string;stagingRevision:number;
  request:(precise?:boolean)=>void; stop:()=>void;
  setManualFix:(latitude:number,longitude:number)=>void;
} | null>(null);
export function useDeviceLocation() {
  const context=useContext(DeviceLocationContext);
  if(!context)throw new Error('DeviceLocationProvider is missing');
  return context;
}
export function freshFix(fix:DeviceFix|null) {
  return fix && Date.now()/1000-fix.observed_at <= (fix.source==='USER_PIN'?600:120) ? fix:null;
}
