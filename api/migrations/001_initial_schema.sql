-- Initial database schema for Against Wind API
-- This script creates all the core tables for route analysis

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    gpx_url TEXT NOT NULL,
    bbox TEXT NOT NULL, -- JSON string: [min_lon, min_lat, max_lon, max_lat]
    length_km FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    name VARCHAR(255)
);

-- Route sample points table
CREATE TABLE IF NOT EXISTS route_samples (
    id SERIAL PRIMARY KEY,
    route_id VARCHAR(36) NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    lat FLOAT NOT NULL,
    lon FLOAT NOT NULL,
    dist_m FLOAT NOT NULL,
    bearing_deg FLOAT NOT NULL,
    eta_offset_s INTEGER NOT NULL,
    UNIQUE(route_id, seq)
);

-- Forecast results table
CREATE TABLE IF NOT EXISTS forecast_results (
    id VARCHAR(36) PRIMARY KEY,
    route_id VARCHAR(36) NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    depart_time TIMESTAMP WITH TIME ZONE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model_run_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
);

-- Segment wind data table
CREATE TABLE IF NOT EXISTS segment_wind (
    id SERIAL PRIMARY KEY,
    result_id VARCHAR(36) NOT NULL REFERENCES forecast_results(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    wind_dir_deg10m FLOAT NOT NULL,
    wind_ms10m FLOAT NOT NULL,
    wind_ms1p5m FLOAT NOT NULL,
    yaw_deg FLOAT NOT NULL,
    wind_class VARCHAR(10) NOT NULL CHECK (wind_class IN ('head', 'cross', 'tail')),
    gust_ms FLOAT,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    UNIQUE(result_id, seq)
);

-- Analysis summaries table
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    result_id VARCHAR(36) NOT NULL REFERENCES forecast_results(id) ON DELETE CASCADE,
    head_pct FLOAT NOT NULL,
    tail_pct FLOAT NOT NULL,
    cross_pct FLOAT NOT NULL,
    longest_head_km FLOAT NOT NULL,
    window_best_depart TIMESTAMP WITH TIME ZONE,
    provider_spread FLOAT,
    notes TEXT,
    UNIQUE(result_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_routes_created_at ON routes(created_at);
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_route_samples_route_id ON route_samples(route_id);
CREATE INDEX IF NOT EXISTS idx_forecast_results_route_id ON forecast_results(route_id);
CREATE INDEX IF NOT EXISTS idx_forecast_results_created_at ON forecast_results(created_at);
CREATE INDEX IF NOT EXISTS idx_segment_wind_result_id ON segment_wind(result_id);
CREATE INDEX IF NOT EXISTS idx_segment_wind_time_utc ON segment_wind(time_utc);

-- Add comments for documentation
COMMENT ON TABLE routes IS 'Uploaded cycling routes with metadata';
COMMENT ON TABLE route_samples IS 'Preprocessed sample points along routes';
COMMENT ON TABLE forecast_results IS 'Wind forecast analysis results';
COMMENT ON TABLE segment_wind IS 'Wind conditions for each route segment';
COMMENT ON TABLE summaries IS 'Aggregated analysis summaries';

COMMENT ON COLUMN routes.bbox IS 'Bounding box as JSON: [min_lon, min_lat, max_lon, max_lat]';
COMMENT ON COLUMN route_samples.eta_offset_s IS 'Estimated time offset from departure in seconds';
COMMENT ON COLUMN segment_wind.wind_class IS 'Wind classification: head, cross, or tail';
COMMENT ON COLUMN segment_wind.confidence IS 'Confidence score from 0.0 to 1.0';
