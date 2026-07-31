"""Typed AI gateway failures that callers can handle without provider-specific logic."""

from __future__ import annotations


class AiGatewayError(RuntimeError):
    """Base class for all expected gateway failures."""


class AiConfigurationError(AiGatewayError):
    """Raised when AI configuration is unsafe or incomplete."""


class AiDisabledError(AiGatewayError):
    """Raised when live AI execution is not enabled."""


class UnknownTaskError(AiGatewayError):
    """Raised when a request names a task without an approved policy."""


class PrivacyViolationError(AiGatewayError):
    """Raised when a request contains disallowed or unminimized private data."""


class BudgetExceededError(AiGatewayError):
    """Raised when a request would exceed a job, daily, or monthly cost ceiling."""


class OutputValidationError(AiGatewayError):
    """Raised when a provider returns malformed or policy-incompatible output."""


class ProviderError(AiGatewayError):
    """Provider-independent upstream failure."""

    def __init__(self, message: str, *, retryable: bool, status_code: int | None = None) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


class CircuitOpenError(AiGatewayError):
    """Raised while a provider circuit breaker is open."""
