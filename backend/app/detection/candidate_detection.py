import time
from dataclasses import dataclass, field
from typing import Dict, Any, Tuple, Optional
import numpy as np

@dataclass
class CandidateDetection:
    """
    Standardized Candidate Detection data structure passed downstream
    from primary YOLOv8s detection through verification, tracking, and fusion.
    """
    bbox: Tuple[float, float, float, float]  # (x1, y1, x2, y2)
    class_id: int
    class_name: str
    confidence: float
    frame_number: int = 0
    timestamp: float = field(default_factory=time.time)
    source: str = "YOLOv8s"
    
    # Geometric metrics
    center_x: float = 0.0
    center_y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    aspect_ratio: float = 1.0  # height / width
    area: float = 0.0
    
    # Thermal statistics extracted within ROI
    thermal_stats: Dict[str, float] = field(default_factory=dict)
    
    # Optional image crops for secondary verification
    crop_thermal: Optional[np.ndarray] = None
    crop_rgb: Optional[np.ndarray] = None
    
    def __post_init__(self):
        x1, y1, x2, y2 = self.bbox
        self.width = max(1.0, float(x2 - x1))
        self.height = max(1.0, float(y2 - y1))
        self.center_x = float(x1 + self.width / 2.0)
        self.center_y = float(y1 + self.height / 2.0)
        self.area = float(self.width * self.height)
        self.aspect_ratio = float(self.height / self.width)

    @classmethod
    def from_yolo_dict(
        cls,
        det_dict: Dict[str, Any],
        frame_number: int = 0,
        thermal_frame: Optional[np.ndarray] = None,
        rgb_frame: Optional[np.ndarray] = None
    ) -> "CandidateDetection":
        x1 = float(det_dict.get("x1", 0.0))
        y1 = float(det_dict.get("y1", 0.0))
        x2 = float(det_dict.get("x2", 0.0))
        y2 = float(det_dict.get("y2", 0.0))
        
        crop_th = None
        crop_rgb = None
        
        if thermal_frame is not None and thermal_frame.size > 0:
            h, w = thermal_frame.shape[:2]
            ix1, iy1 = max(0, int(x1)), max(0, int(y1))
            ix2, iy2 = min(w, int(x2)), min(h, int(y2))
            if ix2 > ix1 and iy2 > iy1:
                crop_th = thermal_frame[iy1:iy2, ix1:ix2].copy()
                
        if rgb_frame is not None and rgb_frame.size > 0:
            h, w = rgb_frame.shape[:2]
            ix1, iy1 = max(0, int(x1)), max(0, int(y1))
            ix2, iy2 = min(w, int(x2)), min(h, int(y2))
            if ix2 > ix1 and iy2 > iy1:
                crop_rgb = rgb_frame[iy1:iy2, ix1:ix2].copy()

        return cls(
            bbox=(x1, y1, x2, y2),
            class_id=int(det_dict.get("class_id", 0)),
            class_name=str(det_dict.get("class_name", "SURVIVOR")),
            confidence=float(det_dict.get("confidence", 0.0)),
            frame_number=frame_number,
            timestamp=time.time(),
            source=det_dict.get("source", "YOLOv8s"),
            crop_thermal=crop_th,
            crop_rgb=crop_rgb
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bbox": list(self.bbox),
            "class_id": self.class_id,
            "class_name": self.class_name,
            "confidence": round(self.confidence, 3),
            "frame_number": self.frame_number,
            "timestamp": round(self.timestamp, 3),
            "center": [round(self.center_x, 1), round(self.center_y, 1)],
            "width": round(self.width, 1),
            "height": round(self.height, 1),
            "aspect_ratio": round(self.aspect_ratio, 2),
            "area": round(self.area, 1),
            "thermal_stats": self.thermal_stats
        }
