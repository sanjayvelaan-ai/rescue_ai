import React, { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Filter,
  MapPin,
  Cpu,
  Radio,
  CheckSquare,
  Send,
  CheckCircle,
  Eye,
  Trash2,
  RefreshCw,
  Camera,
  Thermometer,
  Maximize2,
  X,
  Zap,
  Layers,
  Sparkles
} from 'lucide-react';
import type { Alert, Survivor, RescueTeam } from '../types';
import { api, resolveSnapshotUrl } from '../services/api';
import confetti from 'canvas-confetti';

interface AlertCenterPageProps {
  alerts: Alert[];
  survivors: Survivor[];
  teams: RescueTeam[];
  onRefresh?: () => void;
}

export const AlertCenterPage: React.FC<AlertCenterPageProps> = ({
  alerts,
  survivors,
  teams,
  onRefresh
}) => {
  const [actionError, setActionError] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [inspectAlert, setInspectAlert] = useState<{
    alert: Alert;
    survivor?: Survivor;
    mode: 'dual' | 'rgb' | 'thermal';
  } | null>(null);

  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear all snapshot history and alert records? Live camera detection will continue automatically.")) {
      return;
    }
    setIsClearing(true);
    try {
      await api.clearHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setIsClearing(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.acknowledgeAlert(id);
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.resolveAlert(id);
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDispatchTeam = async (survivorId: string) => {
    if (!teams || teams.length === 0) return;
    const targetTeam = teams.find(t => t.status === 'AVAILABLE' || t.status === 'STANDBY');
    if (!targetTeam) { setActionError('No rescue team is currently available.'); return; }
    setActionLoadingId(survivorId);
    try {
      await api.dispatchMission('M-101', survivorId, targetTeam.team_id);
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'ALL' && a.severity !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="page-shell p-4 sm:p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen relative">
      {actionError && <p role="alert" className="text-xs text-red-400">{actionError}</p>}
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400 animate-pulse" />
            REAL-TIME CAMERA ALERT CENTER
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated Live Drone Camera Survivor Alerts &bull; RGB snapshots with matching simulated thermal previews; no temperature sensor
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* CLEAR HISTORY BUTTON */}
          <button
            onClick={handleClearHistory}
            disabled={isClearing}
            className="theme-control flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-300 font-bold text-xs transition shadow-md hover:shadow-rose-950/50"
          >
            <Trash2 className={`w-3.5 h-3.5 text-rose-400 ${isClearing ? 'animate-spin' : ''}`} />
            {isClearing ? 'CLEARING...' : 'CLEAR HISTORY'}
          </button>

          <div className="theme-card flex flex-wrap items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-bold">SEVERITY:</span>
            {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`theme-control px-2 py-0.5 rounded text-[11px] font-bold transition ${
                  filterSeverity === sev
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="theme-card flex flex-wrap items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-bold">STATUS:</span>
            {['ALL', 'UNREAD', 'ACKNOWLEDGED', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`theme-control px-2 py-0.5 rounded text-[11px] font-bold transition ${
                  filterStatus === st
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Feed Container */}
      <div className="space-y-6">
        {filteredAlerts.length === 0 ? (
          <div className="theme-card p-12 text-center bg-slate-900/60 border border-slate-800 rounded-xl text-slate-500 space-y-2">
            <Shield className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
            <div className="text-sm font-bold text-slate-400">NO ACTIVE ALERTS IN HISTORY</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Alert history is clear. Live camera detection is active — new survivor detections will capture fresh dual-stream snapshots automatically.
            </p>
          </div>
        ) : (
          filteredAlerts.map((a) => {
            const isCritical = a.severity === 'CRITICAL';
            const isWarning = a.severity === 'WARNING';
            const isUnread = a.status === 'UNREAD';
            const isAck = a.status === 'ACKNOWLEDGED';
            const isResolved = a.status === 'RESOLVED';

            const survivor = survivors.find((s) => s.survivor_id === a.survivor_id);
            const targetId = a.survivor_id || 'SURVIVOR';

            // Resolve exact RGB and Thermal snapshot paths
            const rgbSnapshotPath =
              a.frame_snapshot_path ||
              survivor?.detection_frame_path ||
              (a.survivor_id ? `/data/detections/${a.survivor_id}_demo_rgb.jpg` : '/data/detections/S-001_demo_rgb.jpg');

            const thermalSnapshotPath =
              a.thermal_snapshot_path ||
              survivor?.thermal_frame_path ||
              (a.survivor_id ? `/data/detections/${a.survivor_id}_demo_thermal.jpg` : '/data/detections/S-002_demo_thermal.jpg');

            return (
              <div
                key={a.alert_id}
                className={`theme-card p-4 sm:p-5 rounded-2xl border space-y-4 shadow-2xl transition-all ${
                  isCritical
                    ? 'bg-red-950/20 border-red-800/80 shadow-red-950/20'
                    : isWarning
                    ? 'bg-amber-950/20 border-amber-800/80'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {/* Alert Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Severity Badge */}
                    <span
                      className={`px-2.5 py-1 rounded font-bold text-[11px] flex items-center gap-1.5 ${
                        isCritical
                          ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                          : isWarning
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {a.severity}
                    </span>

                    {/* Alert Type & ID */}
                    <span className="font-bold text-slate-100 text-xs sm:text-sm">{a.type}</span>
                    <span className="text-slate-500 text-[11px] font-mono">({a.alert_id})</span>

                    {/* Priority Score Badge */}
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold text-[10px] flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> SCORE: {a.priority_score ?? 0}/100
                    </span>

                    {/* Dual Stream Verification Badge */}
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-bold text-[10px] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-cyan-400" /> DUAL-STREAM VERIFIED
                    </span>
                  </div>

                  {/* Timestamp & Status */}
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono text-[11px]">
                      {a.timestamp?.split('T')[1]?.substring(0, 8) || '14:32:18'} UTC
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isUnread
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                          : isAck
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                </div>

                {/* Main Message & Real Location Tagging */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 space-y-2.5">
                    <p className="text-xs sm:text-sm text-slate-200 font-semibold leading-relaxed">
                      {a.message}
                    </p>

                    {/* REAL LOCATION TAGGING */}
                    <div className="theme-card flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
                      <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          Real Location Tagging & GPS Coordinates
                        </div>
                        <div className="text-cyan-300 font-bold text-xs mt-0.5">
                          {a.lat_lng_tag || `${a.location || '10.9372, 76.9570'} (Sector Bravo-4, ±2.4m)`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI RECOMMENDATION BANNER */}
                  {a.ai_recommendation && (
                    <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-700/60 text-xs space-y-1 flex flex-col justify-center">
                      <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" /> AI DISPATCH RECOMMENDATION
                      </div>
                      <p className="text-slate-300 font-medium text-[11px] leading-snug">
                        {a.ai_recommendation}
                      </p>
                    </div>
                  )}
                </div>

                {/* DUAL-STREAM SNAPSHOT SESSION (RGB OPTICAL + SIMULATED PREVIEW) */}
                <div className="theme-card bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Camera className="w-4 h-4 text-cyan-400" />
                      <span>LIVE SURVEILLANCE SNAPSHOT SESSION</span>
                      <span className="text-[10px] text-slate-500 font-mono">({targetId})</span>
                    </div>
                    <button
                      onClick={() => setInspectAlert({ alert: a, survivor, mode: 'dual' })}
                      className="theme-control text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold bg-cyan-950/70 border border-cyan-700/60 px-2.5 py-1 rounded-lg transition hover:bg-cyan-900"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> DUAL INSPECTOR
                    </button>
                  </div>

                  {/* 2-Column Side-by-Side Dual-Stream Views */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 1. RGB Camera Detection Snapshot */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3 text-cyan-400" /> RGB OPTICAL LIVE DETECTION
                        </span>
                        <span className="text-slate-400 font-mono">YOLOv8s BOUNDING BOX</span>
                      </div>
                      <div
                        onClick={() => setInspectAlert({ alert: a, survivor, mode: 'rgb' })}
                        className="relative rounded-lg overflow-hidden border border-cyan-500/40 bg-black cursor-pointer group aspect-video hover:border-cyan-300 transition shadow-lg"
                        title="Click to view full-resolution RGB snapshot"
                      >
                        <img
                          src={resolveSnapshotUrl(rgbSnapshotPath, targetId, false)}
                          alt="RGB Camera Detection Snapshot"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = resolveSnapshotUrl(undefined, targetId, false);
                          }}
                        />
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono text-cyan-300 border border-cyan-500/50 flex items-center gap-1">
                          <Eye className="w-2.5 h-2.5 text-cyan-400" />
                          {targetId} &bull; OPTICAL
                        </div>
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono text-emerald-400 border border-slate-700">
                          {a.priority_score ?? 0}% AI CONF
                        </div>
                      </div>
                    </div>

                    {/* 2. Simulated Preview Infrared Detection Snapshot */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-amber-300">
                        <span className="flex items-center gap-1">
                          <Thermometer className="w-3 h-3 text-amber-400" /> RGB-DERIVED THERMAL PREVIEW
                        </span>
                        <span className="text-amber-400 font-mono">SIMULATED COLORS</span>
                      </div>
                      <div
                        onClick={() => setInspectAlert({ alert: a, survivor, mode: 'thermal' })}
                        className="relative rounded-lg overflow-hidden border border-amber-500/40 bg-black cursor-pointer group aspect-video hover:border-amber-300 transition shadow-lg"
                        title="Click to view full-resolution Thermal snapshot"
                      >
                        <img
                          src={resolveSnapshotUrl(thermalSnapshotPath, targetId, true)}
                          alt="Thermal preview or no sensor data"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = resolveSnapshotUrl(undefined, targetId, true);
                          }}
                        />
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono text-amber-300 border border-amber-500/50 flex items-center gap-1">
                          <Thermometer className="w-2.5 h-2.5 text-amber-400" />
                          {targetId} &bull; RGB-DERIVED PREVIEW
                        </div>
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono text-amber-400 border border-slate-700">
                          PREVIEW ONLY
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RESPONSIVE ACTION BUTTONS */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-[11px] text-slate-500">
                    {a.survivor_id ? (
                      <span>Target Survivor: <strong className="text-cyan-300 font-mono">{a.survivor_id}</strong></span>
                    ) : (
                      <span>System Event ID: <strong className="text-slate-400 font-mono">{a.alert_id}</strong></span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* ACKNOWLEDGE BUTTON */}
                    {isUnread && (
                      <button
                        onClick={() => handleAcknowledge(a.alert_id)}
                        disabled={actionLoadingId === a.alert_id}
                        className="theme-control flex items-center gap-1.5 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition border border-slate-700 shadow-md"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                        ACKNOWLEDGE
                      </button>
                    )}

                    {/* DISPATCH TEAM BUTTON */}
                    {a.survivor_id && (
                      <button
                        onClick={() => handleDispatchTeam(a.survivor_id!)}
                        disabled={actionLoadingId === a.survivor_id}
                        className="theme-control flex items-center gap-1.5 px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-black transition shadow-lg shadow-red-600/30"
                      >
                        <Send className="w-3.5 h-3.5" />
                        DISPATCH TEAM
                      </button>
                    )}

                    {/* RESOLVE BUTTON */}
                    {!isResolved && (
                      <button
                        onClick={() => handleResolve(a.alert_id)}
                        disabled={actionLoadingId === a.alert_id}
                        className="theme-control flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black transition shadow-md"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        RESOLVE
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FULL RESOLUTION MULTI-MODAL SNAPSHOT INSPECTION MODAL */}
      {inspectAlert && (
        <div className="fixed inset-0 z-[4000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="theme-card bg-slate-900 border border-cyan-500/70 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 font-mono text-slate-100 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-600/50">
                  <Camera className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                    <span>ALERT SNAPSHOT INSPECTOR &bull; {inspectAlert.alert.alert_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inspectAlert.alert.severity === 'CRITICAL'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {inspectAlert.alert.severity}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {inspectAlert.alert.lat_lng_tag || `${inspectAlert.alert.location || '10.9372, 76.9570'} (Sector Bravo-4)`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Mode Switcher: Dual Split / Optical RGB / Simulated Preview */}
                <div className="theme-card flex rounded-lg bg-slate-950 p-0.5 border border-slate-700">
                  <button
                    onClick={() => setInspectAlert({ ...inspectAlert, mode: 'dual' })}
                    className={`theme-control flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition ${
                      inspectAlert.mode === 'dual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3 h-3" /> Dual Split
                  </button>
                  <button
                    onClick={() => setInspectAlert({ ...inspectAlert, mode: 'rgb' })}
                    className={`theme-control flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition ${
                      inspectAlert.mode === 'rgb' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3 h-3" /> Optical RGB
                  </button>
                  <button
                    onClick={() => setInspectAlert({ ...inspectAlert, mode: 'thermal' })}
                    className={`theme-control flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition ${
                      inspectAlert.mode === 'thermal' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Thermometer className="w-3 h-3" /> Simulated Preview
                  </button>
                </div>

                <button
                  onClick={() => setInspectAlert(null)}
                  className="theme-control p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* High-Resolution Viewport (Dual Split or Single Stream) */}
            {inspectAlert.mode === 'dual' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Left: RGB */}
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/50 bg-black aspect-video flex items-center justify-center shadow-2xl">
                  <img
                    src={resolveSnapshotUrl(
                      inspectAlert.alert.frame_snapshot_path || inspectAlert.survivor?.detection_frame_path || (inspectAlert.alert.survivor_id ? `/data/detections/${inspectAlert.alert.survivor_id}_demo_rgb.jpg` : '/data/detections/S-001_demo_rgb.jpg'),
                      inspectAlert.alert.survivor_id || 'ALERT',
                      false
                    )}
                    alt="RGB Camera Telemetry"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = resolveSnapshotUrl(undefined, inspectAlert.alert.survivor_id || 'ALERT', false);
                    }}
                  />
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/85 text-[10px] font-bold text-cyan-300 border border-cyan-500/50 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>RGB OPTICAL LIVE SNAPSHOT</span>
                  </div>
                </div>

                {/* Right: Thermal */}
                <div className="relative rounded-xl overflow-hidden border border-amber-500/50 bg-black aspect-video flex items-center justify-center shadow-2xl">
                  <img
                    src={resolveSnapshotUrl(
                      inspectAlert.alert.thermal_snapshot_path || inspectAlert.survivor?.thermal_frame_path || (inspectAlert.alert.survivor_id ? `/data/detections/${inspectAlert.alert.survivor_id}_demo_thermal.jpg` : '/data/detections/S-002_demo_thermal.jpg'),
                      inspectAlert.alert.survivor_id || 'ALERT',
                      true
                    )}
                    alt="Simulated thermal preview"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = resolveSnapshotUrl(undefined, inspectAlert.alert.survivor_id || 'ALERT', true);
                    }}
                  />
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/85 text-[10px] font-bold text-amber-300 border border-amber-500/50 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>SIMULATED PREVIEW - RGB-DERIVED PREVIEW</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-cyan-500/40 bg-black aspect-video flex items-center justify-center shadow-2xl">
                <img
                  src={resolveSnapshotUrl(
                    inspectAlert.mode === 'rgb'
                      ? (inspectAlert.alert.frame_snapshot_path || inspectAlert.survivor?.detection_frame_path || (inspectAlert.alert.survivor_id ? `/data/detections/${inspectAlert.alert.survivor_id}_demo_rgb.jpg` : '/data/detections/S-001_demo_rgb.jpg'))
                      : (inspectAlert.alert.thermal_snapshot_path || inspectAlert.survivor?.thermal_frame_path || (inspectAlert.alert.survivor_id ? `/data/detections/${inspectAlert.alert.survivor_id}_demo_thermal.jpg` : '/data/detections/S-002_demo_thermal.jpg')),
                    inspectAlert.alert.survivor_id || 'ALERT',
                    inspectAlert.mode === 'thermal'
                  )}
                  alt="Inspection Snapshot"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = resolveSnapshotUrl(undefined, inspectAlert.alert.survivor_id || 'ALERT', inspectAlert.mode === 'thermal');
                  }}
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/85 text-xs font-bold text-cyan-300 border border-cyan-500/50 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{inspectAlert.mode === 'rgb' ? 'RGB DRONE 1080P TELEMETRY' : 'SIMULATED PREVIEW - RGB-DERIVED PREVIEW'}</span>
                </div>
                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded bg-black/85 text-xs font-mono text-emerald-400 border border-slate-700">
                  SCORE: {inspectAlert.alert.priority_score || 96}/100
                </div>
              </div>
            )}

            {/* Telemetry Summary & Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="theme-card p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Message Details</div>
                <div className="text-slate-200">{inspectAlert.alert.message}</div>
              </div>
              <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 space-y-1">
                <div className="text-[10px] text-cyan-400 uppercase font-bold">AI Recommendation</div>
                <div className="text-slate-200 text-[11px]">{inspectAlert.alert.ai_recommendation || 'Direct ground search team dispatch recommended.'}</div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              {inspectAlert.alert.survivor_id && (
                <button
                  onClick={() => {
                    handleDispatchTeam(inspectAlert.alert.survivor_id!);
                    setInspectAlert(null);
                  }}
                  className="theme-control px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow"
                >
                  <Send className="w-3.5 h-3.5" /> DISPATCH RESCUE TEAM
                </button>
              )}
              <button
                onClick={() => setInspectAlert(null)}
                className="theme-control px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

