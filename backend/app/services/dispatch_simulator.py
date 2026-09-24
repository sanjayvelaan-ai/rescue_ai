import time
import threading
from typing import Dict
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db.models import RescueTeamModel, SurvivorModel, HazardModel
from app.services.dijkstra_router import compute_dijkstra_path
from app.websocket.manager import ws_manager

# Active dispatch thread cancellation tokens per team
_active_simulations: Dict[str, threading.Event] = {}
_lock = threading.Lock()

def _animate_dispatch_thread(team_id: str, survivor_id: str, cancel_event: threading.Event):
    """
    Background worker that navigates the rescue team step-by-step along a Dijkstra hazard-avoiding path
    to the survivor's location, broadcasting live movement updates via broadcast_sync, updating status to ON_SITE,
    and setting survivor to RESCUED.
    """
    print(f"[RESCUE AI DispatchSimulator] Initiating Dijkstra team dispatch simulation: Team {team_id} -> Survivor {survivor_id}")
    db: Session = SessionLocal()

    try:
        team = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
        survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
        hazards = db.query(HazardModel).all()

        if not team or not survivor:
            print(f"[RESCUE AI DispatchSimulator] Error: Team {team_id} or Survivor {survivor_id} not found.")
            return

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

        # Calculate hazard-avoiding route using Dijkstra's Algorithm
        dijkstra_route = compute_dijkstra_path(
            team.latitude, team.longitude,
            survivor.latitude, survivor.longitude,
            hazards_list
        )

        waypoints = dijkstra_route["waypoints"]
        total_steps = len(waypoints)
        total_eta = dijkstra_route["eta_seconds"]

        # Broadcast initial dispatch confirmation immediately
        ws_manager.broadcast_sync({
            "type": "team_movement",
            "team_id": team_id,
            "team_name": team.name,
            "survivor_id": survivor_id,
            "latitude": team.latitude,
            "longitude": team.longitude,
            "status": "EN_ROUTE",
            "current_step": 0,
            "total_steps": total_steps,
            "remaining_waypoints": waypoints,
            "eta_seconds": total_eta
        })

        # Animate movement smoothly along waypoints (0.35s per waypoint step)
        for step_idx, pt in enumerate(waypoints):
            if cancel_event.is_set():
                print(f"[RESCUE AI DispatchSimulator] Dispatch for team {team_id} was preempted or cancelled.")
                return

            time.sleep(0.35)
            curr_lat, curr_lng = float(pt[0]), float(pt[1])

            t_obj = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
            if t_obj:
                t_obj.latitude = curr_lat
                t_obj.longitude = curr_lng
                t_obj.status = "EN_ROUTE"
                remaining_pct = 1.0 - ((step_idx + 1) / total_steps)
                t_obj.eta_seconds = max(0, int(total_eta * remaining_pct))
                db.commit()

            ws_manager.broadcast_sync({
                "type": "team_movement",
                "team_id": team_id,
                "team_name": team.name,
                "survivor_id": survivor_id,
                "latitude": curr_lat,
                "longitude": curr_lng,
                "status": "EN_ROUTE",
                "current_step": step_idx + 1,
                "total_steps": total_steps,
                "remaining_waypoints": waypoints[step_idx:],
                "eta_seconds": max(0, int(total_eta * (1.0 - ((step_idx + 1) / total_steps))))
            })

        if cancel_event.is_set():
            return

        # Team Arrived On Site
        time.sleep(0.5)
        t_obj = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
        s_obj = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()

        if t_obj:
            t_obj.status = "ON_SITE"
            t_obj.eta_seconds = 0
            db.commit()

        if s_obj:
            s_obj.status = "RESCUED"
            db.commit()

        ws_manager.broadcast_sync({
            "type": "survivor_rescued",
            "survivor_id": survivor_id,
            "team_id": team_id,
            "team_name": team.name if team else team_id,
            "message": f"SURVIVOR RESCUED: {survivor_id} successfully rescued by {team.name if team else team_id}!"
        })

        # Keep ON_SITE for 3 seconds, then reset team to AVAILABLE for next mission
        time.sleep(3.5)
        if cancel_event.is_set():
            return

        t_obj = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
        if t_obj:
            t_obj.status = "AVAILABLE"
            t_obj.assigned_survivor_id = None
            t_obj.current_mission = None
            db.commit()

            ws_manager.broadcast_sync({
                "type": "team_status_updated",
                "team_id": team_id,
                "status": "AVAILABLE",
                "latitude": t_obj.latitude,
                "longitude": t_obj.longitude
            })

    except Exception as e:
        print(f"[RESCUE AI DispatchSimulator] Exception in Dijkstra team movement thread: {e}")
        db.rollback()
    finally:
        with _lock:
            if _active_simulations.get(team_id) == cancel_event:
                del _active_simulations[team_id]
        db.close()

def start_team_dispatch_simulation(team_id: str, survivor_id: str):
    """Launches non-blocking daemon thread to animate rescue team dispatch along Dijkstra route."""
    cancel_event = threading.Event()
    with _lock:
        if team_id in _active_simulations:
            _active_simulations[team_id].set()
        _active_simulations[team_id] = cancel_event

    t = threading.Thread(target=_animate_dispatch_thread, args=(team_id, survivor_id, cancel_event), daemon=True)
    t.start()
