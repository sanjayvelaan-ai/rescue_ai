import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings, DETECTIONS_DIR
from app.db.init_db import init_db
from app.vision.camera_service import camera_service
from app.vision.detector import detector
from app.websocket.manager import ws_manager

from app.api.browser_camera import router as browser_camera_router
from app.api.system import router as system_router
from app.api.survivors import router as survivors_router
from app.api.alerts import router as alerts_router
from app.api.rescue_teams import router as rescue_teams_router
from app.api.missions import router as missions_router
from app.api.drone import router as drone_router
from app.api.map import router as map_router
from app.api.simulation import router as simulation_router
from app.api.video import router as video_router
from app.api.radar import router as radar_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("=" * 60)
    print(f"  STARTING {settings.PROJECT_NAME} UNIFIED PRODUCTION ENGINE v{settings.VERSION}")
    print("=" * 60)
    
    # 1. Initialize DB tables & seed demo data
    init_db()
    from app.vision.preview_repair import repair_missing_previews
    await asyncio.to_thread(repair_missing_previews)
    
    # 2. Register active event loop for cross-thread WebSocket broadcasts
    ws_manager.set_loop(asyncio.get_running_loop())
    
    # 3. Start single camera capture & vision inference thread
    camera_service.start()
    
    # 4. Start background WebSocket telemetry broadcast loop
    broadcast_task = asyncio.create_task(periodic_telemetry_broadcast())

    yield

    # Shutdown logic
    print("[RESCUE AI] Shutting down vision engine & camera worker...")
    broadcast_task.cancel()
    camera_service.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

@app.middleware('http')
async def device_permissions(request, call_next):
    response = await call_next(request)
    response.headers['Permissions-Policy'] = 'camera=(self), geolocation=(self), microphone=()'
    return response

# CORS middleware for React frontend & public remote access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure detection images directory exists and mount static route
os.makedirs("data/detections", exist_ok=True)
app.mount("/data/detections", StaticFiles(directory=str(DETECTIONS_DIR)), name="detections")

# Include API Routers
app.include_router(browser_camera_router, prefix=settings.API_PREFIX, tags=["Device camera"])
app.include_router(system_router, prefix=settings.API_PREFIX, tags=["System"])
app.include_router(survivors_router, prefix=settings.API_PREFIX, tags=["Survivors"])
app.include_router(alerts_router, prefix=settings.API_PREFIX, tags=["Alerts"])
app.include_router(rescue_teams_router, prefix=settings.API_PREFIX, tags=["Rescue Teams"])
app.include_router(missions_router, prefix=settings.API_PREFIX, tags=["Missions"])
app.include_router(drone_router, prefix=settings.API_PREFIX, tags=["Drone Fleet"])
app.include_router(map_router, prefix=settings.API_PREFIX, tags=["Operational Map"])
app.include_router(simulation_router, prefix=settings.API_PREFIX, tags=["Simulation"])
app.include_router(video_router, prefix=settings.API_PREFIX, tags=["Video Feeds"])
app.include_router(radar_router, prefix=settings.API_PREFIX, tags=["UWB Radar"])

# Production Health Check Endpoint
@app.get("/health")
def health_check():
    return JSONResponse({
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "model": {
            "online": detector.model_online,
            "path": detector.model_path,
            "device": detector.device,
            "classes": len(detector.class_names)
        },
        "camera_online": camera_service.camera_online,
        "camera_error": camera_service.last_error,
    })

@app.get('/readyz')
def readiness_check():
    from sqlalchemy import text
    from app.db.database import engine
    database_ready=False
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        database_ready=True
    except Exception:
        pass
    checks={'model':detector.model_online,'database':database_ready,'snapshot_storage':os.access(DETECTIONS_DIR,os.W_OK)}
    ready=all(checks.values())
    return JSONResponse({'ready':ready,'checks':checks},status_code=200 if ready else 503)

# Real-time WebSocket Endpoint
@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive & listen for client ping messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

async def periodic_telemetry_broadcast():
    """Periodically broadcasts telemetry & map updates to all WebSocket clients."""
    from app.vision.frame_store import frame_store
    from app.services.gps_service import gps_service
    step = 0

    while True:
        try:
            await asyncio.sleep(1.0)
            step += 1
            status = frame_store.get_status()
            telemetry = gps_service.get_drone_telemetry_gps(step)
            from app.radar.radar_service import radar_service
            radar_status = radar_service.get_status().model_dump()

            await ws_manager.broadcast({
                "type": "telemetry_update",
                "timestamp": asyncio.get_event_loop().time(),
                "fps": status["fps"],
                "camera_online": status["camera_online"],
                "model_online": status["model_online"],
                "radar": radar_status,
                "drone": {
                    "id": "RE-01",
                    "latitude": telemetry["latitude"],
                    "longitude": telemetry["longitude"],
                    "heading": telemetry["heading"],
                    "battery": max(15.0, 95.0 - (step * 0.05)),
                    "altitude": 48.5,
                    "speed": 12.4,
                    "signal": 98.0
                }
            })
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[RESCUE AI WS ERROR] Telemetry broadcast exception: {e}")

# Frontend Production Static Files & SPA Route Fallback
FRONTEND_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        # Exclude API endpoints and WebSocket routes from SPA fallback
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("data/"):
            return JSONResponse({"error": "Not Found"}, status_code=404)
        
        target_file = os.path.abspath(os.path.join(FRONTEND_DIST_DIR, full_path))
        if os.path.commonpath([FRONTEND_DIST_DIR, target_file]) != FRONTEND_DIST_DIR:
            return JSONResponse({"error": "Not Found"}, status_code=404)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return FileResponse(target_file)
        
        index_file = os.path.join(FRONTEND_DIST_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        
        return JSONResponse({"error": "Frontend build not found"}, status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
