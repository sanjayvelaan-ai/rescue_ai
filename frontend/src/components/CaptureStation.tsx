import { useState } from 'react';
import { useBrowserCamera } from '../lib/browser-camera-context';
import { useDeviceLocation, freshFix } from '../lib/device-location-context';
import { LiveCameraStreamOverlay } from './LiveCameraStreamOverlay';
import { Camera, MapPin, Radio, ShieldAlert, Cpu, Eye, Video } from 'lucide-react';

export function CaptureStation() {
  const camera = useBrowserCamera();
  const location = useDeviceLocation();
  const [activeTab, setActiveTab] = useState<'rgb' | 'thermal'>('rgb');
  const fix = freshFix(location.fix);

  return (
    <section className="theme-card rounded-xl border border-slate-800 p-4 space-y-4" aria-label="Device capture station">
      {/* Header bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            LIVE MISSION CAMERA & YOLO DETECTOR
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Native 30 FPS browser camera stream with decoupled 1.6 FPS Render Free AI inference.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-400">
            SOURCE: <strong className="text-cyan-400">{camera.sourceId || 'STANDBY'}</strong>
          </span>
        </div>
      </div>

      {/* Control Buttons Grid */}
      <div className="capture-controls grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs font-mono">
        <select
          aria-label="Capture camera"
          value={camera.deviceId}
          disabled={camera.active || camera.starting}
          onChange={(e) => camera.setDeviceId(e.target.value)}
          className="rounded bg-slate-900 border border-slate-700 p-2 max-w-full text-slate-200"
        >
          <option value="">Default / Environment Camera</option>
          {camera.devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>

        <button
          className={`map-toolbar-button font-bold flex items-center justify-center gap-1.5 ${
            camera.active ? 'bg-cyan-700 hover:bg-cyan-600 text-white' : ''
          }`}
          disabled={camera.starting}
          onClick={() => void camera.start()}
        >
          <Camera className="w-3.5 h-3.5" />
          {camera.starting ? 'CONNECTING...' : camera.active ? 'RESTART CAMERA' : 'START LIVE MISSION'}
        </button>

        {(camera.active || camera.starting) && (
          <button
            className="map-toolbar-button bg-red-950/80 hover:bg-red-900 border-red-800 text-red-300 font-bold"
            onClick={camera.stop}
          >
            STOP CAMERA
          </button>
        )}

        <label className="flex items-center justify-between gap-2 px-2 bg-slate-900 border border-slate-700 rounded text-slate-300">
          <span>YOLO Mode:</span>
          <select
            aria-label="Detection mode"
            value={camera.inferenceSize}
            onChange={(e) => camera.setInferenceSize(Number(e.target.value) as 416 | 640)}
            className="rounded bg-slate-950 border border-slate-700 p-1 text-slate-200"
          >
            <option value={416}>Fast (416)</option>
            <option value={640}>Detail (640)</option>
          </select>
        </label>
      </div>

      {/* GPS Location Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {fix
              ? `${fix.source === 'USER_PIN' ? 'Operator Pin' : 'GPS Location'}: ${fix.latitude.toFixed(
                  5
                )}, ${fix.longitude.toFixed(5)}${
                  fix.accuracy_m != null ? ` (±${Math.round(fix.accuracy_m)}m)` : ''
                }`
              : 'Location: Unavailable (Captures will run without geographic coordinates)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="map-toolbar-button py-1 px-2.5" onClick={() => location.request(false)}>
            Get Location
          </button>
          <button className="map-toolbar-button py-1 px-2.5" onClick={() => location.request(true)}>
            Refine GPS
          </button>
          {(location.active || location.fix) && (
            <button className="map-toolbar-button py-1 px-2.5 text-slate-400" onClick={location.stop}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Errors & Alerts */}
      {(camera.error || location.error) && (
        <div
          role="alert"
          className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-800/80 text-amber-300 text-xs flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{camera.error || location.error}</span>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('rgb')}
          className={`flex items-center gap-1.5 pb-2 px-3 font-bold border-b-2 transition ${
            activeTab === 'rgb'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          RGB Live Stream
        </button>
        <button
          onClick={() => setActiveTab('thermal')}
          className={`flex items-center gap-1.5 pb-2 px-3 font-bold border-b-2 transition ${
            activeTab === 'thermal'
              ? 'border-purple-400 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Thermal Simulation
        </button>
      </div>

      {/* High-Performance Smooth Live Video Feed & Canvas Overlay */}
      <LiveCameraStreamOverlay showThermalSim={activeTab === 'thermal'} />

      {/* Telemetry and Alert Status Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-400 font-mono">
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
          <div className="text-slate-300 font-bold flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            AI INFERENCE STATUS
          </div>
          <p>
            Active Targets:{' '}
            <strong className="text-cyan-400">{camera.localTracks.length} candidates</strong>
          </p>
          <p>
            Inference Cycle:{' '}
            <strong className="text-slate-200">
              {camera.lastFrameAt
                ? `${new Date(camera.lastFrameAt).toLocaleTimeString()} (${camera.processingMs} ms)`
                : 'Waiting for first cycle'}
            </strong>
          </p>
          <p className="text-[11px] text-slate-500">
            Browser camera stays smooth at ~30 FPS; YOLO runs asynchronously at ~1.6 FPS on Render Free.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
          <div className="text-slate-300 font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            RECENT SURVIVOR ALERTS
          </div>
          {camera.recentAlerts.length > 0 ? (
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {camera.recentAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] flex items-center justify-between"
                >
                  <span className="text-emerald-400 font-bold">
                    {alert.trackId}: {alert.title} ({Math.round(alert.confidence * 100)}%)
                  </span>
                  <span className="text-slate-500">{alert.timestamp}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-[11px]">
              No survivor alerts triggered yet. Scanner active.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
