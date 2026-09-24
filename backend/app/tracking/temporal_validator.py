from typing import Tuple
from app.config.config_loader import pipeline_config
from .track_state import TrackState, TrackStatus

class TemporalValidator:
    """
    Manages multi-frame temporal consistency state transitions.
    Prevents single-frame false alarms and ensures persistent multi-modal stability
    before confirming a survivor alert.
    """
    def __init__(self):
        self.min_confirm_frames = pipeline_config.get_nested("tracking", "min_confirm_frames", 10)
        self.min_verifying_frames = pipeline_config.get_nested("tracking", "min_verifying_frames", 3)
        self.max_missed_frames = pipeline_config.get_nested("tracking", "max_missed_frames", 12)
        self.min_track_age = pipeline_config.get_nested("tracking", "min_track_age", 5)

    def evaluate_state(
        self,
        track: TrackState,
        current_fused_confidence: float
    ) -> Tuple[TrackStatus, float]:
        """
        Updates the track state and computes a normalized temporal persistence score.
        Returns (new_state, temporal_score [0, 1]).
        """
        # Calculate temporal persistence score based on age and streak
        streak_ratio = min(1.0, track.hit_streak / float(self.min_confirm_frames))
        age_ratio = min(1.0, track.detection_age / float(self.min_confirm_frames + 5))
        miss_penalty = max(0.0, track.missed_frame_count * 0.12)
        
        temporal_score = float(max(0.0, min(1.0, (0.60 * streak_ratio + 0.40 * age_ratio) - miss_penalty)))

        # Check for track loss
        if track.missed_frame_count > self.max_missed_frames:
            track.state = TrackStatus.LOST
            return TrackStatus.LOST, 0.0

        # State transition rules
        if track.state == TrackStatus.CANDIDATE:
            if track.hit_streak >= self.min_verifying_frames and current_fused_confidence >= 0.40:
                track.state = TrackStatus.VERIFYING
            elif track.detection_age > 15 and current_fused_confidence < 0.35:
                track.state = TrackStatus.REJECTED

        elif track.state == TrackStatus.VERIFYING:
            if track.hit_streak >= self.min_confirm_frames and current_fused_confidence >= 0.70:
                track.state = TrackStatus.CONFIRMED
            elif track.missed_frame_count > 6 and current_fused_confidence < 0.45:
                track.state = TrackStatus.REJECTED

        elif track.state == TrackStatus.CONFIRMED:
            # Confirmed tracks remain confirmed unless lost for extended duration
            if track.missed_frame_count > self.max_missed_frames:
                track.state = TrackStatus.LOST

        return track.state, round(temporal_score, 3)

temporal_validator = TemporalValidator()
