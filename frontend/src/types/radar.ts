export interface RadarStatus {
  status: string;
  mode: string;
  hardware_connected: boolean;
  tx_status: string;
  rx_status: string;
  signal_status: string;
  target_status: string;
  frequency_ghz: number;
  bandwidth_ghz: number;
  signal_strength_pct: number;
  estimated_range_m: number;
  reflection_strength_db: number;
  clutter_attenuation_db: number;
  obstruction_type: string;
  test_running: boolean;
  presence_confidence: number;
  micro_doppler_hz: number;
  waveform_sample_rate_m: number;
  timestamp: string;
}

export interface RadarWaveformPoint {
  range_m: number;
  amplitude: number;
}

export interface SensorFusionState {
  survivor_analysis: {
    thermal: string;
    radar: string;
    rgb: string;
    lidar: string;
  };
  fusion_result: {
    status: string;
    confidence: string;
    confidence_val: number;
    estimated_range: string;
    estimated_range_val: number;
    priority: string;
    reason: string;
    technical_honesty_note: string;
  };
  radar_telemetry: {
    tx_status: string;
    rx_status: string;
    signal_status: string;
    target_status: string;
    frequency_ghz: number;
    signal_strength_pct: number;
    obstruction_type: string;
  };
}

export interface RadarAlertEvent {
  type: string;
  alert_name: string;
  incident_id: string;
  timestamp: string;
  radar_id: string;
  estimated_range_m: number;
  signal_strength: string;
  zone: string;
  confidence: string;
  thermal_status: string;
  rgb_status: string;
  lidar_status: string;
  fusion_result: string;
  priority: string;
  latitude: number;
  longitude: number;
  message: string;
}
