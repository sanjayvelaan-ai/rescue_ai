import {useDeviceLocation,freshFix} from '../../lib/device-location-context';
import {useBrowserCamera} from '../../lib/browser-camera-context';
import React, { useState, useEffect } from 'react';
import { Navigation, Cpu, Play, Pause, RotateCcw, Bell, Video, VideoOff } from 'lucide-react';
import { api } from '../../services/api';
import { SpinningBorderButton } from '@/components/ui/spinning-border-button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface HeaderProps {
  systemStatus?: any;
  unreadAlertsCount?: number;
  onOpenAlerts?: () => void;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ systemStatus, unreadAlertsCount = 0, onOpenAlerts, onRefresh }) => {
  const [timeStr, setTimeStr] = useState<string>(() => new Date().toUTCString().split(' ')[4] + ' UTC');
  const [dateStr, setDateStr] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const simRunning = Boolean(systemStatus?.simulation_active);
  const [cameraToggling, setCameraToggling] = useState<boolean>(false);
  const [actionError, setActionError] = useState('');

  const camera=useBrowserCamera();
  const deviceLocation=useDeviceLocation();
  const position=freshFix(deviceLocation.fix);
  const isCameraEnabled = camera.active;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toUTCString().split(' ')[4] + ' UTC');
      setDateStr(now.toISOString().split('T')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleCamera = async () => {
    setActionError('');
    setCameraToggling(true);
    try {
      if(camera.active)camera.stop();else await camera.start();
      if (onRefresh) onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Camera request failed.');
      console.error('Camera toggle failed:', e);
    } finally {
      setCameraToggling(false);
    }
  };

  const handleToggleSimulation = async () => {
    setActionError('');
    try {
    if (simRunning) {
      await api.pauseSimulation();
    } else {
      await api.startSimulation();
    }
    onRefresh?.();
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Simulation request failed.'); }
  };

  const handleResetSimulation = async () => {
    try { await api.resetSimulation(); onRefresh?.(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Reset failed.'); }
  };

  return (
    <header className="app-header shrink-0 min-h-16 border-b border-slate-800/80 px-3 py-3 sm:px-6 flex flex-wrap gap-3 items-center justify-between font-mono sticky top-0 z-40 backdrop-blur-md select-none">
      {/* Left Status Indicators */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* System Online */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-200">
          <span className={`w-2 h-2 rounded-full ${systemStatus ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="font-bold tracking-wider">{systemStatus ? 'SYSTEM ONLINE' : 'BACKEND OFFLINE'}</span>
        </div>

        {/* CAMERA ON / OFF TOGGLE SWITCH */}
        <button
          onClick={handleToggleCamera}
          disabled={cameraToggling || camera.starting || !systemStatus}
          className={`theme-control flex items-center gap-2 px-3.5 py-1.5 rounded-full font-bold border transition text-xs shadow-lg ${
            isCameraEnabled
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900 shadow-emerald-950/50'
              : 'bg-rose-950/90 text-rose-300 border-rose-700/80 hover:bg-rose-900 shadow-rose-950/50'
          }`}
          title="Start or stop this device camera"
        >
          {isCameraEnabled ? (
            <>
              <Video className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>{camera.active ? 'DEVICE CAMERA LIVE' : 'DEVICE CAMERA CONNECTING'}</span>
            </>
          ) : (
            <>
              <VideoOff className="w-3.5 h-3.5 text-rose-400" />
              <span>DEVICE CAMERA OFF</span>
            </>
          )}
        </button>

        {/* GPS Live Coordinates */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hidden md:flex">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>GPS <strong className="text-cyan-300">{position?.source || (position?'DEVICE_LOCATION':'UNAVAILABLE')}</strong></span>
        </div>

        {/* AI Engine Online */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hidden lg:flex">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span>YOLO <strong className="text-blue-400">{systemStatus?.model_online ? 'ONLINE' : 'OFFLINE'}</strong></span>
        </div>
      </div>

      {/* Right Controls & Clock */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <ThemeToggle />
        {/* Simulation Controls */}
        <div className="theme-card flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <SpinningBorderButton
            onClick={handleToggleSimulation}
            showArrow={false}
            surfaceClassName="px-3 py-2 tracking-normal"
            title="Start / Pause Hackathon Demo Simulation"
          >
            {simRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{simRunning ? 'PAUSE SIM' : 'START SIM'}</span>
          </SpinningBorderButton>
          <button
            onClick={handleResetSimulation}
            className="theme-control p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Reset Simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Notifications Icon Button */}
        <button
          onClick={onOpenAlerts}
          aria-label="Open alerts"
          className="theme-control relative p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition"
        >
          <Bell className="w-4 h-4 text-cyan-400" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white font-bold text-[10px] flex items-center justify-center border-2 border-slate-950 animate-bounce">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Realtime UTC Clock */}
        <div className="hidden sm:block text-right border-l border-slate-800 pl-4">
          <div className="text-xs font-bold text-slate-200 tracking-wider">{timeStr}</div>
          <div className="text-[10px] text-slate-500 font-semibold">{dateStr}</div>
        </div>
      </div>
      {(actionError||camera.error) && <p role="alert" className="w-full text-xs text-red-400">{actionError||camera.error}</p>}
    </header>
  );
};
