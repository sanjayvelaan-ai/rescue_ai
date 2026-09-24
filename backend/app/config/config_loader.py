import os
from typing import Any, Dict, Optional
import yaml


class PipelineConfig:
    _instance: Optional["PipelineConfig"] = None

    def __init__(self, config_path: Optional[str] = None) -> None:
        if config_path is None:
            config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
        self.config_path = config_path
        self._raw_config: Dict[str, Any] = {}
        self.reload()

    def reload(self) -> None:
        if os.path.exists(self.config_path):
            with open(self.config_path, "r", encoding="utf-8") as f:
                self._raw_config = yaml.safe_load(f) or {}
        else:
            self._raw_config = self._default_config()

    def get(self, section: str, default: Any = None) -> Any:
        return self._raw_config.get(section, default if default is not None else {})

    def get_nested(self, section: str, key: str, default: Any = None) -> Any:
        sec = self.get(section, {})
        if isinstance(sec, dict):
            return sec.get(key, default)
        return default

    def _default_config(self) -> Dict[str, Any]:
        return {
            "detection": {"yolo_confidence": 0.35, "iou_threshold": 0.45, "imgsz": 416},
            "thermal": {"min_plausible_temp_c": 28.0, "max_plausible_temp_c": 42.0},
            "shape": {"min_aspect_ratio": 0.6, "max_aspect_ratio": 4.8},
            "tracking": {"min_confirm_frames": 10, "max_missed_frames": 12},
            "fusion": {
                "weights": {
                    "yolo": 0.20,
                    "thermal": 0.15,
                    "shape": 0.20,
                    "secondary_cnn": 0.10,
                    "temporal": 0.15,
                    "motion": 0.05,
                    "context": 0.10,
                    "rgb": 0.05,
                    "depth": 0.0,
                    "acoustic": 0.0,
                }
            },
            "decision": {
                "reject_threshold": 0.40,
                "verifying_threshold": 0.58,
                "confirm_threshold": 0.76,
            },
        }


pipeline_config = PipelineConfig()
