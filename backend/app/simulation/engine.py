import asyncio
import math
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import (
    SurvivorModel, AlertModel, RescueTeamModel, MissionModel, DroneFleetModel
)
from app.websocket.manager import ws_manager

class SimulationEngine:
    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.current_step = 0
        self.task: Optional[asyncio.Task] = None
        self.step_delay = 2.5  # seconds per step

        # Simulated path coordinates
        self.drone_path = [
            (10.936423, 76.955785),
            (10.937223, 76.956585),
            (10.937823, 76.957285),
            (10.937223, 76.957985),
            (10.936223, 76.957585),
            (10.935623, 76.956285)
        ]

    def start(self):
        if self.is_running:
            self.is_paused = False
            return
        self.is_running = True
        self.is_paused = False
        self.task = asyncio.create_task(self._run_loop())
        print("[RESCUE AI Simulation] Simulation started.")

    def pause(self):
        self.is_paused = True
        print("[RESCUE AI Simulation] Simulation paused.")

    def reset(self):
        self.is_running = False
        self.is_paused = False
        self.current_step = 0
        if self.task:
            self.task.cancel()
        print("[RESCUE AI Simulation] Simulation reset.")

    def fast_forward(self):
        self.step_delay = max(0.5, self.step_delay / 2.0)
        print(f"[RESCUE AI Simulation] Fast-forwarded. Step delay: {self.step_delay}s")

    async def next_event(self):
        await self._execute_step(self.current_step + 1)

    async def _run_loop(self):
        while self.is_running:
            if not self.is_paused:
                self.current_step += 1
                await self._execute_step(self.current_step)
                if self.current_step >= 20:
                    print("[RESCUE AI Simulation] Completed full 20-step hackathon demo scenario.")
                    self.is_paused = True
            await asyncio.sleep(self.step_delay)

    async def _execute_step(self, step: int):
        now_iso = datetime.now(timezone.utc).isoformat()
        db: Session = SessionLocal()

        try:
            event_type = f"SIMULATION_STEP_{step}"
            details = ""

            if step == 1:
                details = "Drone RE-01 pre-flight checks complete. Launching into airspace."
                db.query(DroneFleetModel).filter(DroneFleetModel.drone_id == "RE-01").update({
                    "status": "MISSION_ACTIVE", "battery_pct": 98.0, "altitude_m": 45.0, "speed_m_s": 12.0
                })
            elif step == 2:
                details = "Drone RE-01 enters Sector Bravo-4 search grid. Scanning operational area."
                db.query(MissionModel).filter(MissionModel.mission_id == "M-101").update({"coverage_pct": 15.0})
            elif step == 3:
                details = "Thermal & RGB sensors active. Search sector 25% scanned."
                db.query(MissionModel).filter(MissionModel.mission_id == "M-101").update({"coverage_pct": 25.0})
            elif step == 4:
                details = "Drone flight telemetry and waypoint path updating on disaster map."
                db.query(DroneFleetModel).filter(DroneFleetModel.drone_id == "RE-01").update({
                    "latitude": 10.937223, "longitude": 76.956585, "heading_deg": 45.0
                })
            elif step == 5:
                details = "THERMAL ANOMALY DETECTED in Sector B-4 commercial zone!"
            elif step == 6:
                details = "RGB Camera stream identifies potential human figure near building collapse."
            elif step == 7:
                details = "THERMAL SIMULATION (COLORMAP_INFERNO) independently confirms 37.2°C heat signature."
            elif step == 8:
                details = "AI Fusion Engine confirms candidate survivor: Creating persistent record S-007."
                survivor = SurvivorModel(
                    survivor_id="S-007",
                    status="CONFIRMED",
                    priority="CRITICAL",
                    model_confidence=0.96,
                    fusion_confidence=0.95,
                    rgb_confirmed=True,
                    thermal_confirmed=True,
                    latitude=10.936423,
                    longitude=76.955785,
                    timestamp=now_iso,
                    detection_frame_path="/data/detections/S-007_demo_rgb.jpg",
                    thermal_frame_path="/data/detections/S-007_demo_thermal.jpg",
                    sector="B-4",
                    first_detected=now_iso,
                    last_detected=now_iso,
                    priority_reason="RGB + thermal dual-stream confirmation with sustained thermal anomaly near active fire."
                )
                db.merge(survivor)
            elif step == 9:
                details = "Survivor S-007 GPS location tagged at 10.9364, 76.9558 (±2.4m accuracy)."
            elif step == 10:
                details = "CRITICAL RESCUE ALERT generated for Survivor S-007."
                alert = AlertModel(
                    alert_id=f"ALT-S007-{int(time.time())}",
                    type="SURVIVOR_DETECTED",
                    severity="CRITICAL",
                    timestamp=now_iso,
                    location="10.9364, 76.9558",
                    survivor_id="S-007",
                    message="CRITICAL RESCUE ALERT: Survivor S-007 confirmed in Sector B-4 (96% model, 95% fusion).",
                    status="UNREAD"
                )
                db.merge(alert)
            elif step == 11:
                details = "Rescue Priority Engine selects nearest recommended unit: TEAM ALPHA (1.8 km, ETA 03:45)."
            elif step == 12:
                details = "OPERATOR ACTION: Team Alpha DISPATCHED to Survivor S-007."
                db.query(RescueTeamModel).filter(RescueTeamModel.team_id == "T-ALPHA").update({
                    "status": "EN_ROUTE", "assigned_survivor_id": "S-007", "eta_seconds": 225, "current_mission": "Rescue S-007"
                })
                db.query(SurvivorModel).filter(SurvivorModel.survivor_id == "S-007").update({
                    "status": "EN_ROUTE", "assigned_team": "Team Alpha"
                })
            elif step == 13:
                details = "Tactical rescue route drawn on disaster map from Base Camp Alpha to S-007."
            elif step == 14:
                details = "Live ETA countdown calculated: 03:45 remaining."
            elif step == 15:
                details = "Team Alpha status updated: APPROACHING survivor location (0.4 km remaining)."
                db.query(RescueTeamModel).filter(RescueTeamModel.team_id == "T-ALPHA").update({
                    "status": "APPROACHING", "latitude": 10.934923, "longitude": 76.954285, "eta_seconds": 60
                })
                db.query(SurvivorModel).filter(SurvivorModel.survivor_id == "S-007").update({
                    "status": "ON_SITE"
                })
            elif step == 16:
                details = "Team Alpha status: ON SITE at S-007 coordinates. Commencing extraction."
                db.query(RescueTeamModel).filter(RescueTeamModel.team_id == "T-ALPHA").update({
                    "status": "ON_SITE", "latitude": 10.936223, "longitude": 76.955585, "eta_seconds": 0
                })
            elif step == 17:
                details = "Survivor S-007 safely extracted and stabilized. Status changed to RESCUED!"
                db.query(SurvivorModel).filter(SurvivorModel.survivor_id == "S-007").update({
                    "status": "RESCUED"
                })
                db.query(MissionModel).filter(MissionModel.mission_id == "M-101").update({
                    "survivors_rescued": MissionModel.survivors_rescued + 1
                })
            elif step == 18:
                details = "Team Alpha returning to Base Camp Alpha with rescued survivor."
                db.query(RescueTeamModel).filter(RescueTeamModel.team_id == "T-ALPHA").update({
                    "status": "RETURNING"
                })
            elif step == 19:
                details = "Rescue mission log updated. All telemetry synced to SQLite database."
            elif step == 20:
                details = "Scenario complete. Sector Bravo-4 search coverage: 100%. System returning to ready monitoring."
                db.query(MissionModel).filter(MissionModel.mission_id == "M-101").update({"coverage_pct": 100.0})

            db.commit()

            # Broadcast simulation step over WebSocket
            await ws_manager.broadcast({
                "type": "simulation_event",
                "step": step,
                "timestamp": now_iso,
                "event_type": event_type,
                "message": details
            })

        except Exception as e:
            print(f"[RESCUE AI ERROR] Exception in simulation step {step}: {e}")
            db.rollback()
        finally:
            db.close()

simulation_engine = SimulationEngine()
