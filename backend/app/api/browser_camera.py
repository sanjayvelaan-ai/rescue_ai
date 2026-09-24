"""Bounded browser-camera sessions. Frames and location belong to one source only."""
import base64
import io
import threading
import time
from uuid import uuid4
from typing import Literal
import cv2
import numpy as np
from PIL import Image
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError, model_validator
from starlette.concurrency import run_in_threadpool
from app.vision.detector import detector
from app.vision.live_pipeline import LiveDetectionPipeline, annotate
from app.vision.thermal_processor import generate_thermal_simulation

router = APIRouter()
MAX_BODY = 2_000_000

class CaptureLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    observed_at: float = Field(allow_inf_nan=False)
    source: Literal['DEVICE_LOCATION', 'USER_PIN'] = 'DEVICE_LOCATION'

    @model_validator(mode='after')
    def validate_accuracy(self):
        if self.source == 'DEVICE_LOCATION' and self.accuracy_m is None:
            raise ValueError('Device location requires its reported accuracy.')
        if self.source == 'USER_PIN':
            self.accuracy_m = None
        return self

    def fresh(self):
        age = time.time() - self.observed_at
        if -10 <= age <= (600 if self.source == 'USER_PIN' else 120):
            if self.source == 'DEVICE_LOCATION' and self.accuracy_m is None:
                raise ValueError('Device location requires its reported accuracy.')
            return self.model_dump()
        return None

class BrowserFrame(BaseModel):
    frame_id: int = Field(ge=1)
    jpeg: str = Field(max_length=1_800_000)
    location: CaptureLocation | None = None
    inference_size: Literal[416, 640] = 416
    include_preview: bool = False

class BrowserSessions:
    def __init__(self):
        self.lock = threading.RLock()
        self.capacity = threading.BoundedSemaphore(1)
        self.sessions = {}

    def create(self):
        with self.lock:
            self.sessions = {k:v for k,v in self.sessions.items() if time.monotonic()-v['seen'] < 120}
            if len(self.sessions) >= 16:
                raise HTTPException(429, 'Camera session capacity reached. Stop unused cameras and retry.')
            sid = uuid4().hex
            entry = dict(seen=time.monotonic(), location=None, last_frame=0)
            entry['pipeline'] = LiveDetectionPipeline(location_provider=lambda:entry['location'],source_id='BROWSER-'+sid[:12])
            self.sessions[sid] = entry
            return {'session_id':sid, 'source_id':'BROWSER-'+sid[:12]}

    def remove(self, sid):
        with self.lock: self.sessions.pop(sid, None)

    def process(self, sid, payload: BrowserFrame):
        with self.lock:
            entry = self.sessions.get(sid)
            if not entry or time.monotonic()-entry['seen'] >= 120:
                raise HTTPException(410, 'Camera session expired. Restart this device camera.')

        # Non-blocking single-flight semaphore: return busy payload without treating as an error
        if not self.capacity.acquire(blocking=False):
            return dict(
                busy=True,
                detections=[],
                tracks=[],
                source_id=entry['pipeline'].source_id if entry else 'BROWSER',
                preview="",
                thermal_preview="",
                frame_id=payload.frame_id,
                inference_size=payload.inference_size,
                inference_ms=0,
                processing_ms=0,
                timestamp=int(time.time() * 1000),
                location_source=entry['location']['source'] if (entry and entry['location']) else 'UNLOCATED'
            )

        try:
            if payload.frame_id <= entry['last_frame']:
                return dict(
                    busy=False,
                    skipped=True,
                    detections=[],
                    tracks=[],
                    source_id=entry['pipeline'].source_id,
                    preview="",
                    thermal_preview="",
                    frame_id=payload.frame_id,
                    inference_size=payload.inference_size,
                    inference_ms=0,
                    processing_ms=0,
                    timestamp=int(time.time() * 1000),
                    location_source='UNLOCATED'
                )
            try:
                raw = base64.b64decode(payload.jpeg, validate=True)
                with Image.open(io.BytesIO(raw)) as header:
                    if header.format != 'JPEG' or header.width*header.height > 1_638_400 or min(header.size)<16:
                        raise ValueError('Use JPEG frames up to 1280 x 1280 pixels.')
                frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
                if frame is None: raise ValueError('Invalid JPEG.')
                entry['location'] = payload.location.fresh() if payload.location else None
            except (ValueError, OSError, Image.DecompressionBombError) as exc:
                raise HTTPException(422, str(exc)) from exc
            if not detector.model_online:
                raise HTTPException(503, 'YOLO model is unavailable on the server.')

            started = time.monotonic()
            detections = detector.infer_frame(frame, imgsz=payload.inference_size)
            if detector.last_error: raise HTTPException(503, detector.last_error)
            tracks = entry['pipeline'].process(frame, detections, payload.frame_id)
            entry['last_frame'] = payload.frame_id
            entry['seen'] = time.monotonic()
            elapsed_ms = round((time.monotonic()-started)*1000)

            preview_b64 = ""
            thermal_b64 = ""
            if payload.include_preview:
                ok, preview = cv2.imencode('.jpg', annotate(frame,tracks), [cv2.IMWRITE_JPEG_QUALITY,75])
                if ok: preview_b64 = 'data:image/jpeg;base64,'+base64.b64encode(preview).decode()
                ok, thermal = cv2.imencode('.jpg', annotate(generate_thermal_simulation(frame),tracks), [cv2.IMWRITE_JPEG_QUALITY,75])
                if ok: thermal_b64 = 'data:image/jpeg;base64,'+base64.b64encode(thermal).decode()

            return dict(
                busy=False,
                detections=detections,
                tracks=tracks,
                source_id=entry['pipeline'].source_id,
                preview=preview_b64,
                thermal_preview=thermal_b64,
                frame_id=payload.frame_id,
                inference_size=payload.inference_size,
                inference_ms=elapsed_ms,
                processing_ms=elapsed_ms,
                timestamp=int(time.time() * 1000),
                location_source=entry['location']['source'] if entry['location'] else 'UNLOCATED'
            )
        finally:
            self.capacity.release()

browser_sessions = BrowserSessions()

@router.post('/camera/sessions')
def create_browser_camera():
    return browser_sessions.create()

@router.delete('/camera/sessions/{session_id}')
def stop_browser_camera(session_id:str):
    browser_sessions.remove(session_id)
    return {'stopped':True}

@router.post('/camera/sessions/{session_id}/frames')
async def browser_frame(session_id:str, request:Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body)>MAX_BODY: raise HTTPException(413,'Camera frame is too large.')
    try: payload = BrowserFrame.model_validate_json(body)
    except ValidationError: raise HTTPException(422,'Invalid camera frame or location fields.')
    return await run_in_threadpool(browser_sessions.process,session_id,payload)
