"""Bounded in-process provider circuit breakers."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from .contracts import ProviderName
from .errors import CircuitOpenError


@dataclass
class _State:
    failures: int = 0
    opened_at: float | None = None


class CircuitBreakers:
    def __init__(self, failure_threshold: int, reset_seconds: int) -> None:
        self.failure_threshold = failure_threshold
        self.reset_seconds = reset_seconds
        self._states: dict[ProviderName, _State] = {}
        self._lock = threading.Lock()

    def before_request(self, provider: ProviderName) -> None:
        with self._lock:
            state = self._states.setdefault(provider, _State())
            if state.opened_at is None:
                return
            if time.monotonic() - state.opened_at >= self.reset_seconds:
                state.failures = 0
                state.opened_at = None
                return
            raise CircuitOpenError(f"The {provider.value} provider circuit is open.")

    def success(self, provider: ProviderName) -> None:
        with self._lock:
            self._states[provider] = _State()

    def failure(self, provider: ProviderName) -> None:
        with self._lock:
            state = self._states.setdefault(provider, _State())
            state.failures += 1
            if state.failures >= self.failure_threshold:
                state.opened_at = time.monotonic()
