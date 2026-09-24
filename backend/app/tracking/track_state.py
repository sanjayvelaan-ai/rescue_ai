from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple
import time

class TrackStatus(str, Enum):
    CANDIDATE = "CANDIDATE"
    VERIFYING = "VERIFYING"
    CONFIRMED = "CONFIRMED"
    LOST = "LOST"
    REJECTED = "REJECTED"

@dataclass
class TrackState:
    track_id: int
    current_bbox: Tuple[float, float, float, float]  # (x1, y1, x2, y2)
    position: Tuple[float, float] = (0.0, 0.0)       # (center_x, center_y)
    velocity: Tuple[float, float] = (0.0, 0.0)       # (vx, vy)
    
    # History queues (capped to last 30 frames)
    bbox_history: List[Tuple[float, float, float, float]] = field(default_factory=list)
    confidence_history: List[float] = field(default_factory=list)
    thermal_feature_history: List[Dict[str, float]] = field(default_factory=list)
    shape_score_history: List[float] = field(default_factory=list)
    fused_score_history: List[float] = field(default_factory=list)
    
    # State tracking metrics
    detection_age: int = 1
    hit_streak: int = 1
    missed_frame_count: int = 0
    state: TrackStatus = TrackStatus.CANDIDATE
    rejection_reason: str = ""
    first_detected_ts: float = field(default_factory=time.time)
    last_updated_ts: float = field(default_factory=time.time)
    
    # Context & auxiliary scores
    context_score: float = 0.80
    rgb_score: float = 0.0
    depth_score: float = 0.0
    motion_score: float = 0.50
    final_confidence: float = 0.50

    def __post_init__(self):
        x1, y1, x2, y2 = self.current_bbox
        self.position = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
        if not self.bbox_history:
            self.bbox_history.append(self.current_bbox)

    def update(
        self,
        new_bbox: Tuple[float, float, float, float],
        confidence: float,
        thermal_stats: Dict[str, float],
        shape_score: float
    ):
        prev_cx, prev_cy = self.position
        new_cx = (new_bbox[0] + new_bbox[2]) / 2.0
        new_cy = (new_bbox[1] + new_bbox[3]) / 2.0
        
        # Velocity estimation
        dt = max(0.03, time.time() - self.last_updated_ts)
        self.velocity = ((new_cx - prev_cx) / dt, (new_cy - prev_cy) / dt)
        
        self.current_bbox = new_bbox
        self.position = (new_cx, new_cy)
        self.detection_age += 1
        self.hit_streak += 1
        self.missed_frame_count = 0
        self.last_updated_ts = time.time()

        # Update histories (keep maximum 30 frames)
        self.bbox_history.append(new_bbox)
        if len(self.bbox_history) > 30:
            self.bbox_history.pop(0)

        self.confidence_history.append(confidence)
        if len(self.confidence_history) > 30:
            self.confidence_history.pop(0)

        self.thermal_feature_history.append(thermal_stats)
        if len(self.thermal_feature_history) > 30:
            self.thermal_feature_history.pop(0)

        self.shape_score_history.append(shape_score)
        if len(self.shape_score_history) > 30:
            self.shape_score_history.pop(0)

    def mark_missed(self):
        self.missed_frame_count += 1
        self.hit_streak = 0

    def get_avg_confidence(self) -> float:
        if not self.confidence_history:
            return 0.0
        return float(sum(self.confidence_history[-10:]) / len(self.confidence_history[-10:]))

    def get_avg_shape_score(self) -> float:
        if not self.shape_score_history:
            return 0.0
        return float(sum(self.shape_score_history[-10:]) / len(self.shape_score_history[-10:]))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "bbox": [round(v, 1) for v in self.current_bbox],
            "position": [round(self.position[0], 1), round(self.position[1], 1)],
            "velocity": [round(self.velocity[0], 1), round(self.velocity[1], 1)],
            "age": self.detection_age,
            "hit_streak": self.hit_streak,
            "missed_count": self.missed_frame_count,
            "state": self.state.value,
            "yolo_conf": round(self.get_avg_confidence(), 3),
            "shape_score": round(self.get_avg_shape_score(), 3),
            "final_confidence": round(self.final_confidence, 3),
            "rejection_reason": self.rejection_reason
        }
