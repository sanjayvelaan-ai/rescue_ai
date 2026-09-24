import math
import random
from typing import Tuple, Dict, Any
from app.core.config import settings

class GPSService:
    def __init__(self):
        self.center_lat = settings.DISASTER_CENTER_LAT
        self.center_lng = settings.DISASTER_CENTER_LNG
        self.gps_mode = settings.GPS_MODE

    def image_to_gps(
        self,
        center_x: float,
        center_y: float,
        frame_width: int = 1280,
        frame_height: int = 720,
        drone_lat: float = 10.936423,
        drone_lng: float = 76.955785,
        altitude_m: float = 48.0
    ) -> Tuple[float, float, float]:
        """
        Maps frame pixel coordinates to realistic GPS coordinates based on drone position and altitude.
        Returns (latitude, longitude, accuracy_meters).
        """
        # Offset from optical center (0.0 to 1.0 normalized)
        norm_x = (center_x - (frame_width / 2.0)) / frame_width
        norm_y = (center_y - (frame_height / 2.0)) / frame_height

        # Approx meters per pixel at given altitude
        fov_meters_x = altitude_m * 1.2
        fov_meters_y = altitude_m * 0.7

        offset_x_m = norm_x * fov_meters_x
        offset_y_m = -norm_y * fov_meters_y  # Invert image y to North

        # 1 degree latitude ~= 111,000 meters
        # 1 degree longitude ~= 111,000 * cos(lat) meters
        lat_change = offset_y_m / 111000.0
        lng_change = offset_x_m / (111000.0 * math.cos(math.radians(drone_lat)))

        lat = round(drone_lat + lat_change, 6)
        lng = round(drone_lng + lng_change, 6)
        accuracy = round(random.uniform(1.8, 3.2), 1)

        return lat, lng, accuracy

    def get_drone_telemetry_gps(self, step: int = 0) -> Dict[str, Any]:
        """
        Generates realistic simulated drone GPS telemetry moving along a sector search grid.
        """
        angle = (step * 0.1) % (2 * math.pi)
        radius = 0.0035 + 0.001 * math.sin(step * 0.05)
        
        lat = round(self.center_lat + radius * math.sin(angle), 6)
        lng = round(self.center_lng + radius * math.cos(angle), 6)
        heading = round((math.degrees(angle) + 90) % 360, 1)

        return {
            "latitude": lat,
            "longitude": lng,
            "heading": heading,
            "accuracy_m": 2.4,
            "mode": self.gps_mode
        }

gps_service = GPSService()
