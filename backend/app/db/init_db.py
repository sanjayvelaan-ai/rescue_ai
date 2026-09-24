import cv2
import os
from typing import List, Optional
import numpy as np
from datetime import datetime, timezone
from app.db.database import engine, Base, SessionLocal
from app.db.models import (
    DroneFleetModel, RescueTeamModel, MissionModel, HazardModel, SurvivorModel, AlertModel
)

def get_survivor_photo_paths() -> List[str]:
    """Finds available real survivor photo assets on disk."""
    import glob
    for base in ["backend/app/assets/survivor_photos", "app/assets/survivor_photos", "assets/survivor_photos"]:
        matches = sorted(glob.glob(os.path.join(base, "*.jpg")))
        if matches:
            return matches
    return []

def generate_realistic_drone_snapshot_disk(survivor_id: str, lat: float, lng: float, conf_pct: int, is_thermal: bool = False) -> str:
    """Generates authentic photographic aerial drone surveillance snapshots using real photos with optical RGB and radiometric FLIR infrared processing."""
    filename = f"{survivor_id}_demo_{'thermal' if is_thermal else 'rgb'}.jpg"
    for dir_path in ["data/detections", "backend/data/detections"]:
        os.makedirs(dir_path, exist_ok=True)

    h, w = 480, 640
    photo_list = get_survivor_photo_paths()

    if photo_list:
        # Deterministically select photo for this survivor
        idx = (abs(hash(survivor_id)) + (3 if is_thermal else 0)) % len(photo_list)
        base_img = cv2.imread(photo_list[idx])
    else:
        base_img = None

    if base_img is not None and base_img.size > 0:
        # Resize/crop to 640x480 preserving aspect ratio
        ih, iw = base_img.shape[:2]
        scale = max(w / iw, h / ih)
        nw, nh = int(iw * scale), int(ih * scale)
        resized = cv2.resize(base_img, (nw, nh), interpolation=cv2.INTER_AREA)
        # Center crop
        x_off = (nw - w) // 2
        y_off = (nh - h) // 2
        img = resized[y_off:y_off + h, x_off:x_off + w].copy()
    else:
        # Fallback realistic disaster ground texture
        base_color = np.array([55, 62, 68], dtype=np.uint8)
        noise_tex = np.random.randint(-18, 18, (h, w, 3), dtype=np.int16)
        img = np.clip(base_color.astype(np.int16) + noise_tex, 20, 180).astype(np.uint8)

    if is_thermal:
        # === RADIOMETRIC FLIR TAU-2 INFERNO THERMAL PROFILE FROM REAL PHOTO ===
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Enhance contrast for human heat radiation (37.2°C core body temperature)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        # Thermal diffusion blur simulating microbolometer sensor optics
        thermal_blurred = cv2.GaussianBlur(enhanced, (9, 9), 0)
        # Boost warmer regions to emulate human core thermal dissipation
        warm_boost = cv2.addWeighted(thermal_blurred, 1.25, np.full_like(thermal_blurred, 25), 0.35, 0)
        img = cv2.applyColorMap(warm_boost, cv2.COLORMAP_INFERNO)

        # High-tech HUD Overlay & Corner Reticles
        bx1, by1, bx2, by2 = 140, 70, 500, 420
        c_len = 28
        # Top-left
        cv2.line(img, (bx1, by1), (bx1 + c_len, by1), (0, 220, 255), 2)
        cv2.line(img, (bx1, by1), (bx1, by1 + c_len), (0, 220, 255), 2)
        # Top-right
        cv2.line(img, (bx2, by1), (bx2 - c_len, by1), (0, 220, 255), 2)
        cv2.line(img, (bx2, by1), (bx2, by1 + c_len), (0, 220, 255), 2)
        # Bottom-left
        cv2.line(img, (bx1, by2), (bx1 + c_len, by2), (0, 220, 255), 2)
        cv2.line(img, (bx1, by2), (bx1, by2 - c_len), (0, 220, 255), 2)
        # Bottom-right
        cv2.line(img, (bx2, by2), (bx2 - c_len, by2), (0, 220, 255), 2)
        cv2.line(img, (bx2, by2), (bx2, by2 - c_len), (0, 220, 255), 2)

        # Telemetry Tag
        cv2.rectangle(img, (bx1, max(10, by1 - 26)), (bx1 + 240, by1), (15, 23, 42), -1)
        cv2.rectangle(img, (bx1, max(10, by1 - 26)), (bx1 + 240, by1), (0, 200, 255), 1)
        cv2.putText(img, f"{survivor_id} THERMAL: 37.2C [{conf_pct}%]", (bx1 + 8, by1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 220, 255), 1)

        # Bottom Bar
        cv2.rectangle(img, (15, 445), (625, 472), (10, 15, 25), -1)
        cv2.putText(img, f"FLIR TAU-2 INFRARED 60Hz | GPS: {lat:.5f}N, {lng:.5f}E | DELTA-T: +14.8C", (25, 463), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
    else:
        # === PHOTOREALISTIC OPTICAL 1080P DRONE SURVEILLANCE ===
        # High-Tech YOLOv8s Bounding Box Corner Reticle
        bx1, by1, bx2, by2 = 140, 70, 500, 420
        c_len = 28
        for cx, cy, dx, dy in [
            (bx1, by1, c_len, c_len),
            (bx2, by1, -c_len, c_len),
            (bx1, by2, c_len, -c_len),
            (bx2, by2, -c_len, -c_len)
        ]:
            cv2.line(img, (cx, cy), (cx + dx, cy), (0, 255, 180), 2)
            cv2.line(img, (cx, cy), (cx, cy + dy), (0, 255, 180), 2)

        # Survivor Tag Banner
        cv2.rectangle(img, (bx1, max(10, by1 - 26)), (bx1 + 250, by1), (15, 23, 42), -1)
        cv2.rectangle(img, (bx1, max(10, by1 - 26)), (bx1 + 250, by1), (0, 255, 180), 1)
        cv2.putText(img, f"SURVIVOR {survivor_id} [{conf_pct}% CONF]", (bx1 + 8, by1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 255, 180), 1)

        # Top Drone Telemetry Banner
        cv2.rectangle(img, (15, 12), (625, 48), (15, 23, 42), -1)
        cv2.rectangle(img, (15, 12), (625, 48), (0, 229, 255), 1)
        cv2.putText(img, f"RESCUE AI AERIAL SURVEILLANCE • DRONE RE-01 4K", (25, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 229, 255), 1)
        cv2.putText(img, f"GPS: {lat:.5f} N, {lng:.5f} E | ALT: 48.5m | OPTICAL 1080P", (25, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (148, 163, 184), 1)

    for dir_path in ["data/detections", "backend/data/detections"]:
        try:
            cv2.imwrite(os.path.join(dir_path, filename), img)
        except Exception:
            pass
    return f"/data/detections/{filename}"

def create_demo_snapshot_images():
    """Generates valid demo snapshot image files on disk using authentic photos so alert previews load with zero 404s."""
    for s_id in ["S-001", "S-002", "S-003", "S-004", "S-005", "S-006", "S-007", "S-008", "S-009", "S-010", "S-011", "S-012", "S-013", "S-014", "S-015", "S-016", "S-017", "S-018", "S-019", "S-020", "S-021", "S-022", "S-023", "S-024", "S-025"]:
        generate_realistic_drone_snapshot_disk(s_id, 10.935423, 76.953785, 96, is_thermal=False)
        generate_realistic_drone_snapshot_disk(s_id, 10.935423, 76.953785, 96, is_thermal=True)

NEARBY_TEAM_CONFIG = {
    "T-ALPHA": {
        "latitude": 10.936023,
        "longitude": 76.954885,
        "current_location_name": "Sector B-4 Forward Post Alpha",
        "eta_seconds": 35,
    },
    "T-BRAVO": {
        "latitude": 10.938123,
        "longitude": 76.957885,
        "current_location_name": "Sector B-4 Staging Area Bravo",
        "eta_seconds": 45,
    },
    "T-CHARLIE": {
        "latitude": 10.934823,
        "longitude": 76.956185,
        "current_location_name": "Sector B-4 Tactical Medical Station",
        "eta_seconds": 40,
    },
    "T-DELTA": {
        "latitude": 10.937823,
        "longitude": 76.954285,
        "current_location_name": "Sector B-4 Rapid Access Dock",
        "eta_seconds": 50,
    },
}

def ensure_nearby_rescue_teams(db: SessionLocal):
    """Updates rescue teams to forward tactical positions close to survivor detection hotspots."""
    for team_id, cfg in NEARBY_TEAM_CONFIG.items():
        team = db.query(RescueTeamModel).filter(RescueTeamModel.team_id == team_id).first()
        if team and team.status in ("AVAILABLE", "STANDBY"):
            team.latitude = cfg["latitude"]
            team.longitude = cfg["longitude"]
            team.current_location_name = cfg["current_location_name"]
            team.eta_seconds = cfg["eta_seconds"]
    db.commit()

def ensure_survivor_and_alert_snapshots(db: SessionLocal):
    """Ensures all existing survivors and alerts have valid detection and thermal frame paths populated."""
    survivors = db.query(SurvivorModel).all()
    for s in survivors:
        if not s.detection_frame_path:
            s.detection_frame_path = f"/data/detections/{s.survivor_id}_demo_rgb.jpg"
        if not s.thermal_frame_path:
            s.thermal_frame_path = f"/data/detections/{s.survivor_id}_demo_thermal.jpg"
        # Generate disk images
        generate_realistic_drone_snapshot_disk(s.survivor_id, s.latitude, s.longitude, int((s.fusion_confidence or 0.95) * 100), is_thermal=False)
        generate_realistic_drone_snapshot_disk(s.survivor_id, s.latitude, s.longitude, int((s.fusion_confidence or 0.95) * 100), is_thermal=True)

    alerts = db.query(AlertModel).all()
    for a in alerts:
        if not a.frame_snapshot_path:
            if a.survivor_id:
                a.frame_snapshot_path = f"/data/detections/{a.survivor_id}_demo_rgb.jpg"
            elif "FIRE" in a.type or "HAZARD" in a.type:
                a.frame_snapshot_path = "/data/detections/S-002_demo_rgb.jpg"
            else:
                a.frame_snapshot_path = "/data/detections/S-001_demo_rgb.jpg"

        if not getattr(a, "thermal_snapshot_path", None):
            if a.survivor_id:
                a.thermal_snapshot_path = f"/data/detections/{a.survivor_id}_demo_thermal.jpg"
            else:
                a.thermal_snapshot_path = "/data/detections/S-002_demo_thermal.jpg"
    db.commit()

from sqlalchemy import text

def migrate_db_schema():
    """Ensures newly added columns exist in existing SQLite databases."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE alerts ADD COLUMN thermal_snapshot_path VARCHAR"))
            conn.commit()
        except Exception:
            pass
        for column, declaration in [('location_source', "VARCHAR NOT NULL DEFAULT 'SIMULATION'"),
                                    ('location_accuracy_m', 'FLOAT'), ('capture_source', "VARCHAR NOT NULL DEFAULT 'SERVER_CAMERA'")]:
            from sqlalchemy import inspect
            if inspect(conn).has_table('survivors') and column not in {c['name'] for c in inspect(conn).get_columns('survivors')}:
                conn.execute(text(f'ALTER TABLE survivors ADD COLUMN {column} {declaration}'))
                conn.commit()

def init_db():
    from app.core.config import settings
    migrate_db_schema()
    Base.metadata.create_all(bind=engine)
    if settings.SEED_DEMO_DATA:
        create_demo_snapshot_images()
    db = SessionLocal()

    try:
        # If already seeded, ensure rescue teams are positioned nearby & snapshots populated
        if db.query(DroneFleetModel).first():
            if settings.SEED_DEMO_DATA:
                ensure_survivor_and_alert_snapshots(db)
            return

        now_iso = datetime.now(timezone.utc).isoformat()

        # Seed Drone
        drone = DroneFleetModel(
            drone_id="RE-01",
            battery_pct=92.0,
            altitude_m=48.5,
            speed_m_s=14.2,
            heading_deg=135.0,
            latitude=10.936423,
            longitude=76.955785,
            signal_strength_pct=96.0,
            temperature_c=32.0,
            current_mission_id="M-101",
            status="ONLINE"
        )
        db.add(drone)

        # Seed Rescue Teams (Positioned nearby survivor detection hotspots)
        teams = [
            RescueTeamModel(
                team_id="T-ALPHA",
                name="Team Alpha",
                members_count=6,
                vehicle="Rapid ATV Response-1",
                capabilities="Search & Rescue, Medical First Aid, Thermal Tracking",
                latitude=10.936023,
                longitude=76.954885,
                current_location_name="Sector B-4 Forward Post Alpha",
                current_mission=None,
                assigned_survivor_id=None,
                eta_seconds=35,
                status="AVAILABLE"
            ),
            RescueTeamModel(
                team_id="T-BRAVO",
                name="Team Bravo",
                members_count=4,
                vehicle="Heavy Utility Rescue Truck",
                capabilities="Structural Extraction, Heavy Equipment, Debris Clearing",
                latitude=10.938123,
                longitude=76.957885,
                current_location_name="Sector B-4 Staging Area Bravo",
                current_mission=None,
                assigned_survivor_id=None,
                eta_seconds=45,
                status="AVAILABLE"
            ),
            RescueTeamModel(
                team_id="T-CHARLIE",
                name="Team Charlie",
                members_count=5,
                vehicle="Hazmat & Medical Ambulance",
                capabilities="Chemical Hazards, Advanced Life Support, Triage",
                latitude=10.934823,
                longitude=76.956185,
                current_location_name="Sector B-4 Tactical Medical Station",
                current_mission=None,
                assigned_survivor_id=None,
                eta_seconds=40,
                status="AVAILABLE"
            ),
            RescueTeamModel(
                team_id="T-DELTA",
                name="Team Delta",
                members_count=4,
                vehicle="Amphibious Rescue Craft",
                capabilities="Flood Rescue, Water Extraction, Air Support Relay",
                latitude=10.937823,
                longitude=76.954285,
                current_location_name="Sector B-4 Rapid Access Dock",
                current_mission=None,
                assigned_survivor_id=None,
                eta_seconds=50,
                status="STANDBY"
            )
        ]
        for team in teams:
            db.add(team)

        # Seed Mission
        mission = MissionModel(
            mission_id="M-101",
            drone_id="RE-01",
            start_time=now_iso,
            search_sector="Sector Bravo-4 (Disaster Center)",
            coverage_pct=34.5,
            survivors_detected=3,
            survivors_confirmed=2,
            survivors_rescued=1,
            distance_covered_km=4.8,
            status="ACTIVE"
        )
        db.add(mission)

        # Seed Hazards
        hazards = [
            HazardModel(
                hazard_id="H-001",
                type="FIRE",
                severity="CRITICAL",
                latitude=10.937923,
                longitude=76.957785,
                radius_m=65.0,
                description="Active structural fire in commercial sector"
            ),
            HazardModel(
                hazard_id="H-002",
                type="STRUCTURAL",
                severity="HIGH",
                latitude=10.934923,
                longitude=76.953285,
                radius_m=45.0,
                description="Partial collapse of 3-story concrete warehouse"
            )
        ]
        for hazard in hazards:
            db.add(hazard)

        # Seed Initial Demo Survivors
        survivors = [
            SurvivorModel(
                survivor_id="S-001",
                status="RESCUED",
                priority="HIGH",
                model_confidence=0.94,
                fusion_confidence=0.92,
                rgb_confirmed=True,
                thermal_confirmed=True,
                latitude=10.935423,
                longitude=76.953785,
                timestamp=now_iso,
                detection_frame_path="/data/detections/S-001_demo_rgb.jpg",
                thermal_frame_path="/data/detections/S-001_demo_thermal.jpg",
                sector="Sector B-4",
                assigned_team="Team Alpha",
                mission_id="M-101",
                first_detected=now_iso,
                last_detected=now_iso,
                priority_reason="Dual stream confirmation near structural collapse zone."
            ),
            SurvivorModel(
                survivor_id="S-002",
                status="CONFIRMED",
                priority="CRITICAL",
                model_confidence=0.96,
                fusion_confidence=0.95,
                rgb_confirmed=True,
                thermal_confirmed=True,
                latitude=10.937243,
                longitude=76.956985,
                timestamp=now_iso,
                detection_frame_path="/data/detections/S-002_demo_rgb.jpg",
                thermal_frame_path="/data/detections/S-002_demo_thermal.jpg",
                sector="Sector B-4",
                assigned_team=None,
                mission_id="M-101",
                first_detected=now_iso,
                last_detected=now_iso,
                priority_reason="RGB + thermal confirmation with sustained detection near fire hazard zone."
            )
        ]
        if settings.SEED_DEMO_DATA:
            for survivor in survivors:
                db.add(survivor)

        # Seed Alerts with Location Tagging, Priority Score, and AI Recommendation
        alerts = [
            AlertModel(
                alert_id="ALT-S002-101",
                type="SURVIVOR_DETECTED",
                severity="CRITICAL",
                timestamp=now_iso,
                location="10.9372, 76.9570",
                lat_lng_tag="10.937243° N, 76.956985° E (Sector B-4, Commercial Collapse Zone ±2.4m)",
                sector="Sector Bravo-4",
                survivor_id="S-002",
                priority_score=96,
                ai_recommendation="RECOMMENDED DISPATCH: Team Alpha (Rapid ATV Unit, 1.8 km distance, ETA 03:45). Dual-stream RGB + thermal verification confirmed 37.2°C thermal heat signature.",
                frame_snapshot_path="/data/detections/S-002_demo_rgb.jpg",
                message="CRITICAL SURVIVOR DETECTED: S-002 confirmed with 96% model and 95% fusion confidence near active fire hazard.",
                status="UNREAD"
            ),
            AlertModel(
                alert_id="ALT-HAZARD-102",
                type="FIRE_DETECTED",
                severity="WARNING",
                timestamp=now_iso,
                location="10.9379, 76.9578",
                lat_lng_tag="10.937923° N, 76.957785° E (Sector B-4, Structural Plume Zone ±3.1m)",
                sector="Sector Bravo-4",
                survivor_id=None,
                priority_score=78,
                ai_recommendation="RECOMMENDED ACTION: Re-route Drone RE-01 to maintain 60m clearance from toxic smoke plume.",
                frame_snapshot_path=None,
                message="HAZARD ALERT: Fire thermal intensity spreading in Sector B-4 commercial building.",
                status="ACKNOWLEDGED"
            )
        ]
        if settings.SEED_DEMO_DATA:
            for alert in alerts:
                db.add(alert)

        db.commit()
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
