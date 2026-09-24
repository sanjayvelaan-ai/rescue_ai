from pydantic import BaseModel
from typing import Optional, List

class SurvivorSchema(BaseModel):
    location_source: str = 'SIMULATION'
    location_accuracy_m: Optional[float] = None
    capture_source: str = "SERVER_CAMERA"
    survivor_id: str
    status: str
    priority: str
    model_confidence: float
    fusion_confidence: float
    rgb_confirmed: bool
    thermal_confirmed: bool
    latitude: float
    longitude: float
    timestamp: str
    detection_frame_path: Optional[str] = None
    thermal_frame_path: Optional[str] = None
    sector: str
    assigned_team: Optional[str] = None
    mission_id: str
    first_detected: str
    last_detected: str
    priority_reason: Optional[str] = None

    class Config:
        from_attributes = True

class AlertSchema(BaseModel):
    alert_id: str
    type: str
    severity: str
    timestamp: str
    location: Optional[str] = None
    lat_lng_tag: Optional[str] = None
    sector: Optional[str] = "Sector B-4"
    survivor_id: Optional[str] = None
    priority_score: Optional[int] = 95
    ai_recommendation: Optional[str] = None
    frame_snapshot_path: Optional[str] = None
    thermal_snapshot_path: Optional[str] = None
    message: str
    status: str
    acknowledged_at: Optional[str] = None
    resolved_at: Optional[str] = None

    class Config:
        from_attributes = True

class RescueTeamSchema(BaseModel):
    team_id: str
    name: str
    members_count: int
    vehicle: str
    capabilities: str
    latitude: float
    longitude: float
    current_location_name: str
    current_mission: Optional[str] = None
    assigned_survivor_id: Optional[str] = None
    eta_seconds: int
    status: str

    class Config:
        from_attributes = True

class MissionSchema(BaseModel):
    mission_id: str
    drone_id: str
    start_time: str
    end_time: Optional[str] = None
    search_sector: str
    coverage_pct: float
    survivors_detected: int
    survivors_confirmed: int
    survivors_rescued: int
    distance_covered_km: float
    status: str

    class Config:
        from_attributes = True

class DroneFleetSchema(BaseModel):
    drone_id: str
    battery_pct: float
    altitude_m: float
    speed_m_s: float
    heading_deg: float
    latitude: float
    longitude: float
    signal_strength_pct: float
    temperature_c: float
    current_mission_id: str
    status: str

    class Config:
        from_attributes = True

class HazardSchema(BaseModel):
    hazard_id: str
    type: str
    severity: str
    latitude: float
    longitude: float
    radius_m: float
    description: Optional[str] = None

    class Config:
        from_attributes = True

class SystemStatusSchema(BaseModel):
    system_online: bool
    camera_online: bool
    model_online: bool
    model_name: str
    device: str
    fps: float
    gps_mode: str
    simulation_active: bool
    active_survivors: int
    total_rescued: int
