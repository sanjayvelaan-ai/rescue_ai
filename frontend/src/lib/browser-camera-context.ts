import {createContext,useContext} from 'react';
export type CameraTrack={survivor_id:string;id:string;confidence:number;state:string;track_id:number;x1:number;y1:number;x2:number;y2:number;[key:string]:any};
export type BrowserCameraState={
  active:boolean;starting:boolean;error:string;sourceId:string;preview:string;thermalPreview:string;stream:MediaStream|null;
  tracks:CameraTrack[];devices:MediaDeviceInfo[];deviceId:string;setDeviceId:(id:string)=>void;
  start:()=>Promise<void>;stop:()=>void;processingMs:number;frameCount:number;lastFrameAt:number|null;
  inferenceSize:416|640;setInferenceSize:(size:416|640)=>void;fps:number;latencyMs:number;
};
export const BrowserCameraContext=createContext<BrowserCameraState|null>(null);
export function useBrowserCamera(){const value=useContext(BrowserCameraContext);if(!value)throw new Error('Camera provider missing');return value;}
