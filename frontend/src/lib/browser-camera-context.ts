import { createContext, useContext } from 'react';
import type { LocalSurvivorTrack } from './detection-config';

export type CameraTrack = LocalSurvivorTrack | {
  survivor_id: string;
  id: string;
  confidence: number;
  state: string;
  track_id: number | string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  [key: string]: any;
};

export type BackendStatusState = 'IDLE' | 'WAKING' | 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface MissionAlertItem {
  id: string;
  trackId: string;
  title: string;
  message: string;
  confidence: number;
  location: string;
  timestamp: string;
}

export type BrowserCameraState = {
  active: boolean;
  starting: boolean;
  error: string;
  sourceId: string;
  preview: string;
  thermalPreview: string;
  stream: MediaStream | null;
  tracks: CameraTrack[];
  localTracks: LocalSurvivorTrack[];
  devices: MediaDeviceInfo[];
  deviceId: string;
  setDeviceId: (id: string) => void;
  start: () => Promise<void>;
  stop: () => void;
  processingMs: number;
  frameCount: number;
  lastFrameAt: number | null;
  inferenceSize: 416 | 640;
  setInferenceSize: (size: 416 | 640) => void;
  fps: number; // Video stream frame rate (~24-30 FPS)
  inferenceFps: number; // YOLO inference frame rate (~1.5-2 FPS)
  latencyMs: number;
  backendStatus: BackendStatusState;
  survivorCount: number;
  recentAlerts: MissionAlertItem[];
};

export const BrowserCameraContext = createContext<BrowserCameraState | null>(null);

export function useBrowserCamera() {
  const value = useContext(BrowserCameraContext);
  if (!value) throw new Error('Camera provider missing');
  return value;
}
