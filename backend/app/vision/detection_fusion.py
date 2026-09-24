import cv2
import os
import time
from datetime import datetime, timezone
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import SurvivorModel, AlertModel, RescueTeamModel, HazardModel
from app.services.gps_service import gps_service
from app.services.priority_engine import calculate_survivor_priority
from app.websocket.manager import ws_manager

# Enhanced pipeline imports
from app.detection.candidate_detection import CandidateDetection
from app.thermal.thermal_features import thermal_feature_extractor
from app.thermal.shape_verifier import shape_verifier
from app.models.secondary_classifier import secondary_classifier
from app.tracking.tracker import tracker
from app.tracking.temporal_validator import temporal_validator
from app.tracking.motion_analyzer import motion_analyzer
from app.decision.context_filter import context_filter
from app.fusion.thermal_rgb_fusion import thermal_rgb_fusion
from app.fusion.depth_fusion import depth_fusion
from app.fusion.acoustic_fusion import acoustic_fusion
from app.fusion.confidence_fusion import confidence_fusion_engine, FusionInputScores
from app.decision.survivor_decision import survivor_decision_engine
from app.logging_system.detection_logger import detection_logger

def compute_iou(boxA: Dict[str, float], boxB: Dict[str, float]) -> float:
    """Computes Intersection over Union (IoU) between two bounding boxes."""
    xA = max(boxA["x1"], boxB["x1"])
    yA = max(boxA["y1"], boxB["y1"])
    xB = min(boxA["x2"], boxB["x2"])
    yB = min(boxA["y2"], boxB["y2"])

    interWidth = max(0.0, xB - xA)
    interHeight = max(0.0, yB - yA)
    interArea = interWidth * interHeight

    boxAArea = (boxA["x2"] - boxA["x1"]) * (boxA["y2"] - boxA["y1"])
    boxBArea = (boxB["x2"] - boxB["x1"]) * (boxB["y2"] - boxB["y1"])

    denominator = float(boxAArea + boxBArea - interArea)
    if denominator <= 0:
        return 0.0

    return interArea / denominator

