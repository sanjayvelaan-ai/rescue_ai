import {CaptureStation} from '../components/CaptureStation';
import {useBrowserCamera} from '../lib/browser-camera-context';
import React, { useState, useEffect } from 'react';
import {
  Radio,
  UserCheck,
  Shield,
  Layers,
  Camera,
  Zap,
  Maximize2,
  Eye,
  Sparkles,
  MapPin,
  X,
  Trash2,
  RefreshCw,
  Power
} from 'lucide-react';
import { DisasterMap } from '../map/DisasterMap';
import type { Survivor, Alert, RescueTeam, DroneFleet } from '../types';
import type { RadarStatus } from '../types/radar';
import { api, resolveSnapshotUrl } from '../services/api';
import { SensorModuleWidget } from '../components/sensors/SensorModuleWidget';
import { SurvivorAnalysisWidget } from '../components/fusion/SurvivorAnalysisWidget';
import { RadarMonitorModal } from '../components/radar/RadarMonitorModal';
import confetti from 'canvas-confetti';

interface DashboardPageProps {
  survivors: Survivor[];
  alerts: Alert[];
  teams: RescueTeam[];
  drone?: DroneFleet;
  systemStatus?: any;
  onRefresh?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  survivors,
  alerts,
  teams,
  drone,
  systemStatus,
  onRefresh
}) => {
  const camera=useBrowserCamera();
  const [selectedSurvivor, setSelectedSurvivor] = useState<Survivor | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [radarStatus, setRadarStatus] = useState<RadarStatus | null>(null);
  const [radarAlert, setRadarAlert] = useState<any | null>(null);
  const [inspectModal, setInspectModal] = useState<{
    survivor?: Survivor;
    alert?: Alert;
    mode: 'rgb' | 'thermal';
  } | null>(null);

  useEffect(() => {
    const fetchRadarStatus = async () => {
      try {
        const rData = await api.getRadarStatus();
        setRadarStatus(rData);
      } catch {
        // quiet fallback
      }
    };
    fetchRadarStatus();
    const interval = setInterval(fetchRadarStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  const confirmedSurvivors = survivors.filter(
    (s) => s.status === 'CONFIRMED' || s.status === 'ASSIGNED' || s.status === 'EN_ROUTE' || s.status === 'ON_SITE'
  );
  const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL' && a.status !== 'RESOLVED');

  const handleDispatchTeam = async (survivor: Survivor, team: RescueTeam) => {
    try {
      await api.dispatchMission('M-101', survivor.survivor_id, team.team_id);
      confetti({ particleCount: 90, spread: 65, origin: { y: 0.6 } });
      if (onRefresh) onRefresh();
    } catch (e) {
      setCaptureFeedback(e instanceof Error ? e.message : 'Dispatch failed.');
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear all survivor snapshot records and alert history? Live camera detection will continue.")) {
      return;
    }
    setIsClearing(true);
    try {
      await api.clearHistory();
      setCaptureFeedback("All snapshot history & survivor records cleared successfully.");
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error("Clear history failed:", e);
      setCaptureFeedback("Failed to clear snapshot history.");
    } finally {
      setIsClearing(false);
      setTimeout(() => setCaptureFeedback(null), 5000);
    }
  };

  const handleToggleCamera = async () => {
    if(camera.active)camera.stop();else await camera.start();
  };
  const handleRetryCamera = async () => {await camera.start();};

  const handleManualCaptureSnapshot = async () => {
    if(camera.active){
      if(!camera.preview||camera.error||!camera.lastFrameAt||Date.now()-camera.lastFrameAt>10000){setCaptureFeedback('Wait for a fresh YOLO result before saving a frame.');return;}
      setLastSnapshot(camera.preview);setCaptureFeedback('Latest processed frame ready to download. Confirmed detections save evidence automatically.');return;
    }
    setIsCapturing(true);
    setCaptureFeedback('Capturing camera photo & running YOLOv8s inference...');
    try {
      const res = await api.captureCameraSnapshot();
      setLastSnapshot(resolveSnapshotUrl(res.rgb_snapshot_path));
      if (res.detections && res.detections.length > 0) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 } });
        setCaptureFeedback(`Photo captured! Detected ${res.detections.length} person candidate(s); review the snapshot.`);
      } else {
        setCaptureFeedback('Photo saved. No person candidates in this frame.');
      }
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Manual snapshot capture error:', e);
      setCaptureFeedback(e instanceof Error ? e.message : 'Snapshot capture failed.');
    } finally {
      setIsCapturing(false);
      setTimeout(() => setCaptureFeedback(null), 6000);
    }
  };

  const getAlertForSurvivor = (survivorId: string): Alert | undefined => {
    return alerts.find((a) => a.survivor_id === survivorId);
  };

  const isCameraEnabled = camera.active || Boolean(systemStatus?.camera_online);

  return (
    <div className="page-shell p-4 sm:p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen">
      {lastSnapshot && <a href={lastSnapshot} download="rescue-camera-snapshot.jpg" className="inline-block text-xs text-cyan-400 underline">Save latest camera snapshot</a>}
      {/* 1. TOP STATUS & MODEL BANNER */}
      <div className="theme-card flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isCameraEnabled ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
            <h1 className="text-base font-bold text-slate-100 tracking-wider flex items-center gap-2">
              DISASTER COMMAND CENTER &bull; REAL-TIME AI SURVEILLANCE
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Automated Survivor Detection &bull; Ultralytics YOLOv8s Inference &bull; Instant Camera Photo Snapshots
          </p>
        </div>

        {/* Action button & Camera / Model stats */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* CAMERA ON / OFF TOGGLE BUTTON */}
          <button
            onClick={handleToggleCamera}
            disabled={camera.starting}
            className={`theme-control flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition shadow-md ${
              isCameraEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-950/50'
                : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-950/50'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {camera.active ? 'DEVICE CAMERA ON' : camera.starting ? 'CONNECTING…' : 'DEVICE CAMERA OFF'}
          </button>

          {/* RECONNECT CAMERA BUTTON */}
          <button
            onClick={handleRetryCamera}
            disabled={camera.starting}
            className="theme-control flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs transition border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            RECONNECT
          </button>

          {/* UWB RADAR MONITOR BUTTON */}
          <button
            onClick={() => setIsRadarOpen(true)}
            className="theme-control flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 font-bold text-xs transition shadow-md shadow-cyan-950/50"
            title="Open UWB Through-Wall Radar Real-Time Monitor"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            📡 UWB RADAR
          </button>

          {/* CAPTURE PHOTO BUTTON */}
          <button
            onClick={handleManualCaptureSnapshot}
            disabled={isCapturing || !isCameraEnabled}
            className="theme-control flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95 disabled:opacity-50"
          >
            <Camera className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
            {isCapturing ? 'ANALYZING...' : camera.active ? 'SAVE YOLO FRAME' : 'CAPTURE SERVER PHOTO'}
          </button>

          <div className="theme-card hidden lg:flex items-center gap-3 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400">MODEL:</span>
            <span className="text-cyan-400 font-bold">YOLOv8s.pt</span>
            <span className="w-px h-3.5 bg-slate-800" />
            <span className="text-slate-400">DEVICE:</span>
            <span className="text-emerald-400 font-bold">{systemStatus?.device?.toUpperCase() || 'CPU'}</span>
            <span className="w-px h-3.5 bg-slate-800" />
            <span className="text-slate-400">FPS:</span>
            <span className="text-blue-400 font-bold">{camera.active ? 'See capture timing' : (systemStatus?.fps ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Real-time Radar Human Presence Alert Banner */}
      {radarAlert && (
        <div className="bg-red-950/95 border-2 border-red-500 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-200 animate-fadeIn shadow-2xl shadow-red-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-900/80 text-red-300 border border-red-700 animate-pulse">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-sm text-red-300 flex items-center gap-2">
                <span>🚨 RADAR HUMAN PRESENCE ALERT</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-900 border border-red-700 text-white font-mono">
                  {radarAlert.zone || 'Sector Bravo-4'} &bull; Conf: {radarAlert.confidence || '92%'}
                </span>
              </div>
              <p className="text-[11px] text-red-200 mt-1">
                {radarAlert.message || `Through-wall micro-Doppler detected living human presence behind rubble at ${radarAlert.estimated_range_m || 8.4}m.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsRadarOpen(true)}
              className="theme-control px-3.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-lg"
            >
              <Eye className="w-3.5 h-3.5" />
              INSPECT RADAR MONITOR
            </button>
            <button
              onClick={() => setRadarAlert(null)}
              className="theme-control p-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-300 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Capture Feedback Toast Banner */}
      {captureFeedback && (
        <div className="bg-cyan-950/80 border border-cyan-500/50 p-3 rounded-lg flex items-center justify-between text-xs text-cyan-300 animate-fadeIn shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="font-bold">{captureFeedback}</span>
          </div>
          <button onClick={() => setCaptureFeedback(null)} className="theme-control text-cyan-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TOP METRICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Active Mission */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg relative overflow-hidden">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Mission</div>
          <div className="text-xl font-black text-cyan-400 mt-1">M-101</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Sector B-4
          </div>
        </div>

        {/* Survivors Detected */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Survivors Detected</div>
          <div className="text-2xl font-black text-slate-100 mt-1">{survivors.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">YOLOv8s Model Signals</div>
        </div>

        {/* Survivors Confirmed */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg border-l-4 border-l-emerald-500">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confirmed / assigned records</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{confirmedSurvivors.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Operator workflow status</div>
        </div>

        {/* Critical Alerts */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg border-l-4 border-l-red-500">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Critical Alerts</div>
          <div className="text-2xl font-black text-red-500 mt-1">{criticalAlerts.length}</div>
          <div className="text-[11px] text-red-400/80 mt-1 font-semibold animate-pulse">Photo Snapshot Saved</div>
        </div>

        {/* Drone Battery */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Drone Battery</div>
          <div className="text-2xl font-black text-cyan-300 mt-1">{drone?.battery_pct || 92}%</div>
          <div className="text-[11px] text-slate-500 mt-1">Est. 42 min remaining</div>
        </div>

        {/* Search Coverage */}
        <div className="theme-card bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-lg">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Search Coverage</div>
          <div className="text-2xl font-black text-blue-400 mt-1">34.5%</div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-blue-400 h-full rounded-full" style={{ width: '34.5%' }} />
          </div>
        </div>
      </div>

      <CaptureStation/>

      {/* 4. DEDICATED REAL-TIME SURVIVOR CAMERA DETECTIONS & SNAPSHOTS SECTION */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              REAL-TIME CAMERA DETECTIONS & SURVIVOR SNAPSHOTS ({survivors.length})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              disabled={isClearing}
              className="theme-control flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-700/80 text-rose-300 font-bold text-xs transition shadow-md hover:shadow-rose-950/50 active:scale-95 disabled:opacity-50"
              title="Clear all survivor snapshot records and reset detection history"
            >
              <Trash2 className={`w-3.5 h-3.5 text-rose-400 ${isClearing ? 'animate-spin' : ''}`} />
              {isClearing ? 'CLEARING...' : 'CLEAR SNAPSHOT HISTORY'}
            </button>
            <span className="text-xs text-slate-400 hidden lg:inline">
              Saved photos &bull; Source-labeled capture positions
            </span>
          </div>
        </div>

        {survivors.length === 0 ? (
          <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <Camera className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-300">No Survivor Snapshots Yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Live camera feed is actively monitored by YOLOv8s. When human presence is detected, photographic camera snapshots and GPS alerts are automatically captured and displayed here.
            </p>
            <button
              onClick={handleManualCaptureSnapshot}
              disabled={isCapturing}
              className="theme-control inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs"
            >
              <Camera className="w-4 h-4" />
              CAPTURE TEST SNAPSHOT NOW
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {survivors.map((surv) => {
              const alert = getAlertForSurvivor(surv.survivor_id);
              const rgbUrl = resolveSnapshotUrl(surv.detection_frame_path || alert?.frame_snapshot_path, surv.survivor_id, false);
              const nearestTeam = teams.length > 0 ? teams[0] : null;

              return (
                <div
                  key={surv.survivor_id}
                  className="theme-card bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl overflow-hidden shadow-xl transition-all duration-200 flex flex-col justify-between"
                >
                  {/* Snapshot Photo Card Top */}
                  <div>
                    {/* Header bar */}
                    <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-cyan-400">{surv.survivor_id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          surv.priority === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-amber-950 text-amber-300'
                        }`}>
                          {surv.priority || 'CRITICAL'}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                        {Math.round(surv.fusion_confidence * 100)}% YOLOv8s
                      </span>
                    </div>

                    {/* Snapshot Photo Container */}
                    <div
                      className="relative aspect-video bg-black overflow-hidden group cursor-pointer"
                      onClick={() => setInspectModal({ survivor: surv, alert, mode: 'rgb' })}
                    >
                      <img
                        src={rgbUrl}
                        alt={`Snapshot of ${surv.survivor_id}`}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLElement).setAttribute('src', resolveSnapshotUrl(undefined, surv.survivor_id, false));
                        }}
                      />
                      
                      {/* Overlay badges */}
                      <div className="absolute top-2 left-2 bg-slate-950/85 backdrop-blur px-2 py-0.5 rounded border border-slate-800 text-[10px] text-cyan-300 flex items-center gap-1 font-mono">
                        <Camera className="w-3 h-3 text-cyan-400" />
                        PHOTO SNAPSHOT
                      </div>

                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <button className="theme-control px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg">
                          <Maximize2 className="w-3.5 h-3.5" />
                          INSPECT FULL PHOTO
                        </button>
                      </div>

                      <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 backdrop-blur px-2 py-1 rounded border border-slate-800/80 text-[10px] text-slate-300 flex items-center justify-between font-mono">
                        <span className="flex items-center gap-1 text-cyan-300">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          {surv.location_source==='UNLOCATED'?'Location unavailable':`${surv.latitude.toFixed(5)}, ${surv.longitude.toFixed(5)}`}
                        </span>
                        <span className="text-slate-400">{surv.sector || 'Sector Bravo-4'}</span>
                      </div>
                    </div>

                    {/* Metadata Details */}
                    <div className="p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Status: <strong className="text-emerald-400">{surv.status}</strong></span>
                        <span>Captured: <strong className="text-slate-200">{surv.timestamp ? new Date(surv.timestamp).toLocaleTimeString() : 'Live'}</strong></span>
                      </div>

                      {alert?.ai_recommendation && (
                        <div className="p-2 bg-slate-950 rounded border border-slate-800/80 text-[11px] text-cyan-300/90 flex items-start gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span className="leading-tight">{alert.ai_recommendation}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons Bottom */}
                  <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center gap-2">
                    <button
                      onClick={() => setInspectModal({ survivor: surv, alert, mode: 'rgb' })}
                      className="theme-control flex-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs transition flex items-center justify-center gap-1 border border-slate-700"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      INSPECT
                    </button>

                    {nearestTeam && surv.status !== 'RESCUED' && (
                      <button
                        onClick={() => handleDispatchTeam(surv, nearestTeam)}
                        className="theme-control flex-1 py-1.5 px-2 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center justify-center gap-1 shadow-md shadow-red-950/50"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        DISPATCH {nearestTeam.name.split(' ')[0]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. MIDDLE SECTION: OPERATIONAL MAP & AI FUSION PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Disaster Map Container (2 cols) */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              OPERATIONAL DISASTER MAP (SECTOR BRAVO-4)
            </h3>
            <span className="text-xs text-slate-400 font-mono">Live Drone Position & Geotagged Survivors</span>
          </div>

          <div className="map-frame">
            <DisasterMap
              survivors={survivors}
              hazards={[]}
              teams={teams}
              drone={drone}
              selectedSurvivorId={selectedSurvivor?.survivor_id}
              onSelectSurvivor={(s) => setSelectedSurvivor(s)}
              onDispatchTeam={(s, t) => handleDispatchTeam(s, t)}
            />
          </div>
        </div>

        <section className="theme-card rounded-xl border border-slate-800 p-5 space-y-4">
          <h3 className="font-bold text-sm text-cyan-400">LIVE YOLO DETECTION</h3>
          <dl className="space-y-3 text-xs">
            <div className="flex justify-between"><dt className="text-slate-400">Model</dt><dd className="text-slate-100">{systemStatus?.model_name || 'Unavailable'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Camera</dt><dd className="text-slate-100">{camera.active ? 'Device live' : systemStatus?.camera_online ? 'Server live' : 'Offline'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Camera FPS</dt><dd className="text-slate-100">{camera.active ? 'Browser capture' : (systemStatus?.fps ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Inference FPS</dt><dd className="text-slate-100">{camera.active ? `${camera.processingMs} ms / result` : (systemStatus?.inference_fps ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">People in view</dt><dd className="text-slate-100">{systemStatus?.candidates?.length ?? 0}</dd></div>
          </dl>
          <p className="text-xs text-slate-400">A stable person track creates one snapshot alert. Model confidence is a detection score, not a measurement of survival or medical condition.</p>
          <p className="text-xs text-amber-400">Location source is recorded per capture. False-color previews do not measure temperature.</p>
        </section>
      </div>

      {/* 5B. RESCUE-AI INTEGRATED SENSOR SUITE & SURVIVOR FUSION ANALYSIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sensor Module Display (1 col) */}
        <div className="lg:col-span-1">
          <SensorModuleWidget
            radarStatus={radarStatus}
            cameraOnline={isCameraEnabled}
            onOpenRadar={() => setIsRadarOpen(true)}
          />
        </div>

        {/* Survivor Analysis & Sensor Fusion Result (2 cols) */}
        <div className="lg:col-span-2">
          <SurvivorAnalysisWidget
            radarStatus={radarStatus}
            cameraOnline={isCameraEnabled}
            onOpenRadar={() => setIsRadarOpen(true)}
          />
        </div>
      </div>

      {/* 6. BOTTOM SECTION: SURVIVOR REGISTRY & ACTIVE RESCUE TEAMS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Survivor Registry Table */}
        <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              SURVIVOR REGISTRY ({survivors.length})
            </h3>
            <span className="text-xs text-slate-400">Database Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">STATUS</th>
                  <th className="pb-2">PRIORITY</th>
                  <th className="pb-2">CONF</th>
                  <th className="pb-2">GPS</th>
                  <th className="pb-2">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {survivors.map((s) => (
                  <tr key={s.survivor_id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 font-bold text-cyan-400">{s.survivor_id}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'RESCUED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-cyan-950 text-cyan-300 border border-cyan-800'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.priority === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-amber-950 text-amber-300'}`}>
                        {s.priority}
                      </span>
                    </td>
                    <td className="py-2.5 text-emerald-400 font-bold">{Math.round(s.fusion_confidence * 100)}%</td>
                    <td className="py-2.5 text-slate-400">{s.location_source==='UNLOCATED'?'Unavailable':`${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`}</td>
                    <td className="py-2.5">
                      {s.status !== 'RESCUED' && teams.length > 0 && (
                        <button
                          onClick={() => handleDispatchTeam(s, teams[0])}
                          className="theme-control px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] transition"
                        >
                          DISPATCH
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Rescue Teams */}
        <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              ACTIVE RESCUE TEAMS ({teams.length})
            </h3>
            <span className="text-xs text-slate-400">Ground Operation Units</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teams.map((t) => (
              <div key={t.team_id} className="theme-card p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-400">{t.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.status === 'AVAILABLE' ? 'bg-emerald-950 text-emerald-400' : 'bg-cyan-950 text-cyan-300'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">{t.vehicle} &bull; {t.members_count} Members</div>
                <div className="text-slate-500 text-[10px] truncate">{t.capabilities}</div>
                <div className="text-cyan-400 font-bold text-[11px] pt-1">
                  ETA: {t.eta_seconds}s
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. HIGH-RESOLUTION PHOTO SNAPSHOT INSPECTION MODAL */}
      {inspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="theme-card bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    SURVIVOR CAMERA SNAPSHOT &bull; {inspectModal.survivor?.survivor_id || inspectModal.alert?.survivor_id}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Live Optical RGB & Simulated Preview Dual-Spectrum Snapshot
                  </p>
                </div>
              </div>

              {/* Spectrum toggle & close button */}
              <div className="flex items-center gap-2">
                <div className="theme-card flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setInspectModal((prev) => prev ? { ...prev, mode: 'rgb' } : null)}
                    className={`theme-control px-3 py-1 rounded transition ${
                      inspectModal.mode === 'rgb' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    OPTICAL RGB
                  </button>
                  <button
                    onClick={() => setInspectModal((prev) => prev ? { ...prev, mode: 'thermal' } : null)}
                    className={`theme-control px-3 py-1 rounded transition ${
                      inspectModal.mode === 'thermal' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    SIMULATED PREVIEW
                  </button>
                </div>

                <button
                  onClick={() => setInspectModal(null)}
                  className="theme-control p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Image Area */}
            <div className="p-4 bg-black flex items-center justify-center overflow-auto flex-1 min-h-[300px]">
              <img
                src={
                  inspectModal.mode === 'thermal'
                    ? resolveSnapshotUrl(
                        inspectModal.survivor?.thermal_frame_path || inspectModal.alert?.thermal_snapshot_path,
                        inspectModal.survivor?.survivor_id || inspectModal.alert?.survivor_id,
                        true
                      )
                    : resolveSnapshotUrl(
                        inspectModal.survivor?.detection_frame_path || inspectModal.alert?.frame_snapshot_path,
                        inspectModal.survivor?.survivor_id || inspectModal.alert?.survivor_id,
                        false
                      )
                }
                alt="High-Resolution Survivor Snapshot"
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-2xl border border-slate-800"
              />
            </div>

            {/* Modal Footer Info */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">GPS LOCATION:</span>
                  <span className="text-cyan-300 font-bold">
                    {inspectModal.survivor?.latitude.toFixed(6)}° N, {inspectModal.survivor?.longitude.toFixed(6)}° E
                  </span>
                  <span className="text-slate-500">({inspectModal.survivor?.sector || 'Sector Bravo-4'})</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>Confidence: <strong className="text-emerald-400">{Math.round((inspectModal.survivor?.fusion_confidence || 0.95) * 100)}%</strong></span>
                  <span>Model: <strong className="text-cyan-400">YOLOv8s</strong></span>
                  <span>Status: <strong className="text-amber-400">{inspectModal.survivor?.status || 'CONFIRMED'}</strong></span>
                </div>
              </div>

              {teams.length > 0 && inspectModal.survivor && inspectModal.survivor.status !== 'RESCUED' && (
                <button
                  onClick={() => {
                    handleDispatchTeam(inspectModal.survivor!, teams[0]);
                    setInspectModal(null);
                  }}
                  className="theme-control px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-950/50"
                >
                  <Zap className="w-4 h-4" />
                  DISPATCH {teams[0].name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. UWB THROUGH-WALL RADAR SIGNAL PROCESSING MONITOR MODAL */}
      <RadarMonitorModal
        isOpen={isRadarOpen}
        onClose={() => setIsRadarOpen(false)}
        onAlertTriggered={(alert) => {
          setRadarAlert(alert);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
