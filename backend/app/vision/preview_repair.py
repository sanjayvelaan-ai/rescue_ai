"""Repair missing RGB-derived previews without claiming thermal measurements."""
import logging
from pathlib import Path
import cv2
from app.core.config import DETECTIONS_DIR
from app.db.database import SessionLocal
from app.db.models import SurvivorModel, AlertModel
from app.vision.live_pipeline import annotate, save_snapshot
from app.vision.thermal_processor import generate_thermal_simulation


def repair_missing_previews(session_factory=SessionLocal):
    repaired = 0
    with session_factory() as db:
        survivors = db.query(SurvivorModel).filter(SurvivorModel.survivor_id.like('LIVE-%')).all()
        for survivor in survivors:
            alerts = db.query(AlertModel).filter(AlertModel.survivor_id == survivor.survivor_id).all()
            if survivor.thermal_frame_path and all(a.thermal_snapshot_path for a in alerts):
                continue
            source = survivor.detection_frame_path
            if not source or not source.startswith('/data/detections/'):
                continue
            path = (DETECTIONS_DIR / Path(source).name).resolve()
            if path.parent != DETECTIONS_DIR.resolve() or not path.is_file():
                continue
            frame = cv2.imread(str(path))
            if frame is None:
                continue
            try:
                preview = survivor.thermal_frame_path or save_snapshot(
                    annotate(generate_thermal_simulation(frame), [], True), path.stem+'_preview')
                survivor.thermal_frame_path = preview
                for alert in alerts:
                    if not alert.thermal_snapshot_path and alert.frame_snapshot_path == source:
                        alert.thermal_snapshot_path = preview
                db.commit()
                repaired += 1
            except OSError:
                db.rollback()
                logging.exception('Could not generate preview for %s', survivor.survivor_id)
    return repaired
