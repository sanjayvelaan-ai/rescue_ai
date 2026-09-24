# Rescue AI

Local camera person detection with YOLO, saved image alerts, and a React operations dashboard. Browser location can geotag camera captures. Without it, coordinates are simulated. False-color thermal previews, radar demonstrations, drone telemetry and team movement remain simulations. The camera model identifies people; an operator must verify whether a detected person needs rescue.

## Active project

Use the root `frontend/` and `backend/` directories. The nested `antigravity_drone/` directory is an older copy.

- Frontend: React, TypeScript, Tailwind CSS 4 and shadcn-compatible `src/components/ui`.
- Shared styles: `frontend/src/index.css`. Theme and component setup: [frontend/THEME.md](frontend/THEME.md).
- Backend: FastAPI, OpenCV, Ultralytics/PyTorch, SQLite.
- Model: existing `backend/models/best.pt`, with a person/survivor class. Missing or invalid models report an error instead of downloading or silently substituting weights.
- Storage: `backend/data/rescueeye.db`, `backend/data/detections/`, and `backend/data/runtime-settings.json`. Paths do not depend on the shell directory.

## Run on Windows

From the project root, install dependencies if needed:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
cd frontend
npm install
```

Start the backend in one terminal:

```powershell
cd backend
..\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. API, WebSocket and image requests use the Vite proxy. Run one backend worker so only one process owns the camera. Camera access must be allowed for desktop applications in Windows; close other apps using the same camera if it cannot connect.

## Use

- The header Light/Dark button changes the whole interface and remembers the choice in this browser.
- The supplied Rescue AI logo is in `frontend/public/rescue-ai-logo.png`; its original transparent background is preserved.
- Use **Start device camera** in Live Mission or the header to connect the viewing laptop, phone, or tablet. Choose a camera after permission is granted. Server-attached camera controls remain under Settings and the optional section in AI Detection; deployed instances default that camera off.
- Keep a person visible for three distinct inference frames. Stable tracks create a possible-survivor record and one alert per track, with a real RGB snapshot. IDs remain unique across restarts. A person leaving and returning may create a new track; this is not identity recognition.
- Review images in Alert Center. Command Center also provides manual capture and a link to the most recent snapshot. Manual photos without people do not create survivor alerts.
- AI Detection can pause its preview while inference continues, or hide/show bounding boxes.
- Settings applies and saves confidence, IoU, model path and camera index. Environment variables override saved settings on startup.
- No camera means no detections: the system shows an offline state and retries, without stock images or invented detections.
- Thermal is a labeled false-color RGB preview, never an independent temperature measurement or confirmation signal. Historical positions without a device fix and team dispatch are simulated. Existing historical records are retained; Clear History is an explicit destructive action in the interface.

## Checks

```powershell
cd backend
..\venv\Scripts\python.exe -m unittest discover -s tests -v
cd ../frontend
npm run build
npm run lint
```

Tests cover frame confirmation, one-alert-per-track behavior, separate people, missing frames, stable saved IDs, preservation of rescue status, snapshot write failures, camera-off failures, and raw-stream selection. Live checks cover the connected camera, local model loading, JPEG retrieval, camera off/reconnect, settings persistence and invalid configuration rejection. Lint may report legacy warnings and Vite reports a large-bundle advisory.

## Alert previews, tracking and analytics

Automatic camera alerts now save an RGB image and a matching false-color preview from the same inference frame. Startup repairs older LIVE records with missing previews when their original RGB image still exists. This does not change thermal_confirmed: previews are not thermal evidence.

Tracking uses global one-to-one assignment with box overlap, short-term motion prediction and torso color appearance. The same ID survives brief gaps up to the configured 5-second timeout. Confirmed tracks do not issue a second alert when they return within that window. Boxes and the last 24 observed centers are drawn on the exact inference frame. Camera-off, Clear History, restart, or expiry ends the tracking session; long occlusions and visually similar people can still cause identity changes. This is camera-local tracking, not biometric re-identification.

