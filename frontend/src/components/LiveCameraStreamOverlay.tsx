import React, { useEffect, useRef, useState } from 'react';
import { useBrowserCamera } from '../lib/browser-camera-context';
import { DETECTION_CONFIG, type LocalSurvivorTrack } from '../lib/detection-config';
import { Activity, AlertTriangle, CheckCircle2, Radio, Eye } from 'lucide-react';

interface LiveCameraStreamOverlayProps {
  showThermalSim?: boolean;
}

export const LiveCameraStreamOverlay: React.FC<LiveCameraStreamOverlayProps> = ({
  showThermalSim = false,
}) => {
  const camera = useBrowserCamera();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 640, height: 360 });

  // Attach native media stream directly to the video element for silky smooth 30 FPS playback
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (camera.stream) {
      el.srcObject = camera.stream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [camera.stream]);

  // Track container sizing with ResizeObserver for precise bounding box coordinate scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 60 FPS requestAnimationFrame canvas rendering loop for bounding boxes and HUD tags
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!camera.active || !camera.stream) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dispW = canvas.width;
      const dispH = canvas.height;
      const vidW = video.videoWidth || DETECTION_CONFIG.inferenceWidth;
      const vidH = video.videoHeight || DETECTION_CONFIG.inferenceHeight;

      // Calculate aspect ratio scaling and letterboxing/pillarboxing offsets
      const vidRatio = vidW / vidH;
      const dispRatio = dispW / dispH;

      let renderW = dispW;
      let renderH = dispH;
      let offsetX = 0;
      let offsetY = 0;

      if (dispRatio > vidRatio) {
        // Container is wider than video (pillarbox)
        renderW = dispH * vidRatio;
        offsetX = (dispW - renderW) / 2;
      } else {
        // Container is taller than video (letterbox)
        renderH = dispW / vidRatio;
        offsetY = (dispH - renderH) / 2;
      }

      const scaleX = renderW / DETECTION_CONFIG.inferenceWidth;
      const scaleY = renderH / DETECTION_CONFIG.inferenceHeight;

      const tracksToDraw = camera.localTracks;

      for (const track of tracksToDraw) {
        // Use exponentially smoothed coordinates to eliminate jitter
        const x1 = Math.round(track.smoothX1 * scaleX + offsetX);
        const y1 = Math.round(track.smoothY1 * scaleY + offsetY);
        const x2 = Math.round(track.smoothX2 * scaleX + offsetX);
        const y2 = Math.round(track.smoothY2 * scaleY + offsetY);
        const boxW = Math.max(20, x2 - x1);
        const boxH = Math.max(20, y2 - y1);

        const isConfirmed = track.state === 'CONFIRMED' || track.state === 'LIKELY_SURVIVOR';
        const isSurvivorClass = track.class_name.toLowerCase() === 'survivor';
        const primaryColor = isSurvivorClass || isConfirmed ? '#10b981' : '#06b6d4'; // Emerald or Cyan
        const boxAlpha = track.hits >= 2 ? '0.25' : '0.15';

        // 1. Semi-transparent highlight box
        ctx.fillStyle = isSurvivorClass || isConfirmed
          ? `rgba(16, 185, 129, ${boxAlpha})`
          : `rgba(6, 182, 212, ${boxAlpha})`;
        ctx.fillRect(x1, y1, boxW, boxH);

        // 2. High-contrast bounding box border
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, boxW, boxH);

        // 3. Stylized Tactical Corner Brackets
        const cornerLen = Math.min(16, Math.min(boxW, boxH) / 3);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';

        // Top-left corner
        ctx.beginPath();
        ctx.moveTo(x1, y1 + cornerLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cornerLen, y1);
        ctx.stroke();

        // Top-right corner
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cornerLen);
        ctx.stroke();

        // Bottom-left corner
        ctx.beginPath();
        ctx.moveTo(x1, y2 - cornerLen);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1 + cornerLen, y2);
        ctx.stroke();

        // Bottom-right corner
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y2);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // 4. Header Badge: S-001 • SURVIVOR • 91%
        const pct = Math.round(track.confidence * 100);
        const labelText = `${track.localId} • ${track.display_label} • ${pct}%`;

        ctx.font = 'bold 11px monospace, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const badgeW = textMetrics.width + 16;
        const badgeH = 22;
        const badgeY = Math.max(4, y1 - badgeH - 2);

        // Badge Background with Dark Glow
        ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
        ctx.fillRect(x1, badgeY, badgeW, badgeH);

        // Badge Accent Border
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, badgeY, badgeW, badgeH);

        // Badge Text
        ctx.fillStyle = primaryColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, x1 + 8, badgeY + badgeH / 2);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [camera.active, camera.stream, camera.localTracks, dimensions]);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center select-none"
    >
      {/* 1. Native Smooth 30 FPS Camera Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-contain ${
          showThermalSim ? 'filter hue-rotate-180 contrast-125 invert' : ''
        }`}
      />

      {/* 2. Transparent 60 FPS Canvas Overlay for Bounding Boxes */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* 3. Top Tactical HUD Status Bar */}
      {camera.active && (
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 z-20 pointer-events-none text-xs font-mono">
          {/* Left: Live & Backend Status */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-slate-700 text-emerald-400 font-bold backdrop-blur-md shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>

            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border backdrop-blur-md shadow-md font-bold ${
                camera.backendStatus === 'ONLINE'
                  ? 'bg-slate-900/90 border-cyan-500/50 text-cyan-400'
                  : camera.backendStatus === 'WAKING'
                  ? 'bg-amber-950/90 border-amber-500 text-amber-400'
                  : 'bg-red-950/90 border-red-500 text-red-400'
              }`}
            >
              {camera.backendStatus === 'ONLINE' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  AI ONLINE
                </>
              ) : camera.backendStatus === 'WAKING' ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  WAKING BACKEND...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  AI DEGRADED
                </>
              )}
            </span>
          </div>

          {/* Right: FPS & Latency Telemetry */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3 py-1 rounded text-slate-300 backdrop-blur-md shadow-md">
            <span>
              CAM: <strong className="text-emerald-400">{camera.fps || 30} FPS</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              YOLO: <strong className="text-blue-400">{camera.inferenceFps || 1.6} FPS</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              LATENCY: <strong className="text-yellow-400">{camera.latencyMs} ms</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              SURVIVORS: <strong className="text-cyan-400">{camera.survivorCount}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 4. Placeholder when camera is inactive */}
      {!camera.active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-slate-950/90">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-cyan-400 shadow-inner">
            <Radio className="w-8 h-8 animate-pulse" />
          </div>
          <h3 className="text-sm font-bold text-slate-200 tracking-wider">LIVE MISSION CAMERA STANDBY</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Start the camera to begin real-time 30 FPS video streaming with asynchronous YOLO survivor detection.
          </p>
          {camera.starting && (
            <p className="text-xs text-cyan-400 mt-3 flex items-center gap-1.5 font-bold">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              Initializing camera hardware & connecting backend...
            </p>
          )}
        </div>
      )}
    </div>
  );
};
