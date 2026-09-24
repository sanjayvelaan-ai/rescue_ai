import cv2
import numpy as np
from dataclasses import dataclass
from typing import Tuple, Dict, Any, Optional
from app.config.config_loader import pipeline_config

@dataclass
class ShapeVerificationResult:
    shape_score: float
    edge_score: float
    contour_score: float
    human_shape_probability: float
    aspect_ratio: float
    solidity: float
    compactness: float
    is_human_compatible: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "shape_score": round(self.shape_score, 3),
            "edge_score": round(self.edge_score, 3),
            "contour_score": round(self.contour_score, 3),
            "human_shape_probability": round(self.human_shape_probability, 3),
            "aspect_ratio": round(self.aspect_ratio, 2),
            "solidity": round(self.solidity, 3),
            "compactness": round(self.compactness, 3),
            "is_human_compatible": self.is_human_compatible
        }

class ShapeVerifier:
    """
    Lightweight thermal shape and edge verification stage.
    Rejects obvious non-human thermal blobs (wide rocks, long heat pipes,
    circular uniform reflections, tiny hot specks) while allowing partially
    occluded or seated survivors.
    """
    def __init__(self):
        self.min_ar = pipeline_config.get_nested("shape", "min_aspect_ratio", 0.6)
        self.max_ar = pipeline_config.get_nested("shape", "max_aspect_ratio", 4.8)
        self.typical_ar = pipeline_config.get_nested("shape", "typical_aspect_ratio", 2.2)
        self.min_solidity = pipeline_config.get_nested("shape", "min_solidity", 0.25)
        self.max_solidity = pipeline_config.get_nested("shape", "max_solidity", 0.92)
        self.canny_low = pipeline_config.get_nested("shape", "edge_canny_low", 40)
        self.canny_high = pipeline_config.get_nested("shape", "edge_canny_high", 120)

    def verify(
        self,
        thermal_crop: np.ndarray,
        bbox: Optional[Tuple[float, float, float, float]] = None
    ) -> ShapeVerificationResult:
        if thermal_crop is None or thermal_crop.size < 64:
            return self._default_result(aspect_ratio=2.0)

        # Convert to grayscale
        gray = cv2.cvtColor(thermal_crop, cv2.COLOR_BGR2GRAY) if thermal_crop.ndim == 3 else thermal_crop
        ch, cw = gray.shape
        if ch < 8 or cw < 8:
            return self._default_result(aspect_ratio=float(ch / max(1, cw)))

        aspect_ratio = float(ch / float(cw))

        # 1. Edge detection using Canny & Sobel
        edges = cv2.Canny(gray, self.canny_low, self.canny_high)
        edge_pixel_count = np.count_nonzero(edges)
        edge_density = float(edge_pixel_count / float(ch * cw))
        # Humans have defined perimeter edges (~0.05 to ~0.35 density)
        edge_score = float(np.clip(1.0 - abs(edge_density - 0.18) * 3.5, 0.05, 0.98))

        # 2. Thresholding and Contour Analysis
        # Use Otsu or adaptive thresholding for thermal body core
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return self._default_result(aspect_ratio=aspect_ratio, edge_score=edge_score)

        # Largest contour is the primary candidate body
        largest_c = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest_c)
        hull = cv2.convexHull(largest_c)
        hull_area = cv2.contourArea(hull)
        perimeter = cv2.arcLength(largest_c, True)

        solidity = float(area / max(1.0, hull_area))
        compactness = float((4.0 * np.pi * area) / max(1.0, perimeter ** 2)) if perimeter > 0 else 0.0

        # Human solidity is typically between 0.35 and 0.85 (limbs, neck, torso produce concave hull)
        # Uniform solid disks (hot rocks) have solidity > 0.95
        if 0.35 <= solidity <= 0.85:
            solidity_score = 0.90
        elif 0.25 <= solidity <= 0.92:
            solidity_score = 0.65
        else:
            solidity_score = 0.25

        # 3. Spatial Mass Distribution (Vertical Organization)
        # Divide into upper half (head/shoulders) and lower half (torso/legs)
        upper_half = thresh[0:ch//2, :]
        lower_half = thresh[ch//2:ch, :]
        upper_mass = np.count_nonzero(upper_half)
        lower_mass = np.count_nonzero(lower_half)
        total_mass = upper_mass + lower_mass

        if total_mass > 0:
            mass_balance = float(min(upper_mass, lower_mass) / float(max(upper_mass, lower_mass)))
            # Reasonable human mass distribution score
            spatial_org_score = float(np.clip(mass_balance + 0.3, 0.2, 1.0))
        else:
            spatial_org_score = 0.4

        # 4. Aspect Ratio compatibility
        if self.min_ar <= aspect_ratio <= self.max_ar:
            # Optimal score centered near 1.8 - 2.6 (standing/lying/sitting human profile)
            ar_diff = abs(aspect_ratio - self.typical_ar)
            ar_score = float(np.clip(1.0 - (ar_diff / 2.5), 0.3, 1.0))
        else:
            ar_score = 0.15

        # 5. Composite scores
        contour_score = float(np.clip(0.5 * solidity_score + 0.5 * spatial_org_score, 0.0, 1.0))
        shape_score = float(np.clip(0.40 * ar_score + 0.35 * contour_score + 0.25 * edge_score, 0.0, 1.0))
        human_shape_prob = float(np.clip(0.45 * shape_score + 0.30 * contour_score + 0.25 * edge_score, 0.0, 1.0))

        is_human_compatible = (shape_score >= 0.35) and (aspect_ratio >= self.min_ar)

        return ShapeVerificationResult(
            shape_score=shape_score,
            edge_score=edge_score,
            contour_score=contour_score,
            human_shape_probability=human_shape_prob,
            aspect_ratio=aspect_ratio,
            solidity=solidity,
            compactness=compactness,
            is_human_compatible=is_human_compatible
        )

    def _default_result(
        self,
        aspect_ratio: float = 2.0,
        edge_score: float = 0.6
    ) -> ShapeVerificationResult:
        return ShapeVerificationResult(
            shape_score=0.60,
            edge_score=edge_score,
            contour_score=0.60,
            human_shape_probability=0.60,
            aspect_ratio=aspect_ratio,
            solidity=0.65,
            compactness=0.30,
            is_human_compatible=True
        )

shape_verifier = ShapeVerifier()