Analytics defaults to all saved records; select Live camera records to exclude simulations using Record source. Independent API failures do not discard successful detection updates. The page shows the last successful refresh time, connection errors and a manual refresh button. Counts refer to saved tracks across sessions, not unique people. Charts group first-detection timestamps by minute including the date; ETA averages include only EN_ROUTE teams. Clearing history clears these analytics. Empty averages are shown as unavailable. Snapshot coverage reports saved image paths.

Run analytics regression checks from frontend with `node --test tests/analytics.test.mjs`. Backend regression tests also cover fast motion, short occlusion, track expiry, target order changes, preview repair and frame/overlay alignment.

## Device location and map views

In Disaster Map or Live Mission, select **My location** and allow browser location access. Use localhost or HTTPS and enable Windows Location services. The map shows the browser-reported laptop position, its accuracy radius, and update time. A timeout or denial is displayed; there is no IP-based guessed location. **Stop location** stops the watch and clears the backend fix. Closing the app stops updates and the backend fix expires after 120 seconds.

While location is active, the browser updates the local backend at most once every five seconds, with a refresh attempt every 30 seconds. New confirmed detections save the capture device coordinates and accuracy. A still-visible track can upgrade a simulated position when a fix first becomes available. Saved device positions remain anchored to that capture even if the laptop moves. These are **camera capture locations, not separately measured survivor GPS coordinates**. Browser cameras attach their own fix to each frame in an isolated tracking session. Only localhost additionally synchronizes a fix for the optional server-attached camera; remote browsers never update that global fix.

Historical coordinates stay unchanged and can be shown using **Simulation / older positions**. Rescued records have a separate filter. Nearby records form zoom-aware clusters; click to select individual records even when their coordinates are identical. Full details sit beside the map. Fit detections, zoom, expanded view and map zone selection remain available.

The view selector provides OpenStreetMap streets, Esri satellite imagery, Esri topographic tiles and dark streets. Tiles require internet access and include provider attribution; viewing an area sends tile requests for that area to its provider. Satellite imagery is a basemap, not a real-time camera feed.

Regression checks: `node --test tests/*.test.mjs` in frontend and `..\venv\Scripts\python.exe -m unittest discover -s tests` in backend. Location API tests cover validation, expiry, migration of existing rows and saved capture positions; map tests cover overlap, zoom separation, invalid coordinates and the date line.

## Browser camera, capture pins and deployment

Open Live Mission and select **Start device camera**, then **Find device location**. Allow both permissions for this site. The camera selector lists accessible cameras after consent; stop capture before selecting a different camera. The app sends bounded JPEG frames to the same application server for YOLO inference, one request at a time, and draws tracks on the returned exact frame. Stopping closes media tracks and the source session. Network/inference failures clear live candidate boxes and preserve the timestamp on the last successful preview.

Camera and geolocation require HTTPS or localhost. A phone visiting an HTTP LAN IP cannot access these APIs; use the deployed HTTPS address. With denied permissions, check the site's camera/location settings and Windows **Settings → Privacy & security → Camera / Location**. Embedded browsers may not expose these capabilities: open the same URL in a regular browser. This cannot be repaired by inventing coordinates or changing camera indices on a cloud server.

**Set capture pin** allows an operator to confirm a known camera position on the map. This pin expires after 10 minutes, is stored as USER_PIN with no claimed GPS accuracy, and never moves previous saved capture positions. Device fixes expire after two minutes. Detections without a fresh fix are stored as UNLOCATED, excluded from map plotting and blocked from routing/dispatch; their snapshots remain reviewable. A confirmed track still in view can acquire a fix when location becomes available. Neither a laptop fix nor an operator pin measures the survivor's distance from the camera.

**Stage simulated teams here** places available simulated teams around the fresh capture position. It preserves assigned/en-route teams and is not a real team-position update. Select any queue record in Live Mission to view its RGB snapshot or labeled false-color preview. Zone review uses current confirmed browser-camera tracks when that camera is active.

