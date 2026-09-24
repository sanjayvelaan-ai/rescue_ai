from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime
from datetime import datetime, timezone
from app.db.database import Base

class SurvivorModel(Base):
    __tablename__ = "survivors"

    survivor_id = Column(String, primary_key=True, index=True)
    status = Column(String, default="DETECTED")  # DETECTED, CONFIRMED, ASSIGNED, EN_ROUTE, ON_SITE, RESCUED, RESOLVED, LOST_SIGNAL
    priority = Column(String, default="MEDIUM")  # CRITICAL, HIGH, MEDIUM, LOW
    model_confidence = Column(Float, default=0.0)
    fusion_confidence = Column(Float, default=0.0)
    rgb_confirmed = Column(Boolean, default=False)
    thermal_confirmed = Column(Boolean, default=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_source = Column(String, default='SIMULATION', nullable=False)
    location_accuracy_m = Column(Float, nullable=True)
    capture_source = Column(String, default="SERVER_CAMERA", nullable=False)
    timestamp = Column(String, nullable=False)
    detection_frame_path = Column(String, nullable=True)
    thermal_frame_path = Column(String, nullable=True)
    sector = Column(String, default="B-4")
    assigned_team = Column(String, nullable=True)
    mission_id = Column(String, default="M-101")
    first_detected = Column(String, nullable=False)
    last_detected = Column(String, nullable=False)
    priority_reason = Column(Text, nullable=True)

class AlertModel(Base):
    __tablename__ = "alerts"

    alert_id = Column(String, primary_key=True, index=True)
    type = Column(String, nullable=False)  # SURVIVOR_DETECTED, FIRE_DETECTED, etc.
    severity = Column(String, default="INFO")  # CRITICAL, WARNING, INFO
    timestamp = Column(String, nullable=False)
    location = Column(String, nullable=True)
    lat_lng_tag = Column(String, nullable=True)
    sector = Column(String, default="Sector B-4")
    survivor_id = Column(String, nullable=True)
    priority_score = Column(Integer, default=95)
    ai_recommendation = Column(Text, nullable=True)
    frame_snapshot_path = Column(String, nullable=True)
    thermal_snapshot_path = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String, default="UNREAD")  # UNREAD, ACKNOWLEDGED, RESOLVED
    acknowledged_at = Column(String, nullable=True)
    resolved_at = Column(String, nullable=True)

class RescueTeamModel(Base):
    __tablename__ = "rescue_teams"

    team_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    members_count = Column(Integer, default=4)
    vehicle = Column(String, nullable=False)
    capabilities = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    current_location_name = Column(String, default="Base Camp")
    current_mission = Column(String, nullable=True)
    assigned_survivor_id = Column(String, nullable=True)
    eta_seconds = Column(Integer, default=0)
    status = Column(String, default="AVAILABLE")  # AVAILABLE, STANDBY, EN_ROUTE, APPROACHING, ON_SITE, RETURNING, OFFLINE

class MissionModel(Base):
    __tablename__ = "missions"

    mission_id = Column(String, primary_key=True, index=True)
    drone_id = Column(String, default="RE-01")
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=True)
    search_sector = Column(String, default="Sector Bravo-4")
    coverage_pct = Column(Float, default=0.0)
    survivors_detected = Column(Integer, default=0)
    survivors_confirmed = Column(Integer, default=0)
    survivors_rescued = Column(Integer, default=0)
    distance_covered_km = Column(Float, default=0.0)
    status = Column(String, default="ACTIVE")  # ACTIVE, PAUSED, COMPLETED, ABORTED

class DroneFleetModel(Base):
    __tablename__ = "drone_fleet"

    drone_id = Column(String, primary_key=True, index=True)
    battery_pct = Column(Float, default=95.0)
    altitude_m = Column(Float, default=45.0)
    speed_m_s = Column(Float, default=12.5)
    heading_deg = Column(Float, default=120.0)
    latitude = Column(Float, default=10.936423)
    longitude = Column(Float, default=76.955785)
    signal_strength_pct = Column(Float, default=98.0)
    temperature_c = Column(Float, default=34.5)
    current_mission_id = Column(String, default="M-101")
    status = Column(String, default="ONLINE")  # ONLINE, OFFLINE, RETURNING, LOW_BATTERY, MISSION_ACTIVE

class HazardModel(Base):
    __tablename__ = "hazards"

    hazard_id = Column(String, primary_key=True, index=True)
    type = Column(String, nullable=False)  # FIRE, STRUCTURAL, SMOKE, GAS, FLOOD, DEBRIS
    severity = Column(String, default="HIGH")  # CRITICAL, HIGH, MEDIUM
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_m = Column(Float, default=50.0)
    description = Column(String, nullable=True)

class SimulationEventModel(Base):
    __tablename__ = "simulation_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    step_number = Column(Integer, nullable=False)
    timestamp = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