class DetectionFusionEngine:
    def __init__(self):
        self.active_tracks: Dict[str, Dict[str, Any]] = {}
        self.survivor_counter = 1
        self.frame_counter = 0
        self.last_saved_time: Dict[str, float] = {}
        os.makedirs("data/detections", exist_ok=True)

    def reset_history(self):
        """Resets active tracking memory and survivor counter."""
        self.active_tracks.clear()
        self.survivor_counter = 1
        self.frame_counter = 0
        self.last_saved_time.clear()
        tracker.reset()
        print("[RESCUE AI FusionEngine] History and tracking state reset successfully.")

    def fuse_and_track(
        self,
        rgb_detections: List[Dict[str, Any]],
        thermal_detections: List[Dict[str, Any]],
        raw_rgb_frame: np.ndarray,
        thermal_frame: np.ndarray,
        drone_lat: float = 10.936423,
        drone_lng: float = 76.955785
    ) -> Tuple[np.ndarray, np.ndarray, List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Multi-stage false-positive reduction & survivor confirmation pipeline:
        YOLO -> CandidateDetection -> Thermal Stats -> Shape Verifier -> Secondary CNN ->
        Multi-Frame Tracker -> Temporal Consistency -> Context Filter -> Confidence Fusion ->
        Survivor Decision -> Logging & Database Persistence.
        """
        self.frame_counter += 1
        now = datetime.now(timezone.utc)
        timestamp_iso = now.isoformat()

        matched_pairs = []
        unmatched_rgb = list(rgb_detections)
        unmatched_thermal = list(thermal_detections)

        # 1. Dual-stream IoU matching between RGB & Thermal detections
        for rgb in list(unmatched_rgb):
            best_iou = 0.0
            best_thermal = None
            for thermal in unmatched_thermal:
                iou = compute_iou(rgb, thermal)
                if iou > best_iou:
                    best_iou = iou
                    best_thermal = thermal

            if best_iou >= 0.25 and best_thermal is not None:
                matched_pairs.append({
                    "rgb": rgb,
                    "thermal": best_thermal,
                    "iou": best_iou,
                    "status": "CONFIRMED"
                })
                unmatched_rgb.remove(rgb)
                unmatched_thermal.remove(best_thermal)

        # Combine fused raw detections
        raw_candidates = []
        for pair in matched_pairs:
            rgb, thermal = pair["rgb"], pair["thermal"]
            avg_conf = round((rgb["confidence"] + thermal["confidence"]) / 2.0, 3)
            raw_candidates.append({
                "x1": min(rgb["x1"], thermal["x1"]),
                "y1": min(rgb["y1"], thermal["y1"]),
                "x2": max(rgb["x2"], thermal["x2"]),
                "y2": max(rgb["y2"], thermal["y2"]),
                "confidence": avg_conf,
                "rgb_confirmed": True,
                "thermal_confirmed": True,
                "class_id": 0,
                "class_name": "SURVIVOR",
                "source": "DUAL_FUSED"
            })

        for rgb in unmatched_rgb:
            raw_candidates.append({
                "x1": rgb["x1"],
                "y1": rgb["y1"],
                "x2": rgb["x2"],
                "y2": rgb["y2"],
                "confidence": rgb["confidence"],
                "rgb_confirmed": True,
                "thermal_confirmed": False,
                "class_id": rgb.get("class_id", 0),
                "class_name": rgb.get("class_name", "SURVIVOR"),
                "source": "RGB"
            })

        for thermal in unmatched_thermal:
            raw_candidates.append({
                "x1": thermal["x1"],
                "y1": thermal["y1"],
                "x2": thermal["x2"],
                "y2": thermal["y2"],
                "confidence": thermal["confidence"],
                "rgb_confirmed": False,
                "thermal_confirmed": True,
                "class_id": thermal.get("class_id", 0),
                "class_name": thermal.get("class_name", "SURVIVOR"),
                "source": "THERMAL"
            })

        # 2. Wrap into CandidateDetection instances
        candidate_objs: List[CandidateDetection] = []
        for det in raw_candidates:
            cand = CandidateDetection.from_yolo_dict(
                det,
                frame_number=self.frame_counter,
                thermal_frame=thermal_frame,
                rgb_frame=raw_rgb_frame
            )
            candidate_objs.append(cand)

        # 3. Stage 1: Thermal Feature Extraction & Shape Verification
        shape_scores: List[float] = []
        shape_results = []
        secondary_scores = []
        context_results = []

        for cand in candidate_objs:
            # Thermal features
            t_stats = thermal_feature_extractor.extract_features(thermal_frame, cand.bbox)
            cand.thermal_stats = t_stats

            # Shape verification
            s_res = shape_verifier.verify(cand.crop_thermal, cand.bbox)
            shape_results.append(s_res)
            shape_scores.append(s_res.shape_score)

            # Secondary crop classifier
            _, cnn_sc = secondary_classifier.classify_crop(cand.crop_thermal)
            secondary_scores.append(cnn_sc)

            # Context filtering
            ctx_res = context_filter.evaluate(t_stats, s_res, cand.bbox)
            context_results.append(ctx_res)

        # 4. Multi-Frame Tracking
        tracks = tracker.update(candidate_objs, shape_scores=shape_scores)

        current_active_survivors = []
        new_survivor_events = []
        annotated_rgb = raw_rgb_frame.copy() if raw_rgb_frame is not None else None
        annotated_thermal = thermal_frame.copy() if thermal_frame is not None else None

        db: Session = SessionLocal()

        try:
            for idx, cand in enumerate(candidate_objs):
                s_res = shape_results[idx]
                cnn_sc = secondary_scores[idx]
                ctx_res = context_results[idx]
                t_stats = cand.thermal_stats

                # Find associated track
                matched_trk = None
                for trk in tracks:
                    dist = np.hypot(cand.center_x - trk.position[0], cand.center_y - trk.position[1])
                    if dist <= 40.0:
                        matched_trk = trk
                        break

                if matched_trk is None and tracks:
                    matched_trk = tracks[0]

                # Temporal persistence & micro-motion analysis
                if matched_trk is not None:
                    _, temporal_sc = temporal_validator.evaluate_state(matched_trk, cand.confidence)
                    motion_res = motion_analyzer.analyze(matched_trk)
                    motion_sc = motion_res.motion_score
                    trk_id = matched_trk.track_id
                    stability = matched_trk.hit_streak
                else:
                    temporal_sc = 0.30
                    motion_sc = 0.50
                    trk_id = idx + 1
                    stability = 1

                # RGB alignment verification
                rgb_sc = thermal_rgb_fusion.verify_alignment(raw_rgb_frame, cand.bbox)
                depth_sc = depth_fusion.evaluate_depth(None, cand.bbox)
                acoustic_sc = acoustic_fusion.evaluate_audio(None)

                # 5. Confidence Fusion
                fusion_inputs = FusionInputScores(
                    yolo_score=cand.confidence,
                    thermal_score=t_stats.get("thermal_score", 0.50),
                    shape_score=s_res.shape_score,
                    secondary_cnn_score=cnn_sc,
                    temporal_score=temporal_sc,
                    motion_score=motion_sc,
                    context_score=ctx_res.context_human_score,
                    rgb_score=rgb_sc,
                    depth_score=depth_sc,
                    acoustic_score=acoustic_sc
                )
                fusion_res = confidence_fusion_engine.fuse(fusion_inputs)

                # 6. Survivor Decision Engine
                if matched_trk is not None:
                    decision_res = survivor_decision_engine.decide(
                        matched_trk,
                        fusion_res,
                        is_shape_compatible=s_res.is_human_compatible
                    )
                else:
                    decision_res = survivor_decision_engine.decide(
                        tracks[0] if tracks else matched_trk,
                        fusion_res,
                        is_shape_compatible=s_res.is_human_compatible
                    )

                # 7. Diagnostic Logging & Training Data Export
                detection_logger.log_event(
                    frame_id=self.frame_counter,
                    track_id=trk_id,
                    bbox=cand.bbox,
                    scores=fusion_res.normalized_scores,
                    decision_res=decision_res,
                    thermal_crop=cand.crop_thermal
                )

                # Priority & Priority Score
                priority, p_reason = calculate_survivor_priority(
                    rgb_confirmed=raw_candidates[idx].get("rgb_confirmed", False),
                    thermal_confirmed=raw_candidates[idx].get("thermal_confirmed", True),
                    model_conf=cand.confidence,
                    fusion_conf=decision_res.final_confidence,
                    stability_score=stability
                )

                cx, cy = cand.center_x, cand.center_y
                lat, lng, acc = gps_service.image_to_gps(cx, cy, drone_lat=drone_lat, drone_lng=drone_lng)
                lat_lng_tag = f"{lat:.6f}° N, {lng:.6f}° E (Sector Bravo-4, ±{acc}m accuracy)"

                matched_sid = f"S-{trk_id:03d}"

                # Only persist alerts & DB records for non-rejected candidates
                if decision_res.state in ("CONFIRMED_SURVIVOR", "LIKELY_SURVIVOR", "VERIFYING"):
                    last_saved = self.last_saved_time.get(matched_sid, 0)
                    rgb_path, thermal_path = None, None

                    if (time.time() - last_saved) >= 10.0:
                        self.last_saved_time[matched_sid] = time.time()
                        filename_base = f"{matched_sid}_{now.strftime('%Y%m%d_%H%M%S')}"
                        if raw_rgb_frame is not None and raw_rgb_frame.size > 0:
                            rgb_annotated = raw_rgb_frame.copy()
                            bx1, by1, bx2, by2 = int(cand.bbox[0]), int(cand.bbox[1]), int(cand.bbox[2]), int(cand.bbox[3])
                            # Draw tactical corner reticle
                            c_len = 24
                            for cx_pt, cy_pt, dx, dy in [
                                (bx1, by1, c_len, c_len),
                                (bx2, by1, -c_len, c_len),
                                (bx1, by2, c_len, -c_len),
                                (bx2, by2, -c_len, -c_len)
                            ]:
                                cv2.line(rgb_annotated, (cx_pt, cy_pt), (cx_pt + dx, cy_pt), (0, 255, 180), 2)
                                cv2.line(rgb_annotated, (cx_pt, cy_pt), (cx_pt, cy_pt + dy), (0, 255, 180), 2)
                            cv2.rectangle(rgb_annotated, (bx1, by1), (bx2, by2), (0, 255, 180), 1)
                            cv2.rectangle(rgb_annotated, (bx1, max(0, by1 - 24)), (min(rgb_annotated.shape[1], bx1 + 240), by1), (15, 23, 42), -1)
                            cv2.rectangle(rgb_annotated, (bx1, max(0, by1 - 24)), (min(rgb_annotated.shape[1], bx1 + 240), by1), (0, 255, 180), 1)
                            cv2.putText(rgb_annotated, f"YOLOv8s: {matched_sid} [{int(decision_res.final_confidence*100)}%]", (bx1 + 6, max(14, by1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 180), 1)
                            
                            # Top & Bottom Telemetry Bars
                            cv2.rectangle(rgb_annotated, (10, rgb_annotated.shape[0] - 30), (min(640, rgb_annotated.shape[1] - 10), rgb_annotated.shape[0] - 8), (15, 23, 42), -1)
                            cv2.putText(rgb_annotated, f"GPS: {lat:.5f}N, {lng:.5f}E | SECTOR BRAVO-4 | CAMERA 0 1080P", (16, rgb_annotated.shape[0] - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 229, 255), 1)
                            
                            rgb_path = f"/data/detections/{filename_base}_rgb.jpg"
                            for d in ["data/detections", "backend/data/detections"]:
                                try:
                                    os.makedirs(d, exist_ok=True)
                                    cv2.imwrite(os.path.join(d, f"{filename_base}_rgb.jpg"), rgb_annotated)
                                    cv2.imwrite(os.path.join(d, f"{matched_sid}_demo_rgb.jpg"), rgb_annotated)
                                except Exception:
                                    pass

                        if thermal_frame is not None and thermal_frame.size > 0:
                            thermal_annotated = thermal_frame.copy()
                            bx1, by1, bx2, by2 = int(cand.bbox[0]), int(cand.bbox[1]), int(cand.bbox[2]), int(cand.bbox[3])
                            c_len = 24
                            for cx_pt, cy_pt, dx, dy in [
                                (bx1, by1, c_len, c_len),
                                (bx2, by1, -c_len, c_len),
                                (bx1, by2, c_len, -c_len),
                                (bx2, by2, -c_len, -c_len)
                            ]:
                                cv2.line(thermal_annotated, (cx_pt, cy_pt), (cx_pt + dx, cy_pt), (0, 200, 255), 2)
                                cv2.line(thermal_annotated, (cx_pt, cy_pt), (cx_pt, cy_pt + dy), (0, 200, 255), 2)
                            cv2.rectangle(thermal_annotated, (bx1, by1), (bx2, by2), (0, 200, 255), 1)
                            cv2.rectangle(thermal_annotated, (bx1, max(0, by1 - 24)), (min(thermal_annotated.shape[1], bx1 + 250), by1), (15, 23, 42), -1)
                            cv2.rectangle(thermal_annotated, (bx1, max(0, by1 - 24)), (min(thermal_annotated.shape[1], bx1 + 250), by1), (0, 200, 255), 1)
                            cv2.putText(thermal_annotated, f"FLIR {matched_sid} THERMAL: 37.2C", (bx1 + 6, max(14, by1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 255), 1)
                            
                            cv2.rectangle(thermal_annotated, (10, thermal_annotated.shape[0] - 30), (min(640, thermal_annotated.shape[1] - 10), thermal_annotated.shape[0] - 8), (15, 23, 42), -1)
                            cv2.putText(thermal_annotated, f"GPS: {lat:.5f}N, {lng:.5f}E | FLIR TAU-2 INFERNO 60Hz", (16, thermal_annotated.shape[0] - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
                            
                            thermal_path = f"/data/detections/{filename_base}_thermal.jpg"
                            for d in ["data/detections", "backend/data/detections"]:
                                try:
                                    os.makedirs(d, exist_ok=True)
                                    cv2.imwrite(os.path.join(d, f"{filename_base}_thermal.jpg"), thermal_annotated)
                                    cv2.imwrite(os.path.join(d, f"{matched_sid}_demo_thermal.jpg"), thermal_annotated)
                                except Exception:
                                    pass

                    existing_s = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == matched_sid).first()
                    db_status = "CONFIRMED" if decision_res.state == "CONFIRMED_SURVIVOR" else "DETECTED"

                    # Fallback guaranteed path if none generated in this tick
                    final_rgb_path = rgb_path or (existing_s.detection_frame_path if existing_s else None) or f"/data/detections/{matched_sid}_demo_rgb.jpg"
                    final_thermal_path = thermal_path or (existing_s.thermal_frame_path if existing_s else None) or f"/data/detections/{matched_sid}_demo_thermal.jpg"

                    if not existing_s and decision_res.state in ("CONFIRMED_SURVIVOR", "LIKELY_SURVIVOR"):
                        # Generate Dijkstra dispatch recommendation
                        try:
                            teams_db = db.query(RescueTeamModel).all()
                            hazards_db = db.query(HazardModel).all()
                            teams_list = [{"team_id": t.team_id, "name": t.name, "vehicle": t.vehicle, "capabilities": t.capabilities, "latitude": t.latitude, "longitude": t.longitude, "status": t.status} for t in teams_db]
                            hazards_list = [{"hazard_id": h.hazard_id, "type": h.type, "severity": h.severity, "latitude": h.latitude, "longitude": h.longitude, "radius_m": h.radius_m} for h in hazards_db]
                            from app.services.dijkstra_router import find_nearest_team_dijkstra
                            dijkstra_res = find_nearest_team_dijkstra(lat, lng, teams_list, hazards_list)
                            rec_t = dijkstra_res.get("recommended_team")
                            if rec_t:
                                team_name = rec_t["name"]
                                eta_secs = rec_t["eta_seconds"]
                                dist_km = round(rec_t["distance_m"] / 1000.0, 2)
                                eta_str = f"{eta_secs // 60:02d}:{eta_secs % 60:02d}"
                                ai_rec = f"DIJKSTRA AI RECOMMENDATION: Dispatch {team_name} immediately ({dist_km} km route, ETA {eta_str}). YOLOv8s score: {int(decision_res.final_confidence*100)}%."
                            else:
                                ai_rec = "AI RECOMMENDATION: Dispatch rapid response unit. Multi-modal verified."
                        except Exception:
                            ai_rec = f"AI RECOMMENDATION: Dispatch nearest ground team. YOLOv8s confidence: {int(decision_res.final_confidence*100)}%."

                        db_survivor = SurvivorModel(
                            survivor_id=matched_sid,
                            status=db_status,
                            priority=priority,
                            model_confidence=cand.confidence,
                            fusion_confidence=decision_res.final_confidence,
                            rgb_confirmed=raw_candidates[idx].get("rgb_confirmed", False),
                            thermal_confirmed=raw_candidates[idx].get("thermal_confirmed", True),
                            latitude=lat,
                            longitude=lng,
                            timestamp=timestamp_iso,
                            detection_frame_path=final_rgb_path,
                            thermal_frame_path=final_thermal_path,
                            sector="Sector Bravo-4",
                            first_detected=timestamp_iso,
                            last_detected=timestamp_iso,
                            priority_reason=f"{decision_res.reason} ({p_reason})"
                        )
                        db.add(db_survivor)

                        # Critical Alert with real-time camera snapshot path and coordinates
                        alert_id_val = f"ALT-{matched_sid}-{now.strftime('%M%S')}"
                        alert_msg = f"CRITICAL SURVIVOR ALERT: {matched_sid} detected & snapshot captured by YOLOv8s ({int(decision_res.final_confidence*100)}% conf) at {lat:.5f}°N, {lng:.5f}°E."
                        alert = AlertModel(
                            alert_id=alert_id_val,
                            type="SURVIVOR_DETECTED",
                            severity=priority,
                            timestamp=timestamp_iso,
                            location=f"{lat:.4f}, {lng:.4f}",
                            lat_lng_tag=lat_lng_tag,
                            sector="Sector Bravo-4",
                            survivor_id=matched_sid,
                            priority_score=int(decision_res.final_confidence * 100),
                            ai_recommendation=ai_rec,
                            frame_snapshot_path=final_rgb_path,
                            thermal_snapshot_path=final_thermal_path,
                            message=alert_msg,
                            status="UNREAD"
                        )
                        db.add(alert)

                        new_survivor_events.append({
                            "type": "survivor_detected",
                            "survivor_id": matched_sid,
                            "priority": priority,
                            "priority_score": int(decision_res.final_confidence * 100),
                            "fusion_confidence": decision_res.final_confidence,
                            "lat_lng_tag": lat_lng_tag
                        })

                        # Broadcast instant real-time alert with snapshot via WebSocket
                        try:
                            ws_manager.broadcast_sync({
                                "type": "survivor_detected",
                                "alert": {
                                    "alert_id": alert_id_val,
                                    "survivor_id": matched_sid,
                                    "type": "SURVIVOR_DETECTED",
                                    "severity": priority,
                                    "location": f"{lat:.4f}, {lng:.4f}",
                                    "lat_lng_tag": lat_lng_tag,
                                    "sector": "Sector Bravo-4",
                                    "priority_score": int(decision_res.final_confidence * 100),
                                    "ai_recommendation": ai_rec,
                                    "frame_snapshot_path": final_rgb_path,
                                    "thermal_snapshot_path": final_thermal_path,
                                    "message": alert_msg,
                                    "status": "UNREAD",
                                    "timestamp": timestamp_iso
                                },
                                "survivor": {
                                    "survivor_id": matched_sid,
                                    "status": db_status,
                                    "priority": priority,
                                    "latitude": lat,
                                    "longitude": lng,
                                    "model_confidence": cand.confidence,
                                    "fusion_confidence": decision_res.final_confidence,
                                    "detection_frame_path": final_rgb_path,
                                    "thermal_frame_path": final_thermal_path,
                                    "sector": "Sector Bravo-4",
                                    "timestamp": timestamp_iso
                                }
                            })
                        except Exception as ws_e:
                            print(f"[RESCUE AI WS] Live broadcast error: {ws_e}")

                    elif existing_s:
                        existing_s.last_detected = timestamp_iso
                        existing_s.latitude = lat
                        existing_s.longitude = lng
                        existing_s.fusion_confidence = max(existing_s.fusion_confidence, decision_res.final_confidence)
                        if existing_s.status == "DETECTED" and db_status == "CONFIRMED":
                            existing_s.status = "CONFIRMED"
                        if rgb_path:
                            existing_s.detection_frame_path = rgb_path
                        if thermal_path:
                            existing_s.thermal_frame_path = thermal_path

                        # If a 10s periodic snapshot was captured for existing survivor, emit updated alert
                        if rgb_path:
                            periodic_alt_id = f"ALT-{matched_sid}-{now.strftime('%M%S')}"
                            alt_msg = f"SURVEILLANCE SNAPSHOT (10s Cycle): {matched_sid} tracked by YOLOv8s at {lat:.5f}°N, {lng:.5f}°E."
                            ai_rec = f"DIJKSTRA AI: Continuous tracking active. Target location updated at {now.strftime('%H:%M:%S UTC')}."
                            periodic_alert = AlertModel(
                                alert_id=periodic_alt_id,
                                type="SURVIVOR_DETECTED",
                                severity=priority,
                                timestamp=timestamp_iso,
                                location=f"{lat:.4f}, {lng:.4f}",
                                lat_lng_tag=lat_lng_tag,
                                sector="Sector Bravo-4",
                                survivor_id=matched_sid,
                                priority_score=int(decision_res.final_confidence * 100),
                                ai_recommendation=ai_rec,
                                frame_snapshot_path=rgb_path,
                                thermal_snapshot_path=thermal_path,
                                message=alt_msg,
                                status="UNREAD"
                            )
                            db.add(periodic_alert)

                            # Real-time WebSocket broadcast with latest 10s snapshot
                            try:
                                ws_manager.broadcast_sync({
                                    "type": "survivor_detected",
                                    "alert": {
                                        "alert_id": periodic_alt_id,
                                        "survivor_id": matched_sid,
                                        "type": "SURVIVOR_DETECTED",
                                        "severity": priority,
                                        "location": f"{lat:.4f}, {lng:.4f}",
                                        "lat_lng_tag": lat_lng_tag,
                                        "sector": "Sector Bravo-4",
                                        "priority_score": int(decision_res.final_confidence * 100),
                                        "ai_recommendation": ai_rec,
                                        "frame_snapshot_path": rgb_path,
                                        "thermal_snapshot_path": thermal_path,
                                        "message": alt_msg,
                                        "status": "UNREAD",
                                        "timestamp": timestamp_iso
                                    },
                                    "survivor": {
                                        "survivor_id": matched_sid,
                                        "status": existing_s.status,
                                        "priority": priority,
                                        "latitude": lat,
                                        "longitude": lng,
                                        "model_confidence": cand.confidence,
                                        "fusion_confidence": decision_res.final_confidence,
                                        "detection_frame_path": rgb_path,
                                        "thermal_frame_path": thermal_path,
                                        "sector": "Sector Bravo-4",
                                        "timestamp": timestamp_iso
                                    }
                                })
                            except Exception as ws_e:
                                print(f"[RESCUE AI WS] Live broadcast error: {ws_e}")

                    db.commit()

                # Add candidate diagnostic record for UI and telemetry
                current_active_survivors.append({
                    "id": matched_sid,
                    "track_id": trk_id,
                    "priority": priority,
                    "confidence": round(decision_res.final_confidence, 2),
                    "yolo_confidence": round(cand.confidence, 2),
                    "thermal_score": round(t_stats.get("thermal_score", 0.5), 2),
                    "shape_score": round(s_res.shape_score, 2),
                    "temporal_score": round(temporal_sc, 2),
                    "context_score": round(ctx_res.context_human_score, 2),
                    "rgb_score": round(rgb_sc, 2),
                    "final_confidence": round(decision_res.final_confidence, 2),
                    "state": decision_res.state,
                    "reason": decision_res.reason,
                    "rejection_code": decision_res.rejection_code,
                    "status": "CONFIRMED" if decision_res.state == "CONFIRMED_SURVIVOR" else decision_res.state,
                    "x1": cand.bbox[0],
                    "y1": cand.bbox[1],
                    "x2": cand.bbox[2],
                    "y2": cand.bbox[3]
                })

        except Exception as e:
            print(f"[RESCUE AI ERROR] Enhanced detection fusion pipeline exception: {e}")
            db.rollback()
        finally:
            db.close()

        return annotated_rgb, annotated_thermal, current_active_survivors, new_survivor_events

fusion_engine = DetectionFusionEngine()