Analytics supports source, time, confidence and status filters, cumulative/per-minute graphs, a draggable chart range and filtered CSV export. Counts describe saved tracks, not unique identities. Missions adds search, status filtering, record-derived rescue progress, snapshot review and CSV export. Drone Fleet shows simulator battery/signal history, low-reserve warnings, capture readiness and simulated commands; no physical flight controller is connected.

Docker/Render configuration uses the bundled YOLO model, persistent data storage, and CAMERA_ENABLED=false. Serve the frontend and API on the same HTTPS origin. The response permissions policy permits this origin's camera and geolocation. Keep one backend worker: source sessions, tracking and live broadcasts are process-local. The current CPU service bounds simultaneous sessions to 16, expires idle sessions after 120 seconds, and processes one browser inference at a time; excess work receives a retryable 429 instead of growing a frame queue. Devices with high latency will have lower tracking continuity.

This is a shared-team application, not a multi-tenant service. Before public exposure, add authentication/authorization and a gateway with request/rate limits. Horizontal scaling requires shared session ownership/event transport and a suitable shared database; adding workers to this configuration alone is unsupported. The deployment configuration was updated locally, not deployed or load-tested. Device permissions and camera availability still need verification on each target browser.

Team routes use a per-request grid around the actual team and target, including date-line handling. Only AVAILABLE/STANDBY teams are ranked. These are simulated terrain-grid paths with hazard penalties, not verified road navigation or real-world safe routes.

## Synchronized live views and automatic team staging

Live Mission, AI Detection and Command Center show **RGB detection** beside **Thermal view**. Both carry identical tracks from the same source frame; thermal colors are derived from RGB intensity and are not temperature measurements. No second independent detection vote or thermal confirmation is created.

**Fast** mode uses a 640-pixel capture and 416-pixel YOLO inference. **Detail** uses the same 640-pixel capture with 640-pixel inference for small/distant subjects. Keeping capture dimensions stable preserves track coordinates when switching modes. The next fresh frame is submitted as soon as the previous response arrives; the former 350 ms success delay is removed. Only one frame is in flight, failures back off, and performance metrics are retained internally. The capture display keeps the candidate count and last-result time. Captured video may run faster than inference; this is latest-frame processing, not a guarantee that every 30 fps camera frame is analyzed. A local blank-frame benchmark returned both JPEG views in about 62–63 ms server time / 72–84 ms round trip in Fast mode, compared with 109–110 ms / 109–118 ms in Detail mode. These are warmed CPU measurements, not a guarantee under real scene/load/network conditions.

Selecting **My location**, **Find device location**, **Refine GPS accuracy**, or confirming a capture pin automatically stages available simulated teams around the accepted position. The map recenters and team positions refresh through the live event. Assigned teams stay on their rescue; failed or denied location requests never move teams. Ordinary location-watch updates do not repeatedly teleport teams. A new explicit location request stages them again.

Click a survivor marker to immediately open the saved snapshot and a recommended available team, vehicle, route distance, estimated time and modeled hazard-overlap notice. Overlapping records have separate display tags around their saved capture coordinates; select any tag to inspect its evidence. The recommendation route appears on the map. Refresh and dispatch recompute against current team availability. Dispatch remains a simulation, and hazard grid paths are not verified road-safe routes.


## Latest interface and hosting changes

Survivors now use individually selectable map tags, with overlapping tags visually separated around their saved capture point. One responsive detail panel contains the selected snapshot and route-based team recommendation. Live Mission puts the review queue below the map. Camera motion trails and the performance statistics line have been removed from the capture display. After 45 seconds of healthy empty browser-camera results, a dismissible notice appears for nine seconds; further notices are limited to one every three minutes.

Vercel/Render configuration and remaining cloud verification steps are in [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md). Hosting sign-in and public deployment are still pending.
