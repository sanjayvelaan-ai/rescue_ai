import unittest
import numpy as np
import cv2
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.thermal.shape_verifier import shape_verifier

class TestShapeVerifier(unittest.TestCase):
    def setUp(self):
        # 1. Human-like vertical silhouette crop (w=40, h=90 -> aspect ratio 2.25)
        self.human_crop = np.zeros((90, 40), dtype=np.uint8)
        # Head
        cv2.circle(self.human_crop, (20, 15), 10, 220, -1)
        # Torso
        cv2.rectangle(self.human_crop, (8, 25), (32, 65), 200, -1)
        # Legs
        cv2.rectangle(self.human_crop, (10, 65), (18, 88), 180, -1)
        cv2.rectangle(self.human_crop, (22, 65), (30, 88), 180, -1)

        # 2. Non-human flat hot rock slab (w=120, h=30 -> aspect ratio 0.25)
        self.rock_crop = np.full((30, 120), 230, dtype=np.uint8)

    def test_human_shape_verification(self):
        result = shape_verifier.verify(self.human_crop)
        
        self.assertTrue(result.is_human_compatible)
        self.assertGreaterEqual(result.aspect_ratio, 1.2)
        self.assertGreater(result.shape_score, 0.50)
        self.assertGreater(result.human_shape_probability, 0.50)

    def test_non_human_slab_rejection(self):
        result = shape_verifier.verify(self.rock_crop)
        
        # Horizontal rock slab aspect ratio ~ 0.25 (below min_aspect_ratio 0.6)
        self.assertFalse(result.is_human_compatible)
        self.assertLess(result.aspect_ratio, 0.6)
        self.assertLess(result.shape_score, 0.45)

    def test_empty_crop_resilience(self):
        result = shape_verifier.verify(np.array([]))
        self.assertIsNotNone(result)
        self.assertIn("shape_score", result.to_dict())

if __name__ == "__main__":
    unittest.main()
