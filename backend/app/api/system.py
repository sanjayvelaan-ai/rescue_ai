from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from pathlib import Path
import json
from app.db.database import get_db
from app.db.models import SurvivorModel
from app.vision.frame_store import frame_store
from app.vision.detector import detector
from app.vision.camera_service import camera_service
from app.simulation.engine import simulation_engine
from app.core.config import settings, BACKEND_ROOT, DATA_DIR
from app.vision.live_pipeline import live_pipeline
from app.services.device_location import device_location

router = APIRouter()

@router.get('/health')
def get_health():
    return dict(status='online' if camera_service.camera_online and detector.model_online else 'degraded',
        camera_online=camera_service.camera_online, camera_enabled=camera_service.camera_enabled,
        model_online=detector.model_online, model_path=detector.model_path, device=detector.device,
        gps_mode=settings.GPS_MODE, camera_error=camera_service.last_error, model_error=detector.last_error)

@router.get('/system/status')
def get_system_status(db: Session = Depends(get_db)):
    status = frame_store.get_status()
    return dict(system_online=True, camera_online=camera_service.camera_online,
        camera_enabled=camera_service.camera_enabled, camera_source='SERVER_CAMERA', browser_camera_supported=True, camera_index=camera_service.camera_index,
        camera_error=camera_service.last_error, model_error=detector.last_error,
        model_online=detector.model_online, model_name=detector.model_name,
        model_path=detector.model_path, device=detector.device, fps=status['fps'],
        inference_fps=camera_service.inference_fps, gps_mode='DEVICE_LOCATION' if device_location.current() else settings.GPS_MODE,
        device_location=device_location.current(),
        thermal_mode='RGB_FALSE_COLOR', simulation_active=simulation_engine.is_running,
        tracking=live_pipeline.get_status(),
        confidence_threshold=detector.conf_threshold, iou_threshold=detector.iou_threshold,
        active_survivors=db.query(SurvivorModel).filter(SurvivorModel.status.in_(['DETECTED','CONFIRMED','ASSIGNED','EN_ROUTE','ON_SITE'])).count(),
        total_rescued=db.query(SurvivorModel).filter(SurvivorModel.status == 'RESCUED').count(),
        candidates=status.get('candidates', []))

@router.get('/pipeline/candidates')
def get_pipeline_candidates():
    return frame_store.get_latest_detections()

@router.get('/pipeline/config')
def get_pipeline_config():
    return dict(mode='LIVE_RGB', detection=dict(yolo_confidence=detector.conf_threshold,
        iou_threshold=detector.iou_threshold), tracking=dict(min_confirm_frames=settings.LIVE_CONFIRM_FRAMES),
        thermal=dict(mode='RGB_FALSE_COLOR', counts_as_evidence=False))

@router.post('/system/toggle-camera')
def toggle_camera(enabled: Optional[bool] = None):
    state = camera_service.toggle_camera(enabled)
    return dict(message=f"Camera {'connection requested' if state else 'turned off'}.", camera_enabled=state)

@router.post('/system/retry-camera')
def retry_camera():
    camera_service.retry_camera()
    return dict(message='Camera reconnection requested.')

@router.post('/system/capture-snapshot')
def capture_instant_snapshot():
    try:
        return camera_service.capture_snapshot()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail='Could not save snapshot to disk.') from exc

class Configuration(BaseModel):
    confidence_threshold: float = Field(ge=.1, le=1)
    iou_threshold: float = Field(ge=.1, le=1)
    camera_index: int = Field(ge=0, le=10)
    model_path: str


from app.api.browser_camera import CaptureLocation

class DeviceLocationRequest(CaptureLocation):
    pass


@router.post('/system/device-location')
def update_device_location(payload: DeviceLocationRequest):
    try:
        return device_location.update(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete('/system/device-location')
def clear_device_location():
    device_location.clear()
    return {'message': 'Device location sharing stopped.'}

@router.post('/system/config')
def configure_system(config: Configuration):
    target = Path(config.model_path)
    if not target.is_absolute():
        target = BACKEND_ROOT / target
    target = target.resolve()
    if not target.is_file() or target.suffix != '.pt':
        raise HTTPException(422, 'Model path must point to an existing .pt file.')
    with camera_service._process_lock, detector._lock:
        previous = detector.model_path
        if str(target) != str(Path(previous).resolve()):
            detector.model_path = str(target)
            detector.load_model()
            if not detector.model_online:
                error = detector.last_error
                detector.model_path = previous
                detector.load_model()
                raise HTTPException(422, f'Could not load selected model: {error}')
        detector.update_config(config.confidence_threshold, config.iou_threshold)
        if camera_service.camera_index != config.camera_index:
            camera_service.camera_index = config.camera_index
            camera_service.retry_camera()
        saved = dict(MODEL_PATH=str(target), CONFIDENCE_THRESHOLD=config.confidence_threshold,
            IOU_THRESHOLD=config.iou_threshold, CAMERA_INDEX=config.camera_index)
        file = DATA_DIR / 'runtime-settings.json'
        temp = file.with_suffix('.tmp')
        temp.write_text(json.dumps(saved, indent=2), encoding='utf-8')
        temp.replace(file)
    return dict(message='Configuration saved and applied to the live pipeline.')
