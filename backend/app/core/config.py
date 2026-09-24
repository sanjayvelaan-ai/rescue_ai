import os
from pathlib import Path
from pydantic_settings import BaseSettings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_ROOT / 'data'
DETECTIONS_DIR = DATA_DIR / 'detections'
DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "RESCUE AI"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Model configuration
    MODEL_PATH: str = os.getenv("MODEL_PATH", str(BACKEND_ROOT / 'models' / 'best.pt'))
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.28"))
    IOU_THRESHOLD: float = float(os.getenv("IOU_THRESHOLD", "0.45"))
    DEVICE: str = os.getenv("DEVICE", "auto")
    
    # Vision & Camera configuration
    CAMERA_INDEX: int = int(os.getenv("CAMERA_INDEX", "0"))
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720
    FRAME_FPS: int = 30
    CAMERA_ENABLED: bool = os.getenv("CAMERA_ENABLED", "true").lower() in ("true", "1", "yes")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
    LIVE_CONFIRM_FRAMES: int = 1
    LIVE_TRACK_TIMEOUT: float = 4.0
    SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "false").lower() in ("true", "1", "yes")
    
    # Simulation & GPS configuration
    GPS_MODE: str = os.getenv("GPS_MODE", "SIMULATION")
    DISASTER_CENTER_LAT: float = 10.936423
    DISASTER_CENTER_LNG: float = 76.955785
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'rescueeye.db').as_posix()}")

import json
try:
    saved = json.loads((DATA_DIR / 'runtime-settings.json').read_text(encoding='utf-8'))
except (OSError, ValueError):
    saved = {}
settings = Settings(**{k: v for k, v in saved.items() if k in {'MODEL_PATH', 'CONFIDENCE_THRESHOLD', 'IOU_THRESHOLD', 'CAMERA_INDEX'} and k not in os.environ})
