"""
Wind classification and analysis utilities.
"""

import math
from typing import Tuple
from api.app.domain.models import WindClass


def calculate_yaw_angle(route_bearing_deg: float, wind_from_deg: float) -> float:
    """
    Calculate yaw angle between route direction and wind direction.
    
    Args:
        route_bearing_deg: Route heading in degrees (0-360)
        wind_from_deg: Wind direction in degrees (meteorological convention - direction wind comes FROM)
    
    Returns:
        Yaw angle in degrees (0-180)
    """
    # Convert wind "from" direction to "to" direction
    wind_to_deg = (wind_from_deg + 180) % 360
    
    # Calculate relative angle
    yaw = abs(route_bearing_deg - wind_to_deg)
    
    # Normalize to 0-180 degrees (absolute yaw angle)
    if yaw > 180:
        yaw = 360 - yaw
    
    return yaw


def classify_wind_by_yaw(yaw_angle_deg: float) -> WindClass:
    """
    Classify wind based on yaw angle relative to route direction.
    
    Args:
        yaw_angle_deg: Yaw angle in degrees (0-180)
    
    Returns:
        WindClass enum value
    """
    if yaw_angle_deg > 120:
        return WindClass.HEAD
    elif yaw_angle_deg < 60:
        return WindClass.TAIL
    else:
        return WindClass.CROSS


def wind_components_to_speed_direction(u_ms: float, v_ms: float) -> Tuple[float, float]:
    """
    Convert u/v wind components to speed and direction.
    
    Args:
        u_ms: Eastward wind component (m/s)
        v_ms: Northward wind component (m/s)
    
    Returns:
        Tuple of (speed_ms, direction_deg)
        Direction is meteorological convention (direction wind comes FROM)
    """
    speed = math.sqrt(u_ms**2 + v_ms**2)
    
    # Calculate direction (meteorological convention - direction wind is coming FROM)
    direction_rad = math.atan2(-u_ms, -v_ms)  # Note the negative signs
    direction_deg = math.degrees(direction_rad)
    
    # Normalize to 0-360 degrees
    direction_deg = (direction_deg + 360) % 360
    
    return speed, direction_deg


def calculate_effective_wind_speed(wind_speed_ms: float, yaw_angle_deg: float) -> float:
    """
    Calculate effective wind speed component in the direction of travel.
    
    Args:
        wind_speed_ms: Wind speed in m/s
        yaw_angle_deg: Yaw angle in degrees
    
    Returns:
        Effective wind speed component (positive = headwind, negative = tailwind)
    """
    yaw_rad = math.radians(yaw_angle_deg)
    
    # Project wind onto route direction
    # cos(0°) = 1 (full headwind), cos(90°) = 0 (pure crosswind), cos(180°) = -1 (full tailwind)
    effective_speed = wind_speed_ms * math.cos(yaw_rad)
    
    return effective_speed


def calculate_crosswind_component(wind_speed_ms: float, yaw_angle_deg: float) -> float:
    """
    Calculate crosswind component perpendicular to route direction.
    
    Args:
        wind_speed_ms: Wind speed in m/s
        yaw_angle_deg: Yaw angle in degrees
    
    Returns:
        Crosswind speed component in m/s
    """
    yaw_rad = math.radians(yaw_angle_deg)
    crosswind_speed = wind_speed_ms * math.sin(yaw_rad)
    
    return abs(crosswind_speed)  # Always positive magnitude
