import cv2
import numpy as np
from typing import Tuple, Dict, Any
from app.config.config_loader import pipeline_config

class BackgroundNormalizer:
    """
    Estimates ambient background temperature/intensity dynamically using an
    annular boundary region surrounding the candidate bounding box.
    Calculates adaptive relative contrast rather than relying on a single static threshold.
    """
    def __init__(self):
        self.margin = pipeline_config.get_nested("thermal", "bg_annulus_margin", 8)
        self.thickness = pipeline_config.get_nested("thermal", "bg_annulus_thickness", 14)
        self.min_contrast_delta = pipeline_config.get_nested("thermal", "min_contrast_delta", 3.0)
        self.rolling_bg_mean = 120.0
        self.alpha = 0.05  # Exponential moving average weight

    def extract_local_background_stats(
        self,
        frame: np.ndarray,
        bbox: Tuple[float, float, float, float]
    ) -> Dict[str, float]:
        """
        Samples an annular ring around the bbox (excluding the candidate itself)
        to measure true local ambient conditions (sunlit ground, cool rubble, shadow).
        """
        if frame is None or frame.size == 0:
            return {"bg_mean": self.rolling_bg_mean, "bg_std": 10.0, "bg_median": self.rolling_bg_mean}

        # Convert to single-channel intensity if BGR
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
        h, w = gray.shape

        x1, y1, x2, y2 = [int(v) for v in bbox]
        
        # Outer expanded box
        ox1 = max(0, x1 - self.margin - self.thickness)
        oy1 = max(0, y1 - self.margin - self.thickness)
        ox2 = min(w, x2 + self.margin + self.thickness)
        oy2 = min(h, y2 + self.margin + self.thickness)

        # Inner exclusion box (candidate + inner margin)
        ix1 = max(0, x1 - self.margin)
        iy1 = max(0, y1 - self.margin)
        ix2 = min(w, x2 + self.margin)
        iy2 = min(h, y2 + self.margin)

        # Mask creation for annular region
        outer_crop = gray[oy1:oy2, ox1:ox2]
        if outer_crop.size == 0:
            return {"bg_mean": self.rolling_bg_mean, "bg_std": 10.0, "bg_median": self.rolling_bg_mean}

        mask = np.ones(outer_crop.shape, dtype=np.uint8)
        # Inner rectangle coordinates relative to outer box
        rel_ix1 = max(0, ix1 - ox1)
        rel_iy1 = max(0, iy1 - oy1)
        rel_ix2 = min(outer_crop.shape[1], ix2 - ox1)
        rel_iy2 = min(outer_crop.shape[0], iy2 - oy1)

        mask[rel_iy1:rel_iy2, rel_ix1:rel_ix2] = 0

        bg_pixels = outer_crop[mask == 1]
        if bg_pixels.size < 10:
            # Fallback to whole outer crop if margin clipped by frame borders
            bg_pixels = outer_crop.flatten()

        bg_mean = float(np.mean(bg_pixels))
        bg_std = float(np.std(bg_pixels))
        bg_median = float(np.median(bg_pixels))

        # Update rolling global background
        self.rolling_bg_mean = (1 - self.alpha) * self.rolling_bg_mean + self.alpha * bg_mean

        return {
            "bg_mean": round(bg_mean, 2),
            "bg_std": round(bg_std, 2),
            "bg_median": round(bg_median, 2)
        }

    def compute_relative_contrast(
        self,
        candidate_mean_intensity: float,
        bg_stats: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Calculates relative contrast metrics:
        relative_thermal_contrast = candidate_intensity - local_background_intensity
        contrast_snr = delta / bg_std
        """
        bg_mean = bg_stats.get("bg_mean", self.rolling_bg_mean)
        bg_std = max(1.0, bg_stats.get("bg_std", 10.0))

        delta = candidate_mean_intensity - bg_mean
        snr = delta / bg_std
        # Normalize contrast into [0, 1]
        # Survivors typically have positive contrast over ground (hotter than surroundings)
        normalized_contrast = float(np.clip((delta + 10.0) / 60.0, 0.0, 1.0))

        return {
            "relative_thermal_contrast": round(delta, 2),
            "contrast_snr": round(snr, 2),
            "normalized_contrast": round(normalized_contrast, 3)
        }

background_normalizer = BackgroundNormalizer()
