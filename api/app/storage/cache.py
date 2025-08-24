import redis
import json
from typing import Optional, Any, Dict
from datetime import timedelta
import logging
from api.app.core.config import get_settings
from api.app.domain.models import TileCacheKey, ResultCacheKey

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-based caching service for wind data and analysis results."""
    
    def __init__(self):
        self.settings = get_settings()
        self.redis = get_redis_connection()
        self.default_ttl = self.settings.cache_ttl_seconds
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        try:
            value = self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Cache get error for key {key}: {e}")
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with optional TTL."""
        try:
            ttl = ttl or self.default_ttl
            serialized = json.dumps(value, default=str)
            return self.redis.setex(key, ttl, serialized)
        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        try:
            return bool(self.redis.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        try:
            return bool(self.redis.exists(key))
        except Exception as e:
            logger.error(f"Cache exists error for key {key}: {e}")
            return False
    
    async def set_wind_tile(self, tile_key: TileCacheKey, wind_data: Dict[str, Any], 
                           ttl: Optional[int] = None) -> bool:
        """Cache wind tile data."""
        key = tile_key.to_string()
        return await self.set(key, wind_data, ttl)
    
    async def get_wind_tile(self, tile_key: TileCacheKey) -> Optional[Dict[str, Any]]:
        """Get cached wind tile data."""
        key = tile_key.to_string()
        return await self.get(key)
    
    async def set_route_result(self, result_key: ResultCacheKey, result_data: Dict[str, Any],
                              ttl: Optional[int] = None) -> bool:
        """Cache route analysis result."""
        key = result_key.to_string()
        return await self.set(key, result_data, ttl)
    
    async def get_route_result(self, result_key: ResultCacheKey) -> Optional[Dict[str, Any]]:
        """Get cached route analysis result."""
        key = result_key.to_string()
        return await self.get(key)
    
    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching pattern."""
        try:
            keys = self.redis.keys(pattern)
            if keys:
                return self.redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache invalidate pattern error for {pattern}: {e}")
            return 0
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        try:
            info = self.redis.info('memory')
            return {
                "used_memory": info.get('used_memory', 0),
                "used_memory_human": info.get('used_memory_human', '0B'),
                "keyspace_hits": info.get('keyspace_hits', 0),
                "keyspace_misses": info.get('keyspace_misses', 0),
                "connected_clients": info.get('connected_clients', 0)
            }
        except Exception as e:
            logger.error(f"Cache stats error: {e}")
            return {}


def get_redis_connection():
    """Get Redis connection instance."""
    settings = get_settings()
    return redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True
    )


# Global cache service instance
_cache_service = None


def get_cache_service() -> CacheService:
    """Get cache service instance."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service
