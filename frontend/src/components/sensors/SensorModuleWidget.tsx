import React from 'react';
import { Camera, Thermometer, Radio, Compass, Navigation, ExternalLink, Activity } from 'lucide-react';
import type { RadarStatus } from '../../types/radar';

interface SensorModuleWidgetProps {
  radarStatus?: RadarStatus | null;
  cameraOnline?: boolean;
  onOpenRadar: () => void;
}

export const SensorModuleWidget: React.FC<SensorModuleWidgetProps> = ({
  radarStatus,
  cameraOnline = false,
  onOpenRadar,
}) => {
  const isRadarActive = radarStatus?.status === 'ACTIVE' || radarStatus?.tx_status === 'TRANSMITTING';
  const targetDetected = radarStatus?.target_status === 'POSSIBLE HUMAN';

  return (
    <div className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl font-mono text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <h3 className="font-bold text-slate-100 tracking-wider text-xs uppercase">
            RESCUE-AI SENSOR MODULE
          </h3>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
          {cameraOnline ? 'RGB CAMERA LIVE' : 'CAMERA OFFLINE'}
        </span>
      </div>

      {/* Sensor List */}
      <div className="space-y-2">
        {/* 1. RGB Camera */}
        <div className="theme-card flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[11px] text-slate-100">📷 RGB CAMERA</div>
              <div className="text-[10px] text-slate-500">Live RGB &bull; YOLO person detection</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cameraOnline ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
            <span className={`text-[10px] font-bold ${cameraOnline ? 'text-emerald-400' : 'text-red-400'}`}>
              {cameraOnline ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* 2. Thermal Camera */}
        <div className="theme-card flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
              <Thermometer className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[11px] text-slate-100">🌡️ THERMAL CAMERA</div>
              <div className="text-[10px] text-slate-500">False-color RGB &bull; No temperature sensor</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold text-amber-400">PREVIEW</span>
          </div>
        </div>

        {/* 3. UWB Through-Wall Radar - Clickable Interactive Element */}
        <button
          onClick={onOpenRadar}
          className={`theme-control w-full flex items-center justify-between p-2.5 rounded-lg border transition text-left group shadow-lg ${
            targetDetected
              ? 'bg-cyan-950/60 border-cyan-500 shadow-cyan-950/40 hover:bg-cyan-900/50'
              : 'bg-slate-950/90 border-cyan-500/40 hover:border-cyan-400 hover:bg-slate-900'
          }`}
          title="Click to open full UWB Radar Monitor"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-600/60 group-hover:scale-105 transition">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="font-black text-[11px] text-cyan-300 flex items-center gap-1.5">
                <span>📡 UWB RADAR</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-900/80 text-cyan-200 border border-cyan-700 font-normal">
                  CLICK TO MONITOR
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                Through-Wall RF Penetration &bull; Micro-Doppler {radarStatus ? `${radarStatus.estimated_range_m}m` : '8.4m'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <span className={`w-2 h-2 rounded-full ${isRadarActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-500'}`} />
                <span className="text-[10px] font-bold text-cyan-300">
                  {isRadarActive ? 'ACTIVE' : 'READY'}
                </span>
              </div>
              <div className="text-[9px] text-slate-500">PROTOTYPE MODE</div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400 opacity-60 group-hover:opacity-100 transition ml-1" />
          </div>
        </button>

        {/* 4. LiDAR */}
        <div className="theme-card flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/50">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[11px] text-slate-100">🔵 LiDAR</div>
              <div className="text-[10px] text-slate-500">3D Point Cloud &bull; Surface Rubble Profiling</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] font-bold text-blue-400">NOT CONNECTED</span>
          </div>
        </div>

        {/* 5. GPS */}
        <div className="theme-card flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[11px] text-slate-100">📍 GPS</div>
              <div className="text-[10px] text-slate-500">Demo map center &bull; 10.9364°N, 76.9558°E</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">SIMULATED</span>
          </div>
        </div>
      </div>
    </div>
  );
};
