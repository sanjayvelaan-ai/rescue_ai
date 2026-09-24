import { DETECTION_CONFIG, type LocalSurvivorTrack } from './detection-config';
import type { MissionAlertItem } from './browser-camera-context';

export function calculateIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  const boxAArea = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const boxBArea = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);

  const unionArea = boxAArea + boxBArea - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

export class ClientSurvivorTracker {
  private tracks: Map<string, LocalSurvivorTrack> = new Map();
  private nextTrackNum = 1;
  private config = DETECTION_CONFIG;

  public reset(): void {
    this.tracks.clear();
    this.nextTrackNum = 1;
  }

  public update(
    rawDetections: Array<{
      id?: string;
      class_name?: string;
      display_label?: string;
      confidence: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      [key: string]: any;
    }>,
    currentLocation: { latitude: number; longitude: number; source?: string } | null,
    now: number = Date.now()
  ): {
    activeTracks: LocalSurvivorTrack[];
    newAlerts: MissionAlertItem[];
  } {
    const matchedTrackKeys = new Set<string>();
    const newAlerts: MissionAlertItem[] = [];

    // Filter by base confidence threshold
    const candidates = rawDetections.filter(
      (d) => d.confidence >= this.config.defaultConfidence
    );

    for (const det of candidates) {
      const detBox: [number, number, number, number] = [det.x1, det.y1, det.x2, det.y2];
      let bestMatchKey: string | null = null;
      let highestIoU = 0;

      // Find best overlapping track that hasn't been matched in this cycle
      for (const [key, track] of this.tracks.entries()) {
        if (matchedTrackKeys.has(key)) continue;

        const trackBox: [number, number, number, number] = [
          track.x1,
          track.y1,
          track.x2,
          track.y2,
        ];
        const iou = calculateIoU(detBox, trackBox);

        if (iou >= this.config.iouMatchThreshold && iou > highestIoU) {
          highestIoU = iou;
          bestMatchKey = key;
        }
      }

      const rawClass = det.class_name || 'person';
      const isSurvivor = rawClass.toLowerCase() === 'survivor';
      const isPerson = rawClass.toLowerCase() === 'person';
      const displayLabel =
        det.display_label ||
        (isSurvivor
          ? 'SURVIVOR'
          : isPerson
          ? 'PERSON / POSSIBLE SURVIVOR'
          : rawClass.toUpperCase());

      if (bestMatchKey && this.tracks.has(bestMatchKey)) {
        // Update existing track
        matchedTrackKeys.add(bestMatchKey);
        const track = this.tracks.get(bestMatchKey)!;

        // Apply Exponential Moving Average (EMA) coordinate smoothing
        const alpha = this.config.emaAlpha;
        track.smoothX1 = track.smoothX1 * (1 - alpha) + det.x1 * alpha;
        track.smoothY1 = track.smoothY1 * (1 - alpha) + det.y1 * alpha;
        track.smoothX2 = track.smoothX2 * (1 - alpha) + det.x2 * alpha;
        track.smoothY2 = track.smoothY2 * (1 - alpha) + det.y2 * alpha;

        track.x1 = det.x1;
        track.y1 = det.y1;
        track.x2 = det.x2;
        track.y2 = det.y2;
        track.confidence = det.confidence;
        track.lastSeen = now;
        track.hits += 1;
        track.display_label = displayLabel;
        track.state = track.hits >= 2 ? 'LIKELY_SURVIVOR' : 'VERIFYING';

        // Check if cooldown allows re-alerting if necessary
        if (
          det.confidence >= this.config.survivorAlertConfidence &&
          now - track.lastAlertTime >= this.config.alertCooldown &&
          (isPerson || isSurvivor)
        ) {
          track.lastAlertTime = now;
          const locStr =
            currentLocation && currentLocation.latitude && currentLocation.longitude
              ? `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`
              : 'Unavailable';

          newAlerts.push({
            id: `ALT-${track.localId}-${now}`,
            trackId: track.localId,
            title: isSurvivor ? 'Survivor Confirmed' : 'Possible Survivor Detected',
            message: `${isSurvivor ? 'Survivor' : 'Possible survivor'} active in zone (${Math.round(
              det.confidence * 100
            )}% confidence)`,
            confidence: det.confidence,
            location: locStr,
            timestamp: new Date(now).toLocaleTimeString(),
          });
        }
      } else {
        // Create new track with session-local ID: S-001, S-002, ...
        const localId = `S-${String(this.nextTrackNum++).padStart(3, '0')}`;
        const newTrack: LocalSurvivorTrack = {
          localId,
          survivor_id: localId,
          id: det.id || localId,
          class_name: rawClass,
          display_label: displayLabel,
          confidence: det.confidence,
          x1: det.x1,
          y1: det.y1,
          x2: det.x2,
          y2: det.y2,
          smoothX1: det.x1,
          smoothY1: det.y1,
          smoothX2: det.x2,
          smoothY2: det.y2,
          firstSeen: now,
          lastSeen: now,
          hits: 1,
          lastAlertTime: now,
          state: 'VERIFYING',
        };

        this.tracks.set(localId, newTrack);
        matchedTrackKeys.add(localId);

        // Generate ONE initial alert upon creation if confidence meets threshold
        if (
          det.confidence >= this.config.survivorAlertConfidence &&
          (isPerson || isSurvivor)
        ) {
          const locStr =
            currentLocation && currentLocation.latitude && currentLocation.longitude
              ? `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`
              : 'Unavailable';

          newAlerts.push({
            id: `ALT-${localId}-${now}`,
            trackId: localId,
            title: isSurvivor ? 'Survivor Identified' : 'Possible Survivor Detected',
            message: `${isSurvivor ? 'Survivor' : 'Possible survivor'} ${localId} detected (${Math.round(
              det.confidence * 100
            )}% confidence)`,
            confidence: det.confidence,
            location: locStr,
            timestamp: new Date(now).toLocaleTimeString(),
          });
        }
      }
    }

    // Drop tracks that haven't been seen within the persistence timeout (1500ms)
    for (const [key, track] of this.tracks.entries()) {
      if (now - track.lastSeen > this.config.trackTimeout) {
        this.tracks.delete(key);
      }
    }

    const activeTracks = Array.from(this.tracks.values()).sort(
      (a, b) => b.lastSeen - a.lastSeen
    );

    return { activeTracks, newAlerts };
  }

  public getActiveTracks(now: number = Date.now()): LocalSurvivorTrack[] {
    for (const [key, track] of this.tracks.entries()) {
      if (now - track.lastSeen > this.config.trackTimeout) {
        this.tracks.delete(key);
      }
    }
    return Array.from(this.tracks.values());
  }
}
