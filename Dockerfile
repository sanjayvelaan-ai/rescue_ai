# Stage 1: Build React Frontend
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python FastAPI + PyTorch YOLO Engine
FROM python:3.12-slim AS production

# Install OpenCV and System Dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python Requirements
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Copy Backend Source Code & Models
COPY backend /app/backend

# Copy Built Frontend Distribution
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Set Working Directory & Environment Variables
WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV MODEL_PATH=/app/backend/models/best.pt
ENV CAMERA_ENABLED=false

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/readyz || exit 1

# Production Start Command
CMD ["python", "serve.py"]
