export type SurvivorStatus =
  | 'DETECTED'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'RESCUED'
  | 'RESOLVED'
  | 'LOST_SIGNAL';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Survivor {
  location_source?: 'DEVICE_LOCATION' | 'SIMULATION' | 'USER_PIN' | 'UNLOCATED';
  location_accuracy_m?: number | null;
  capture_source?: string;
  survivor_id: string;
  status: SurvivorStatus;
  priority: PriorityLevel;
  model_confidence: number;
  fusion_confidence: number;
  rgb_confirmed: boolean;
  thermal_confirmed: boolean;
  latitude: number;
  longitude: number;
  timestamp: string;
  detection_frame_path?: string;
  thermal_frame_path?: string;
  sector: string;
  assigned_team?: string;
  mission_id: string;
  first_detected: string;
  last_detected: string;
  priority_reason?: string;
}

export interface Alert {
  alert_id: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
  location?: string;
  lat_lng_tag?: string;
  sector?: string;
  survivor_id?: string;
  priority_score?: number;
  ai_recommendation?: string;
  frame_snapshot_path?: string;
  thermal_snapshot_path?: string;
  message: string;
  status: 'UNREAD' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledged_at?: string;
  resolved_at?: string;
}

export interface RescueTeam {
  team_id: string;
  name: string;
  members_count: number;
  vehicle: string;
  capabilities: string;
  latitude: number;
  longitude: number;
  current_location_name: string;
  current_mission?: string;
  assigned_survivor_id?: string;
  eta_seconds: number;
  status: 'AVAILABLE' | 'STANDBY' | 'EN_ROUTE' | 'APPROACHING' | 'ON_SITE' | 'RETURNING' | 'OFFLINE';
}

export interface Mission {
  mission_id: string;
  drone_id: string;
  start_time: string;
  end_time?: string;
  search_sector: string;
  coverage_pct: number;
  survivors_detected: number;
  survivors_confirmed: number;
  survivors_rescued: number;
  distance_covered_km: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABORTED';
}

export interface DroneFleet {
  drone_id: string;
  battery_pct: number;
  altitude_m: number;
  speed_m_s: number;
  heading_deg: number;
  latitude: number;
  longitude: number;
  signal_strength_pct: number;
  temperature_c: number;
  current_mission_id: string;
  status: 'ONLINE' | 'OFFLINE' | 'RETURNING' | 'LOW_BATTERY' | 'MISSION_ACTIVE';
}

export interface Hazard {
  hazard_id: string;
  type: 'FIRE' | 'STRUCTURAL' | 'SMOKE' | 'GAS' | 'FLOOD' | 'DEBRIS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  latitude: number;
  longitude: number;
  radius_m: number;
  description?: string;
}

export interface CandidateTrack {
  observed_frames?: number;
  consecutive_frames?: number;
  alert_saved?: boolean;
  id: string;
  track_id: number;
  priority: PriorityLevel;
  confidence: number;
  yolo_confidence: number;
  thermal_score: number;
  shape_score: number;
  temporal_score: number;
  context_score: number;
  rgb_score: number;
  final_confidence: number;
  state: 'CONFIRMED_SURVIVOR' | 'LIKELY_SURVIVOR' | 'VERIFYING' | 'LOW_CONFIDENCE' | 'REJECTED' | string;
  reason: string;
  rejection_code?: string;
  status: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SystemStatus {
  tracking?: {
    method: string;
    visible_tracks: number;
    retained_tracks: number;
    lost_track_timeout_seconds: number;
    confirmation_frames: number;
    last_frame_age_seconds: number | null;
  };
  camera_error?: string;
  model_error?: string;
  camera_index?: number;
  model_path?: string;
  confidence_threshold?: number;
  iou_threshold?: number;
  inference_fps?: number;
  system_online: boolean;
  camera_online: boolean;
  camera_enabled?: boolean;
  model_online: boolean;
  model_name: string;
  device: string;
  fps: number;
  gps_mode: string;
  simulation_active: boolean;
  active_survivors: number;
  total_rescued: number;
  candidates?: CandidateTrack[];
}

export const Survivor = {};
export const Alert = {};
export const RescueTeam = {};
export const Mission = {};
export const DroneFleet = {};
export const Hazard = {};
export const SystemStatus = {};
export const CandidateTrack = {};
