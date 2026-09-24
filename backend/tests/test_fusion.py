import unittest
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.fusion.confidence_fusion import confidence_fusion_engine, FusionInputScores

class TestConfidenceFusion(unittest.TestCase):
    def test_weighted_fusion_normalization(self):
        inputs = FusionInputScores(
            yolo_score=0.85,
            thermal_score=0.78,
            shape_score=0.82,
            secondary_cnn_score=0.75,
            temporal_score=0.90,
            motion_score=0.60,
            context_score=0.88,
            rgb_score=0.80
        )
        result = confidence_fusion_engine.fuse(inputs)

        self.assertGreaterEqual(result.final_confidence, 0.0)
        self.assertLessEqual(result.final_confidence, 1.0)
        # Verify scores are stored in [0, 1]
        for score_name, score_val in result.normalized_scores.items():
            self.assertGreaterEqual(score_val, 0.0)
            self.assertLessEqual(score_val, 1.0)

        # High quality inputs should produce high confidence >= 0.75
        self.assertGreater(result.final_confidence, 0.75)

    def test_low_signals_produce_low_confidence(self):
        inputs = FusionInputScores(
            yolo_score=0.35,
            thermal_score=0.30,
            shape_score=0.20,
            secondary_cnn_score=0.30,
            temporal_score=0.20,
            motion_score=0.40,
            context_score=0.25,
            rgb_score=0.30
        )
        result = confidence_fusion_engine.fuse(inputs)
        self.assertLess(result.final_confidence, 0.40)

if __name__ == "__main__":
    unittest.main()
