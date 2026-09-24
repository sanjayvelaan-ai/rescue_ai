import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Cpu } from 'lucide-react';
import { api } from '../services/api';
import { SpinningBorderButton } from '@/components/ui/spinning-border-button';

interface SettingsPageProps {
  systemStatus?: any;
  onRefresh?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ systemStatus, onRefresh }) => {
  const [modelPath, setModelPath] = useState<string>('models/best.pt');
  const [confThreshold, setConfThreshold] = useState<number>(0.50);
  const [iouThreshold, setIouThreshold] = useState<number>(0.45);
  const [cameraIndex, setCameraIndex] = useState<number>(0);
  const [gpsMode, setGpsMode] = useState<string>('SIMULATION');
  const [msg, setMsg] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!systemStatus || initialized.current) return;
    setModelPath(systemStatus.model_path || 'models/best.pt');
    setConfThreshold(systemStatus.confidence_threshold ?? .35);
    setIouThreshold(systemStatus.iou_threshold ?? .45);
    setCameraIndex(systemStatus.camera_index ?? 0);
    initialized.current = true;
  }, [systemStatus]);

  const handleRetryCamera = async () => {
    try { await api.retryCamera(); setMsg('Camera reconnection requested.'); onRefresh?.(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Camera reconnection failed.'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.saveConfiguration({ model_path: modelPath, confidence_threshold: confThreshold, iou_threshold: iouThreshold, camera_index: cameraIndex });
      setMsg(result.message);
      onRefresh?.();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not apply settings.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="page-shell p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen max-w-4xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            SYSTEM & VISION ENGINE CONFIGURATION
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Configure Pretrained YOLO Model Path, Inference Thresholds & Hardware Devices</p>
        </div>
      </div>

      {msg && (
        <div role="status" className="p-3 bg-emerald-950 border border-emerald-500 rounded-lg text-emerald-300 text-xs font-bold">
          {msg}
        </div>
      )}

      {/* Current Model Status Box */}
      <div className="theme-card bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-xl">
        <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          LOADED MODEL STATUS & HARDWARE
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-500">MODEL STATUS</div>
            <div className="text-emerald-400 font-bold mt-0.5">{systemStatus?.model_online ? 'MODEL ONLINE' : 'OFFLINE'}</div>
          </div>
          <div>
            <div className="text-slate-500">ACTIVE MODEL PATH</div>
            <div className="text-slate-200 font-bold mt-0.5 truncate">{systemStatus?.model_name || 'backend/models/best.pt'}</div>
          </div>
          <div>
            <div className="text-slate-500">HARDWARE DEVICE</div>
            <div className="text-cyan-400 font-bold mt-0.5">{systemStatus?.device?.toUpperCase() || 'CPU'}</div>
          </div>
          <div>
            <div className="text-slate-500">SERVER CAMERA STATUS</div>
            <div className="text-amber-400 font-bold mt-0.5">{systemStatus?.camera_online ? `LIVE CAMERA ${systemStatus.camera_index}` : 'CAMERA OFFLINE'}</div>
          </div>
        </div>
      </div>

      {/* Config Form */}
      <form onSubmit={handleSave} className="theme-card bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-xl text-xs">
        <div className="space-y-1">
          <label htmlFor="model-path" className="text-slate-300 font-bold">MODEL_PATH (.pt file)</label>
          <input
            id="model-path" type="text"
            value={modelPath}
            onChange={(e) => setModelPath(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-cyan-300 font-mono focus:border-cyan-500 outline-none"
          />
          <p className="text-[11px] text-slate-500">Place your custom trained YOLO .pt model file inside backend/models/best.pt</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="confidence-threshold" className="text-slate-300 font-bold">CONFIDENCE_THRESHOLD ({confThreshold})</label>
            <input
              id="confidence-threshold" type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="iou-threshold" className="text-slate-300 font-bold">IOU_THRESHOLD ({iouThreshold})</label>
            <input
              id="iou-threshold" type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={iouThreshold}
              onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <label htmlFor="camera-index" className="text-slate-300 font-bold">SERVER CAMERA INDEX</label>
            <input
              id="camera-index" type="number" min="0" max="10" required
              value={cameraIndex}
              onChange={(e) => setCameraIndex(parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="gps-mode" className="text-slate-300 font-bold">GPS_MODE</label>
            <select id="gps-mode"
              value={gpsMode}
              disabled
              onChange={(e) => setGpsMode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono"
            >
              <option value="SIMULATION">SIMULATION (Realistic Disaster Hub Coordinates)</option>
            </select>
            <p className="text-xs text-slate-500">GPS is simulated; no hardware GPS receiver is connected.</p>
          </div>
        </div>

        <div className="pt-4 flex items-center gap-3">
          <SpinningBorderButton
            type="submit"
            disabled={saving || !systemStatus}
            surfaceClassName="px-4 tracking-normal"
          >
            <Save className="w-4 h-4" /> {saving ? 'SAVING...' : 'SAVE CONFIGURATION'}
          </SpinningBorderButton>
          <SpinningBorderButton
            type="button"
            onClick={handleRetryCamera}
            showArrow={false}
            surfaceClassName="px-4 tracking-normal"
          >
            <RefreshCw className="w-4 h-4" /> RECONNECT SERVER CAMERA
          </SpinningBorderButton>
        </div>
      </form>
    </div>
  );
};
