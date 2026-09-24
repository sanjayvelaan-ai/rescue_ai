import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional
from app.config.config_loader import pipeline_config

class ThermalRGBFusion:
    """
    Thermal-to-RGB cross-modal projection and feature verification.
    If RGB hardware is connected, checks whether visible edge/color profile
    is compatible with a human figure. If unavailable, degrades gracefully.
    """
    def __init__(self):
        self.enabled = pipeline_config.get_nested("sensors", "rgb_fusion_enabled", True)

    def verify_alignment(
        self,
        rgb_frame: Optional[np.ndarray],
        thermal_bbox: Tuple[float, float, float, float]
    ) -> float:
        """
        Projects thermal candidate bbox onto RGB frame and extracts
        edge and color consistency metrics. Returns rgb_score [0, 1].
        """
        if not self.enabled or rgb_frame is None or rgb_frame.size == 0:
            return 0.50  # Neutral fallback when RGB sensor is absent

        h, w = rgb_frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in thermal_bbox]
        ix1, iy1 = max(0, x1), max(0, y1)
        ix2, iy2 = min(w, x2), min(h, y2)

        if ix2 <= ix1 or iy2 <= iy1:
            return 0.50

        crop = rgb_frame[iy1:iy2, ix1:ix2]
        if crop.size < 64:
            return 0.50

        # 1. Edge richness in RGB
        gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray_crop, 50, 150)
        edge_density = float(np.count_nonzero(edges) / gray_crop.size)

        # 2. Color variance (clothing / skin provides distinct non-monochromatic texture)
        color_std = float(np.mean(np.std(crop, axis=(0, 1))))

        score = 0.50
        if 0.04 <= edge_density <= 0.40:
            score += 0.20
        if color_std > 12.0:
            score += 0.20

        return float(np.clip(score, 0.10, 0.95))

thermal_rgb_fusion = ThermalRGBFusion()
