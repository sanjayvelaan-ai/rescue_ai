from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import SurvivorModel, HazardModel, RescueTeamModel, DroneFleetModel

router = APIRouter()

@router.get("/map/state")
def get_map_state(db: Session = Depends(get_db)):
    drone = db.query(DroneFleetModel).filter(DroneFleetModel.drone_id == "RE-01").first()
    survivors = db.query(SurvivorModel).all()
    hazards = db.query(HazardModel).all()
    teams = db.query(RescueTeamModel).all()

    return {
        "drone": {
            "id": drone.drone_id if drone else "RE-01",
            "latitude": drone.latitude if drone else 10.936423,
            "longitude": drone.longitude if drone else 76.955785,
            "heading": drone.heading_deg if drone else 120.0,
            "battery": drone.battery_pct if drone else 92.0,
            "status": drone.status if drone else "ONLINE"
        },
        "survivors": [
            {
                "id": s.survivor_id,
                "status": s.status,
                "priority": s.priority,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "location_source": s.location_source,
                "location_accuracy_m": s.location_accuracy_m,
                "fusion_confidence": s.fusion_confidence,
                "model_confidence": s.model_confidence,
                "assigned_team": s.assigned_team,
                "timestamp": s.timestamp
            } for s in survivors
        ],
        "hazards": [
            {
                "id": h.hazard_id,
                "hazard_id": h.hazard_id,
                "type": h.type,
                "severity": h.severity,
                "latitude": h.latitude,
                "longitude": h.longitude,
                "radius_m": h.radius_m,
                "description": h.description
            } for h in hazards
        ],
        "teams": [
            {
                "id": t.team_id,
                "name": t.name,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "status": t.status,
                "assigned_survivor_id": t.assigned_survivor_id,
                "eta_seconds": t.eta_seconds
            } for t in teams
        ]
    }
