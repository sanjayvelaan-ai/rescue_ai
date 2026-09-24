import unittest
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.tracking.track_state import TrackState, TrackStatus
from app.fusion.confidence_fusion import FusionResult
from app.decision.survivor_decision import survivor_decision_engine
from app.decision.rejection_reasons import RejectionReason

class TestDecisionEngine(unittest.TestCase):
    def test_confirmed_survivor_decision(self):
        track = TrackState(
            track_id=12,
            current_bbox=(200.0, 150.0, 250.0, 260.0),
            hit_streak=12,
            detection_age=15,
            state=TrackStatus.VERIFYING
        )
        fusion_res = FusionResult(
            final_confidence=0.84,
            normalized_scores={
                "yolo": 0.81, "thermal": 0.76, "shape": 0.83,
                "temporal": 0.91, "context": 0.88, "rgb": 0.79
            },
            weights_used={}
        )
        decision = survivor_decision_engine.decide(track, fusion_res, is_shape_compatible=True)

        self.assertEqual(decision.state, "CONFIRMED_SURVIVOR")
        self.assertEqual(decision.track_id, 12)
        self.assertIn("Persistent multi-modal human candidate", decision.reason)
        self.assertEqual(decision.rejection_code, RejectionReason.NONE.value)

    def test_rejected_false_positive_decision(self):
        track = TrackState(
            track_id=7,
            current_bbox=(300.0, 400.0, 420.0, 430.0),
            hit_streak=10,
            detection_age=12
        )
        # Low shape score & low context score
        fusion_res = FusionResult(
            final_confidence=0.38,
            normalized_scores={
                "yolo": 0.72, "thermal": 0.85, "shape": 0.25,
                "temporal": 0.94, "context": 0.22, "rgb": 0.30
            },
            weights_used={}
        )
        decision = survivor_decision_engine.decide(track, fusion_res, is_shape_compatible=False)

        self.assertEqual(decision.state, "REJECTED")
        self.assertEqual(decision.track_id, 7)
        self.assertEqual(decision.rejection_code, RejectionReason.POOR_HUMAN_SHAPE.value)

    def test_verifying_uncertain_decision(self):
        track = TrackState(
            track_id=4,
            current_bbox=(100.0, 100.0, 140.0, 190.0),
            hit_streak=4,
            detection_age=5
        )
        fusion_res = FusionResult(
            final_confidence=0.62,
            normalized_scores={
                "yolo": 0.60, "thermal": 0.65, "shape": 0.62,
                "temporal": 0.55, "context": 0.70, "rgb": 0.50
            },
            weights_used={}
        )
        decision = survivor_decision_engine.decide(track, fusion_res, is_shape_compatible=True)

        self.assertEqual(decision.state, "VERIFYING")
        self.assertIn("re-scan", decision.reason.lower())

if __name__ == "__main__":
    unittest.main()
