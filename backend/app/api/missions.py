from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from app.db.database import get_db
from app.db.models import MissionModel, SurvivorModel, RescueTeamModel
from app.schemas.types import MissionSchema
from app.services.dispatch_simulator import start_team_dispatch_simulation

router = APIRouter()

@router.get("/missions", response_model=List[MissionSchema])
def get_missions(db: Session = Depends(get_db)):
    return db.query(MissionModel).order_by(MissionModel.start_time.desc()).all()

@router.get("/missions/{mission_id}", response_model=MissionSchema)
def get_mission_by_id(mission_id: str, db: Session = Depends(get_db)):
    mission = db.query(MissionModel).filter(MissionModel.mission_id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission {mission_id} not found")
    return mission

@router.post("/missions/{mission_id}/dispatch")
def dispatch_rescue_mission(mission_id: str, survivor_id: str, team_id: str, db: Session = Depends(get_db)):
    mission = db.query(MissionModel).filter(MissionModel.mission_id == mission_id).first()
    if not mission:
        mission = MissionModel(mission_id=mission_id, start_time=datetime.now(timezone.utc).isoformat(), status="ACTIVE")
        db.add(mission)
    else:
        mission.status = "ACTIVE"

    team = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Selected rescue team not found")
    if team.status not in ('AVAILABLE', 'STANDBY'):
        raise HTTPException(status_code=409, detail="Selected team is already assigned or unavailable")

    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    if survivor.location_source == 'UNLOCATED':
        raise HTTPException(409, 'No capture location saved. Verify location before dispatch.')
    if survivor.status not in ('DETECTED', 'CONFIRMED'):
        raise HTTPException(status_code=409, detail="Survivor is already assigned or the rescue is complete")

    from app.db.models import HazardModel
    from app.services.dijkstra_router import compute_dijkstra_path

    hazards = db.query(HazardModel).all()
    hazards_list = [
        {
            "hazard_id": h.hazard_id,
            "type": h.type,
            "severity": h.severity,
            "latitude": h.latitude,
            "longitude": h.longitude,
            "radius_m": h.radius_m
        }
        for h in hazards
    ]

    route = compute_dijkstra_path(
        team.latitude, team.longitude,
        survivor.latitude, survivor.longitude,
        hazards_list
    )

    survivor.status = "EN_ROUTE"
    survivor.assigned_team = team.name

    team.status = "EN_ROUTE"
    team.assigned_survivor_id = survivor_id
    team.current_mission = f"Rescue {survivor_id}"
    team.eta_seconds = route["eta_seconds"]

    db.commit()

    # Launch live team movement animation on Leaflet map
    start_team_dispatch_simulation(team.team_id, survivor_id)

    return {
        "status": "DISPATCHED",
        "mission_id": mission_id,
        "survivor_id": survivor_id,
        "team_id": team.team_id,
        "team_name": team.name,
        "eta_seconds": route["eta_seconds"],
        "waypoints": route["waypoints"]
    }
