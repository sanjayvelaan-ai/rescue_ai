import os
import cv2
import time
from typing import Generator, Tuple, Optional
import numpy as np

class FlightReplayEngine:
    """
    Replay engine allowing previously recorded video flights or frame sequences
    to be reprocessed through the enhanced survivor detection pipeline without
    physical drone hardware.
    """
    def __init__(self):
        self.is_replaying = False

    def stream_video(
        self,
        video_path: str,
        fps_target: float = 30.0
    ) -> Generator[Tuple[int, np.ndarray], None, None]:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Flight recording not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        frame_idx = 0
        frame_delay = 1.0 / max(1.0, fps_target)

        try:
            self.is_replaying = True
            while cap.isOpened() and self.is_replaying:
                start = time.time()
                ret, frame = cap.read()
                if not ret or frame is None:
                    break
                frame_idx += 1
                yield frame_idx, frame
                elapsed = time.time() - start
                time.sleep(max(0.001, frame_delay - elapsed))
        finally:
            cap.release()
            self.is_replaying = False

    def stop(self):
        self.is_replaying = False

flight_replay_engine = FlightReplayEngine()
