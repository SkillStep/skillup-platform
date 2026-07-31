"""Fail-closed provider adapter."""

from __future__ import annotations

from ..contracts import ProviderRequest, ProviderResponse
from ..errors import AiDisabledError


class DisabledAdapter:
    def generate(self, request: ProviderRequest) -> ProviderResponse:
        del request
        raise AiDisabledError("AI generation is disabled.")
