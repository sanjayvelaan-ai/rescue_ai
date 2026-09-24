import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from app.config.config_loader import pipeline_config
from app.detection.candidate_detection import CandidateDetection
from .track_state import TrackState, TrackStatus

def compute_iou(boxA: Tuple[float, float, float, float], boxB: Tuple[float, float, float, float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interWidth = max(0.0, xB - xA)
    interHeight = max(0.0, yB - yA)
    interArea = interWidth * interHeight

    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    denom = boxAArea + boxBArea - interArea
    return interArea / denom if denom > 0 else 0.0

class MultiFrameTracker:
    """
    Edge-optimized multi-frame object tracker using spatial IoU and centroid distance
    association with constant-velocity Kalman prediction.
    Maintains persistent track IDs and histories across frames.
    """
    def __init__(self):
        self.next_track_id = 1
        self.tracks: Dict[int, TrackState] = {}
        self.iou_threshold = pipeline_config.get_nested("tracking", "iou_association_threshold", 0.30)
        self.max_distance_px = 75.0

    def reset(self):
        self.tracks.clear()
        self.next_track_id = 1

    def update(
        self,
        candidates: List[CandidateDetection],
        shape_scores: Optional[List[float]] = None
    ) -> List[TrackState]:
        """
        Associates new candidate detections with existing tracks.
        Creates new tracks for unmatched candidates and marks missing tracks.
        """
        matched_tracks = set()
        matched_candidates = set()

        if shape_scores is None:
            shape_scores = [0.6] * len(candidates)

        # 1. Greedy IoU & Centroid Distance Association
        for trk_id, track in list(self.tracks.items()):
            # Predict expected position using constant velocity
            pred_x1 = track.current_bbox[0] + track.velocity[0] * 0.03
            pred_y1 = track.current_bbox[1] + track.velocity[1] * 0.03
            pred_x2 = track.current_bbox[2] + track.velocity[0] * 0.03
            pred_y2 = track.current_bbox[3] + track.velocity[1] * 0.03
            pred_bbox = (pred_x1, pred_y1, pred_x2, pred_y2)
            pred_cx = (pred_x1 + pred_x2) / 2.0
            pred_cy = (pred_y1 + pred_y2) / 2.0

            best_iou = 0.0
            best_cand_idx = -1

            for i, cand in enumerate(candidates):
                if i in matched_candidates:
                    continue

                iou = compute_iou(pred_bbox, cand.bbox)
                cand_cx, cand_cy = cand.center_x, cand.center_y
                dist = np.hypot(cand_cx - pred_cx, cand_cy - pred_cy)

                # Combine IoU with proximity threshold
                if iou >= self.iou_threshold or dist <= self.max_distance_px:
                    score = iou + max(0.0, 1.0 - (dist / self.max_distance_px)) * 0.5
                    if score > best_iou:
                        best_iou = score
                        best_cand_idx = i

            if best_cand_idx >= 0:
                cand = candidates[best_cand_idx]
                ss = shape_scores[best_cand_idx]
                track.update(
                    new_bbox=cand.bbox,
                    confidence=cand.confidence,
                    thermal_stats=cand.thermal_stats,
                    shape_score=ss
                )
                matched_tracks.add(trk_id)
                matched_candidates.add(best_cand_idx)

        # 2. Mark unmatched tracks as missed
        for trk_id, track in list(self.tracks.items()):
            if trk_id not in matched_tracks:
                track.mark_missed()
                # Remove dead tracks if lost for too long
                if track.missed_frame_count > 25:
                    del self.tracks[trk_id]

        # 3. Create new tracks for unmatched candidates
        for i, cand in enumerate(candidates):
            if i not in matched_candidates:
                new_id = self.next_track_id
                self.next_track_id += 1
                ss = shape_scores[i]
                new_track = TrackState(
                    track_id=new_id,
                    current_bbox=cand.bbox,
                    confidence_history=[cand.confidence],
                    thermal_feature_history=[cand.thermal_stats],
                    shape_score_history=[ss],
                    state=TrackStatus.CANDIDATE
                )
                self.tracks[new_id] = new_track

        return list(self.tracks.values())

tracker = MultiFrameTracker()
