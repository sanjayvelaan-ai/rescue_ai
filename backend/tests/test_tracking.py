import unittest
import numpy as np
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.detection.candidate_detection import CandidateDetection
from app.tracking.tracker import MultiFrameTracker
from app.tracking.track_state import TrackState, TrackStatus
from app.tracking.temporal_validator import temporal_validator
from app.tracking.motion_analyzer import motion_analyzer

class TestTracking(unittest.TestCase):
    def setUp(self):
        self.tracker = MultiFrameTracker()

    def test_track_creation_and_association(self):
        # Frame 1 candidate
        cand1 = CandidateDetection(
            bbox=(100.0, 100.0, 150.0, 200.0),
            class_id=0,
            class_name="SURVIVOR",
            confidence=0.85
        )
        tracks_f1 = self.tracker.update([cand1], shape_scores=[0.75])
        self.assertEqual(len(tracks_f1), 1)
        track_id = tracks_f1[0].track_id

        # Frame 2 candidate (slight displacement)
        cand2 = CandidateDetection(
            bbox=(102.0, 101.0, 152.0, 201.0),
            class_id=0,
            class_name="SURVIVOR",
            confidence=0.88
        )
        tracks_f2 = self.tracker.update([cand2], shape_scores=[0.78])
        self.assertEqual(len(tracks_f2), 1)
        # Persistent track ID preserved
        self.assertEqual(tracks_f2[0].track_id, track_id)
        self.assertEqual(tracks_f2[0].hit_streak, 2)

    def test_temporal_validator_state_transitions(self):
        track = TrackState(
            track_id=1,
            current_bbox=(100.0, 100.0, 150.0, 200.0),
            state=TrackStatus.CANDIDATE
        )
        # Initially CANDIDATE
        state, score = temporal_validator.evaluate_state(track, current_fused_confidence=0.75)
        self.assertEqual(state, TrackStatus.CANDIDATE)

        # After hit streak >= 3 -> VERIFYING
        track.hit_streak = 4
        track.detection_age = 4
        state, score = temporal_validator.evaluate_state(track, current_fused_confidence=0.75)
        self.assertEqual(state, TrackStatus.VERIFYING)

        # After hit streak >= 10 -> CONFIRMED
        track.hit_streak = 10
        track.detection_age = 12
        state, score = temporal_validator.evaluate_state(track, current_fused_confidence=0.82)
        self.assertEqual(state, TrackStatus.CONFIRMED)
        self.assertGreater(score, 0.70)

    def test_motion_analyzer_preserves_stationary_survivors(self):
        # A motionless survivor (identical bboxes across frames)
        track = TrackState(
            track_id=1,
            current_bbox=(100.0, 100.0, 150.0, 200.0)
        )
        for _ in range(5):
            track.bbox_history.append((100.0, 100.0, 150.0, 200.0))

        result = motion_analyzer.analyze(track)
        # Stationary target must NOT be penalized (score stays >= 0.40)
        self.assertFalse(result.is_moving)
        self.assertGreaterEqual(result.motion_score, 0.45)

if __name__ == "__main__":
    unittest.main()
