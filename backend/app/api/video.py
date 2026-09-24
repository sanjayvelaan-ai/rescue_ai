import cv2
import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.vision.frame_store import frame_store

router = APIRouter()

def generate_mjpeg_stream(stream_type: str = "rgb", boxes: bool = True):
    while True:
        raw = frame_store.get_raw_frame() if not boxes else None
        if raw is not None:
            if stream_type == 'thermal':
                from app.vision.thermal_processor import generate_thermal_simulation
                from app.vision.live_pipeline import annotate
                raw = annotate(generate_thermal_simulation(raw), [], thermal=True)
            ok, jpeg = cv2.imencode('.jpg', raw, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            jpeg_bytes = jpeg.tobytes() if ok else None
        elif stream_type.lower() == "thermal":
            jpeg_bytes = frame_store.get_latest_thermal_jpeg()
        else:
            jpeg_bytes = frame_store.get_latest_rgb_jpeg()

        if jpeg_bytes is None or len(jpeg_bytes) == 0:
            # Fallback if cache not ready yet
            if stream_type.lower() == "thermal":
                frame, _ = frame_store.get_latest_thermal()
            else:
                frame, _ = frame_store.get_latest_rgb()

            if frame is None or frame.size == 0:
                time.sleep(0.04)
                continue
            ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ret:
                time.sleep(0.04)
                continue
            jpeg_bytes = jpeg.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
        time.sleep(0.033)

@router.get("/video/rgb")
def get_rgb_video_stream(boxes: bool = True):
    return StreamingResponse(
        generate_mjpeg_stream(stream_type="rgb", boxes=boxes),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/video/thermal")
def get_thermal_video_stream(boxes: bool = True):
    return StreamingResponse(
        generate_mjpeg_stream(stream_type="thermal", boxes=boxes),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
