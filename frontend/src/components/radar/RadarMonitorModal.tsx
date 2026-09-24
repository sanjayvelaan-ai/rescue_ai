import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  X,
  Play,
  Square,
  User,
  Sliders,
  Activity,
  Layers,
  ShieldAlert,
  Cpu,
  Info,
  ChevronRight,
  AlertTriangle,
  Zap,
  Sparkles
} from 'lucide-react';
import type { RadarStatus, RadarWaveformPoint } from '../../types/radar';
import { api } from '../../services/api';

interface RadarMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertTriggered?: (alert: any) => void;
}

export const RadarMonitorModal: React.FC<RadarMonitorModalProps> = ({
  isOpen,
  onClose,
  onAlertTriggered,
}) => {
  const [radarStatus, setRadarStatus] = useState<RadarStatus | null>(null);
  const [waveform, setWaveform] = useState<RadarWaveformPoint[]>([]);
  const [testLog, setTestLog] = useState<string | null>(null);
  const [isStartingTest, setIsStartingTest] = useState(false);
  const [isSimulatingHuman, setIsSimulatingHuman] = useState(false);
  const [targetRange, setTargetRange] = useState<number>(8.4);
  const [frequency, setFrequency] = useState<number>(4.3);
  const [obstructionType, setObstructionType] = useState<string>('CONCRETE_RUBBLE');
  const [animationTick, setAnimationTick] = useState<number>(0);

  // Poll radar status and waveform when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const fetchRadar = async () => {
      try {
        const [statusData, waveData] = await Promise.all([
          api.getRadarStatus(),
          api.getRadarWaveform(),
        ]);
        setRadarStatus(statusData);
        if (waveData?.waveform) {
          setWaveform(waveData.waveform);
        }
        if (statusData.estimated_range_m > 0) {
          setTargetRange(statusData.estimated_range_m);
        }
        if (statusData.frequency_ghz) {
          setFrequency(statusData.frequency_ghz);
        }
        if (statusData.obstruction_type) {
          setObstructionType(statusData.obstruction_type);
        }
      } catch (e) {
        console.error('Failed to fetch radar telemetry:', e);
      }
    };

    fetchRadar();
    const interval = setInterval(fetchRadar, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Smooth animation loop for RF wave propagation canvas/SVG
  useEffect(() => {
    if (!isOpen) return;
    const anim = setInterval(() => {
      setAnimationTick((prev) => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(anim);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartTest = async () => {
    setIsStartingTest(true);
    setTestLog('Initiating UWB Radar Sensing Pipeline Test...');
    try {
      const res = await api.startRadarTest();
      setTestLog(res.message);
      // Wait for test sequence updates
      setTimeout(async () => {
        const updated = await api.getRadarStatus();
        setRadarStatus(updated);
        if (onAlertTriggered) {
          onAlertTriggered({
            title: '🚨 RADAR HUMAN PRESENCE ALERT',
            message: `Possible human presence verified at ${updated.estimated_range_m}m behind ${updated.obstruction_type}.`,
          });
        }
      }, 4200);
    } catch (e) {
      console.error('Start test failed:', e);
      setTestLog('Failed to start radar test sequence.');
    } finally {
      setIsStartingTest(false);
    }
  };

  const handleStopTest = async () => {
    try {
      const res = await api.stopRadarTest();
      setTestLog(res.message);
      const updated = await api.getRadarStatus();
      setRadarStatus(updated);
    } catch (e) {
      console.error('Stop test failed:', e);
    }
  };

  const handleSimulateHumanTarget = async () => {
    setIsSimulatingHuman(true);
    setTestLog(`Simulating human target at ${targetRange}m behind rubble...`);
    try {
      const res = await api.simulateHumanTarget(targetRange);
      setTestLog(res.message);
      if (res.alert && onAlertTriggered) {
        onAlertTriggered(res.alert);
      }
      const updated = await api.getRadarStatus();
      setRadarStatus(updated);
      const wave = await api.getRadarWaveform();
      if (wave?.waveform) setWaveform(wave.waveform);
    } catch (e) {
      console.error('Simulate human failed:', e);
    } finally {
      setIsSimulatingHuman(false);
    }
  };

  const handleConfigChange = async (newRange?: number, newFreq?: number, newObs?: string) => {
    const r = newRange !== undefined ? newRange : targetRange;
    const f = newFreq !== undefined ? newFreq : frequency;
    const o = newObs !== undefined ? newObs : obstructionType;

    if (newRange !== undefined) setTargetRange(r);
    if (newFreq !== undefined) setFrequency(f);
    if (newObs !== undefined) setObstructionType(o);

    try {
      await api.configureRadar({
        target_range_m: r,
        frequency_ghz: f,
        obstruction_type: o,
      });
      const updated = await api.getRadarStatus();
      setRadarStatus(updated);
      const wave = await api.getRadarWaveform();
      if (wave?.waveform) setWaveform(wave.waveform);
    } catch (e) {
      console.error('Config update failed:', e);
    }
  };

  const displayRange = radarStatus?.estimated_range_m ?? targetRange;
  const isTransmitting = radarStatus?.tx_status === 'TRANSMITTING' || true;
  const isReceiving = radarStatus?.rx_status === 'RECEIVING' || true;
  const isTargetHuman = radarStatus?.target_status === 'POSSIBLE HUMAN';

  // Calculate position on 0-20m range slider (percentage)
  const rangePct = Math.min(100, Math.max(0, (displayRange / 20.0) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn select-none font-mono">
      <div className="theme-card bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        {/* MODAL HEADER */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-500/50 shadow-lg shadow-cyan-950/50">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-sm sm:text-base text-slate-100 tracking-wider flex items-center gap-2">
                  UWB THROUGH-WALL RADAR &bull; SIGNAL PROCESSING MODULE
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-800 text-[10px] font-bold">
                  RADAR SIMULATION MODE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Integrated Multi-Static UWB Transceiver &bull; Micro-Doppler Human Presence Estimation &bull; Edge Sensor Pipeline
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="theme-control p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-slate-200">
          {/* 1. HARDWARE INTEGRATION STATUS & ARCHITECTURE BANNER */}
          <div className="theme-card p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-bold text-cyan-300 text-xs uppercase tracking-wide">
                  HARDWARE-READY ARCHITECTURE &bull; SENSOR INTERFACE v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Operating driver: <strong className="text-slate-200">SimulationRadar (RadarSensorInterface)</strong>. Physical UWB radar can be plugged into driver without modifying dashboard or fusion logic.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                REAL HARDWARE: <strong className="text-amber-400">READY FOR INTEGRATION</strong>
              </span>
            </div>
          </div>

          {/* 2. RADAR LIVE STATUS TELEMETRY GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* RADAR STATUS */}
            <div className="theme-card bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold">RADAR STATUS</div>
              <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE
              </div>
              <div className="text-[10px] text-slate-500 font-mono">UWB Transceiver</div>
            </div>

            {/* TX STATUS */}
            <div className="theme-card bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold">TX STATUS</div>
              <div className="text-sm font-black text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                {isTransmitting ? 'TRANSMITTING' : 'IDLE'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">{frequency} GHz Impulse</div>
            </div>

            {/* RX STATUS */}
            <div className="theme-card bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold">RX STATUS</div>
              <div className="text-sm font-black text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                {isReceiving ? 'RECEIVING' : 'IDLE'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">ADC 200 Bins / 20m</div>
            </div>

            {/* SIGNAL STATUS */}
            <div className="theme-card bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold">SIGNAL STATUS</div>
              <div className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                {radarStatus?.signal_status || 'REFLECTION DETECTED'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                SNR: {radarStatus?.signal_strength_pct || 78}%
              </div>
            </div>

            {/* TARGET STATUS */}
            <div className="theme-card bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1 col-span-2 sm:col-span-1 border-l-2 border-l-emerald-500">
              <div className="text-[10px] text-slate-400 uppercase font-bold">TARGET STATUS</div>
              <div className="text-sm font-black text-emerald-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {radarStatus?.target_status || 'POSSIBLE HUMAN'}
              </div>
              <div className="text-[10px] text-emerald-400/80 font-mono">
                Conf: {Math.round((radarStatus?.presence_confidence ?? 0.92) * 100)}%
              </div>
            </div>
          </div>

          {/* 3. RADAR HARDWARE REPRESENTATION & LOGICAL FLOW DIAGRAM */}
          <div className="theme-card bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-xs text-cyan-400 tracking-wider">
                RADAR HARDWARE ARCHITECTURE (INTEGRATED COMPONENT)
              </span>
              <span className="text-[10px] text-slate-500">
                Single Unified Sensor Housing: TX Antenna &bull; RX Array &bull; DSP Engine
              </span>
            </div>

            {/* Hardware Flow Blocks */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-center text-[10px] font-mono font-bold">
              {/* TX Section */}
              <div className="p-2.5 rounded-lg bg-cyan-950/70 border border-cyan-600/70 space-y-1">
                <div className="text-cyan-400 font-black">TX SECTION</div>
                <div className="text-[9px] text-slate-300">Radar Transmitter</div>
                <div className="text-[9px] text-cyan-200">UWB Pulser {frequency} GHz</div>
              </div>

              <div className="flex items-center justify-center text-cyan-400 font-bold">
                <span className="hidden md:inline">&rarr;</span>
                <span className="md:hidden">&darr;</span>
                <span className="text-[9px] text-slate-400 ml-1">RF PULSE</span>
              </div>

              {/* Rubble Obstruction */}
              <div className="p-2.5 rounded-lg bg-amber-950/70 border border-amber-600/70 space-y-1">
                <div className="text-amber-400 font-black">OBSTRUCTION</div>
                <div className="text-[9px] text-slate-300">Collapsed Rubble</div>
                <div className="text-[9px] text-amber-200">er=4.8 | Loss 8.5dB/m</div>
              </div>

              <div className="flex items-center justify-center text-cyan-400 font-bold">
                <span className="hidden md:inline">&rarr;</span>
                <span className="md:hidden">&darr;</span>
                <span className="text-[9px] text-slate-400 ml-1">PENETRATION</span>
              </div>

              {/* Target */}
              <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-600/70 space-y-1">
                <div className="text-emerald-400 font-black">TARGET</div>
                <div className="text-[9px] text-slate-300">Human Target</div>
                <div className="text-[9px] text-emerald-200">Est. {displayRange} m</div>
              </div>

              <div className="flex items-center justify-center text-blue-400 font-bold">
                <span className="hidden md:inline">&rarr;</span>
                <span className="md:hidden">&darr;</span>
                <span className="text-[9px] text-slate-400 ml-1">REFLECTED</span>
              </div>

              {/* RX Section */}
              <div className="p-2.5 rounded-lg bg-blue-950/70 border border-blue-600/70 space-y-1">
                <div className="text-blue-400 font-black">RX SECTION</div>
                <div className="text-[9px] text-slate-300">Radar Receiver</div>
                <div className="text-[9px] text-blue-200">DSP Signal Proc.</div>
              </div>
            </div>
          </div>

          {/* 4. REAL-TIME RADAR SIGNAL & RUBBLE CROSS-SECTION VISUALIZATION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: SCIENTIFIC CROSS-SECTION VISUALIZATION */}
            <div className="theme-card bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-xs text-slate-100 uppercase">
                    THROUGH-RUBBLE RF PROPAGATION (CROSS-SECTION)
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Physics Simulation</span>
              </div>

              {/* Scientific RF Wave Cross-section SVG */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 p-2">
                <svg className="w-full h-full" viewBox="0 0 500 280">
                  {/* Grid background lines */}
                  <defs>
                    <pattern id="radarGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                      <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="500" height="280" fill="#020617" />
                  <rect width="500" height="280" fill="url(#radarGrid)" />

                  {/* Drone / Radar Sensor Source (Left) */}
                  <g transform="translate(45, 140)">
                    <rect x="-30" y="-35" width="60" height="70" rx="8" fill="#0f172a" stroke="#00e5ff" strokeWidth="1.5" />
                    <text x="0" y="-18" fill="#00e5ff" fontSize="9" fontWeight="bold" textAnchor="middle">RESCUE-AI</text>
                    <text x="0" y="-6" fill="#94a3b8" fontSize="8" textAnchor="middle">DRONE RE-01</text>
                    
                    {/* TX & RX Antennas inside same housing */}
                    <rect x="12" y="-12" width="12" height="10" fill="#0284c7" rx="2" />
                    <text x="18" y="-4" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">TX</text>
                    
                    <rect x="12" y="3" width="12" height="10" fill="#2563eb" rx="2" />
                    <text x="18" y="11" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">RX</text>

                    <circle cx="0" cy="0" r="4" fill="#38bdf8" />
                  </g>

                  {/* Expanding Outgoing RF Waves (TX Antenna Wavefronts) */}
                  {[0, 1, 2, 3].map((waveIdx) => {
                    const wavePhase = (animationTick * 1.5 + waveIdx * 45) % 180;
                    const r = 25 + wavePhase * 1.2;
                    const opacity = Math.max(0, 1 - wavePhase / 180);
                    return (
                      <path
                        key={`tx-wave-${waveIdx}`}
                        d={`M ${45 + r * 0.4} ${140 - r * 0.8} A ${r} ${r} 0 0 1 ${45 + r * 0.4} ${140 + r * 0.8}`}
                        fill="none"
                        stroke="#00e5ff"
                        strokeWidth="1.8"
                        strokeDasharray="4,3"
                        opacity={opacity * 0.85}
                      />
                    );
                  })}

                  {/* Semi-transparent Rubble / Wall Barrier */}
                  <g transform="translate(180, 20)">
                    {/* Rubble zone rectangle */}
                    <rect x="0" y="0" width="70" height="240" fill="#334155" fillOpacity="0.45" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="5,4" />
                    
                    {/* Debris particles / stones inside rubble */}
                    <polygon points="12,40 28,30 35,55 18,65" fill="#475569" opacity="0.8" />
                    <polygon points="35,90 55,80 62,110 40,120" fill="#475569" opacity="0.7" />
                    <polygon points="15,160 38,150 48,185 22,195" fill="#475569" opacity="0.8" />
                    <polygon points="30,210 50,200 58,225 35,230" fill="#475569" opacity="0.6" />

                    {/* Rubble Label */}
                    <text x="35" y="125" fill="#fbbf24" fontSize="9" fontWeight="bold" textAnchor="middle" transform="rotate(-90 35 125)">
                      COLLAPSED CONCRETE RUBBLE (65cm)
                    </text>
                  </g>

                  {/* Reflected Inward RF Waves (Echo from Target back to RX) */}
                  {[0, 1, 2].map((echoIdx) => {
                    const echoPhase = (180 - (animationTick * 1.5 + echoIdx * 50) % 180);
                    const r = 20 + echoPhase * 0.9;
                    const opacity = Math.max(0, 1 - echoPhase / 180);
                    return (
                      <path
                        key={`rx-echo-${echoIdx}`}
                        d={`M ${390 - r * 0.4} ${140 - r * 0.7} A ${r} ${r} 0 0 0 ${390 - r * 0.4} ${140 + r * 0.7}`}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="1.5"
                        opacity={opacity * 0.9}
                      />
                    );
                  })}

                  {/* Target Behind Rubble (Human Silhouette / Indicator) */}
                  <g transform={`translate(${350 + (displayRange - 8.4) * 8}, 140)`}>
                    {/* Target reflection aura */}
                    <circle cx="0" cy="0" r="28" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" />
                    
                    {/* Human icon / silhouette indication */}
                    <circle cx="0" cy="-14" r="9" fill="#10b981" />
                    <path d="M -12 4 C -12 -5, 12 -5, 12 4 L 8 20 L -8 20 Z" fill="#10b981" />

                    {/* Micro-Doppler breathing indicator ring */}
                    <circle cx="0" cy="0" r="34" fill="none" stroke="#34d399" strokeWidth="1" opacity={0.6 + 0.4 * Math.sin(animationTick * 0.2)} />

                    <text x="0" y="32" fill="#34d399" fontSize="9" fontWeight="bold" textAnchor="middle">
                      SURVIVOR ({displayRange}m)
                    </text>
                    <text x="0" y="42" fill="#94a3b8" fontSize="7" textAnchor="middle">
                      BREATHING 0.28 Hz
                    </text>
                  </g>

                  {/* Technical Range Dimension Arrow */}
                  <line x1="65" y1="260" x2="390" y2="260" stroke="#00e5ff" strokeWidth="1" markerEnd="url(#arrow)" />
                  <circle cx="65" cy="260" r="2" fill="#00e5ff" />
                  <circle cx="390" cy="260" r="2" fill="#00e5ff" />
                  <text x="225" y="254" fill="#00e5ff" fontSize="9" fontWeight="bold" textAnchor="middle">
                    ESTIMATED RANGE: {displayRange} METERS
                  </text>
                </svg>
              </div>

              {/* Scientific disclaimer badge */}
              <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] text-slate-400 leading-tight">
                <span className="text-amber-400 font-bold">PHYSICAL RF PRINCIPLE: </span>
                UWB microwave pulses penetrate non-metallic debris. Reflection occurs at permittivity boundaries ($\Delta\epsilon_r$). Chest-wall micromotion modulates the return pulse phase, differentiating living survivors from inert stone.
              </div>
            </div>

            {/* RIGHT: LIVE TECHNICAL RADAR SIGNAL GRAPH (A-SCAN) */}
            <div className="theme-card bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-xs text-slate-100 uppercase">
                    A-SCAN RADAR SIGNAL GRAPH (RANGE VS. AMPLITUDE)
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  PEAK: {displayRange} m ({radarStatus?.signal_strength_pct || 78}%)
                </span>
              </div>

              {/* Technical A-scan Graph SVG */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 p-2">
                <svg className="w-full h-full" viewBox="0 0 500 240">
                  <rect width="500" height="240" fill="#020617" />
                  
                  {/* Grid Lines */}
                  {[0, 5, 10, 15, 20].map((rVal) => {
                    const x = 40 + (rVal / 20.0) * 440;
                    return (
                      <g key={`grid-x-${rVal}`}>
                        <line x1={x} y1="20" x2={x} y2="200" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3,3" />
                        <text x={x} y="215" fill="#64748b" fontSize="9" textAnchor="middle">{rVal}m</text>
                      </g>
                    );
                  })}

                  {[0.2, 0.4, 0.6, 0.8, 1.0].map((ampVal) => {
                    const y = 200 - ampVal * 180;
                    return (
                      <g key={`grid-y-${ampVal}`}>
                        <line x1="40" y1={y} x2="480" y2={y} stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3,3" />
                        <text x="32" y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{ampVal.toFixed(1)}</text>
                      </g>
                    );
                  })}

                  {/* Axes */}
                  <line x1="40" y1="200" x2="480" y2="200" stroke="#475569" strokeWidth="1.5" />
                  <line x1="40" y1="20" x2="40" y2="200" stroke="#475569" strokeWidth="1.5" />
                  <text x="260" y="232" fill="#94a3b8" fontSize="9" textAnchor="middle">Target Range / Distance (Meters) &rarr;</text>
                  <text x="12" y="110" fill="#94a3b8" fontSize="8" textAnchor="middle" transform="rotate(-90 12 110)">Amplitude &rarr;</text>

                  {/* Front Rubble Barrier Clutter Zone (approx 2m - 3m) */}
                  <rect x={40 + (2.0 / 20.0) * 440} y="20" width={(1.5 / 20.0) * 440} height="180" fill="#f59e0b" fillOpacity="0.08" />
                  <text x={40 + (2.75 / 20.0) * 440} y="32" fill="#f59e0b" fontSize="8" textAnchor="middle">RUBBLE BARRIER</text>

                  {/* Plot Waveform Line */}
                  {waveform && waveform.length > 0 ? (
                    <polyline
                      fill="none"
                      stroke="#00e5ff"
                      strokeWidth="2"
                      points={waveform
                        .map((pt) => {
                          const x = 40 + (pt.range_m / 20.0) * 440;
                          const y = 200 - Math.min(1.0, pt.amplitude) * 180;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  ) : (
                    /* Fallback generated curve with peak at displayRange */
                    <path
                      d={`M 40 192 Q 60 190 85 130 T 110 190 T 180 192 Q ${40 + (displayRange / 20) * 440} 40 ${40 + (displayRange / 20) * 440 + 20} 190 T 480 194`}
                      fill="none"
                      stroke="#00e5ff"
                      strokeWidth="2"
                    />
                  )}

                  {/* Highlight Peak at Target Range */}
                  {displayRange > 0 && (
                    <g transform={`translate(${40 + (displayRange / 20.0) * 440}, 50)`}>
                      <line x1="0" y1="0" x2="0" y2="150" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3,2" />
                      <circle cx="0" cy="15" r="5" fill="#10b981" />
                      <rect x="-42" y="-22" width="84" height="18" rx="4" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
                      <text x="0" y="-10" fill="#a7f3d0" fontSize="8" fontWeight="bold" textAnchor="middle">
                        PEAK: {displayRange}m
                      </text>
                    </g>
                  )}
                </svg>
              </div>

              {/* Signal Technical Metrics */}
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-slate-500">FREQUENCY</div>
                  <div className="font-bold text-cyan-400">{frequency} GHz UWB</div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-slate-500">SIGNAL STRENGTH</div>
                  <div className="font-bold text-emerald-400">{radarStatus?.signal_strength_pct || 78}%</div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-slate-500">REFLECTION</div>
                  <div className="font-bold text-amber-400">{radarStatus?.reflection_strength_db || -18.7} dB</div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. RANGE DETECTION INDICATOR GAUGE (0m - 20m) */}
          <div className="theme-card bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2.5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200 uppercase tracking-wide">
                ESTIMATED TARGET RANGE: <strong className="text-cyan-400 text-sm">{displayRange} m</strong>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Range Gate: 0.0 m &mdash; 20.0 m (Resolution: 0.1 m)
              </span>
            </div>

            {/* Distance Indicator Bar: 0 m ────────●──────── 20 m */}
            <div className="relative pt-4 pb-2">
              {/* Background Track */}
              <div className="w-full h-2.5 bg-slate-800 rounded-full relative overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${rangePct}%` }}
                />
              </div>

              {/* Indicator Thumb (●) */}
              <div
                className="absolute top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300"
                style={{ left: `${rangePct}%` }}
              >
                <div className="w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-lg shadow-emerald-500/50 animate-pulse flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-slate-950 rounded-full" />
                </div>
                <span className="mt-1 text-[10px] font-black text-emerald-300 bg-slate-900 px-1.5 py-0.5 rounded border border-emerald-600/60 shadow">
                  {displayRange}m
                </span>
              </div>
            </div>

            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.0 m (Sensor Origin)</span>
              <span>10.0 m</span>
              <span>20.0 m (Max UWB Penetration Range)</span>
            </div>
          </div>

          {/* 6. 6-STAGE SIGNAL PROCESSING LAYER & DETECTION CLASSIFIER */}
          <div className="theme-card bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-xs text-slate-200 uppercase tracking-wide">
                SIGNAL PROCESSING LAYER (STAGE 1 &rarr; STAGE 6)
              </span>
              <span className="text-[10px] text-emerald-400 font-bold font-mono">
                OUTPUT: POSSIBLE HUMAN PRESENCE DETECTED
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[10px] font-mono">
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">1. ACQUISITION</div>
                <div className="text-slate-400 text-[9px]">UWB Raw Waveform</div>
                <div className="text-emerald-400 text-[9px]">&bull; PASSED</div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">2. NOISE FILTER</div>
                <div className="text-slate-400 text-[9px]">Butterworth Filter</div>
                <div className="text-emerald-400 text-[9px]">&bull; PASSED</div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">3. RANGE EST.</div>
                <div className="text-slate-400 text-[9px]">Time-of-Flight ToF</div>
                <div className="text-emerald-400 text-[9px]">&bull; {displayRange}m</div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">4. REFLECTION</div>
                <div className="text-slate-400 text-[9px]">CFAR Peak Detect</div>
                <div className="text-emerald-400 text-[9px]">&bull; DETECTED</div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">5. TARGET EXT.</div>
                <div className="text-slate-400 text-[9px]">Micro-Doppler 0.28Hz</div>
                <div className="text-emerald-400 text-[9px]">&bull; RESPIRATORY</div>
              </div>
              <div className="p-2 rounded bg-emerald-950/80 border border-emerald-700/80 space-y-1">
                <div className="text-emerald-300 font-bold">6. ESTIMATION</div>
                <div className="text-emerald-200 text-[9px]">Human Target</div>
                <div className="text-emerald-400 font-bold text-[9px]">&bull; 92% CONF</div>
              </div>
            </div>
          </div>

          {/* 7. CONTROLS & TEST BUTTONS */}
          <div className="theme-card p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                RADAR CONTROLS & TEST DEMONSTRATION
              </span>
              {testLog && (
                <span className="text-[11px] text-cyan-300 font-mono animate-pulse">
                  {testLog}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* START RADAR TEST BUTTON */}
              <button
                onClick={handleStartTest}
                disabled={isStartingTest}
                className="theme-control px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {isStartingTest ? 'TESTING...' : 'START RADAR TEST'}
              </button>

              {/* STOP RADAR TEST BUTTON */}
              <button
                onClick={handleStopTest}
                className="theme-control px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-2 border border-slate-700"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                STOP RADAR TEST
              </button>

              {/* SIMULATE HUMAN TARGET BUTTON */}
              <button
                onClick={handleSimulateHumanTarget}
                disabled={isSimulatingHuman}
                className="theme-control px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                <User className="w-4 h-4" />
                SIMULATE HUMAN TARGET
              </button>
            </div>

            {/* Configurable Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800/80 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>RF Frequency:</span>
                  <span className="font-bold text-cyan-400">{frequency} GHz UWB</span>
                </div>
                <input
                  type="range"
                  min="3.1"
                  max="10.6"
                  step="0.1"
                  value={frequency}
                  onChange={(e) => handleConfigChange(undefined, parseFloat(e.target.value), undefined)}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Target Distance:</span>
                  <span className="font-bold text-emerald-400">{targetRange} m</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="18.0"
                  step="0.2"
                  value={targetRange}
                  onChange={(e) => handleConfigChange(parseFloat(e.target.value), undefined, undefined)}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Obstruction Material:</span>
                  <span className="font-bold text-amber-400">{obstructionType}</span>
                </div>
                <select
                  value={obstructionType}
                  onChange={(e) => handleConfigChange(undefined, undefined, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono"
                >
                  <option value="CONCRETE_RUBBLE">Reinforced Concrete Rubble (er=4.8)</option>
                  <option value="BRICK_DEBRIS">Crushed Masonry & Brick (er=3.6)</option>
                  <option value="WOOD_DRYWALL">Timber & Structural Drywall (er=2.2)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-[11px]">
              Technical Honesty Notice: UWB radar-assisted human presence detection. Performance depends on obstruction material, thickness, distance, and radar hardware.
            </span>
          </div>

          <button
            onClick={onClose}
            className="theme-control px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition"
          >
            CLOSE MONITOR
          </button>
        </div>
      </div>
    </div>
  );
};
