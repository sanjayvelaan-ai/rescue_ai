import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  BrowserCameraContext,
  type CameraTrack,
  type BackendStatusState,
  type MissionAlertItem,
} from './browser-camera-context';
import { useDeviceLocation, freshFix } from './device-location-context';
import { api } from '../services/api';
import { backendUrl, backendOrigin } from './backend-url';
import { createNoDetectionMonitor } from './no-detection';
import { DETECTION_CONFIG, type LocalSurvivorTrack } from './detection-config';
import { ClientSurvivorTracker } from './tracker';

class CameraRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function checkBackendReadiness(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(backendUrl('/readyz'), {
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.ready === true;
    }
    return false;
  } catch {
    return false;
  }
}

async function cameraRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(backendUrl('/api/camera/' + path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(DETECTION_CONFIG.requestTimeoutMs),
  });

  // Handle HTTP 429 without throwing a fatal error
  if (response.status === 429) {
    return { busy: true, detections: [], tracks: [] };
  }

  const result = await response.json().catch(() => ({ detail: 'Camera service did not respond.' }));
  if (!response.ok) {
    throw new CameraRequestError(
      result.detail || `Camera service error ${response.status}`,
      response.status
    );
  }
  return result;
}

export function BrowserCameraProvider({ children }: { children: ReactNode }) {
  const location = useDeviceLocation();
  const quietMonitor = useRef(createNoDetectionMonitor());
  const trackerRef = useRef<ClientSurvivorTracker>(new ClientSurvivorTracker());
  const [quietNotice, setQuietNotice] = useState(false);

  useEffect(() => {
    if (!quietNotice) return;
    const timer = setTimeout(() => setQuietNotice(false), 9000);
    return () => clearTimeout(timer);
  }, [quietNotice]);

  const fix = useRef(location.fix);
  useEffect(() => {
    fix.current = location.fix;
  }, [location.fix]);

  // Video element ref used for direct native stream display & offscreen sampling
  const video = useRef<HTMLVideoElement>(null);
  const runtime = useRef<{
    generation: number;
    stream: MediaStream | null;
    session: string;
    timer: ReturnType<typeof setTimeout> | null;
    abort: AbortController | null;
    inferenceInProgress: boolean;
    consecutiveErrors: number;
  }>({
    generation: 0,
    stream: null,
    session: '',
    timer: null,
    abort: null,
    inferenceInProgress: false,
    consecutiveErrors: 0,
  });

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState<BackendStatusState>('IDLE');
  const [sourceId, setSourceId] = useState('');
  const [preview, setPreview] = useState('');
  const [thermalPreview, setThermalPreview] = useState('');
  const [tracks, setTracks] = useState<CameraTrack[]>([]);
  const [localTracks, setLocalTracks] = useState<LocalSurvivorTrack[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<MissionAlertItem[]>([]);
  const [survivorCount, setSurvivorCount] = useState(0);

  const [inferenceSize, setInferenceSize] = useState<416 | 640>(416);
  const [fps, setFps] = useState(0); // native camera stream FPS (~24-30 FPS)
  const [inferenceFps, setInferenceFps] = useState(0); // YOLO inference FPS (~1-2 FPS)
  const [latencyMs, setLatencyMs] = useState(0);
  const sizeRef = useRef(inferenceSize);
  useEffect(() => {
    sizeRef.current = inferenceSize;
  }, [inferenceSize]);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [processingMs, setProcessingMs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);

  const release = useCallback(() => {
    const r = runtime.current;
    r.generation++;
    if (r.timer) clearTimeout(r.timer);
    r.abort?.abort();
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    r.inferenceInProgress = false;
    r.consecutiveErrors = 0;
    if (r.session) {
      void cameraRequest('sessions/' + r.session, { method: 'DELETE' }).catch(() => {});
    }
    r.session = '';
    if (video.current) video.current.srcObject = null;
    trackerRef.current.reset();
  }, []);

  const stop = useCallback(() => {
    release();
    quietMonitor.current.reset();
    setQuietNotice(false);
    setActive(false);
    setStarting(false);
    setStream(null);
    setTracks([]);
    setLocalTracks([]);
    setPreview('');
    setThermalPreview('');
    setFps(0);
    setInferenceFps(0);
    setSourceId('');
    setBackendStatus('IDLE');
    setError('');
  }, [release]);

  useEffect(() => () => release(), [release]);

  // Periodic FPS measurement on native video element (~30 FPS)
  useEffect(() => {
    if (!active || !stream) return;
    let animId: number;
    let frames = 0;
    let lastTime = performance.now();

    const measure = () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(Math.round((frames * 1000) / (now - lastTime)));
        frames = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(measure);
    };

    animId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animId);
  }, [active, stream]);

  const start = async () => {
    stop();
    setError('');
    setStarting(true);
    setFrameCount(0);
    setLastFrameAt(null);
    setBackendStatus('WAKING');
    const generation = runtime.current.generation;

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Device camera requires HTTPS or localhost. Open the deployed HTTPS address in your browser.'
        );
      }

      if (!backendOrigin && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
        await api.toggleCamera(false).catch(() => {});
      }

      // Step 1: Open native browser camera stream immediately
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (generation !== runtime.current.generation) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }

      runtime.current.stream = media;
      setStream(media);

      media.getVideoTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (generation === runtime.current.generation) {
            stop();
            setError('Camera disconnected.');
          }
        })
      );

      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => {});
      }

      // Check backend readiness asynchronously
      void checkBackendReadiness().then((ready) => {
        if (generation === runtime.current.generation) {
          setBackendStatus(ready ? 'ONLINE' : 'WAKING');
        }
      });

      // Step 2: Establish session with Render backend
      let session: { session_id: string; source_id: string };
      try {
        session = await cameraRequest('sessions', { method: 'POST' });
        if (generation !== runtime.current.generation) {
          void cameraRequest('sessions/' + session.session_id, { method: 'DELETE' }).catch(() => {});
          return;
        }
        runtime.current.session = session.session_id;
        setSourceId(session.source_id);
        setBackendStatus('ONLINE');
      } catch (err) {
        setBackendStatus('WAKING');
        session = { session_id: '', source_id: 'BROWSER-LOCAL' };
      }

      const list = await navigator.mediaDevices.enumerateDevices();
      if (generation !== runtime.current.generation) return;
      setDevices(list.filter((d) => d.kind === 'videoinput'));

      setStarting(false);
      setActive(true);

      // Step 3: Offscreen canvas specifically for inference resizing (640x360)
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = DETECTION_CONFIG.inferenceWidth;
      offscreenCanvas.height = DETECTION_CONFIG.inferenceHeight;
      const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });

      let frameId = 0;
      let lastInferenceTime = 0;
      let lastVideoFrameTime = -1;

      // Adaptive inference loop with strict single-flight execution
      const sendInferenceLoop = async () => {
        if (generation !== runtime.current.generation) return;

        // FIX 1: If inference is currently in progress, SILENTLY return. Do NOT treat as error or toast!
        if (runtime.current.inferenceInProgress) {
          runtime.current.timer = setTimeout(sendInferenceLoop, 200);
          return;
        }

        const el = video.current;
        if (!el || !el.videoWidth || el.readyState < 2) {
          runtime.current.timer = setTimeout(sendInferenceLoop, 150);
          return;
        }

        // Avoid re-processing unchanged video frames
        if (el.currentTime === lastVideoFrameTime) {
          runtime.current.timer = setTimeout(sendInferenceLoop, 80);
          return;
        }
        lastVideoFrameTime = el.currentTime;

        const cycleStart = performance.now();
        let nextInterval = DETECTION_CONFIG.inferenceInterval; // default 1000ms

        try {
          runtime.current.inferenceInProgress = true;
          setBackendStatus('PROCESSING');

          // Resize latest camera frame to 640x360
          if (offscreenCtx) {
            offscreenCtx.drawImage(
              el,
              0,
              0,
              DETECTION_CONFIG.inferenceWidth,
              DETECTION_CONFIG.inferenceHeight
            );
          }

          // Compress to JPEG (quality 0.60)
          const blob = await new Promise<Blob | null>((resolve) =>
            offscreenCanvas.toBlob(resolve, 'image/jpeg', DETECTION_CONFIG.jpegQuality)
          );

          if (!blob || generation !== runtime.current.generation) return;

          const jpegBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          if (generation !== runtime.current.generation) return;

          // Ensure session is active
          if (!runtime.current.session) {
            try {
              const replacement = await cameraRequest('sessions', { method: 'POST' });
              if (generation !== runtime.current.generation) return;
              session = replacement;
              runtime.current.session = session.session_id;
              setSourceId(session.source_id);
            } catch {
              setBackendStatus('WAKING');
              throw new CameraRequestError('Waking backend...', 503);
            }
          }

          // FIX 3: Request timeout with AbortController (8-10 seconds)
          const controller = new AbortController();
          runtime.current.abort = controller;
          const timeout = setTimeout(() => controller.abort(), DETECTION_CONFIG.requestTimeoutMs);

          let result: {
            busy?: boolean;
            skipped?: boolean;
            detections?: any[];
            tracks?: any[];
            source_id?: string;
            inference_ms?: number;
            processing_ms?: number;
            preview?: string;
            thermal_preview?: string;
          };

          try {
            result = await cameraRequest('sessions/' + runtime.current.session + '/frames', {
              method: 'POST',
              signal: controller.signal,
              body: JSON.stringify({
                jpeg: jpegBase64,
                frame_id: ++frameId,
                location: freshFix(fix.current),
                inference_size: sizeRef.current,
                include_preview: false,
              }),
            });
          } finally {
            clearTimeout(timeout);
          }

          if (generation !== runtime.current.generation) return;

          const now = performance.now();
          const latency = Math.round(now - cycleStart);
          setLatencyMs(latency);

          // FIX 1 & 9: If YOLO is busy, skip this frame cycle silently without any error
          if (result.busy) {
            setBackendStatus('PROCESSING');
            runtime.current.consecutiveErrors = 0;
            nextInterval = 800;
            return;
          }

          setProcessingMs(result.inference_ms || result.processing_ms || latency);

          // Update inference rate (YOLO FPS)
          if (lastInferenceTime > 0) {
            const calculatedFps = Math.round(10000 / (now - lastInferenceTime)) / 10;
            setInferenceFps(calculatedFps);
          }
          lastInferenceTime = now;

          // Process detections via ClientSurvivorTracker (works with or without GPS)
          const rawDetections = result.detections || result.tracks || [];
          const currentFix = freshFix(fix.current);
          const { activeTracks, newAlerts } = trackerRef.current.update(
            rawDetections,
            currentFix,
            Date.now()
          );

          setLocalTracks(activeTracks);
          setTracks(result.tracks || activeTracks);
          setSurvivorCount(activeTracks.length);

          if (newAlerts.length > 0) {
            setRecentAlerts((prev) => [...newAlerts, ...prev].slice(0, 10));
          }

          if (activeTracks.length > 0) {
            setQuietNotice(false);
          } else if (quietMonitor.current.observe(now, 0)) {
            setQuietNotice(true);
          }

          if (result.preview) setPreview(result.preview);
          if (result.thermal_preview) setThermalPreview(result.thermal_preview);

          setFrameCount((n) => n + 1);
          setLastFrameAt(Date.now());
          setError('');
          setBackendStatus('ONLINE');
          runtime.current.consecutiveErrors = 0;

          // FIX 2: Adaptive inference timing based on measured latency
          if (latency < 700) {
            nextInterval = 700;
          } else if (latency < 1200) {
            nextInterval = 1000;
          } else if (latency < 2000) {
            nextInterval = 1500;
          } else {
            nextInterval = 2000;
          }
        } catch (e: any) {
          if (generation !== runtime.current.generation) return;

          // Check if request timed out / was aborted
          if (e.name === 'AbortError') {
            setBackendStatus('DELAYED');
            nextInterval = 2000;
          } else if (e instanceof CameraRequestError && e.status === 410) {
            // Session expired: recreate on next cycle
            runtime.current.session = '';
            setBackendStatus('WAKING');
            nextInterval = 1500;
          } else {
            runtime.current.consecutiveErrors++;
            const errors = runtime.current.consecutiveErrors;
            nextInterval = Math.min(8000, 1500 * Math.pow(1.5, errors - 1));
            setBackendStatus('DELAYED');
          }

          setInferenceFps(0);
        } finally {
          runtime.current.inferenceInProgress = false;
          if (generation === runtime.current.generation) {
            runtime.current.timer = setTimeout(sendInferenceLoop, nextInterval);
          }
        }
      };

      // Launch the inference loop
      void sendInferenceLoop();
    } catch (e) {
      if (generation !== runtime.current.generation) return;
      stop();
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in browser settings.'
          : name === 'NotFoundError'
          ? 'No camera found on this device.'
          : name === 'NotReadableError'
          ? 'Camera is in use by another application.'
          : name === 'OverconstrainedError'
          ? 'Selected camera constraints are not supported.'
          : name === 'SecurityError'
          ? 'Camera access requires HTTPS or localhost.'
          : e instanceof Error
          ? e.message
          : 'Could not initialize camera.'
      );
      setBackendStatus('OFFLINE');
    }
  };

  return (
    <BrowserCameraContext.Provider
      value={{
        active,
        starting,
        error,
        sourceId,
        preview,
        thermalPreview,
        stream,
        tracks,
        localTracks,
        devices,
        deviceId,
        setDeviceId,
        start,
        stop,
        processingMs,
        frameCount,
        lastFrameAt,
        inferenceSize,
        setInferenceSize,
        fps,
        inferenceFps,
        latencyMs,
        backendStatus,
        survivorCount,
        recentAlerts,
      }}
    >
      {quietNotice && (
        <div
          role="status"
          aria-live="polite"
          className="detection-notice rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl mb-3"
        >
          <div className="flex items-start gap-3">
            <div>
              <strong className="block text-sm text-cyan-400">Scanning disaster area...</strong>
              <p className="mt-1 text-xs text-slate-400">
                No survivors detected in the current camera sector for 45s. Keep panning the device.
              </p>
            </div>
            <button
              aria-label="Dismiss scan notice"
              className="map-toolbar-button shrink-0 text-slate-400 hover:text-white"
              onClick={() => setQuietNotice(false)}
            >
              &times;
            </button>
          </div>
        </div>
      )}
      <video ref={video} muted playsInline aria-hidden="true" className="hidden" />
      {children}
    </BrowserCameraContext.Provider>
  );
}
