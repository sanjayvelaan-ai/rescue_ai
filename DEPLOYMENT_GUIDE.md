# Rescue AI Drone - GitHub, Render & Vercel Deployment Guide

This guide details how to safely push this project to **GitHub** without file size alerts and deploy it to **Render** (Backend API + PyTorch YOLO Engine) and **Vercel** (Interactive React Frontend).

---

## 1. GitHub Safe Upload (Pre-Flight File Size Check)

GitHub enforces two strict file size rules:
* **> 50 MB**: Triggers a warning alert during `git push`.
* **> 100 MB**: Hard blocks the push and rejects the commit completely.

### Automated File Size Check
Run the pre-flight validator before pushing:
```powershell
python scripts\check_github_filesize.py
```
*(Or use `.\venv\Scripts\python.exe scripts\check_github_filesize.py`)*

### What is protected in `.gitignore`:
- `**/venv/` & `**/.venv/`: Virtual environments containing large compiled libraries (`torch_cpu.dll` is 195MB+).
- `**/node_modules/`: Frontend package dependencies.
- `backend/data/` & `data/`: Dynamic SQLite databases, runtime logs, and detection images.
- `**/*.log` & `**/*.jsonl`: Stream logs like `detection_events.jsonl` (20MB+).
- `**/*.zip`: Deployment archive files.
- `backend/yolov8s.pt`: Redundant model duplicates (active model is safely stored in `backend/models/best.pt` at 21.5MB, well below the 50MB alert threshold).

### Initializing & Pushing to GitHub
```powershell
# 1. Initialize git (if not already done)
git init

# 2. Verify git status respects .gitignore
git status

# 3. Add and commit
git add .
git commit -m "feat: production ready deployment for Render and Vercel"

# 4. Set branch and remote
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git

# 5. Push to GitHub
git push -u origin main
```

---

## 2. Deploy Backend to Render

The backend is packaged using a multi-stage Docker container (`Dockerfile`) with CPU-optimized PyTorch and OpenCV.

### Step-by-Step Render Deployment:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect `render.yaml`.
5. When prompted for environment variables:
   - **`CORS_ORIGINS`**: Enter your future or existing Vercel domain (e.g., `https://rescue-ai-drone.vercel.app` or temporary `*` during initial testing).
6. Click **Apply**.
7. Once deployed, test the health check in your browser:
   ```
   https://<your-render-service>.onrender.com/readyz
   ```
   Expected response:
   ```json
   {
     "ready": true,
     "checks": {
       "model": true,
       "database": true,
       "snapshot_storage": true
     }
   }
   ```
8. Copy your Render service URL (e.g. `https://rescue-ai-drone-api.onrender.com`).

---

## 3. Deploy Frontend to Vercel

The frontend is a Vite + React + Tailwind CSS application located in the `frontend/` directory.

### Step-by-Step Vercel Deployment:
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. In the configuration screen:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Select `frontend` (or leave default root, as root `vercel.json` and `package.json` are pre-configured).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   - Name: `VITE_BACKEND_ORIGIN`
   - Value: `https://<your-render-service>.onrender.com` *(no trailing slash)*
6. Click **Deploy**.

---

## 4. Final Verification Checklist

- [ ] Open your deployed Vercel frontend URL.
- [ ] Confirm the top banner shows the backend status as **ONLINE**.
- [ ] Verify Live Mission page connects to `/ws/live` WebSockets on Render.
- [ ] In Render settings, ensure `CORS_ORIGINS` includes the exact Vercel URL.
