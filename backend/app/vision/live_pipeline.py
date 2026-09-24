"""Live RGB tracking; false-color previews never count as thermal evidence."""
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4
import cv2
import numpy as np
from app.core.config import settings, DETECTIONS_DIR
from app.db.database import SessionLocal
from app.db.models import SurvivorModel, AlertModel
from app.schemas.types import SurvivorSchema, AlertSchema
from app.services.gps_service import gps_service
from app.websocket.manager import ws_manager
from app.vision.track_association import appearance, associate
from app.vision.thermal_processor import generate_thermal_simulation
from app.services.device_location import device_location


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    area = max(0, x2-x1) * max(0, y2-y1)
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - area
    return area / union if union > 0 else 0


def save_snapshot(frame, name):
    """Publish a URL only after a complete JPEG has been written."""
    DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    target = DETECTIONS_DIR / f'{name}.jpg'
    temp = DETECTIONS_DIR / f'{name}.tmp.jpg'
    if not cv2.imwrite(str(temp), frame):
        raise OSError('Could not write detection snapshot')
    temp.replace(target)
    return f'/data/detections/{target.name}'


def annotate(frame, detections, thermal=False):
    image = frame.copy()
    for det in detections:
        x1, y1, x2, y2 = [int(det[k]) for k in ('x1', 'y1', 'x2', 'y2')]
        color = (0, 220, 255) if det['state'] == 'VERIFYING' else (40, 230, 90)
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        cv2.putText(image, f"TRACK {det.get('track_id', '?')} | PERSON {det['confidence']:.0%} | {det['state']}",
            (max(0, x1), max(18, y1-8)), cv2.FONT_HERSHEY_SIMPLEX, .5, color, 1)
    if thermal:
        cv2.putText(image, 'FALSE-COLOR RGB PREVIEW - NOT A THERMAL SENSOR', (12, 25),
            cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 255, 255), 2)
    return image


