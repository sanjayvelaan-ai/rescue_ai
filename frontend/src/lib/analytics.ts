import type { Survivor, RescueTeam } from '../types';

export function calculateAnalytics(survivors: Survivor[], teams: RescueTeam[], liveOnly = true) {
  const records = [...new Map(survivors.filter(s => !liveOnly || s.survivor_id.startsWith('LIVE-')).map(s => [s.survivor_id, s])).values()];
  const scores = records.map(s => s.model_confidence).filter(n => Number.isFinite(n) && n >= 0 && n <= 1);
  const eta = teams.filter(t => t.status === 'EN_ROUTE' && Number.isFinite(t.eta_seconds) && t.eta_seconds >= 0);
  const buckets = new Map<number, number>();
  for (const record of records) {
    const timestamp = Date.parse(record.first_detected || record.timestamp);
    if (Number.isFinite(timestamp)) {
      const minute = Math.floor(timestamp/60000)*60000;
      buckets.set(minute, (buckets.get(minute) || 0)+1);
    }
  }
  let cumulative = 0;
  const timeline = [...buckets].sort(([a], [b]) => a-b).map(([time, count]) => ({time, detected: cumulative += count}));
  return {
    total: records.length,
    rescued: records.filter(s => s.status === 'RESCUED').length,
    averageConfidence: scores.length ? scores.reduce((sum,n) => sum+n,0)/scores.length*100 : null,
    averageEta: eta.length ? eta.reduce((sum,t) => sum+t.eta_seconds,0)/eta.length/60 : null,
    timeline,
    routes: eta.map(t => ({team:t.name, minutes:t.eta_seconds/60})),
    rgbSnapshots: records.filter(s => Boolean(s.detection_frame_path)).length,
    previewSnapshots: records.filter(s => Boolean(s.thermal_frame_path)).length,
  };
}
