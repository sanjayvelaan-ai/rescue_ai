import cv2
import numpy as np
from typing import Dict, Any, Tuple, Optional
from app.config.config_loader import pipeline_config
from .background_normalization import background_normalizer

class ThermalFeatureExtractor:
    """
    Extracts rich multi-dimensional thermal statistics for a candidate bounding box.
    Avoids single fixed-temperature thresholding and evaluates distribution,
    gradient boundaries, hot-pixel concentrations, and background contrast.
    """
    def __init__(self):
        self.min_plausible_temp = pipeline_config.get_nested("thermal", "min_plausible_temp_c", 28.0)
        self.max_plausible_temp = pipeline_config.get_nested("thermal", "max_plausible_temp_c", 42.0)
        self.optimal_temp = pipeline_config.get_nested("thermal", "optimal_human_temp_c", 36.5)
        self.hot_percentile = pipeline_config.get_nested("thermal", "hot_pixel_percentile", 85.0)

    def extract_features(
        self,
        thermal_frame: np.ndarray,
        bbox: Tuple[float, float, float, float]
    ) -> Dict[str, float]:
        """
        Extracts comprehensive thermal features inside the candidate ROI
        and relative to the surrounding scene.
        """
        if thermal_frame is None or thermal_frame.size == 0:
            return self._empty_features()

        gray = cv2.cvtColor(thermal_frame, cv2.COLOR_BGR2GRAY) if thermal_frame.ndim == 3 else thermal_frame
        h, w = gray.shape
        x1, y1, x2, y2 = [int(v) for v in bbox]
        ix1, iy1 = max(0, x1), max(0, y1)
        ix2, iy2 = min(w, x2), min(h, y2)

        if ix2 <= ix1 or iy2 <= iy1:
            return self._empty_features()

        roi = gray[iy1:iy2, ix1:ix2]
        if roi.size == 0:
            return self._empty_features()

        # 1. Basic intensity statistics
        mean_val = float(np.mean(roi))
        max_val = float(np.max(roi))
        min_val = float(np.min(roi))
        variance = float(np.var(roi))
        std_val = float(np.std(roi))

        # Approximate temperature mapping (linear calibration from intensity 0-255 to 15-50 °C)
        est_mean_c = 15.0 + (mean_val / 255.0) * 35.0
        est_max_c = 15.0 + (max_val / 255.0) * 35.0

        # 2. Thermal gradient (Sobel magnitude to measure internal/external heat boundary transition)
        sobelx = cv2.Sobel(roi, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(roi, cv2.CV_64F, 0, 1, ksize=3)
        grad_mag = np.sqrt(sobelx**2 + sobely**2)
        mean_grad = float(np.mean(grad_mag))

        # 3. Hot-pixel concentration (pixels >= 85th percentile of the frame or > 160 intensity)
        hot_threshold = max(150.0, np.percentile(roi, 60.0))
        hot_mask = (roi >= hot_threshold).astype(np.uint8)
        hot_pixel_ratio = float(np.count_nonzero(hot_mask) / roi.size)

        # 4. Connected thermal regions (component count inside ROI)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(hot_mask)
        connected_regions_count = max(1, num_labels - 1)  # subtract background label 0

        # 5. Thermal centroid vs geometric center
        moments = cv2.moments(hot_mask)
        if moments["m00"] > 0:
            cx_rel = float(moments["m10"] / moments["m00"])
            cy_rel = float(moments["m01"] / moments["m00"])
            roi_cx = (ix2 - ix1) / 2.0
            roi_cy = (iy2 - iy1) / 2.0
            centroid_offset = float(np.hypot(cx_rel - roi_cx, cy_rel - roi_cy) / max(1.0, np.hypot(roi_cx, roi_cy)))
        else:
            centroid_offset = 0.5

        # 6. Temperature distribution skewness
        skewness = float(np.mean(((roi - mean_val) / max(1.0, std_val))**3)) if std_val > 0.001 else 0.0

        # 7. Local background normalization and relative contrast
        bg_stats = background_normalizer.extract_local_background_stats(thermal_frame, bbox)
        contrast_stats = background_normalizer.compute_relative_contrast(mean_val, bg_stats)

        # 8. Multi-criteria thermal plausibility score (0.0 to 1.0)
        # Instead of binary thresholds, score is continuous
        temp_score = 1.0 - min(1.0, abs(est_mean_c - self.optimal_temp) / 12.0)
        contrast_score = contrast_stats["normalized_contrast"]
        grad_score = float(np.clip(mean_grad / 30.0, 0.0, 1.0))
        hot_ratio_score = 1.0 - min(1.0, abs(hot_pixel_ratio - 0.40) * 2.0)

        # Weighted combination for thermal score
        thermal_score = float(np.clip(
            0.35 * temp_score +
            0.30 * contrast_score +
            0.20 * grad_score +
            0.15 * hot_ratio_score,
            0.0, 1.0
        ))

        return {
            "mean_intensity": round(mean_val, 2),
            "max_intensity": round(max_val, 2),
            "min_intensity": round(min_val, 2),
            "variance": round(variance, 2),
            "std_dev": round(std_val, 2),
            "estimated_temp_c": round(est_mean_c, 1),
            "estimated_max_temp_c": round(est_max_c, 1),
            "mean_gradient": round(mean_grad, 2),
            "hot_pixel_ratio": round(hot_pixel_ratio, 3),
            "connected_regions": connected_regions_count,
            "centroid_offset": round(centroid_offset, 3),
            "skewness": round(skewness, 3),
            "relative_thermal_contrast": contrast_stats["relative_thermal_contrast"],
            "contrast_snr": contrast_stats["contrast_snr"],
            "bg_mean": bg_stats["bg_mean"],
            "thermal_score": round(thermal_score, 3)
        }

    def _empty_features(self) -> Dict[str, float]:
        return {
            "mean_intensity": 100.0,
            "max_intensity": 100.0,
            "min_intensity": 100.0,
            "variance": 10.0,
            "std_dev": 3.0,
            "estimated_temp_c": 30.0,
            "estimated_max_temp_c": 32.0,
            "mean_gradient": 5.0,
            "hot_pixel_ratio": 0.3,
            "connected_regions": 1,
            "centroid_offset": 0.5,
            "skewness": 0.0,
            "relative_thermal_contrast": 5.0,
            "contrast_snr": 1.0,
            "bg_mean": 100.0,
            "thermal_score": 0.5
        }

thermal_feature_extractor = ThermalFeatureExtractor()
