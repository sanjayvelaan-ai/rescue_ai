import numpy as np
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any
from app.config.config_loader import pipeline_config
from .track_state import TrackState

@dataclass
class MotionAnalysisResult:
    motion_score: float
    center_displacement: float
    scale_variation: float
    is_moving: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "motion_score": round(self.motion_score, 3),
            "center_displacement": round(self.center_displacement, 2),
            "scale_variation": round(self.scale_variation, 3),
            "is_moving": self.is_moving
        }

class MotionAnalyzer:
    """
    Analyzes micro-motion and temporal target displacement across frames.
    Stationary targets are NEVER rejected (trapped survivors may be motionless).
    Observed micro-motion or bodily movement gives a positive confidence boost.
    """
    def __init__(self):
        self.disp_thresh = pipeline_config.get_nested("motion", "min_displacement_threshold", 1.5)
        self.move_bonus = pipeline_config.get_nested("motion", "movement_confidence_bonus", 0.08)

    def analyze(self, track: TrackState) -> MotionAnalysisResult:
        if len(track.bbox_history) < 2:
            return MotionAnalysisResult(
                motion_score=0.50,
                center_displacement=0.0,
                scale_variation=0.0,
                is_moving=False
            )

        history = track.bbox_history[-10:]
        centers = [((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0) for b in history]
        areas = [(b[2] - b[0]) * (b[3] - b[1]) for b in history]

        # 1. Total path center displacement over recent window
        displacements = [
            np.hypot(centers[i][0] - centers[i-1][0], centers[i][1] - centers[i-1][1])
            for i in range(1, len(centers))
        ]
        mean_step_displacement = float(np.mean(displacements)) if displacements else 0.0

        # 2. Scale / Area variation (breathing, gesturing, stance shift)
        mean_area = float(np.mean(areas)) if areas else 1.0
        area_std = float(np.std(areas)) if areas else 0.0
        scale_variation = float(area_std / max(1.0, mean_area))

        is_moving = mean_step_displacement >= self.disp_thresh

        # Motion score:
        # Base is 0.50 (neutral for stationary survivor - NOT penalized)
        # Movement gracefully scales up to 0.85
        if is_moving:
            motion_boost = min(0.35, (mean_step_displacement / 15.0) * 0.25 + min(0.10, scale_variation * 2.0))
            motion_score = 0.50 + motion_boost
        else:
            # Subtle physiological variance or motionless trapped posture
            motion_score = 0.50

        return MotionAnalysisResult(
            motion_score=float(np.clip(motion_score, 0.20, 0.95)),
            center_displacement=round(mean_step_displacement, 2),
            scale_variation=round(scale_variation, 3),
            is_moving=is_moving
        )

motion_analyzer = MotionAnalyzer()
