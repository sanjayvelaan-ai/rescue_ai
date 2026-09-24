import type { Survivor, Alert, RescueTeam, Mission, DroneFleet, Hazard, SystemStatus, CandidateTrack } from '../types';
import type { RadarStatus, RadarWaveformPoint, SensorFusionState } from '../types/radar';

import {backendUrl} from '../lib/backend-url';
const API_BASE_URL = backendUrl('/api');

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API Error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export const api = {
  updateDeviceLocation: (fix: {latitude:number; longitude:number; accuracy_m:number|null; observed_at:number; source?:string}) => fetchJson('/system/device-location', {method:'POST', body:JSON.stringify(fix)}),
  clearDeviceLocation: () => fetchJson('/system/device-location', {method:'DELETE'}),
  alignTeams: (fix: {latitude:number;longitude:number;accuracy_m:number|null;observed_at:number;source?:string}) => fetchJson<{message:string}>('/rescue-teams/align-capture', {method:'POST',body:JSON.stringify(fix)}),
  // System
  saveConfiguration: (config: {model_path: string; confidence_threshold: number; iou_threshold: number; camera_index: number}) => fetchJson<{message: string}>('/system/config', {method: 'POST', body: JSON.stringify(config)}),
  getHealth: () => fetchJson<{ status: string; camera_online: boolean; model_online: boolean; device: string }>('/health'),
  getSystemStatus: () => fetchJson<SystemStatus>('/system/status'),
  getCandidates: () => fetchJson<CandidateTrack[]>('/pipeline/candidates'),
  getPipelineConfig: () => fetchJson<any>('/pipeline/config'),
  retryCamera: () => fetchJson<{ message: string }>('/system/retry-camera', { method: 'POST' }),
  toggleCamera: (enabled?: boolean) => fetchJson<{ message: string; camera_enabled: boolean }>(`/system/toggle-camera${enabled !== undefined ? `?enabled=${enabled}` : ''}`, { method: 'POST' }),
  captureCameraSnapshot: () => fetchJson<{
    status: string;
    message: string;
    snapshot_id: string;
    timestamp: string;
    rgb_snapshot_path: string;
    thermal_snapshot_path: string;
    drone_location: { latitude: number; longitude: number };
    model: string;
    detections: Array<{
      survivor_id: string;
      confidence: number;
      latitude: number;
      longitude: number;
      lat_lng_tag: string;
      bbox: number[];
    }>;
    alert_created?: any;
  }>('/system/capture-snapshot', { method: 'POST' }),

  // Survivors
  getSurvivors: (status?: string) => fetchJson<Survivor[]>(`/survivors${status ? `?status=${status}` : ''}`),
  getSurvivorById: (id: string) => fetchJson<Survivor>(`/survivors/${id}`),
  updateSurvivorStatus: (id: string, status: string) => fetchJson<{ message: string }>(`/survivors/${id}/status?status=${status}`, { method: 'POST' }),

  // Alerts
  getAlerts: (severity?: string, status?: string) => {
    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<Alert[]>(`/alerts${query}`);
  },
  acknowledgeAlert: (id: string) => fetchJson<{ message: string }>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  resolveAlert: (id: string) => fetchJson<{ message: string }>(`/alerts/${id}/resolve`, { method: 'POST' }),
  clearHistory: () => fetchJson<{ status: string; message: string }>('/alerts/clear-history', { method: 'POST' }),

  // Rescue Teams & Dijkstra Router
  getRescueTeams: () => fetchJson<RescueTeam[]>('/rescue-teams'),
  repositionTeamsNearby: () => fetchJson<{ message: string; teams: RescueTeam[] }>('/rescue-teams/reposition-nearby', { method: 'POST' }),
  assignTeam: (teamId: string, survivorId: string) => fetchJson<{ message: string; eta_seconds: number; waypoints?: [number, number][] }>(`/rescue-teams/${teamId}/assign?survivor_id=${survivorId}`, { method: 'POST' }),
  getNearestTeamDijkstra: (survivorId: string, signal?:AbortSignal) => fetchJson<{ survivor_location: [number, number]; recommended_team: any; all_teams_evaluated: any[] }>(`/rescue-teams/dijkstra-nearest?survivor_id=${encodeURIComponent(survivorId)}`, { method: 'POST', signal }),
  getDijkstraRoute: (teamId: string, survivorId: string) => fetchJson<{ start: [number, number]; destination: [number, number]; waypoints: [number, number][]; total_distance_m: number; eta_seconds: number }>(`/rescue-teams/dijkstra-route?team_id=${teamId}&survivor_id=${survivorId}`, { method: 'POST' }),

  // Missions
  getMissions: () => fetchJson<Mission[]>('/missions'),
  getMissionById: (id: string) => fetchJson<Mission>(`/missions/${id}`),
  dispatchMission: (missionId: string, survivorId: string, teamId: string) =>
    fetchJson<{ status: string; team_name: string; eta_seconds: number }>(`/missions/${missionId}/dispatch?survivor_id=${survivorId}&team_id=${teamId}`, { method: 'POST' }),

  // Drone & Autonomous Detection
  getDrone: () => fetchJson<DroneFleet>('/drone'),
  getDroneFleet: () => fetchJson<DroneFleet[]>('/drone/fleet'),
  sendDroneCommand: (droneId: string, command: string) => fetchJson<{ message: string; status: string }>(`/drone/command?drone_id=${droneId}&command=${command}`, { method: 'POST' }),
  triggerAutonomousZoneDetection: (params: {
    zone_name?: string;
    center_lat: number;
    center_lng: number;
    radius_m?: number;
    auto_dispatch?: boolean;
  }) => fetchJson<{
    status: string;
    message: string;
    survivor: Survivor;
    assigned_team: {
      team_id: string;
      name: string;
      distance_m: number;
      eta_seconds: number;
      waypoints: [number, number][];
    };
    virtual_zone: {
      name: string;
      center_lat: number;
      center_lng: number;
      radius_m: number;
    };
  }>('/drone/autonomous-zone', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

  // Operational Map State
  getMapState: async () => {
    const state = await fetchJson<{ drone: any; survivors: Survivor[]; hazards: Array<Omit<Hazard, 'hazard_id'> & {id: string}>; teams: RescueTeam[] }>('/map/state');
    return {...state, hazards: state.hazards.map(h => ({...h, hazard_id: h.id}))};
  },

  // Simulation Controls
  startSimulation: () => fetchJson<{ status: string; step: number }>('/simulation/start', { method: 'POST' }),
  pauseSimulation: () => fetchJson<{ status: string; step: number }>('/simulation/pause', { method: 'POST' }),
  resetSimulation: () => fetchJson<{ status: string; step: number }>('/simulation/reset', { method: 'POST' }),
  nextSimulationEvent: () => fetchJson<{ status: string; step: number }>('/simulation/next-event', { method: 'POST' }),
  fastForwardSimulation: () => fetchJson<{ status: string; delay: number }>('/simulation/fast-forward', { method: 'POST' }),

  // UWB Through-Wall Radar Module
  getRadarStatus: () => fetchJson<RadarStatus>('/radar/status'),
  getRadarWaveform: () => fetchJson<{ status: string; waveform: RadarWaveformPoint[] }>('/radar/waveform'),
  startRadarTest: () => fetchJson<{ status: string; message: string }>('/radar/start-test', { method: 'POST' }),
  stopRadarTest: () => fetchJson<{ status: string; message: string }>('/radar/stop-test', { method: 'POST' }),
  simulateHumanTarget: (targetRangeM: number = 8.4) => fetchJson<{ status: string; message: string; alert: any }>('/radar/simulate-human', {
    method: 'POST',
    body: JSON.stringify({ target_range_m: targetRangeM })
  }),
  configureRadar: (params: {
    frequency_ghz?: number;
    target_range_m?: number;
    target_type?: string;
    obstruction_type?: string;
    rubble_thickness_m?: number;
  }) => fetchJson<any>('/radar/configure', {
    method: 'POST',
    body: JSON.stringify(params)
  }),
  getSensorFusionStatus: (thermal: boolean = true, rgb: boolean = false, lidar: boolean = true) =>
    fetchJson<SensorFusionState>(`/radar/fusion-status?thermal_detected=${thermal}&rgb_confirmed=${rgb}&lidar_obstruction=${lidar}`),
};

export const resolveSnapshotUrl = (path?: string, _survivorId?: string, _isThermal = false): string => {
  if (!path) return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#18181b"/><text x="160" y="100" fill="#a1a1aa" font-size="14" text-anchor="middle">No sensor snapshot available</text></svg>');
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return backendUrl(path.startsWith('/') ? path : `/${path}`);
};
