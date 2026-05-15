export interface RouteMetadata {
  has_timestamps: boolean;
  timestamp_coverage: number;
  has_elevation?: boolean;
  elevation_coverage?: number;
  total_ascent_m?: number;
  total_descent_m?: number;
  start_time?: string;
  estimated_duration_hours?: number;
  eta_model?: string;
  eta_warnings?: string[];
  total_distance_km?: number;
  total_points?: number;
}

export type TimingMode = 'power' | 'manual_duration' | 'gpx_timestamps';

export interface AnalysisProgress {
  stage: string;
  progress: number;
  message?: string;
}
