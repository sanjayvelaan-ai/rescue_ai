import cv2
import threading
import numpy as np
from typing import Optional, Tuple

class FrameStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._raw_frame: Optional[np.ndarray] = None
        self._rgb_annotated_frame: Optional[np.ndarray] = None
        self._thermal_annotated_frame: Optional[np.ndarray] = None
        self._cached_rgb_jpeg: Optional[bytes] = None
        self._cached_thermal_jpeg: Optional[bytes] = None
        self._fps: float = 0.0
        self._camera_online: bool = False
        self._model_online: bool = False
        self._latest_detections: list = []
        self._device: str = "CPU"
        self._model_name: str = "YOLOv8s"

    def get_raw_frame(self) -> Optional[np.ndarray]:
        with self._lock:
            if self._raw_frame is not None:
                return self._raw_frame.copy()
            return None

    def update_raw_frame(self, frame: np.ndarray, camera_online: bool = True):
        with self._lock:
            self._raw_frame = frame
            self._camera_online = camera_online

    def update_processed_frames(
        self,
        rgb_frame: np.ndarray,
        thermal_frame: np.ndarray,
        detections: list,
        fps: float,
        model_online: bool = True,
        device: str = "CPU"
    ):
        # Encode JPEGs once for all connected streaming clients
        rgb_bytes = None
        thermal_bytes = None
        if rgb_frame is not None and rgb_frame.size > 0:
            ret, jpeg = cv2.imencode('.jpg', rgb_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ret:
                rgb_bytes = jpeg.tobytes()
        if thermal_frame is not None and thermal_frame.size > 0:
            ret, jpeg = cv2.imencode('.jpg', thermal_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ret:
                thermal_bytes = jpeg.tobytes()

        with self._lock:
            self._rgb_annotated_frame = rgb_frame
            self._thermal_annotated_frame = thermal_frame
            self._cached_rgb_jpeg = rgb_bytes
            self._cached_thermal_jpeg = thermal_bytes
            self._latest_detections = detections
            self._fps = fps
            self._model_online = model_online
            self._device = device

    def get_latest_detections(self) -> list:
        with self._lock:
            return list(self._latest_detections)

    def get_latest_rgb_jpeg(self) -> Optional[bytes]:
        with self._lock:
            return self._cached_rgb_jpeg

    def get_latest_thermal_jpeg(self) -> Optional[bytes]:
        with self._lock:
            return self._cached_thermal_jpeg

    def get_latest_rgb(self) -> Tuple[Optional[np.ndarray], bool]:
        with self._lock:
            if self._rgb_annotated_frame is not None:
                return self._rgb_annotated_frame.copy(), self._camera_online
            elif self._raw_frame is not None:
                return self._raw_frame.copy(), self._camera_online
            return None, self._camera_online

    def get_latest_thermal(self) -> Tuple[Optional[np.ndarray], bool]:
        with self._lock:
            if self._thermal_annotated_frame is not None:
                return self._thermal_annotated_frame.copy(), self._camera_online
            return None, self._camera_online

    def get_status(self) -> dict:
        with self._lock:
            return {
                "camera_online": self._camera_online,
                "model_online": self._model_online,
                "fps": round(self._fps, 1),
                "device": self._device,
                "detections_count": len(self._latest_detections),
                "candidates": list(self._latest_detections)
            }

frame_store = FrameStore()
