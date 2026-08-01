"""Fail-closed AI worker configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Mapping
from urllib.parse import urlparse

from .contracts import ProviderName
from .errors import AiConfigurationError


_ALLOWED_ENVIRONMENTS = {"local", "test", "staging", "production"}


def _read_bool(environment: Mapping[str, str], name: str, default: bool = False) -> bool:
    value = environment.get(name, "true" if default else "false").strip().lower()
    if value not in {"true", "false"}:
        raise AiConfigurationError(f"{name} must be true or false.")
    return value == "true"


def _read_int(
    environment: Mapping[str, str], name: str, default: int, minimum: int, maximum: int
) -> int:
    try:
        value = int(environment.get(name, str(default)))
    except ValueError as error:
        raise AiConfigurationError(f"{name} must be an integer.") from error
    if value < minimum or value > maximum:
        raise AiConfigurationError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _read_decimal(
    environment: Mapping[str, str], name: str, default: str, minimum: str, maximum: str
) -> Decimal:
    try:
        value = Decimal(environment.get(name, default))
    except InvalidOperation as error:
        raise AiConfigurationError(f"{name} must be a decimal number.") from error
    if value < Decimal(minimum) or value > Decimal(maximum):
        raise AiConfigurationError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _read_provider(environment: Mapping[str, str], name: str, default: str) -> ProviderName:
    try:
        return ProviderName(environment.get(name, default).strip().lower())
    except ValueError as error:
        allowed = ", ".join(provider.value for provider in ProviderName)
        raise AiConfigurationError(f"{name} must be one of: {allowed}.") from error


def _validate_base_url(value: str, *, app_environment: str, name: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise AiConfigurationError(f"{name} must be an absolute HTTP(S) URL.")
    if parsed.username or parsed.password:
        raise AiConfigurationError(f"{name} must not contain credentials.")
    if app_environment in {"staging", "production"} and parsed.scheme != "https":
        raise AiConfigurationError(f"{name} must use HTTPS outside local/test environments.")
    return value.rstrip("/")


@dataclass(frozen=True)
class ProviderConfig:
    name: ProviderName
    api_key: str | None = field(repr=False)
    base_url: str
    model_override: str | None = None


@dataclass(frozen=True)
class AiWorkerConfig:
    app_environment: str
    feature_enabled: bool
    primary: ProviderConfig
    fallback: ProviderConfig | None
    max_cost_per_job_usd: Decimal
    daily_budget_usd: Decimal
    monthly_budget_usd: Decimal
    max_concurrency: int
    max_retries: int
    request_timeout_seconds: int
    circuit_failure_threshold: int
    circuit_reset_seconds: int
    cache_ttl_seconds: int
    budget_db_path: str
    release_sha: str
    openrouter_site_url: str | None
    openrouter_app_name: str


def _provider_config(
    provider: ProviderName,
    environment: Mapping[str, str],
    app_environment: str,
) -> ProviderConfig:
    defaults = {
        ProviderName.DISABLED: ("", ""),
        ProviderName.DETERMINISTIC: ("", ""),
        ProviderName.DEEPSEEK: ("DEEPSEEK_API_KEY", "https://api.deepseek.com"),
        ProviderName.GROQ: ("GROQ_API_KEY", "https://api.groq.com/openai"),
        ProviderName.OPENROUTER: ("OPENROUTER_API_KEY", "https://openrouter.ai/api"),
    }
    key_name, default_url = defaults[provider]
    if provider in {ProviderName.DISABLED, ProviderName.DETERMINISTIC}:
        return ProviderConfig(provider, None, "")

    prefix = provider.value.upper()
    api_key = environment.get(key_name, "").strip() or None
    base_url = environment.get(f"{prefix}_API_BASE_URL", default_url).strip()
    if not base_url:
        raise AiConfigurationError(f"{prefix}_API_BASE_URL is required for {provider.value}.")
    configured_model = environment.get(f"{prefix}_MODEL", "").strip()
    model_override = configured_model or (
        "deepseek-v4-flash" if provider is ProviderName.DEEPSEEK else None
    )
    return ProviderConfig(
        name=provider,
        api_key=api_key,
        base_url=_validate_base_url(base_url, app_environment=app_environment, name=f"{prefix}_API_BASE_URL"),
        model_override=model_override,
    )


def read_worker_config(environment: Mapping[str, str] | None = None) -> AiWorkerConfig:
    source: Mapping[str, str] = os.environ if environment is None else environment
    app_environment = source.get("APP_ENV", "local").strip().lower()
    if app_environment not in _ALLOWED_ENVIRONMENTS:
        raise AiConfigurationError("APP_ENV must be local, test, staging, or production.")

    feature_enabled = _read_bool(source, "FEATURE_AI_GENERATION_ENABLED", False)
    primary_name = _read_provider(source, "AI_PROVIDER", "disabled")
    fallback_name = _read_provider(source, "AI_FALLBACK_PROVIDER", "disabled")
    primary = _provider_config(primary_name, source, app_environment)
    fallback = (
        None
        if fallback_name is ProviderName.DISABLED
        else _provider_config(fallback_name, source, app_environment)
    )

    if fallback and fallback.name is primary.name:
        raise AiConfigurationError("AI_FALLBACK_PROVIDER must differ from AI_PROVIDER.")
    if feature_enabled and primary.name is ProviderName.DISABLED:
        raise AiConfigurationError("AI_PROVIDER cannot be disabled when AI generation is enabled.")
    if app_environment in {"staging", "production"} and primary.name is ProviderName.DETERMINISTIC:
        raise AiConfigurationError("The deterministic provider cannot be used in staging or production.")
    if app_environment in {"staging", "production"} and fallback and fallback.name is ProviderName.DETERMINISTIC:
        raise AiConfigurationError("The deterministic fallback cannot be used in staging or production.")

    for provider in (primary, fallback):
        if provider and provider.name not in {ProviderName.DISABLED, ProviderName.DETERMINISTIC}:
            if feature_enabled and not provider.api_key:
                raise AiConfigurationError(
                    f"A secret API key is required for enabled provider {provider.name.value}."
                )

    max_cost = _read_decimal(source, "AI_MAX_COST_USD_PER_JOB", "0.005", "0", "10")
    daily_budget = _read_decimal(source, "AI_DAILY_BUDGET_USD", "1", "0", "10000")
    monthly_budget = _read_decimal(source, "AI_MONTHLY_BUDGET_USD", "20", "0", "100000")
    if daily_budget > monthly_budget:
        raise AiConfigurationError("AI_DAILY_BUDGET_USD cannot exceed AI_MONTHLY_BUDGET_USD.")

    return AiWorkerConfig(
        app_environment=app_environment,
        feature_enabled=feature_enabled,
        primary=primary,
        fallback=fallback,
        max_cost_per_job_usd=max_cost,
        daily_budget_usd=daily_budget,
        monthly_budget_usd=monthly_budget,
        max_concurrency=_read_int(source, "AI_MAX_CONCURRENCY", 1, 1, 64),
        max_retries=_read_int(source, "AI_MAX_RETRIES", 2, 0, 5),
        request_timeout_seconds=_read_int(source, "AI_REQUEST_TIMEOUT_SECONDS", 30, 1, 180),
        circuit_failure_threshold=_read_int(source, "AI_CIRCUIT_FAILURE_THRESHOLD", 5, 1, 100),
        circuit_reset_seconds=_read_int(source, "AI_CIRCUIT_RESET_SECONDS", 60, 1, 3600),
        cache_ttl_seconds=_read_int(source, "AI_CACHE_TTL_SECONDS", 86400, 0, 2592000),
        budget_db_path=source.get("AI_BUDGET_DB_PATH", "var/ai-gateway.sqlite3"),
        release_sha=source.get("RELEASE_SHA", "local"),
        openrouter_site_url=source.get("OPENROUTER_SITE_URL", "").strip() or None,
        openrouter_app_name=source.get("OPENROUTER_APP_NAME", "SkillUp").strip() or "SkillUp",
    )
