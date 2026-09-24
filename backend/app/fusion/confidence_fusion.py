from dataclasses import dataclass
from typing import Dict, Any, Optional
import numpy as np
from app.config.config_loader import pipeline_config

@dataclass
class FusionInputScores:
    yolo_score: float
    thermal_score: float
    shape_score: float
    secondary_cnn_score: float = 0.50
    temporal_score: float = 0.50
    motion_score: float = 0.50
    context_score: float = 0.50
    rgb_score: float = 0.50
    depth_score: float = 0.50
    acoustic_score: float = 0.50
    radar_score: float = 0.50

@dataclass
class FusionResult:
    final_confidence: float
    normalized_scores: Dict[str, float]
    weights_used: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "final_confidence": round(self.final_confidence, 3),
            "normalized_scores": {k: round(v, 3) for k, v in self.normalized_scores.items()},
            "weights_used": {k: round(v, 3) for k, v in self.weights_used.items()}
        }

class ConfidenceFusionEngine:
    """
    Centralized Confidence Fusion Engine.
    Combines multi-modal features with configurable weights from config.yaml.
    Guarantees every score is normalized into [0, 1].
    """
    def __init__(self):
        self.reload_weights()

    def reload_weights(self):
        cfg_weights = pipeline_config.get_nested("fusion", "weights", {})
        self.weights = {
            "yolo": float(cfg_weights.get("yolo", 0.20)),
            "thermal": float(cfg_weights.get("thermal", 0.15)),
            "shape": float(cfg_weights.get("shape", 0.20)),
            "secondary_cnn": float(cfg_weights.get("secondary_cnn", 0.10)),
            "temporal": float(cfg_weights.get("temporal", 0.15)),
            "motion": float(cfg_weights.get("motion", 0.05)),
            "context": float(cfg_weights.get("context", 0.10)),
            "rgb": float(cfg_weights.get("rgb", 0.05)),
            "depth": float(cfg_weights.get("depth", 0.00)),
            "acoustic": float(cfg_weights.get("acoustic", 0.00)),
            "radar": float(cfg_weights.get("radar", 0.00))
        }

    def fuse(self, inputs: FusionInputScores) -> FusionResult:
        self.reload_weights()

        raw_scores = {
            "yolo": float(np.clip(inputs.yolo_score, 0.0, 1.0)),
            "thermal": float(np.clip(inputs.thermal_score, 0.0, 1.0)),
            "shape": float(np.clip(inputs.shape_score, 0.0, 1.0)),
            "secondary_cnn": float(np.clip(inputs.secondary_cnn_score, 0.0, 1.0)),
            "temporal": float(np.clip(inputs.temporal_score, 0.0, 1.0)),
            "motion": float(np.clip(inputs.motion_score, 0.0, 1.0)),
            "context": float(np.clip(inputs.context_score, 0.0, 1.0)),
            "rgb": float(np.clip(inputs.rgb_score, 0.0, 1.0)),
            "depth": float(np.clip(inputs.depth_score, 0.0, 1.0)),
            "acoustic": float(np.clip(inputs.acoustic_score, 0.0, 1.0)),
            "radar": float(np.clip(inputs.radar_score, 0.0, 1.0))
        }

        # Normalize weights so sum equals 1.0
        active_weights = {k: w for k, w in self.weights.items() if w > 0.0}
        total_weight = sum(active_weights.values())
        if total_weight <= 0.0:
            total_weight = 1.0
            active_weights = {"yolo": 0.5, "thermal": 0.5}

        normalized_weights = {k: w / total_weight for k, w in active_weights.items()}

        final_score = sum(raw_scores[k] * normalized_weights[k] for k in normalized_weights)
        final_score = float(np.clip(final_score, 0.0, 1.0))

        return FusionResult(
            final_confidence=round(final_score, 3),
            normalized_scores=raw_scores,
            weights_used=normalized_weights
        )

confidence_fusion_engine = ConfidenceFusionEngine()
