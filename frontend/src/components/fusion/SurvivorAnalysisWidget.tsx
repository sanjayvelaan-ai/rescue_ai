import { Cpu, Radio } from 'lucide-react';
import type { RadarStatus } from '../../types/radar';

interface Props { radarStatus?: RadarStatus | null; cameraOnline?: boolean; onOpenRadar: () => void }
export function SurvivorAnalysisWidget({ radarStatus, cameraOnline = false, onOpenRadar }: Props) {
  return <section className="theme-card rounded-xl border border-slate-800 p-5 space-y-4 text-xs">
    <h3 className="flex items-center gap-2 font-bold text-cyan-400"><Cpu size={18} /> SENSOR EVIDENCE</h3>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><dt className="text-slate-400">RGB camera</dt><dd className="font-bold text-slate-100">{cameraOnline ? 'Live YOLO person detection' : 'No live camera frames'}</dd></div>
      <div><dt className="text-slate-400">Thermal</dt><dd className="text-slate-100">False-color RGB preview only</dd></div>
      <div><dt className="text-slate-400">UWB radar</dt><dd className="text-slate-100">Simulation · {radarStatus?.target_status || 'Standby'}</dd></div>
      <div><dt className="text-slate-400">LiDAR</dt><dd className="text-slate-100">No hardware connected</dd></div>
    </dl>
    <p className="text-slate-400">Live alerts use repeated RGB person detections. Review the captured image to verify a possible survivor. The preview does not measure temperature or confirm life signs.</p>
    <button type="button" onClick={onOpenRadar} className="theme-control inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"><Radio size={16} /> Open radar simulation</button>
  </section>;
}