class LiveDetectionPipeline:
    def __init__(self, session_factory=SessionLocal, broadcast=ws_manager.broadcast_sync, location_provider=None, source_id="SERVER_CAMERA"):
        self.location_provider = location_provider or (lambda: device_location.current())
        self.source_id = source_id
        self.lock = threading.RLock()
        self.tracks = {}
        self.session_factory = session_factory
        self.broadcast = broadcast
        self.next_track_id = 1
        self.last_frame_id = None
        self.last_results = []
        self.last_processed_at = None

    def reset_history(self):
        with self.lock:
            self.tracks.clear()
            self.last_frame_id = None
            self.last_results = []
            self.last_processed_at = None

    def get_status(self):
        with self.lock:
            now = time.monotonic()
            active = [t for t in self.tracks.values() if now-t['seen'] < settings.LIVE_TRACK_TIMEOUT]
            return dict(method='Motion + appearance, global one-to-one assignment',
                visible_tracks=len(self.last_results), retained_tracks=len(active),
                lost_track_timeout_seconds=settings.LIVE_TRACK_TIMEOUT,
                confirmation_frames=settings.LIVE_CONFIRM_FRAMES,
                last_frame_age_seconds=round(now-self.last_processed_at, 2) if self.last_processed_at else None)

    def process(self, frame, detections, frame_id):
        with self.lock:
            if frame_id == self.last_frame_id:
                return self.last_results
            now = time.monotonic()
            self.tracks = {key: trk for key, trk in self.tracks.items()
                           if now-trk['seen'] < settings.LIVE_TRACK_TIMEOUT}
            available = set(self.tracks)
            results = []
            boxes = [tuple(d[key] for key in ('x1', 'y1', 'x2', 'y2')) for d in detections]
            features = [appearance(frame, box) for box in boxes]
            matches = associate(self.tracks, boxes, features, now)
            for index, det in enumerate(detections):
                bbox = boxes[index]
                match = matches.get(index)
                if match is None:
                    match = self.next_track_id
                    self.next_track_id += 1
                    self.tracks[match] = dict(bbox=bbox, hits=0, seen=now,
                        survivor_id=f'LIVE-{uuid4().hex[:12]}', saved=False, last_update=0,
                        appearance=features[index], velocity=np.zeros(4), trail=[], total_hits=0)
                else:
                    available.remove(match)
                track = self.tracks[match]
                elapsed = max(.03, now-track['seen'])
                velocity = (np.array(bbox)-np.array(track['bbox']))/elapsed
                track['velocity'] = .5*track['velocity'] + .5*velocity
                if features[index] is not None:
                    track['appearance'] = features[index] if track['appearance'] is None else .85*track['appearance'] + .15*features[index]
                track['trail'] = (track['trail'] + [[(bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2]])[-24:]
                track['total_hits'] += 1
                track.update(bbox=bbox, hits=track['hits']+1, seen=now)
                stable = track['saved'] or track['hits'] >= settings.LIVE_CONFIRM_FRAMES
                result = dict(det, id=track['survivor_id'], survivor_id=track['survivor_id'],
                    track_id=match, state='LIKELY_SURVIVOR' if stable else 'VERIFYING',
                    trail=track['trail'], observed_frames=track['total_hits'],
                    consecutive_frames=track['hits'], alert_saved=track['saved'],
                    status='DETECTED', priority='HIGH', final_confidence=det['confidence'],
                    yolo_confidence=det['confidence'], thermal_score=0, shape_score=0,
                    temporal_score=1 if stable else min(1, track['hits']/settings.LIVE_CONFIRM_FRAMES),
                    context_score=0, rgb_score=det['confidence'],
                    reason='Live RGB person detection; operator verification required. Thermal and GPS are not independently measured.')
                if stable and (not track['saved'] or now-track['last_update'] >= 1):
                    self._persist(frame, result, track)
                    track['saved'] = True
                    result['alert_saved'] = True
                    track['last_update'] = now
                results.append(result)
            for key in available:
                self.tracks[key]['hits'] = 0
            self.last_frame_id = frame_id
            self.last_results = results
            self.last_processed_at = now
            return results

    def _persist(self, frame, det, track):
        timestamp = datetime.now(timezone.utc).isoformat()
        height, width = frame.shape[:2]
        lat, lng, _ = gps_service.image_to_gps((det['x1']+det['x2'])/2, (det['y1']+det['y2'])/2,
            frame_width=width, frame_height=height, drone_lat=settings.DISASTER_CENTER_LAT,
            drone_lng=settings.DISASTER_CENTER_LNG)
        fix = self.location_provider()
        if fix:
            lat, lng = fix['latitude'], fix['longitude']
        source = fix.get('source', 'DEVICE_LOCATION') if fix else ('SIMULATION' if self.source_id == 'SERVER_CAMERA' else 'UNLOCATED')
        if source == 'UNLOCATED': lat, lng = 0, 0
        sector = 'Operator-set capture position' if source == 'USER_PIN' else ('Device capture location' if fix else 'Capture location unavailable' if source == 'UNLOCATED' else 'Camera view (simulated GPS)')
        event = None
        with self.session_factory() as db:
            survivor = db.get(SurvivorModel, track['survivor_id'])
            if survivor is None:
                path = save_snapshot(annotate(frame, [det]), f"{track['survivor_id']}_{uuid4().hex[:8]}")
                preview = save_snapshot(annotate(generate_thermal_simulation(frame), [det], True),
                    f"{track['survivor_id']}_{uuid4().hex[:8]}_preview")
                survivor = SurvivorModel(survivor_id=track['survivor_id'], status='DETECTED',
                    priority='HIGH', model_confidence=det['confidence'], fusion_confidence=det['confidence'],
                    rgb_confirmed=True, thermal_confirmed=False, latitude=lat, longitude=lng,
                    location_source=source, capture_source=self.source_id,
                    location_accuracy_m=fix['accuracy_m'] if fix else None,
                    timestamp=timestamp, first_detected=timestamp, last_detected=timestamp,
                    detection_frame_path=path, thermal_frame_path=preview, mission_id='M-101',
                    sector=sector, priority_reason=det['reason'])
                alert = AlertModel(alert_id=f'ALT-{uuid4().hex}', type='SURVIVOR_DETECTED',
                    severity='WARNING', timestamp=timestamp, survivor_id=track['survivor_id'],
                    location='Unavailable' if source == 'UNLOCATED' else f'{lat:.6f}, {lng:.6f}',
                    lat_lng_tag='Capture location unavailable' if source == 'UNLOCATED' else f'{sector}: {lat:.6f}, {lng:.6f}',
                    sector=survivor.sector, priority_score=round(det['confidence']*100),
                    ai_recommendation='Review the live camera snapshot and verify the person before dispatch.',
                    frame_snapshot_path=path, thermal_snapshot_path=preview, status='UNREAD',
                    message=f"Possible survivor detected in {track['hits']} camera frames ({det['confidence']:.0%} YOLO person confidence).")
                db.add_all([survivor, alert])
                db.commit()
                event = dict(type='survivor_detected',
                    survivor=SurvivorSchema.model_validate(survivor).model_dump(),
                    alert=AlertSchema.model_validate(alert).model_dump())
            else:
                # Upgrade a still-visible track once a real device fix becomes available.
                # Existing device fixes stay attached to their capture, not future movement.
                if fix and survivor.location_source not in ('DEVICE_LOCATION', 'USER_PIN'):
                    survivor.latitude, survivor.longitude = lat, lng
                    survivor.location_source = source
                    survivor.location_accuracy_m = fix['accuracy_m']
                    survivor.sector = sector
                    for alert in db.query(AlertModel).filter(AlertModel.survivor_id == survivor.survivor_id):
                        alert.location = f'{lat:.6f}, {lng:.6f}'
                        alert.lat_lng_tag = f'{sector}: {lat:.6f}, {lng:.6f}'
                        alert.sector = sector
                survivor.last_detected = timestamp
                survivor.model_confidence = det['confidence']
                survivor.fusion_confidence = det['confidence']
                db.commit()
        if event:
            self.broadcast(event)


live_pipeline = LiveDetectionPipeline()
