import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.db.database import get_db
from app.db.models import AlertModel, SurvivorModel
from app.schemas.types import AlertSchema
from app.vision.detection_fusion import fusion_engine

router = APIRouter()

@router.get("/alerts", response_model=List[AlertSchema])
def get_alerts(severity: Optional[str] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(AlertModel)
    if severity:
        query = query.filter(AlertModel.severity == severity.upper())
    if status:
        query = query.filter(AlertModel.status == status.upper())
    return query.order_by(AlertModel.timestamp.desc()).all()

@router.post("/alerts/clear-history")
def clear_alert_history(db: Session = Depends(get_db)):
    """
    Clears all alert and survivor records in SQLite database, removes image snapshot files,
    and resets tracking memory so detection & alert snapshot pipeline continues fresh.
    """
    from app.vision.camera_service import camera_service
    from app.vision.live_pipeline import live_pipeline
    from app.core.config import DETECTIONS_DIR
    from app.websocket.manager import ws_manager
    from app.api.browser_camera import browser_sessions
    # Serialize with capture persistence so clearing cannot race a new alert.
    with camera_service._process_lock, live_pipeline.lock, browser_sessions.capacity:
        try:
            paths = {s.detection_frame_path for s in db.query(SurvivorModel).all()}
            paths.update(s.thermal_frame_path for s in db.query(SurvivorModel).all())
            paths.update(a.frame_snapshot_path for a in db.query(AlertModel).all())
            paths.update(a.thermal_snapshot_path for a in db.query(AlertModel).all())
            db.query(AlertModel).delete()
            db.query(SurvivorModel).delete()
            db.commit()
            live_pipeline.reset_history()
            with browser_sessions.lock:
                for session in browser_sessions.sessions.values():
                    session['pipeline'].reset_history()
            fusion_engine.reset_history()
            for value in paths:
                if value and value.startswith('/data/detections/'):
                    from pathlib import Path
                    target = (DETECTIONS_DIR / Path(value).name).resolve()
                    if target.parent == DETECTIONS_DIR.resolve():
                        target.unlink(missing_ok=True)
            ws_manager.broadcast_sync(dict(type='history_cleared'))
            return dict(status='SUCCESS', message='Alert history and referenced snapshots cleared.')
        except Exception as exc:
            db.rollback()
            raise HTTPException(500, 'Could not clear alert history.') from exc

@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(AlertModel).filter(AlertModel.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"message": f"Alert {alert_id} acknowledged."}

@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(AlertModel).filter(AlertModel.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    alert.status = "RESOLVED"
    alert.resolved_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"message": f"Alert {alert_id} resolved."}
