export interface RouteMetadata {
  has_timestamps: boolean;
  timestamp_coverage: number;
  start_time?: string;
  estimated_duration_hours?: number;
  total_distance_km?: number;
}

export type TimingMode = 'manual' | 'gpx_timestamps' | 'estimated';

export interface AnalysisProgress {
  stage: string;
  progress: number;
  message?: string;
}
