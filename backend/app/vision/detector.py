import os
import threading
import numpy as np
from typing import List, Dict, Any
from pathlib import Path
from app.core.config import settings, BACKEND_ROOT

try:
    import torch
    from ultralytics import YOLO
    TORCH_AVAILABLE = True
except ImportError as e:
    print(f"[RESCUE AI WARNING] PyTorch/Ultralytics not installed or initializing: {e}")
    torch = None
    YOLO = None
    TORCH_AVAILABLE = False


class YOLODetector:
    def __init__(self):
        self.model = None
        self._lock = threading.RLock()
        self.last_error = None
        self.model_online = False
        self.model_name = "YOLOv8s"
        self.device = "cpu"
        self.class_names: Dict[int, str] = {}
        self.person_class_ids: List[int] = []
        self.model_path = settings.MODEL_PATH or "yolov8s.pt"
        self.conf_threshold = settings.CONFIDENCE_THRESHOLD
        self.iou_threshold = settings.IOU_THRESHOLD
        
        self.load_model()

    def load_model(self):
        if not TORCH_AVAILABLE or torch is None or YOLO is None:
            print("[RESCUE AI Detector] PyTorch/YOLO unavailable. Detector offline.")
            self.model_online = False
            self.last_error = 'PyTorch/Ultralytics unavailable. Install backend requirements.'
            return

        print(f"[RESCUE AI Detector] Initializing YOLOv8s model loading from: {self.model_path}")
        
        # Determine PyTorch hardware device
        if settings.DEVICE == "auto" or not settings.DEVICE:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = settings.DEVICE

        if self.device == "cpu":
            # Enable CPU thread optimization for fast inference
            cpu_threads = max(1,min(8,int(os.getenv('TORCH_NUM_THREADS',str(os.cpu_count() or 4)))))
            torch.set_num_threads(cpu_threads)
            print(f"[RESCUE AI Detector] Configured PyTorch CPU threads: {cpu_threads}")

        print(f"[RESCUE AI Detector] Target device selected: {self.device.upper()}")

        target = Path(self.model_path)
        if not target.is_absolute():
            target = BACKEND_ROOT / target
        resolved_path = str(target.resolve()) if target.is_file() else None

        try:
            if resolved_path is None:
                raise FileNotFoundError('No local YOLO weights found. Configure MODEL_PATH.')
            print(f"[RESCUE AI Detector] Loading YOLOv8s weights from: {resolved_path}")
            self.model = YOLO(resolved_path)
            self.model.to(self.device)
            self.model_online = True
            self.model_path = resolved_path
            self.model_name = os.path.basename(resolved_path)
            
            # Inspect original class names from model.names
            if hasattr(self.model, 'names') and self.model.names:
                self.class_names = self.model.names
            elif hasattr(self.model.model, 'names') and self.model.model.names:
                self.class_names = self.model.model.names
            else:
                raise ValueError('Configured model has no class names.')

            print(f"[RESCUE AI Detector] YOLOv8s model successfully loaded. Classes ({len(self.class_names)}): {self.class_names}")

            # Identify target survivor/person class IDs dynamically without hardcoding
            self.person_class_ids = []
            for cid, cname in self.class_names.items():
                cname_lower = str(cname).lower()
                if any(term in cname_lower for term in ['person', 'survivor', 'human', 'body', 'victim']):
                    self.person_class_ids.append(cid)
            
            if not self.person_class_ids:
                raise ValueError('The configured model has no person/survivor class.')
            self.last_error = None

            print(f"[RESCUE AI Detector] Target survivor class IDs identified: {self.person_class_ids}")

        except Exception as e:
            self.last_error = str(e)
            print(f"[RESCUE AI ERROR] Failed to load YOLOv8s model: {e}")
            self.model = None
            self.model_online = False

    def update_config(self, conf: float, iou: float):
        self.conf_threshold = conf
        self.iou_threshold = iou

    def infer_frame(self, frame: np.ndarray, source: str = "RGB", imgsz: int = 416) -> List[Dict[str, Any]]:
        if not self.model_online or self.model is None or frame is None or frame.size == 0:
            return []

        try:
            with self._lock:
                # Optimize CPU inference with inference_mode if torch is available
                if TORCH_AVAILABLE and torch is not None:
                    with torch.inference_mode():
                        results = self.model(
                            frame, conf=self.conf_threshold, iou=self.iou_threshold,
                            imgsz=imgsz, device=self.device, classes=self.person_class_ids,
                            verbose=False, save=False
                        )
                else:
                    results = self.model(
                        frame, conf=self.conf_threshold, iou=self.iou_threshold,
                        imgsz=imgsz, device=self.device, classes=self.person_class_ids,
                        verbose=False, save=False
                    )
            self.last_error = None

            detections = []
            if not results or len(results) == 0:
                return detections

            boxes = results[0].boxes
            if boxes is None or len(boxes) == 0:
                return detections

            for i, box in enumerate(boxes):
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                
                # Check if detected class is within target classes
                if cls_id in self.person_class_ids or not self.person_class_ids:
                    xyxy = box.xyxy[0].cpu().numpy()
                    x1, y1, x2, y2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])
                    center_x = float((x1 + x2) / 2.0)
                    center_y = float((y1 + y2) / 2.0)
                    
                    raw_name = self.class_names.get(cls_id, "person")
                    raw_lower = raw_name.lower().strip()
                    
                    # Context-safe labeling
                    if raw_lower == "survivor":
                        display_label = "SURVIVOR"
                    elif raw_lower == "person":
                        display_label = "PERSON / POSSIBLE SURVIVOR"
                    else:
                        display_label = raw_name.upper()

                    det = {
                        "id": f"{source.lower()}_{i}",
                        "class_id": cls_id,
                        "class_name": raw_name,
                        "display_label": display_label,
                        "confidence": round(conf, 3),
                        "x1": round(x1, 1),
                        "y1": round(y1, 1),
                        "x2": round(x2, 1),
                        "y2": round(y2, 1),
                        "center_x": round(center_x, 1),
                        "center_y": round(center_y, 1),
                        "source": source
                    }
                    detections.append(det)

            return detections

        except Exception as e:
            self.last_error = str(e)
            print(f"[RESCUE AI ERROR] Inference error on {source} frame: {e}")
            return []

detector = YOLODetector()
