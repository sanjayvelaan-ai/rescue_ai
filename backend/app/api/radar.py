"""
Radar API Router for RESCUE-AI.
Exposes endpoints for UWB through-wall radar telemetry, testing, simulation control,
and radar + thermal sensor fusion evaluation.
"""

from fastapi import APIRouter, Query, Body, HTTPException
from typing import Optional, Dict, Any
from pydantic import BaseModel

from app.radar.radar_service import radar_service
from app.radar.radar_interface import RadarStatusDTO
from app.fusion.radar_fusion import radar_fusion_engine

router = APIRouter()

class RadarConfigDTO(BaseModel):
    frequency_ghz: Optional[float] = None
    target_range_m: Optional[float] = None
    target_type: Optional[str] = None
    obstruction_type: Optional[str] = None
    rubble_thickness_m: Optional[float] = None

class SimulateHumanDTO(BaseModel):
    target_range_m: float = 8.4

@router.get("/radar/status", response_model=RadarStatusDTO)
def get_radar_status():
    """Returns current live radar operational status, parameters, and detection results."""
    return radar_service.get_status()

@router.get("/radar/waveform")
def get_radar_waveform():
    """Returns the latest 200-point A-scan waveform (range vs. amplitude) for plotting."""
    return {
        "status": "SUCCESS",
        "waveform": radar_service.get_waveform()
    }

@router.post("/radar/start-test")
def start_radar_test():
    """
    Executes automated radar test demonstration:
    1. Start transmission (TX)
    2. Animate RF waves
    3. Simulate reflection
    4. Process signal
    5. Detect target
    6. Display estimated range
    7. Trigger possible-human result
    8. Send event to dashboard & alert center
    """
    return radar_service.start_test_sequence()

@router.post("/radar/stop-test")
def stop_radar_test():
    """Stops the active radar test sequence."""
    return radar_service.stop_test_sequence()

@router.post("/radar/simulate-human")
def simulate_human_target(payload: SimulateHumanDTO = Body(default_factory=SimulateHumanDTO)):
    """Simulates a human survivor behind rubble at the specified distance."""
    return radar_service.simulate_human_target(target_range_m=payload.target_range_m)

@router.post("/radar/configure")
def configure_radar(payload: RadarConfigDTO = Body(...)):
    """Updates dynamic radar configuration parameters."""
    cfg = payload.model_dump(exclude_none=True)
    return radar_service.configure(**cfg)

@router.get("/radar/fusion-status")
def get_sensor_fusion_status(
    thermal_detected: bool = Query(False, description="Simulated thermal camera heat anomaly present"),
    rgb_confirmed: bool = Query(False, description="Optical visual line-of-sight confirmation"),
    lidar_obstruction: bool = Query(False, description="Simulated LiDAR detected physical wall/rubble barrier")
):
    """
    Returns unified multi-sensor fusion survivor analysis correlating
    UWB Radar + FLIR Thermal + Optical RGB + LiDAR.
    """
    result = radar_fusion_engine.get_survivor_fusion_analysis(
        thermal_detected=thermal_detected,
        rgb_confirmed=rgb_confirmed,
        lidar_obstruction=lidar_obstruction
    )

    result['mode'] = 'SIMULATION'
    result['notice'] = 'Demo inputs only; no physical thermal, LiDAR or radar sensor is connected.'
    return result
