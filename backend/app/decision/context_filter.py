from dataclasses import dataclass
from typing import Dict, Any, Tuple, Optional
import numpy as np
from app.config.config_loader import pipeline_config
from app.thermal.shape_verifier import ShapeVerificationResult

@dataclass
class ContextEvaluationResult:
    context_human_score: float
    context_nonhuman_score: float
    detected_category: str
    is_plausible_survivor: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "context_human_score": round(self.context_human_score, 3),
            "context_nonhuman_score": round(self.context_nonhuman_score, 3),
            "detected_category": self.detected_category,
            "is_plausible_survivor": self.is_plausible_survivor
        }

class ContextFilter:
    """
    Evaluates environmental and thermal context to discriminate against
    common false-positive heat sources (hot rocks, engines, small fires,
    metallic debris, sun-glint reflections) without hard rejections.
    """
    def __init__(self):
        self.rock_max_variance = pipeline_config.get_nested("context", "rock_max_variance", 18.0)
        self.engine_min_temp = pipeline_config.get_nested("context", "vehicle_engine_min_temp_c", 65.0)
        self.fire_min_variance = pipeline_config.get_nested("context", "small_fire_min_variance", 45.0)

    def evaluate(
        self,
        thermal_stats: Dict[str, float],
        shape_result: ShapeVerificationResult,
        bbox: Tuple[float, float, float, float]
    ) -> ContextEvaluationResult:
        mean_c = thermal_stats.get("estimated_temp_c", 32.0)
        max_c = thermal_stats.get("estimated_max_temp_c", 36.0)
        variance = thermal_stats.get("variance", 15.0)
        ar = shape_result.aspect_ratio
        solidity = shape_result.solidity
        rel_contrast = thermal_stats.get("relative_thermal_contrast", 5.0)

        # Compute risk scores for common false-positive categories
        category = "HUMAN_CANDIDATE"
        nonhuman_score = 0.15

        # 1. Hot Rock / Pavement (Uniform thermal slab, high solidity, horizontal, low variance)
        if variance < self.rock_max_variance and solidity > 0.90 and ar < 1.1:
            category = "HOT_ROCK_OR_SLAB"
            nonhuman_score = 0.75

        # 2. Vehicle Engine / Industrial Component (Extremely hot, high contrast, rigid block)
        elif max_c >= self.engine_min_temp or (mean_c >= 55.0 and ar < 1.4):
            category = "VEHICLE_OR_MACHINERY"
            nonhuman_score = 0.85

        # 3. Small Fire / Burning Embers (Extreme localized heat and chaotic variance)
        elif variance >= self.fire_min_variance and max_c >= 60.0:
            category = "FIRE_OR_EMBERS"
            nonhuman_score = 0.80

        # 4. Sunlit Metallic Debris / Roof Reflection (High contrast, low interior gradient)
        elif rel_contrast > 25.0 and shape_result.edge_score < 0.25:
            category = "REFLECTIVE_SURFACE"
            nonhuman_score = 0.70

        # 5. Wild / Stray Animal (Horizontal aspect ratio ar < 0.85 with thermal heat)
        elif ar <= 0.85 and shape_result.is_human_compatible is False:
            category = "QUADRUPED_ANIMAL"
            nonhuman_score = 0.60

        # Invert to obtain context human score
        context_human_score = float(np.clip(1.0 - nonhuman_score, 0.05, 0.95))
        is_plausible = context_human_score >= 0.35

        return ContextEvaluationResult(
            context_human_score=context_human_score,
            context_nonhuman_score=round(nonhuman_score, 3),
            detected_category=category,
            is_plausible_survivor=is_plausible
        )

context_filter = ContextFilter()
