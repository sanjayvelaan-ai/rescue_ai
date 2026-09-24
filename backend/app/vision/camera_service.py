import os
import threading
import time
from uuid import uuid4
from datetime import datetime, timezone
import cv2
import numpy as np
from app.core.config import settings
from app.vision.detector import detector
from app.vision.frame_store import frame_store
from app.vision.thermal_processor import generate_thermal_simulation
from app.vision.live_pipeline import live_pipeline, annotate, save_snapshot


class CameraService:
    """Capture owns the hardware; inference consumes each fresh frame once."""
    def __init__(self):
        self.camera_index = settings.CAMERA_INDEX
        self.camera_enabled = settings.CAMERA_ENABLED
        self.camera_online = False
        self.is_running = False
        self.simulation_fallback = False
        self.last_error = None
        self.fps = 0.0
        self.inference_fps = 0.0
        self.cap = None
        self._lock = threading.RLock()
        self._process_lock = threading.RLock()
        self._reconnect = threading.Event()
        self._stop = threading.Event()
        self._latest_raw_rgb = None
        self._frame_id = 0
        self._frame_time = 0.0
        self._cached_active_survivors = []
        self.capture_thread = None
        self.inference_thread = None

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._stop.clear()
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True, name='camera-capture')
        self.inference_thread = threading.Thread(target=self._inference_loop, daemon=True, name='yolo-inference')
        self.capture_thread.start()
        self.inference_thread.start()

    def stop(self):
        self.is_running = False
        self._stop.set()
        for worker in (self.capture_thread, self.inference_thread):
            if worker:
                worker.join(timeout=5)

    def toggle_camera(self, enabled=None):
        with self._process_lock:
            self.camera_enabled = not self.camera_enabled if enabled is None else enabled
            with self._lock:
                self._latest_raw_rgb = None
                self._cached_active_survivors = []
                self.camera_online = False
            frame_store.update_raw_frame(None, camera_online=False)
            live_pipeline.reset_history()
            self._reconnect.set()
        return self.camera_enabled

    def retry_camera(self):
        self.toggle_camera(True)

    def _release(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.camera_online = False

    def _open_camera(self):
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF] if os.name == 'nt' else [cv2.CAP_ANY]
        for backend in backends:
            if not self.camera_enabled or self._stop.is_set():
                return False
            cap = cv2.VideoCapture(self.camera_index, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings.FRAME_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.FRAME_HEIGHT)
                cap.set(cv2.CAP_PROP_FPS, settings.FRAME_FPS)
                ok, frame = cap.read()
                if ok and frame is not None:
                    self.cap = cap
                    self.last_error = None
                    return True
            cap.release()
        self.last_error = f'Camera {self.camera_index} unavailable. Check Windows camera permissions and close other camera apps.'
        return False

    def _standby(self):
        frame = np.full((480, 854, 3), (22, 18, 16), dtype=np.uint8)
        title = 'CAMERA OFF' if not self.camera_enabled else 'CAMERA UNAVAILABLE - RECONNECT TO RETRY'
        cv2.putText(frame, title, (35, 220), cv2.FONT_HERSHEY_SIMPLEX, .7, (220, 220, 220), 2)
        cv2.putText(frame, 'No live detections are being generated.', (35, 255), cv2.FONT_HERSHEY_SIMPLEX, .6, (150, 150, 150), 1)
        with self._lock:
            self._latest_raw_rgb = None
            self._cached_active_survivors = []
        self.camera_online = False
        self.fps = 0
        self.inference_fps = 0
        frame_store.update_raw_frame(None, camera_online=False)
        frame_store.update_processed_frames(frame, frame.copy(), [], 0, detector.model_online, detector.device)

    def _capture_loop(self):
        last_attempt = -10.0
        previous_frame_time = None
        try:
            while not self._stop.is_set():
                started = time.monotonic()
                try:
                    if self._reconnect.is_set():
                        self._release()
                        self._reconnect.clear()
                        last_attempt = -10.0
                    if not self.camera_enabled:
                        self._release()
                        self._standby()
                        self._stop.wait(.2)
                        continue
                    if self.cap is None and started-last_attempt >= 5:
                        last_attempt = started
                        self._open_camera()
                    if self.cap is None:
                        self._standby()
                        self._stop.wait(.2)
                        continue
                    ok, frame = self.cap.read()
                    if not ok or frame is None:
                        self.last_error = 'Camera stopped delivering frames; reconnecting.'
                        self._release()
                        self._standby()
                        continue
                    if not self.camera_enabled or self._reconnect.is_set():
                        continue
                    with self._lock:
                        self._latest_raw_rgb = frame.copy()
                        self._frame_id += 1
                        self._frame_time = time.monotonic()
                        detections = list(self._cached_active_survivors)
                        self.camera_online = True
                    self.fps = min(settings.FRAME_FPS, 1/max(.001, started-previous_frame_time)) if previous_frame_time else 0
                    previous_frame_time = started
                    frame_store.update_raw_frame(frame, camera_online=True)
                    # Render boxes on the exact frame used for inference, never a newer frame.
                    if not detector.model_online or detector.last_error:
                        frame_store.update_processed_frames(frame, annotate(generate_thermal_simulation(frame), [], True),
                            [], self.fps, detector.model_online, detector.device)
                    self._stop.wait(max(.001, 1/settings.FRAME_FPS - (time.monotonic()-started)))
                except Exception as exc:
                    self.last_error = str(exc)
                    self._release()
                    self._standby()
                    self._stop.wait(.5)
        finally:
            self._release()
            self._standby()

    def _process_latest(self):
        with self._lock:
            if not self.camera_enabled or not self.camera_online or self._latest_raw_rgb is None or time.monotonic()-self._frame_time > 2:
                raise RuntimeError('No fresh camera frame. Turn on or reconnect the camera.')
            frame, frame_id = self._latest_raw_rgb.copy(), self._frame_id
        if not detector.model_online:
            raise RuntimeError(detector.last_error or 'YOLO model is unavailable.')
        detections = detector.infer_frame(frame, imgsz=640)
        if detector.last_error:
            raise RuntimeError(detector.last_error)
        if not self.camera_enabled or not self.camera_online:
            raise RuntimeError('Camera disconnected during inference.')
        tracks = live_pipeline.process(frame, detections, frame_id)
        with self._lock:
            self._cached_active_survivors = tracks
        frame_store.update_processed_frames(annotate(frame, tracks),
            annotate(generate_thermal_simulation(frame), tracks, True),
            tracks, self.fps, detector.model_online, detector.device)
        return frame, tracks

    def _inference_loop(self):
        last_id = -1
        while not self._stop.wait(.05):
            with self._process_lock:
                if not self.camera_enabled or not self.camera_online or not detector.model_online or self._frame_id == last_id:
                    continue
                started = time.monotonic()
                last_id = self._frame_id
                try:
                    self._process_latest()
                    self.inference_fps = round(1/max(.001, time.monotonic()-started), 1)
                    self.last_error = None
                except Exception as exc:
                    self.last_error = str(exc)

    def capture_snapshot(self):
        from app.services.device_location import device_location
        with self._process_lock:
            frame, tracks = self._process_latest()
            snapshot_id = f'SNAP-{uuid4().hex}'
            rgb = save_snapshot(annotate(frame, tracks), snapshot_id+'_rgb')
            thermal = save_snapshot(annotate(generate_thermal_simulation(frame), tracks, True), snapshot_id+'_preview')
            fix = device_location.current()
            return dict(status='SUCCESS', message=f'Live snapshot saved. {len(tracks)} person candidate(s).',
                snapshot_id=snapshot_id, timestamp=datetime.now(timezone.utc).isoformat(),
                rgb_snapshot_path=rgb, thermal_snapshot_path=thermal, thermal_is_simulated=True,
                drone_location=fix or dict(latitude=settings.DISASTER_CENTER_LAT, longitude=settings.DISASTER_CENTER_LNG, source='SIMULATION'),
                model=detector.model_name, detections=[dict(t, bbox=[t[k] for k in ('x1','y1','x2','y2')]) for t in tracks])


camera_service = CameraService()
