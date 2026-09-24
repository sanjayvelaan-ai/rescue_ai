import os
import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional
from app.config.config_loader import pipeline_config

class SecondaryClassifier:
    """
    Lightweight secondary classifier for thermal candidate crops.
    Operates strictly on candidate ROIs (not full frame) for maximum edge efficiency.
    Supports PyTorch MobileNetV3/EfficientNet-Lite if weights file is provided,
    and includes a robust edge-optimized HOG/gradient classifier fallback.
    """
    def __init__(self):
        self.enabled = pipeline_config.get_nested("secondary_classifier", "enabled", True)
        self.model_type = pipeline_config.get_nested("secondary_classifier", "model_type", "edge_fallback")
        self.weights_path = pipeline_config.get_nested("secondary_classifier", "weights_path", "backend/models/secondary_thermal_crop.pt")
        self.crop_size = tuple(pipeline_config.get_nested("secondary_classifier", "crop_size", [64, 64]))
        self.threshold = pipeline_config.get_nested("secondary_classifier", "threshold", 0.60)
        
        self.model = None
        self.device = "cpu"
        self._initialize_model()

    def _initialize_model(self):
        if not self.enabled:
            return

        # Attempt PyTorch model loading if file exists and torch is importable
        if os.path.exists(self.weights_path):
            try:
                import torch
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                self.model = torch.jit.load(self.weights_path, map_location=self.device)
                self.model.eval()
                print(f"[RESCUE AI] Secondary Classifier loaded TorchScript model from {self.weights_path}")
                return
            except Exception as e:
                print(f"[RESCUE AI] Could not load TorchScript secondary model ({e}). Using edge fallback verifier.")

        # Fallback mode
        self.model_type = "edge_fallback"

    def classify_crop(self, crop: Optional[np.ndarray]) -> Tuple[str, float]:
        """
        Classifies candidate crop as 'human' or 'non_human'.
        Returns (label, confidence_score [0, 1]).
        """
        if not self.enabled or crop is None or crop.size < 64:
            return "human", 0.65  # Neutral human assumption if crop missing

        try:
            if self.model is not None and self.model_type != "edge_fallback":
                return self._infer_pytorch(crop)
            else:
                return self._infer_fallback(crop)
        except Exception as e:
            return "human", 0.60

    def _infer_pytorch(self, crop: np.ndarray) -> Tuple[str, float]:
        import torch
        resized = cv2.resize(crop, self.crop_size)
        if resized.ndim == 2:
            resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
        tensor = torch.from_numpy(resized).permute(2, 0, 1).float().unsqueeze(0) / 255.0
        tensor = tensor.to(self.device)

        with torch.no_grad():
            output = self.model(tensor)
            prob = float(torch.softmax(output, dim=1)[0, 1].item()) if output.shape[1] > 1 else float(torch.sigmoid(output)[0, 0].item())

        label = "human" if prob >= self.threshold else "non_human"
        return label, round(prob, 3)

    def _infer_fallback(self, crop: np.ndarray) -> Tuple[str, float]:
        """
        Edge-optimized feature classifier based on gradient orientation histograms (HOG)
        and vertical intensity distribution.
        """
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
        resized = cv2.resize(gray, (48, 96))  # 1:2 human aspect ratio standard
        
        # 1. Gradient energy
        gx = cv2.Sobel(resized, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(resized, cv2.CV_32F, 0, 1, ksize=3)
        mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)
        mean_mag = float(np.mean(mag))

        # Vertical orientation preference (human silhouettes have strong vertical boundaries)
        vert_grad_mask = ((angle >= 70) & (angle <= 110)) | ((angle >= 250) & (angle <= 290))
        vert_grad_ratio = float(np.count_nonzero(vert_grad_mask) / max(1, np.count_nonzero(mag > 5)))

        # 2. Body-shape vertical profile (Head, Torso, Legs)
        h, w = resized.shape
        head_row = resized[0:int(h*0.25), :]
        torso_row = resized[int(h*0.25):int(h*0.7), :]
        legs_row = resized[int(h*0.7):, :]

        # Torso is typically the warmest core region in thermal view
        torso_mean = float(np.mean(torso_row))
        head_mean = float(np.mean(head_row))
        legs_mean = float(np.mean(legs_row))

        torso_dominance = (torso_mean >= head_mean - 10) and (torso_mean >= legs_mean - 15)

        # Composite score
        score = 0.50
        if mean_mag > 8.0:
            score += 0.15
        if vert_grad_ratio > 0.30:
            score += 0.20
        if torso_dominance:
            score += 0.15

        prob = float(np.clip(score, 0.10, 0.95))
        label = "human" if prob >= self.threshold else "non_human"
        return label, round(prob, 3)

secondary_classifier = SecondaryClassifier()
