"""Provider adapter protocol."""

from __future__ import annotations

from typing import Protocol

from ..contracts import ProviderRequest, ProviderResponse


class ProviderAdapter(Protocol):
    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Execute one bounded provider request."""
