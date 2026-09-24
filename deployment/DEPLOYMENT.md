# Rescue AI Drone deployment

Status: locally prepared and tested; public deployment is pending hosting sign-in and service creation. No domain has been reserved.

## Services

* Vercel: Vite frontend, project candidate `rescue-ai-drone`, root directory `frontend`.
* Render: Docker backend candidate `rescue-ai-drone-api`, `render.yaml`, Standard / 1 CPU / 2 GB RAM, one instance.
* Persistent disk: 1 GB mounted at `/app/backend/data`. Stores the SQLite database, snapshots and runtime settings.
* YOLO: bundled `backend/models/best.pt`; CPU PyTorch wheels are installed during the image build.

The proposed Render compute plus disk baseline is about $25.25/month at the published rates checked on 2026-09-21, excluding extra usage, workspace charges and taxes. Confirm the current checkout price before creating paid resources. `rescue_ai_drone` cannot be a web hostname; use a hyphenated name. The exact `rescue-ai-drone.vercel.app` alias is subject to availability.

## Deployment sequence

1. Complete Vercel CLI login and Render sign-in. Connect a private source repository containing the deployment bundle. The local workspace is not currently a Git repository.
2. Import `render.yaml` as a Render Blueprint. Confirm the plan and disk. Set `CORS_ORIGINS` to the actual Vercel production origin, for example `https://rescue-ai-drone.vercel.app` only if that alias is assigned to your project. Multiple explicit origins can be comma-separated. Do not use a wildcard.
3. Wait for the Docker build and startup. Check the actual Render URL's `/readyz`: HTTP 200 with model, database and snapshot storage all true. `/health` alone is only a liveness report.
4. In Vercel, import the frontend with root directory `frontend`, Vite preset, `npm run build`, and output `dist`. Set `VITE_BACKEND_ORIGIN` to the actual Render HTTPS origin without `/api` or a trailing path. This is a public build-time setting, not a secret. Redeploy after changing it.
5. Deploy the frontend as `rescue-ai-drone` if available. If the assigned domain differs, update Render's `CORS_ORIGINS` to match before testing camera uploads.
6. Verify on the public frontend: all navigation routes, backend status, API reads, WSS connection, camera session creation and processed RGB/thermal frames, saved snapshot loading, current-location permissions, individual tag selection, dispatch and analytics. Check a second browser/device and confirm its camera session is independent.
7. Stop and restart the Render service; confirm new cloud records and snapshots survive. Do not copy the laptop database or personal camera snapshots into a public image.

The frontend calls Render directly for APIs, camera frames, images and WebSockets. It does not send WebSockets through a Vercel Function. When `VITE_BACKEND_ORIGIN` is empty, local Vite proxying and the unified Docker frontend continue to work.

## Runtime constraints

Keep one backend worker and one instance: tracking sessions, telemetry and dispatch workers are process-local. Browser camera sessions are independent, bounded to 16, and inference uses backpressure with one in-flight processing slot. Cloud CPU/network speed must be measured; multi-device support does not guarantee simultaneous full-rate video inference. Scaling to multiple workers requires shared session ownership, event transport, storage and database changes.

Capture and location require HTTPS and browser permission on each device. Thermal view derives colors from RGB, not a physical temperature sensor. Map tag spacing is visual; saved capture GPS determines dispatch. Drone, radar, rescue-team movement and payload controls remain simulations unless real hardware is integrated. The 45-second no-detection notice uses successfully processed browser-camera frames only and has a three-minute repeat cooldown.

This is a shared mission workspace, with no per-user authorization. Do not load private incident data into an unrestricted public instance. The deployment bundle excludes local databases, camera snapshots, environment secrets and sample survivor photographs.

## Local verification

```powershell
cd frontend
npm run build
node --test tests/*.test.mjs
cd ../backend
../venv/Scripts/python.exe -m unittest discover -s tests -q
```

For isolated visual testing, run `python tests/preview_app.py` after building the frontend and open `http://127.0.0.1:8011/live-mission`. It uses a temporary database with TEST records, not the operational database. It is excluded from the Docker image.

Docker validation was not completed locally because the Docker daemon was not running. Hosting authentication, remote image build, public DNS, public-browser permissions, cloud persistence and deployed load behavior still require verification.
