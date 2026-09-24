import {backendUrl} from '../lib/backend-url';
import {CaptureStation} from '../components/CaptureStation';
import {useBrowserCamera} from '../lib/browser-camera-context';
import React, { useState } from 'react';
import { Eye, Cpu, Play, Pause, Camera, ShieldCheck, Layers, Trash2, Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { Survivor } from '../types';
import { api } from '../services/api';

interface AIDetectionPageProps {
  survivors: Survivor[];
  systemStatus?: any;
  onRefresh?: () => void;
}

export const AIDetectionPage: React.FC<AIDetectionPageProps> = ({ survivors, systemStatus, onRefresh }) => {
  const [isPaused, setIsPaused] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const deviceCamera=useBrowserCamera();
  const candidates = deviceCamera.active ? deviceCamera.tracks : systemStatus?.candidates || [];
  const [actionError, setActionError] = useState('');

  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear all snapshot history and alert records? Live camera detection will continue automatically.")) {
      return;
    }
    setIsClearing(true);
    try {
      await api.clearHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Clear history failed.');
    } finally {
      setIsClearing(false);
    }
  };

  const handleToggleCamera = async () => {
    try {
      await api.toggleCamera();
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Camera toggle failed.');
    }
  };

  const handleRetryCamera = async () => {
    try {
      await api.retryCamera();
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reconnect failed.');
    }
  };

  const confirmedCount = survivors.filter(s => s.status === 'CONFIRMED' || s.status === 'RESCUED').length;

  return (
    <div className="page-shell p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen">
      <CaptureStation/>
      {actionError && <p role="alert" className="text-red-400 text-xs">{actionError}</p>}
      {/* Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            AI COMPUTER VISION ENGINE &bull; DUAL STREAM INSPECTION
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Ultralytics YOLOv8s Inference &bull; Person Tracking &bull; Operator Verification Required</p>
        </div>

        {/* Model Status Card */}
        <div className="theme-card flex items-center gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <div>
            <span className="text-slate-400">MODEL:</span> <strong className="text-cyan-400">{systemStatus?.model_name || 'OFFLINE'}</strong>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div>
            <span className="text-slate-400">DEVICE:</span> <strong className="text-emerald-400">{systemStatus?.device?.toUpperCase() || 'CPU'}</strong>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div>
            <span className="text-slate-400">FPS:</span> <strong className="text-blue-400">{systemStatus?.fps ?? 0}</strong>
          </div>
        </div>
      </div>

      <details className="space-y-3"><summary className="cursor-pointer text-sm text-slate-400">Optional server-attached camera controls and streams</summary>
      {/* Overlay Toolbar Controls */}
      <div className="theme-card flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={deviceCamera.active} onClick={handleToggleCamera}
            className={`theme-control flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${systemStatus?.camera_enabled ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950' : 'bg-amber-600 hover:bg-amber-500 text-slate-950'}`}
          >
            <Camera className="w-4 h-4" />
            {systemStatus?.camera_enabled ? 'SERVER CAMERA ON' : 'SERVER CAMERA OFF'}
          </button>

          <button
            disabled={deviceCamera.active} onClick={handleRetryCamera}
            className="theme-control flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold transition border border-slate-700"
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            RECONNECT SERVER CAMERA
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="theme-control flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
          </button>
          
          <button
            onClick={() => setShowBoxes(!showBoxes)}
            className={`theme-control flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${showBoxes ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400'}`}
          >
            <Layers className="w-4 h-4" />
            {showBoxes ? 'HIDE BOUNDING BOXES' : 'SHOW BOUNDING BOXES'}
          </button>

          {/* CLEAR HISTORY BUTTON */}
          <button
            onClick={handleClearHistory}
            disabled={isClearing}
            className="theme-control flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-300 font-bold text-xs transition shadow-md"
          >
            <Trash2 className={`w-3.5 h-3.5 text-rose-400 ${isClearing ? 'animate-spin' : ''}`} />
            {isClearing ? 'CLEARING...' : 'CLEAR HISTORY'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-slate-400 text-xs">
          <div>FPS: <strong className="text-emerald-400">{systemStatus?.fps ?? 0}</strong></div>
          <div>YOLO CONF: <strong className="text-cyan-400">{Math.round((systemStatus?.confidence_threshold ?? 0) * 100)}%</strong></div>
          <div>PERSISTENCE: <strong className="text-blue-400">3 distinct frames</strong></div>
          <div>CONFIRMED SURVIVORS: <strong className="text-emerald-400">{confirmedCount}</strong></div>
        </div>
      </div>

      {/* Large Split-Screen View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stream 1: RGB Live View */}
        <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative space-y-2">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              RGB LIVE CAMERA
            </span>
            <span className="text-slate-400 text-[11px]">Primary Optical Feed</span>
          </div>
          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            {!isPaused ? <img
              key={`rgb-${systemStatus?.camera_online}-${showBoxes}`}
              src={backendUrl(`/api/video/rgb?boxes=${showBoxes}`)}
              alt="RGB Live Stream"
              className="w-full h-full object-contain"
            /> : <p className="text-white text-xs">Preview paused. Detection continues.</p>}
            <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur px-2 py-1 rounded border border-slate-800 text-[11px] text-cyan-300">
              RGB PERSON DETECTION &bull; {showBoxes ? 'BOXES ON' : 'BOXES OFF'}
            </div>
          </div>
        </div>

        {/* Stream 2: Thermal Simulation View */}
        <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative space-y-2">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-bold text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              FALSE-COLOR RGB PREVIEW
            </span>
            <span className="text-slate-400 text-[11px]">OpenCV COLORMAP_INFERNO</span>
          </div>
          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            {!isPaused ? <img
              key={`thermal-${systemStatus?.camera_online}-${showBoxes}`}
              src={backendUrl(`/api/video/thermal?boxes=${showBoxes}`)}
              alt="Thermal Simulation Stream"
              className="w-full h-full object-contain"
            /> : <p className="text-white text-xs">Preview paused. Detection continues.</p>}
            <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur px-2 py-1 rounded border border-slate-800 text-[11px] text-amber-400 font-bold">
              SIMULATED COLORS &bull; NO TEMPERATURE MEASUREMENT
            </div>
          </div>
        </div>
      </div>

      </details>
      {/* Candidate Multi-Modal Verification Matrix Panel */}
      <div className="theme-card bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Live Person Tracks & Persistence
            </h2>
          </div>
          <div className="text-xs text-slate-400">
            Active Candidates Tracked: <strong className="text-cyan-300">{candidates.length}</strong>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          {systemStatus?.tracking?.method || 'Waiting for tracking status'} · Tracks retained for {systemStatus?.tracking?.lost_track_timeout_seconds ?? 5}s after a missed detection.
          Boxes and trails are aligned to the inference frame. A saved track returning within this window does not create a second alert.
        </p>
        {candidates.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 space-y-1">
            <ShieldCheck className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-400 font-bold">No active person candidates in the current frame.</p>
            <p className="text-slate-600">Enable the camera and keep a person in view for several frames.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {candidates.map((cand: import('../types').CandidateTrack, idx: number) => {
              const state = cand.state || 'CANDIDATE';
              const isConfirmed = state === 'CONFIRMED_SURVIVOR' || state === 'CONFIRMED';
              const isLikely = state === 'LIKELY_SURVIVOR';
              const isVerifying = state === 'VERIFYING';
              const isRejected = state === 'REJECTED';

              const badgeColor = isConfirmed
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : isLikely
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : isVerifying
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : isRejected
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : 'bg-blue-500/20 text-blue-300 border-blue-500/40';

              const badgeIcon = isConfirmed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
              ) : isVerifying ? (
                <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              ) : isRejected ? (
                <XCircle className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              );

              return (
                <div
                  key={cand.id}
                  className={`theme-card bg-slate-950/80 rounded-lg p-4 border transition hover:border-slate-700 space-y-3 ${isConfirmed ? 'border-rose-900/60' : 'border-slate-800'}`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      TRACK #{cand.track_id || idx + 1}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                      {badgeIcon}
                      {state.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 break-all">{cand.id}</div>
                  <p className="text-xs text-slate-300">{cand.observed_frames ?? 0} observations · {cand.alert_saved ? 'Alert saved' : 'Verifying before alert'}</p>
                  {/* Final Confidence Highlight */}
                  <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded border border-slate-800/80 text-xs">
                    <span className="text-slate-400">Person Confidence:</span>
                    <span className={`font-bold text-sm ${cand.final_confidence >= 0.76 ? 'text-emerald-400' : cand.final_confidence >= 0.58 ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {Math.round((cand.final_confidence || cand.confidence || 0) * 100)}%
                    </span>
                  </div>

                  {/* Multi-modal score progress bars */}
                  <div className="space-y-1.5 text-[11px]">
                    {/* YOLO Score */}
                    <div className="flex justify-between items-center text-slate-400">
                      <span>YOLO Detection:</span>
                      <span className="font-bold text-slate-300">{Math.round((cand.yolo_confidence || 0) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${Math.round((cand.yolo_confidence || 0) * 100)}%` }} />
                    </div>

                    {/* Temporal Persistence Score */}
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Temporal Persistence:</span>
                      <span className="font-bold text-slate-300">{Math.round((cand.temporal_score || 0) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round((cand.temporal_score || 0) * 100)}%` }} />
                    </div>

                  </div>

                  {/* Decision Reason */}
                  <div className="pt-2 border-t border-slate-900 text-[11px]">
                    <span className="text-slate-500">Reason: </span>
                    <span className="text-slate-300 font-medium">{cand.reason || 'Candidate detection undergoing multi-frame verification'}</span>
                    {cand.rejection_code && cand.rejection_code !== 'NONE' && (
                      <div className="mt-1 text-[10px] text-rose-400 font-bold">
                        CODE: {cand.rejection_code}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
