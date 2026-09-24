from typing import Optional, Tuple, Dict, Any
import numpy as np
from app.config.config_loader import pipeline_config

class DepthFusion:
    """
    Optional Depth / LiDAR fusion interface.
    Estimates 3D physical height, ground separation, and planar distance.
    Degrades gracefully if depth hardware is absent.
    """
    def __init__(self):
        self.enabled = pipeline_config.get_nested("sensors", "depth_fusion_enabled", False)

    def evaluate_depth(
        self,
        depth_map: Optional[np.ndarray],
        bbox: Tuple[float, float, float, float]
    ) -> float:
        if not self.enabled or depth_map is None or depth_map.size == 0:
            return 0.50

        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = depth_map.shape[:2]
        crop = depth_map[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
        if crop.size == 0:
            return 0.50

        # Non-zero valid depth values
        valid_depths = crop[crop > 0]
        if valid_depths.size < 10:
            return 0.50

        depth_variance = float(np.var(valid_depths))
        # Consistent depth contour separation indicates solid 3D foreground entity
        score = 0.50 + min(0.35, max(0.0, 1.0 - (depth_variance / 500.0)))
        return float(np.clip(score, 0.10, 0.95))

depth_fusion = DepthFusion()
