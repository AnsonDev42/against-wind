import numpy as np
from typing import List, Tuple, Optional
from datetime import datetime, timedelta
from api.app.domain.models import WindSample, WindClass
from api.app.core.config import get_settings
import math
import logging

logger = logging.getLogger(__name__)


class WindInterpolator:
    """Handles wind data interpolation and downscaling."""
    
    def __init__(self):
        self.settings = get_settings()
    
    def downscale_wind(self, wind_10m: float, target_height: float = None, 
                      roughness_length: float = 0.1) -> float:
        """Downscale wind from 10m to target height using log wind profile."""
        if target_height is None:
            target_height = self.settings.default_rider_height_m
        
        if target_height >= 10.0:
            return wind_10m  # No downscaling needed
        
        # Log wind profile: u(z) = (u*/k) * ln(z/z0)
        # Where u* is friction velocity, k is von Karman constant (0.41)
        # z0 is roughness length
        
        k = 0.41  # von Karman constant
        z0 = roughness_length  # roughness length in meters
        
        # Calculate friction velocity from 10m wind
        u_star = (wind_10m * k) / math.log(10.0 / z0)
        
        # Calculate wind at target height
        wind_target = (u_star / k) * math.log(target_height / z0)
        
        return max(0, wind_target)
    
    def spatial_interpolate(self, samples: List[WindSample], target_lat: float, 
                          target_lon: float, target_time: datetime) -> Optional[WindSample]:
        """Perform bilinear spatial interpolation of wind samples."""
        if not samples:
            return None
        
        # Filter samples close to target time (within 1 hour)
        time_filtered = []
        for sample in samples:
            time_diff = abs((sample.valid_from - target_time).total_seconds())
            if time_diff <= 3600:  # 1 hour tolerance
                time_filtered.append(sample)
        
        if not time_filtered:
            return None
        
        # Find the 4 nearest points for bilinear interpolation
        # For MVP, use simple inverse distance weighting
        return self._inverse_distance_weighting(time_filtered, target_lat, target_lon, target_time)
    
    def temporal_interpolate(self, samples: List[WindSample], target_time: datetime) -> Optional[WindSample]:
        """Perform linear temporal interpolation between wind samples."""
        if not samples:
            return None
        
        # Sort samples by time
        sorted_samples = sorted(samples, key=lambda s: s.valid_from)
        
        # Find samples before and after target time
        before_sample = None
        after_sample = None
        
        for sample in sorted_samples:
            if sample.valid_from <= target_time:
                before_sample = sample
            elif sample.valid_from > target_time and after_sample is None:
                after_sample = sample
                break
        
        if before_sample is None:
            return sorted_samples[0] if sorted_samples else None
        if after_sample is None:
            return before_sample
        
        # Linear interpolation
        time_diff_total = (after_sample.valid_from - before_sample.valid_from).total_seconds()
        if time_diff_total == 0:
            return before_sample
        
        time_diff_target = (target_time - before_sample.valid_from).total_seconds()
        ratio = time_diff_target / time_diff_total
        
        # Interpolate u and v components
        u_interp = before_sample.u_ms + ratio * (after_sample.u_ms - before_sample.u_ms)
        v_interp = before_sample.v_ms + ratio * (after_sample.v_ms - before_sample.v_ms)
        
        return WindSample(
            u_ms=u_interp,
            v_ms=v_interp,
            height_m=before_sample.height_m,
            model_run_id=before_sample.model_run_id,
            source=before_sample.source,
            valid_from=target_time,
            valid_to=target_time,
            meta={
                "interpolated": True,
                "before_time": before_sample.valid_from.isoformat(),
                "after_time": after_sample.valid_from.isoformat(),
                "ratio": ratio
            }
        )
    
    def calculate_yaw_angle(self, route_bearing_deg: float, wind_from_deg: float) -> float:
        """Calculate yaw angle between route direction and wind direction."""
        # Convert wind "from" direction to "to" direction
        wind_to_deg = (wind_from_deg + 180) % 360
        
        # Calculate relative angle
        yaw = abs(route_bearing_deg - wind_to_deg)
        
        # Normalize to 0-180 degrees (absolute yaw angle)
        if yaw > 180:
            yaw = 360 - yaw
        
        return yaw
    
    def classify_wind(self, yaw_angle_deg: float) -> WindClass:
        """Classify wind based on yaw angle."""
        if yaw_angle_deg > 120:
            return WindClass.HEAD
        elif yaw_angle_deg < 60:
            return WindClass.TAIL
        else:
            return WindClass.CROSS
    
    def wind_components_to_speed_direction(self, u_ms: float, v_ms: float) -> Tuple[float, float]:
        """Convert u/v wind components to speed and direction."""
        speed = math.sqrt(u_ms**2 + v_ms**2)
        
        # Calculate direction (meteorological convention - direction wind is coming FROM)
        direction_rad = math.atan2(-u_ms, -v_ms)  # Note the negative signs
        direction_deg = math.degrees(direction_rad)
        
        # Normalize to 0-360 degrees
        direction_deg = (direction_deg + 360) % 360
        
        return speed, direction_deg
    
    def calculate_confidence(self, wind_sample: WindSample, gust_factor: Optional[float] = None,
                           terrain_roughness: float = 0.1) -> float:
        """Calculate confidence score for wind prediction."""
        confidence = 1.0
        
        # Reduce confidence based on gust factor
        if gust_factor is not None and gust_factor > 1.5:
            confidence *= max(0.5, 1.0 - (gust_factor - 1.5) * 0.2)
        
        # Reduce confidence for high terrain roughness (more turbulent)
        if terrain_roughness > 0.5:
            confidence *= max(0.6, 1.0 - (terrain_roughness - 0.5) * 0.4)
        
        # Reduce confidence for interpolated data
        if wind_sample.meta.get("interpolated", False):
            confidence *= 0.9
        
        return max(0.0, min(1.0, confidence))
    
    def _inverse_distance_weighting(self, samples: List[WindSample], target_lat: float,
                                  target_lon: float, target_time: datetime) -> Optional[WindSample]:
        """Apply inverse distance weighting to interpolate wind at target location."""
        if not samples:
            return None
        
        if len(samples) == 1:
            return samples[0]
        
        # Calculate weights based on distance
        weights = []
        total_weight = 0
        
        for sample in samples:
            # Calculate distance using simple Euclidean distance in degrees
            # For more accuracy, could use Haversine distance
            lat_diff = sample.meta.get("lat", 0) - target_lat
            lon_diff = sample.meta.get("lon", 0) - target_lon
            distance = math.sqrt(lat_diff**2 + lon_diff**2)
            
            # Avoid division by zero
            if distance < 1e-6:
                return sample  # Exact match
            
            weight = 1.0 / (distance**2)  # Inverse square distance
            weights.append(weight)
            total_weight += weight
        
        if total_weight == 0:
            return samples[0]  # Fallback
        
        # Weighted average of u and v components
        u_weighted = sum(sample.u_ms * weight for sample, weight in zip(samples, weights)) / total_weight
        v_weighted = sum(sample.v_ms * weight for sample, weight in zip(samples, weights)) / total_weight
        
        # Use metadata from closest sample
        closest_sample = min(samples, key=lambda s: 
                           math.sqrt((s.meta.get("lat", 0) - target_lat)**2 + 
                                   (s.meta.get("lon", 0) - target_lon)**2))
        
        return WindSample(
            u_ms=u_weighted,
            v_ms=v_weighted,
            height_m=closest_sample.height_m,
            model_run_id=closest_sample.model_run_id,
            source=closest_sample.source,
            valid_from=target_time,
            valid_to=target_time,
            meta={
                "interpolated": True,
                "method": "inverse_distance_weighting",
                "num_samples": len(samples),
                "lat": target_lat,
                "lon": target_lon
            }
        )
