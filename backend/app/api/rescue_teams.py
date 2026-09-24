from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.db.models import RescueTeamModel, SurvivorModel, HazardModel
from app.schemas.types import RescueTeamSchema
from app.services.dijkstra_router import find_nearest_team_dijkstra, compute_dijkstra_path
from app.services.dispatch_simulator import start_team_dispatch_simulation

router = APIRouter()

@router.get("/rescue-teams", response_model=List[RescueTeamSchema])
def get_rescue_teams(db: Session = Depends(get_db)):
    return db.query(RescueTeamModel).all()

@router.post("/rescue-teams/dijkstra-nearest")
def get_nearest_rescue_team_dijkstra(
    survivor_id: str = Query(..., description="ID of target survivor"),
    db: Session = Depends(get_db)
):
    """
    Evaluates all ground rescue teams using Dijkstra's Algorithm with hazard penalties
    to find and recommend the fastest, safest nearest rescue team.
    """
    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    if survivor.location_source == 'UNLOCATED':
        raise HTTPException(409, 'Capture location is unavailable. Verify the survivor location before routing or dispatch.')

    teams = db.query(RescueTeamModel).all()
    hazards = db.query(HazardModel).all()

    teams_list = [
        {
            "team_id": t.team_id,
            "name": t.name,
            "vehicle": t.vehicle,
            "capabilities": t.capabilities,
            "latitude": t.latitude,
            "longitude": t.longitude,
            "status": t.status
        }
        for t in teams
    ]

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

    result = find_nearest_team_dijkstra(survivor.latitude, survivor.longitude, teams_list, hazards_list)
    result["survivor_id"] = survivor_id
    return result

@router.post("/rescue-teams/dijkstra-route")
def get_dijkstra_route(
    team_id: str = Query(...),
    survivor_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Computes hazard-avoiding Dijkstra waypoints between a rescue team and a survivor.
    """
    team = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail=f"Rescue Team {team_id} not found")

    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    if survivor.location_source == 'UNLOCATED':
        raise HTTPException(409, 'Capture location is unavailable. Verify the survivor location before routing or dispatch.')

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
    return route

@router.post("/rescue-teams/{team_id}/assign")
def assign_team_to_survivor(team_id: str, survivor_id: str, db: Session = Depends(get_db)):
    """
    Assigns team to survivor and launches real-time Dijkstra dispatch simulation thread.
    """
    team = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail=f"Rescue Team {team_id} not found")

    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    if survivor.location_source == 'UNLOCATED':
        raise HTTPException(409, 'Capture location is unavailable. Verify the survivor location before routing or dispatch.')

    if team.status not in ('AVAILABLE', 'STANDBY'):
        raise HTTPException(409, 'Team is already assigned or unavailable')
    if survivor.status not in ('DETECTED', 'CONFIRMED'):
        raise HTTPException(409, 'Survivor is already assigned or rescue is complete')

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

    team.status = "EN_ROUTE"
    team.assigned_survivor_id = survivor_id
    team.current_mission = f"Rescue {survivor_id}"
    team.eta_seconds = route["eta_seconds"]

    survivor.status = "EN_ROUTE"
    survivor.assigned_team = team.name

    db.commit()

    # Trigger async Dijkstra movement thread
    start_team_dispatch_simulation(team_id, survivor_id)

    return {
        "message": f"Assigned {team.name} to {survivor_id} via Dijkstra Hazard Route",
        "team_id": team_id,
        "survivor_id": survivor_id,
        "eta_seconds": route["eta_seconds"],
        "waypoints": route["waypoints"],
        "total_distance_m": route["total_distance_m"]
    }

@router.post("/rescue-teams/reposition-nearby")
def reposition_teams_nearby(db: Session = Depends(get_db)):
    """
    Reposition ground rescue teams to forward tactical perimeters right near survivor detections.
    """
    from app.db.init_db import ensure_nearby_rescue_teams
    ensure_nearby_rescue_teams(db)
    teams = db.query(RescueTeamModel).all()
    return {
        "message": "Rescue teams successfully relocated to forward tactical positions near survivor coordinates",
        "teams": [
            {
                "team_id": t.team_id,
                "name": t.name,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "current_location_name": t.current_location_name,
                "status": t.status,
                "eta_seconds": t.eta_seconds
            }
            for t in teams
        ]
    }


from app.api.browser_camera import CaptureLocation

@router.post('/rescue-teams/align-capture')
def align_teams_to_capture(payload: CaptureLocation, db: Session = Depends(get_db)):
    """Place available simulated teams around an explicitly selected capture position."""
    import math
    if not payload.fresh(): raise HTTPException(422, 'Capture position expired. Refresh your location first.')
    teams=db.query(RescueTeamModel).filter(RescueTeamModel.status.in_(['AVAILABLE','STANDBY'])).all()
    if not teams: raise HTTPException(409, 'No available simulated teams to reposition.')
    for index,team in enumerate(teams):
        angle=2*math.pi*index/len(teams)
        team.latitude=max(-89.9,min(89.9,payload.latitude+math.cos(angle)*120/111320))
        team.longitude=(payload.longitude+math.sin(angle)*120/(111320*max(.01,math.cos(math.radians(payload.latitude))))+180)%360-180
        team.current_location_name='Simulated staging near capture device'
        team.eta_seconds=0
    db.commit()
    from app.websocket.manager import ws_manager
    ws_manager.broadcast_sync({'type':'team_status_updated'})
    return {'message':f'{len(teams)} available simulated teams staged near the capture position. Assigned teams continue their missions.'}
