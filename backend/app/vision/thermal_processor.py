import cv2
import numpy as np

def generate_thermal_simulation(rgb_frame: np.ndarray) -> np.ndarray:
    """
    Transforms an RGB frame into a realistic thermal simulation view
    using intensity normalization and OpenCV's COLORMAP_INFERNO.
    """
    if rgb_frame is None or rgb_frame.size == 0:
        return rgb_frame

    # Convert to grayscale / intensity image
    gray = cv2.cvtColor(rgb_frame, cv2.COLOR_BGR2GRAY)

    # Apply contrast enhancement (CLAHE - Contrast Limited Adaptive Histogram Equalization)
    # to accentuate warm/hot body signatures
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced_gray = clahe.apply(gray)

    # Apply COLORMAP_INFERNO mapping for realistic thermal aesthetic
    thermal_frame = cv2.applyColorMap(enhanced_gray, cv2.COLORMAP_INFERNO)

    return thermal_frame
