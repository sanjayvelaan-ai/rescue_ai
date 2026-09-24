import unittest
import numpy as np
import cv2
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.thermal.thermal_features import thermal_feature_extractor
from app.thermal.background_normalization import background_normalizer

class TestThermalFeatures(unittest.TestCase):
    def setUp(self):
        # Create synthetic 720x1280 thermal frame
        self.frame = np.full((720, 1280), 80, dtype=np.uint8)  # Ambient cool background
        
        # Draw warm synthetic human blob (cx=640, cy=360, w=40, h=90)
        cv2.rectangle(self.frame, (620, 315), (660, 405), 185, -1)
        # Inner warmer torso
        cv2.rectangle(self.frame, (625, 335), (655, 385), 215, -1)

    def test_background_normalization(self):
        bbox = (620.0, 315.0, 660.0, 405.0)
        bg_stats = background_normalizer.extract_local_background_stats(self.frame, bbox)
        
        self.assertIn("bg_mean", bg_stats)
        self.assertIn("bg_std", bg_stats)
        # Ambient background should be close to 80
        self.assertAlmostEqual(bg_stats["bg_mean"], 80.0, delta=15.0)

    def test_relative_contrast(self):
        bg_stats = {"bg_mean": 80.0, "bg_std": 5.0}
        contrast = background_normalizer.compute_relative_contrast(190.0, bg_stats)
        
        self.assertGreater(contrast["relative_thermal_contrast"], 90.0)
        self.assertGreater(contrast["contrast_snr"], 10.0)
        self.assertGreaterEqual(contrast["normalized_contrast"], 0.70)

    def test_thermal_feature_extraction(self):
        bbox = (620.0, 315.0, 660.0, 405.0)
        features = thermal_feature_extractor.extract_features(self.frame, bbox)

        self.assertIn("mean_intensity", features)
        self.assertIn("estimated_temp_c", features)
        self.assertIn("thermal_score", features)
        self.assertIn("mean_gradient", features)
        self.assertIn("hot_pixel_ratio", features)

        # Candidate is warm, so estimated temp should be in plausible human range
        self.assertGreater(features["estimated_temp_c"], 30.0)
        self.assertGreater(features["thermal_score"], 0.50)

    def test_empty_frame_handling(self):
        features = thermal_feature_extractor.extract_features(np.array([]), (0, 0, 10, 10))
        self.assertIn("thermal_score", features)
        self.assertEqual(features["thermal_score"], 0.5)

if __name__ == "__main__":
    unittest.main()
