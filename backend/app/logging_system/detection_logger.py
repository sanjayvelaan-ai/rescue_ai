import os
import json
import time
import cv2
import numpy as np
from typing import Dict, Any, Optional, Tuple
from app.config.config_loader import pipeline_config
from app.decision.survivor_decision import DecisionResult

class DetectionLogger:
    """
    Structured logger recording full multi-modal telemetry for every detection.
    Exports false positives and uncertain candidates to dataset curation folders
    for continual model training.
    """
    def __init__(self):
        self.enabled = pipeline_config.get_nested("logging", "log_detections", True)
        self.log_path = pipeline_config.get_nested("logging", "log_path", "data/logs/detection_events.jsonl")
        self.export_crops = pipeline_config.get_nested("logging", "export_uncertain_crops", True)
        self.crops_dir = pipeline_config.get_nested("logging", "crops_export_dir", "data/dataset_candidates")
        
        # Ensure directories exist
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        os.makedirs(self.crops_dir, exist_ok=True)
        os.makedirs(os.path.join(self.crops_dir, "false_positives"), exist_ok=True)
        os.makedirs(os.path.join(self.crops_dir, "uncertain"), exist_ok=True)

    def log_event(
        self,
        frame_id: int,
        track_id: int,
        bbox: Tuple[float, float, float, float],
        scores: Dict[str, float],
        decision_res: DecisionResult,
        thermal_crop: Optional[np.ndarray] = None
    ):
        if not self.enabled:
            return

        event_record = {
            "timestamp": time.time(),
            "iso_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "frame_id": frame_id,
            "track_id": track_id,
            "bounding_box": [round(v, 1) for v in bbox],
            "scores": {k: round(v, 3) for k, v in scores.items()},
            "final_score": round(decision_res.final_confidence, 3),
            "decision": decision_res.state,
            "reason": decision_res.reason,
            "rejection_code": decision_res.rejection_code
        }

        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(event_record) + "\n")
        except Exception as e:
            print(f"[RESCUE AI] Logger append error: {e}")

        # Export crop sample if false positive or uncertain
        if self.export_crops and thermal_crop is not None and thermal_crop.size > 0:
            target_sub = None
            if decision_res.state == "REJECTED":
                target_sub = "false_positives"
            elif decision_res.state in ("VERIFYING", "LOW_CONFIDENCE"):
                target_sub = "uncertain"

            if target_sub:
                crop_filename = f"{target_sub}_f{frame_id}_t{track_id}_{int(time.time()*1000)}.jpg"
                crop_out_path = os.path.join(self.crops_dir, target_sub, crop_filename)
                try:
                    cv2.imwrite(crop_out_path, thermal_crop)
                except Exception:
                    pass

detection_logger = DetectionLogger()
