from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
import math

from app.db.database import get_db
from app.db.models import DroneFleetModel, SurvivorModel, RescueTeamModel, HazardModel
from app.schemas.types import DroneFleetSchema
from app.services.dijkstra_router import find_nearest_team_dijkstra

router = APIRouter()

class AutonomousZoneRequest(BaseModel):
    zone_name: str = "Virtual Patrol Zone Alpha"
    center_lat: float = Field(default=10.936423, ge=-90, le=90)
    center_lng: float = Field(default=76.955785, ge=-180, le=180)
    radius_m: float = Field(default=120.0, gt=0, le=10000)
    auto_dispatch: bool = True

@router.get("/drone", response_model=DroneFleetSchema)
def get_primary_drone(db: Session = Depends(get_db)):
    drone = db.query(DroneFleetModel).filter(DroneFleetModel.drone_id == "RE-01").first()
    if not drone:
        drone = db.query(DroneFleetModel).first()
    if not drone:
        raise HTTPException(status_code=404, detail="No active drone telemetry found")
    return drone

@router.get("/drone/fleet", response_model=List[DroneFleetSchema])
def get_drone_fleet(db: Session = Depends(get_db)):
    return db.query(DroneFleetModel).all()

@router.post("/drone/command")
def send_drone_command(drone_id: str, command: str, db: Session = Depends(get_db)):
    drone = db.query(DroneFleetModel).filter(DroneFleetModel.drone_id == drone_id).first()
    if not drone:
        raise HTTPException(status_code=404, detail=f"Drone {drone_id} not found")

    cmd = command.upper()
    if cmd == "RETURN_TO_BASE":
        drone.status = "RETURNING"
    elif cmd == "PAUSE_SEARCH":
        drone.status = "ONLINE"
    elif cmd == "RESUME_SEARCH":
        drone.status = "MISSION_ACTIVE"

    else:
        raise HTTPException(422, "Unsupported drone command")

    db.commit()
    return {"message": f"Simulated command {cmd} dispatched to Drone {drone_id}", "status": drone.status}

@router.post("/drone/autonomous-zone")
def trigger_autonomous_zone_detection(
    req: AutonomousZoneRequest,
    db: Session = Depends(get_db)
):
    """Review a current camera target and optionally dispatch a simulated team."""
    from app.vision.camera_service import camera_service
    from app.schemas.types import SurvivorSchema
    from app.api.missions import dispatch_rescue_mission
    try:
        capture = camera_service.capture_snapshot()
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    candidates = [d for d in capture['detections'] if d['state'] == 'LIKELY_SURVIVOR']
    survivor = None
    for candidate in candidates:
        target = db.get(SurvivorModel, candidate['survivor_id'])
        if target and target.status in ('DETECTED', 'CONFIRMED'):
            north = math.radians(target.latitude - req.center_lat) * 6371000
            east = math.radians(target.longitude - req.center_lng) * 6371000 * math.cos(math.radians(req.center_lat))
            if math.hypot(north, east) > req.radius_m:
                continue
            survivor = target
            break
    if survivor is None:
        raise HTTPException(409, 'No unassigned live person track is ready inside the selected map zone. Keep a person in the camera view for several frames.')
    teams = db.query(RescueTeamModel).filter(RescueTeamModel.status.in_(['AVAILABLE', 'STANDBY'])).all()
    hazards = db.query(HazardModel).all()
    result = find_nearest_team_dijkstra(survivor.latitude, survivor.longitude,
        [dict(team_id=t.team_id, name=t.name, vehicle=t.vehicle, capabilities=t.capabilities,
              latitude=t.latitude, longitude=t.longitude, status=t.status) for t in teams],
        [dict(hazard_id=h.hazard_id, type=h.type, severity=h.severity,
              latitude=h.latitude, longitude=h.longitude, radius_m=h.radius_m) for h in hazards])
    team = result.get('recommended_team')
    if req.auto_dispatch and not team:
        raise HTTPException(409, 'No rescue team is available for simulated dispatch.')
    if req.auto_dispatch and team:
        dispatch_rescue_mission('M-101', survivor.survivor_id, team['team_id'], db)
        db.refresh(survivor)
    return dict(status='success', message='Live camera target reviewed. Check its location source; team movement is simulated.',
        survivor=SurvivorSchema.model_validate(survivor).model_dump(),
        assigned_team=team or dict(team_id=None, name='No available team', distance_m=0, eta_seconds=0, waypoints=[]),
        virtual_zone=dict(name=req.zone_name, center_lat=req.center_lat, center_lng=req.center_lng, radius_m=req.radius_m))
