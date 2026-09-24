export interface DetectionConfig {
  inferenceInterval: number; // Starting inference interval (1000ms)
  requestTimeoutMs: number; // Request abort timeout (9000ms)
  jpegQuality: number; // JPEG quality for offscreen sampling (0.60)
  inferenceWidth: number; // Offscreen canvas width for inference
  inferenceHeight: number; // Offscreen canvas height for inference
  defaultConfidence: number; // Base confidence filter threshold (0.30)
  survivorAlertConfidence: number; // Minimum confidence to trigger sound/banner alert (0.40)
  alertCooldown: number; // Cooldown ms per track ID before emitting another alert (7000ms)
  trackTimeout: number; // Persistence timeout ms before dropping missing track (1500ms)
  iouMatchThreshold: number; // IoU threshold for matching consecutive frame boxes (0.35)
  emaAlpha: number; // Coordinate smoothing factor (0.4 new + 0.6 old)
}

export const DETECTION_CONFIG: DetectionConfig = {
  inferenceInterval: 1000, // Starts at ~1000ms for Render Free (0.1 CPU, 512MB RAM)
  requestTimeoutMs: 9000, // 9-second timeout before aborting delayed inference
  jpegQuality: 0.60,
  inferenceWidth: 640,
  inferenceHeight: 360,
  defaultConfidence: 0.30,
  survivorAlertConfidence: 0.40,
  alertCooldown: 7000,
  trackTimeout: 1500,
  iouMatchThreshold: 0.35,
  emaAlpha: 0.40,
};

export interface LocalSurvivorTrack {
  localId: string; // e.g. "S-001"
  survivor_id: string; // Backend/session ID or "S-001"
  id: string;
  class_name: string; // "person", "survivor", etc.
  display_label: string; // "SURVIVOR", "PERSON / POSSIBLE SURVIVOR", etc.
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  smoothX1: number;
  smoothY1: number;
  smoothX2: number;
  smoothY2: number;
  firstSeen: number;
  lastSeen: number;
  hits: number;
  lastAlertTime: number;
  state: 'VERIFYING' | 'LIKELY_SURVIVOR' | 'CONFIRMED';
  [key: string]: any;
}
