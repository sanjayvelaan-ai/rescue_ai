import unittest
import time
from unittest.mock import patch
import cv2
import numpy as np
from fastapi import HTTPException
from app.api.system import capture_instant_snapshot
from app.api.video import generate_mjpeg_stream
from app.vision.camera_service import CameraService
from app.vision.frame_store import FrameStore


class CameraControlTests(unittest.TestCase):
    def test_overlay_uses_inference_frame_even_when_capture_advances(self):
        service = CameraService()
        service.camera_enabled = service.camera_online = True
        original = np.full((80, 120, 3), 40, dtype=np.uint8)
        service._latest_raw_rgb = original.copy()
        service._frame_time = time.monotonic()
        service._frame_id = 1
        store = FrameStore()
        def infer(frame, imgsz):
            service._latest_raw_rgb = np.full_like(original, 200)
            service._frame_id = 2
            return []
        with patch('app.vision.camera_service.detector') as detector, \
             patch('app.vision.camera_service.live_pipeline') as pipeline, \
             patch('app.vision.camera_service.frame_store', store):
            detector.model_online = True
            detector.last_error = None
            detector.infer_frame.side_effect = infer
            pipeline.process.return_value = []
            service._process_latest()
        rendered, _ = store.get_latest_rgb()
        np.testing.assert_array_equal(rendered, original)
        self.assertEqual(pipeline.process.call_args.args[2], 1)

    def test_disabled_camera_cannot_save_a_snapshot(self):
        service = CameraService()
        service.camera_enabled = False
        with patch('app.vision.camera_service.save_snapshot') as save:
            with self.assertRaises(RuntimeError):
                service.capture_snapshot()
            save.assert_not_called()

    def test_snapshot_unavailable_returns_service_error(self):
        with patch('app.api.system.camera_service.capture_snapshot', side_effect=RuntimeError('No camera')):
            with self.assertRaises(HTTPException) as result:
                capture_instant_snapshot()
            self.assertEqual(result.exception.status_code, 503)

    def test_snapshot_disk_error_returns_failure(self):
        with patch('app.api.system.camera_service.capture_snapshot', side_effect=OSError('Disk full')):
            with self.assertRaises(HTTPException) as result:
                capture_instant_snapshot()
            self.assertEqual(result.exception.status_code, 500)

    def test_hide_boxes_stream_uses_raw_frame(self):
        store = FrameStore()
        raw = np.zeros((80, 120, 3), dtype=np.uint8)
        marked = np.full_like(raw, 255)
        store.update_raw_frame(raw)
        store.update_processed_frames(marked, marked, [], 20)
        with patch('app.api.video.frame_store', store):
            stream = generate_mjpeg_stream('rgb', boxes=False)
            part = next(stream)
            stream.close()
            payload = part.split(b'\r\n\r\n', 1)[1].rstrip(b'\r\n')
            frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
            self.assertLess(frame.mean(), 1)

    def test_processed_frame_does_not_become_a_camera_source(self):
        store = FrameStore()
        image = np.zeros((80, 120, 3), dtype=np.uint8)
        store.update_processed_frames(image, image, [], 0)
        self.assertIsNone(store.get_raw_frame())
