"""
Radar Service for RESCUE-AI.
Manages radar state machine, automated test routines, real-time alert generation,
database persistence, and WebSocket push broadcasts to connected UI clients.
"""

import time
import asyncio
import threading
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.radar.simulation_radar import SimulationRadar
from app.radar.radar_interface import RadarStatusDTO
from app.websocket.manager import ws_manager
from app.db.database import SessionLocal
from app.db.models import AlertModel, SurvivorModel
from app.services.gps_service import gps_service

class RadarService:
    def __init__(self):
        self.radar = SimulationRadar()
        self._test_task: Optional[asyncio.Task] = None
        self._test_thread: Optional[threading.Thread] = None
        self._is_testing = False
        self._lock = threading.Lock()

    def get_status(self) -> RadarStatusDTO:
        return self.radar.get_status()

    def get_waveform(self):
        return self.radar.get_latest_waveform()

    def configure(self, **kwargs) -> Dict[str, Any]:
        res = self.radar.configure(**kwargs)
        self._broadcast_radar_update()
        return res

    def simulate_human_target(self, target_range_m: float = 8.4) -> Dict[str, Any]:
        """Toggles or sets simulated human presence behind rubble."""
        with self._lock:
            self.radar.target_present = True
            self.radar.target_type = "HUMAN"
            self.radar.target_range_m = float(target_range_m)

        # Trigger radar human presence event
        alert_info = self.generate_human_presence_alert(source="SIMULATE_TARGET")
        self._broadcast_radar_update()
        return {
            "status": "SUCCESS",
            "message": f"Simulated human target active at {target_range_m}m behind rubble.",
            "alert": alert_info
        }

    def start_test_sequence(self) -> Dict[str, Any]:
        """
        Executes complete automated radar sensing demo sequence:
        1. Start simulated radar transmission (TX)
        2. Animate RF waves through rubble
        3. Simulate target reflection
        4. RX Signal reception & noise filtering
        5. CFAR detection & Micro-Doppler vital sign estimation
        6. Display estimated range (8.4 m)
        7. Trigger POSSIBLE HUMAN detection
        8. Send event to dashboard & alert center
        """
        with self._lock:
            if self._is_testing:
                return {"status": "ALREADY_RUNNING", "message": "Radar test sequence is already in progress."}
            self._is_testing = True
            self.radar.test_running = True
            self.radar.is_transmitting = True
            self.radar.is_receiving = True
            self.radar.target_present = True
            self.radar.target_type = "HUMAN"
            self.radar.target_range_m = 8.4

        # Run test workflow in background thread
        self._test_thread = threading.Thread(target=self._run_test_worker, daemon=True)
        self._test_thread.start()

        return {
            "status": "STARTED",
            "message": "UWB Radar test sequence started: TX active -> Rubble penetration -> Reflection -> Processing -> Alert."
        }

    def stop_test_sequence(self) -> Dict[str, Any]:
        with self._lock:
            self._is_testing = False
            self.radar.test_running = False

        self._broadcast_radar_update()
        return {"status": "STOPPED", "message": "Radar test sequence stopped."}

    def _run_test_worker(self):
        """Step-by-step test sequence worker."""
        try:
            # Stage 1: TX Transmission active
            self._broadcast_radar_step("1/6: RF Impulse Transmission Active (TX 4.3 GHz)...")
            time.sleep(0.8)

            # Stage 2: RF Wavefront passing through obstruction
            self._broadcast_radar_step("2/6: RF Waves Penetrating Reinforced Concrete Rubble (Dielectric er=4.8)...")
            time.sleep(0.8)

            # Stage 3: Reflection detected
            self._broadcast_radar_step("3/6: Target Surface Reflection Intercepted by RX Array...")
            time.sleep(0.8)

            # Stage 4: Signal Acquisition & Noise Filtering
            self._broadcast_radar_step("4/6: Background Clutter Subtraction & Butterworth Filtering...")
            time.sleep(0.8)

            # Stage 5: Range Estimation & Micro-Doppler Extraction
            self._broadcast_radar_step("5/6: Time-of-Flight R=8.4m | Respiratory Micro-Motion Detected (0.28 Hz)...")
            time.sleep(0.8)

            # Stage 6: Human Presence Result & Alert Generation
            self._broadcast_radar_step("6/6: Target Confirmed: POSSIBLE HUMAN PRESENCE DETECTED.")
            
            # Generate the official alert event
            self.generate_human_presence_alert(source="AUTOMATED_TEST")

        except Exception as e:
            print(f"[RESCUE AI Radar Error] Test worker exception: {e}")
        finally:
            with self._lock:
                self.radar.test_running = False
                self._is_testing = False
            self._broadcast_radar_update()

    def generate_human_presence_alert(self, source: str = "RADAR_TEST") -> Dict[str, Any]:
        """
        Generates official real-time event:
        🚨 RADAR HUMAN PRESENCE ALERT
        Includes:
        Incident ID, Timestamp, Radar ID, Estimated Range, Signal Strength, Zone,
        Confidence, Thermal Status, RGB Status, GPS Location.
        Persists into AlertModel and dispatches via WebSocket.
        """
        now_utc = datetime.now(timezone.utc)
        timestamp_iso = now_utc.isoformat()
        incident_id = f"RADAR-AL-{int(now_utc.timestamp()) % 100000:05d}"
        radar_id = "UWB-RADAR-01"
        est_range = self.radar.get_range()
        if est_range <= 0:
            est_range = 8.4
        sig_strength = round(self.radar.get_status().signal_strength_pct, 1)
        zone = "Sector Bravo-4"
        confidence = 0.92
        thermal_status = "HEAT SIGNATURE DETECTED"
        rgb_status = "NO VISUAL CONFIRMATION (RUBBLE OBSTRUCTED)"
        drone_gps = gps_service.get_drone_telemetry_gps(1)
        lat = drone_gps["latitude"]
        lng = drone_gps["longitude"]

        alert_payload = {
            "type": "radar_alert",
            "alert_name": "🚨 RADAR HUMAN PRESENCE ALERT",
            "incident_id": incident_id,
            "timestamp": timestamp_iso,
            "radar_id": radar_id,
            "estimated_range_m": est_range,
            "signal_strength": f"{sig_strength}%",
            "zone": zone,
            "confidence": f"{int(confidence * 100)}%",
            "thermal_status": thermal_status,
            "rgb_status": rgb_status,
            "lidar_status": "OBSTRUCTION DETECTED",
            "fusion_result": "POSSIBLE SURVIVOR",
            "priority": "HIGH",
            "latitude": lat,
            "longitude": lng,
            "source": source,
            "message": f"🚨 RADAR HUMAN PRESENCE ALERT: Possible survivor detected through rubble at {est_range}m. Signal: {sig_strength}%, Conf: {int(confidence*100)}%."
        }

        # Save record in SQLite database
        try:
            db = SessionLocal()
            try:
                db_alert = AlertModel(
                    alert_id=incident_id,
                    type="RADAR_HUMAN_PRESENCE",
                    severity="CRITICAL",
                    timestamp=timestamp_iso,
                    location=f"{zone} (Obstruction Core)",
                    lat_lng_tag=f"{lat:.5f} N, {lng:.5f} E",
                    sector=zone,
                    survivor_id="SURV-RADAR-01",
                    priority_score=94,
                    ai_recommendation=f"UWB Through-Wall Radar detected human breathing micro-motion behind rubble at {est_range}m. Thermal confirms heat pocket. Dispatch Heavy Rescue Team for rubble penetration.",
                    message=alert_payload["message"],
                    status="UNREAD"
                )
                db.add(db_alert)
                db.commit()
            finally:
                db.close()
        except Exception as db_err:
            print(f"[RESCUE AI Radar Error] Database persistence error: {db_err}")

        # Broadcast event across WebSocket manager
        try:
            ws_manager.broadcast_sync(alert_payload)
            ws_manager.broadcast_sync({
                "type": "alert_created",
                "alert": alert_payload
            })
        except Exception as ws_err:
            print(f"[RESCUE AI Radar Error] WebSocket broadcast error: {ws_err}")

        return alert_payload

    def _broadcast_radar_step(self, message: str):
        try:
            ws_manager.broadcast_sync({
                "type": "radar_test_step",
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "radar": self.radar.get_status().model_dump()
            })
        except Exception:
            pass

    def _broadcast_radar_update(self):
        try:
            status_dto = self.radar.get_status().model_dump()
            waveform = self.radar.get_latest_waveform()
            ws_manager.broadcast_sync({
                "type": "radar_update",
                "radar": status_dto,
                "waveform": waveform
            })
        except Exception:
            pass

radar_service = RadarService()
