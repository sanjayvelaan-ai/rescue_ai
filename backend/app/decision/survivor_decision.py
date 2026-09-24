from dataclasses import dataclass
from typing import Dict, Any, Optional
from app.config.config_loader import pipeline_config
from app.tracking.track_state import TrackState, TrackStatus
from app.fusion.confidence_fusion import FusionResult
from .rejection_reasons import RejectionReason

@dataclass
class DecisionResult:
    track_id: int
    yolo_confidence: float
    thermal_score: float
    shape_score: float
    temporal_score: float
    context_score: float
    rgb_score: float
    final_confidence: float
    state: str  # REJECTED, LOW_CONFIDENCE, VERIFYING, LIKELY_SURVIVOR, CONFIRMED_SURVIVOR
    reason: str
    rejection_code: str = RejectionReason.NONE.value

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "yolo_confidence": round(self.yolo_confidence, 2),
            "thermal_score": round(self.thermal_score, 2),
            "shape_score": round(self.shape_score, 2),
            "temporal_score": round(self.temporal_score, 2),
            "context_score": round(self.context_score, 2),
            "rgb_score": round(self.rgb_score, 2),
            "final_confidence": round(self.final_confidence, 2),
            "state": self.state,
            "reason": self.reason,
            "rejection_code": self.rejection_code
        }

class SurvivorDecisionEngine:
    """
    Survivor Decision Engine.
    Evaluates multi-modal evidence across detector, thermal, shape, temporal, and context.
    Strictly forbids triggering survivor alerts purely on single-frame YOLO confidence.
    """
    def __init__(self):
        self.reject_thresh = pipeline_config.get_nested("decision", "reject_threshold", 0.40)
        self.verifying_thresh = pipeline_config.get_nested("decision", "verifying_threshold", 0.58)
        self.confirm_thresh = pipeline_config.get_nested("decision", "confirm_threshold", 0.76)
        self.min_confirm_frames = pipeline_config.get_nested("tracking", "min_confirm_frames", 10)

    def decide(
        self,
        track: TrackState,
        fusion_res: FusionResult,
        is_shape_compatible: bool = True
    ) -> DecisionResult:
        final_conf = fusion_res.final_confidence
        scores = fusion_res.normalized_scores

        yolo_conf = scores.get("yolo", 0.0)
        thermal_sc = scores.get("thermal", 0.0)
        shape_sc = scores.get("shape", 0.0)
        temp_sc = scores.get("temporal", 0.0)
        ctx_sc = scores.get("context", 0.0)
        rgb_sc = scores.get("rgb", 0.0)

        # 1. Definite Rejections (Identifiable non-human patterns)
        if shape_sc < 0.28 or not is_shape_compatible:
            return DecisionResult(
                track_id=track.track_id,
                yolo_confidence=yolo_conf,
                thermal_score=thermal_sc,
                shape_score=shape_sc,
                temporal_score=temp_sc,
                context_score=ctx_sc,
                rgb_score=rgb_sc,
                final_confidence=final_conf,
                state="REJECTED",
                reason="Non-human thermal structure",
                rejection_code=RejectionReason.POOR_HUMAN_SHAPE.value
            )

        if ctx_sc < 0.30:
            return DecisionResult(
                track_id=track.track_id,
                yolo_confidence=yolo_conf,
                thermal_score=thermal_sc,
                shape_score=shape_sc,
                temporal_score=temp_sc,
                context_score=ctx_sc,
                rgb_score=rgb_sc,
                final_confidence=final_conf,
                state="REJECTED",
                reason="Non-human context (high risk heat source)",
                rejection_code=RejectionReason.NONHUMAN_CONTEXT.value
            )

        if final_conf < self.reject_thresh:
            return DecisionResult(
                track_id=track.track_id,
                yolo_confidence=yolo_conf,
                thermal_score=thermal_sc,
                shape_score=shape_sc,
                temporal_score=temp_sc,
                context_score=ctx_sc,
                rgb_score=rgb_sc,
                final_confidence=final_conf,
                state="REJECTED",
                reason="Low multi-modal fused confidence",
                rejection_code=RejectionReason.LOW_FUSED_CONFIDENCE.value
            )

        # 2. Confirmed Survivor Criteria
        # Must have:
        # - High fused confidence >= confirm_threshold
        # - Multi-frame track persistence (hit_streak >= min_confirm_frames)
        # - Decent shape & thermal evidence
        if final_conf >= self.confirm_thresh and track.hit_streak >= self.min_confirm_frames:
            state = "CONFIRMED_SURVIVOR"
            reason = "Persistent multi-modal human candidate"
            track.state = TrackStatus.CONFIRMED

        elif final_conf >= 0.65 and track.hit_streak >= 5:
            state = "LIKELY_SURVIVOR"
            reason = "High confidence candidate accumulating track persistence"
            track.state = TrackStatus.VERIFYING

        elif final_conf >= self.verifying_thresh:
            state = "VERIFYING"
            reason = "Uncertain target under active multi-frame re-scan"
            track.state = TrackStatus.VERIFYING

        else:
            state = "LOW_CONFIDENCE"
            reason = "Candidate detection awaiting temporal accumulation"
            track.state = TrackStatus.CANDIDATE

        return DecisionResult(
            track_id=track.track_id,
            yolo_confidence=yolo_conf,
            thermal_score=thermal_sc,
            shape_score=shape_sc,
            temporal_score=temp_sc,
            context_score=ctx_sc,
            rgb_score=rgb_sc,
            final_confidence=final_conf,
            state=state,
            reason=reason,
            rejection_code=RejectionReason.NONE.value
        )

survivor_decision_engine = SurvivorDecisionEngine()
