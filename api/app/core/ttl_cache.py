import time
from collections import OrderedDict
from typing import Any, Optional


class TTLCache:
    """Small process-local TTL/LRU cache for cheap single-machine reuse."""

    def __init__(self, max_items: int, ttl_seconds: int):
        self.max_items = max_items
        self.ttl_seconds = ttl_seconds
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        item = self._items.get(key)
        if item is None:
            return None

        expires_at, value = item
        if expires_at <= time.monotonic():
            self._items.pop(key, None)
            return None

        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        self._items[key] = (time.monotonic() + self.ttl_seconds, value)
        self._items.move_to_end(key)

        while len(self._items) > self.max_items:
            self._items.popitem(last=False)
