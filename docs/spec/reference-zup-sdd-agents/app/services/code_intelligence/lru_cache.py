"""Bounded LRU cache primitives for code intelligence services."""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass(frozen=True)
class CacheStats:
    """Point-in-time cache statistics."""

    hits: int = 0
    misses: int = 0
    evictions: int = 0
    current_size: int = 0
    maxsize: int = 0

    @property
    def hit_rate(self) -> float:
        """Return hit ratio in the range 0.0-1.0."""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0


class LRUCache(Generic[K, V]):
    """Small thread-safe LRU cache with a hard item limit."""

    def __init__(self, maxsize: int = 1000) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self._cache: OrderedDict[K, V] = OrderedDict()
        self._maxsize = maxsize
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        self._lock = RLock()

    def get(self, key: K) -> V | None:
        """Return cached value and mark it as recently used."""
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None
            self._cache.move_to_end(key)
            self._hits += 1
            return self._cache[key]

    def put(self, key: K, value: V) -> None:
        """Store a value and evict the least-recently-used entry if full."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = value
                return

            self._cache[key] = value
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)
                self._evictions += 1

    def invalidate(self, key: K | None = None) -> None:
        """Invalidate one key, or clear the whole cache when key is None."""
        with self._lock:
            if key is None:
                self._cache.clear()
            else:
                self._cache.pop(key, None)

    def stats(self) -> CacheStats:
        """Return a snapshot of cache counters."""
        with self._lock:
            return CacheStats(
                hits=self._hits,
                misses=self._misses,
                evictions=self._evictions,
                current_size=len(self._cache),
                maxsize=self._maxsize,
            )

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)
