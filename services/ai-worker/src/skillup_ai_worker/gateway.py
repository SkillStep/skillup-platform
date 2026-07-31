"""Observable, provider-neutral SkillUp AI gateway."""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections.abc import Callable, Mapping
from decimal import Decimal, ROUND_UP
from typing import Any

from .circuit import CircuitBreakers
from .config import AiWorkerConfig, ProviderConfig, read_worker_config
from .contracts import (
    AiJob,
    AiResult,
    ChatMessage,
    ProviderName,
    ProviderRequest,
    TaskName,
)
from .errors import (
    AiConfigurationError,
    AiDisabledError,
    BudgetExceededError,
    ProviderError,
)
from .observability import emit_event
from .policies import TaskPolicy, model_for, policy_for, price_for
from .privacy import sanitize_payload
from .providers.base import ProviderAdapter
from .providers.deterministic import DeterministicAdapter
from .providers.disabled import DisabledAdapter
from .providers.openai_compatible import OpenAICompatibleAdapter
from .store import GatewayStore, Reservation
from .validation import parse_and_validate_output


_CORRELATION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
EventSink = Callable[[str, Mapping[str, Any]], None]


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_UP)


def estimate_cost(
    provider: ProviderName,
    model: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> Decimal:
    price = price_for(provider, model)
    regular_input = max(0, input_tokens - cached_input_tokens)
    value = (
        Decimal(regular_input) * price.input_per_million
        + Decimal(cached_input_tokens) * price.cached_input_per_million
        + Decimal(output_tokens) * price.output_per_million
    ) / Decimal(1_000_000)
    return _quantize(value)


def _maximum_cost(
    policy: TaskPolicy, provider: ProviderName, model: str, payload_text: str
) -> Decimal:
    estimated_input_tokens = max(1, (len(policy.system_prompt) + len(payload_text) + 2) // 2)
    return estimate_cost(
        provider,
        model,
        input_tokens=estimated_input_tokens,
        output_tokens=policy.max_output_tokens,
    )


def _input_fingerprint(payload_text: str) -> str:
    return hashlib.sha256(payload_text.encode("utf-8")).hexdigest()


def _cache_key(
    job: AiJob, policy: TaskPolicy, provider: ProviderName, model: str, payload: str
) -> str:
    digest = hashlib.sha256()
    for part in (
        job.task.value,
        policy.prompt_version,
        provider.value,
        model,
        job.content_version,
        payload,
    ):
        digest.update(part.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def _adapter(provider: ProviderConfig, config: AiWorkerConfig) -> ProviderAdapter:
    if provider.name is ProviderName.DISABLED:
        return DisabledAdapter()
    if provider.name is ProviderName.DETERMINISTIC:
        return DeterministicAdapter()
    if not provider.api_key:
        raise AiConfigurationError(f"Provider {provider.name.value} has no API key.")
    return OpenAICompatibleAdapter(
        provider=provider.name,
        base_url=provider.base_url,
        api_key=provider.api_key,
        site_url=config.openrouter_site_url,
        app_name=config.openrouter_app_name,
    )


def _result_from_record(
    record: Mapping[str, Any],
    *,
    correlation_id: str,
    content_version: str,
    cache_hit: bool,
    redaction_count: int,
) -> AiResult:
    return AiResult(
        task=TaskName(str(record["task"])),
        payload=dict(record["payload"]),
        provider=ProviderName(record["provider"]),
        model=str(record["model"]),
        prompt_version=str(record["prompt_version"]),
        correlation_id=correlation_id,
        content_version=content_version,
        input_tokens=int(record["input_tokens"]),
        cached_input_tokens=int(record["cached_input_tokens"]),
        output_tokens=int(record["output_tokens"]),
        estimated_cost_usd="0" if cache_hit else str(record["estimated_cost_usd"]),
        latency_ms=0 if cache_hit else int(record["latency_ms"]),
        attempts=0 if cache_hit else int(record["attempts"]),
        cache_hit=cache_hit,
        redaction_count=redaction_count,
        provider_request_id=(
            str(record["provider_request_id"]) if record.get("provider_request_id") else None
        ),
        input_fingerprint=str(record["input_fingerprint"]),
        release_sha=str(record["release_sha"]),
    )


class AiGateway:
    def __init__(
        self,
        config: AiWorkerConfig | None = None,
        *,
        store: GatewayStore | None = None,
        adapters: Mapping[ProviderName, ProviderAdapter] | None = None,
        event_sink: EventSink = emit_event,
    ) -> None:
        self.config = config or read_worker_config()
        self.store = store or GatewayStore(self.config.budget_db_path)
        configured_adapters: dict[ProviderName, ProviderAdapter] = {
            self.config.primary.name: _adapter(self.config.primary, self.config)
        }
        if self.config.fallback:
            configured_adapters[self.config.fallback.name] = _adapter(
                self.config.fallback, self.config
            )
        if adapters:
            configured_adapters.update(adapters)
        self.adapters = configured_adapters
        self.event_sink = event_sink
        self.circuits = CircuitBreakers(
            self.config.circuit_failure_threshold, self.config.circuit_reset_seconds
        )
        self.semaphore = threading.BoundedSemaphore(self.config.max_concurrency)

    def execute(self, job: AiJob) -> AiResult:
        if not _CORRELATION_ID.fullmatch(job.correlation_id):
            raise AiConfigurationError("correlation_id has an invalid format.")
        if not job.content_version.strip() or len(job.content_version) > 128:
            raise AiConfigurationError("content_version must be between 1 and 128 characters.")
        if not self.config.feature_enabled:
            raise AiDisabledError("AI generation is disabled by feature flag.")

        policy = policy_for(job.task)
        sanitized, redactions = sanitize_payload(job.payload, policy)
        payload_text = json.dumps(sanitized, ensure_ascii=False, sort_keys=True)
        fingerprint = _input_fingerprint(payload_text)

        idempotent = self.store.job_get(job.correlation_id, job.task)
        if idempotent:
            if idempotent.get("input_fingerprint") != fingerprint:
                raise AiConfigurationError(
                    "correlation_id was already used for a different sanitized input."
                )
            result = _result_from_record(
                idempotent,
                correlation_id=job.correlation_id,
                content_version=job.content_version,
                cache_hit=True,
                redaction_count=redactions,
            )
            self._event("ai_gateway.idempotency_hit", result)
            return result

        primary_model = model_for(
            policy, self.config.primary.name, self.config.primary.model_override
        )
        self._ensure_production_model(self.config.primary.name, primary_model)
        cache_key = _cache_key(
            job, policy, self.config.primary.name, primary_model, payload_text
        )
        cached = self.store.cache_get(cache_key)
        if cached:
            result = _result_from_record(
                cached,
                correlation_id=job.correlation_id,
                content_version=job.content_version,
                cache_hit=True,
                redaction_count=redactions,
            )
            self.store.job_put(result)
            self._event("ai_gateway.cache_hit", result)
            return result

        provider_plan: list[tuple[ProviderConfig, str]] = [
            (self.config.primary, primary_model)
        ]
        if self.config.fallback:
            fallback_model = model_for(
                policy, self.config.fallback.name, self.config.fallback.model_override
            )
            self._ensure_production_model(self.config.fallback.name, fallback_model)
            provider_plan.append((self.config.fallback, fallback_model))

        maximums = [
            _maximum_cost(policy, provider.name, model, payload_text)
            for provider, model in provider_plan
        ]
        reservation_cost = max(maximums)
        job_cap = min(policy.max_cost_usd, self.config.max_cost_per_job_usd)
        if reservation_cost > job_cap:
            raise BudgetExceededError(
                f"Task {job.task.value} could cost {reservation_cost} USD, above its {job_cap} USD cap."
            )
        reservation = self.store.reserve(
            correlation_id=job.correlation_id,
            task=job.task,
            provider=self.config.primary.name,
            model=primary_model,
            prompt_version=policy.prompt_version,
            content_version=job.content_version,
            input_fingerprint=fingerprint,
            release_sha=self.config.release_sha,
            redaction_count=redactions,
            requested_cost_usd=reservation_cost,
            daily_budget_usd=self.config.daily_budget_usd,
            monthly_budget_usd=self.config.monthly_budget_usd,
        )
        acquired = self.semaphore.acquire(timeout=policy.timeout_seconds)
        if not acquired:
            self.store.fail(reservation)
            raise ProviderError("AI worker concurrency is saturated.", retryable=True)
        try:
            result = self._execute_reserved(
                job,
                policy,
                provider_plan,
                payload_text,
                fingerprint,
                redactions,
                reservation,
                cache_key,
                job_cap,
            )
            self.store.job_put(result)
            self._event("ai_gateway.completed", result)
            return result
        except Exception as error:
            self.store.fail(reservation)
            self.event_sink(
                "ai_gateway.failed",
                {
                    "task": job.task.value,
                    "correlation_id": job.correlation_id,
                    "content_version": job.content_version,
                    "input_fingerprint": fingerprint,
                    "release_sha": self.config.release_sha,
                    "error_type": type(error).__name__,
                },
            )
            raise
        finally:
            self.semaphore.release()

    def _ensure_production_model(self, provider: ProviderName, model: str) -> None:
        model_price = price_for(provider, model)
        if (
            self.config.app_environment in {"staging", "production"}
            and not model_price.production_approved
        ):
            raise AiConfigurationError(
                f"{provider.value}/{model} is not approved for production."
            )

    def _execute_reserved(
        self,
        job: AiJob,
        policy: TaskPolicy,
        provider_plan: list[tuple[ProviderConfig, str]],
        payload_text: str,
        fingerprint: str,
        redactions: int,
        reservation: Reservation,
        cache_key: str,
        job_cap: Decimal,
    ) -> AiResult:
        total_attempts = 0
        last_error: Exception | None = None
        for provider_config, model in provider_plan:
            adapter = self.adapters[provider_config.name]
            retry_limit = min(policy.max_retries, self.config.max_retries)
            for retry_index in range(retry_limit + 1):
                total_attempts += 1
                try:
                    self.circuits.before_request(provider_config.name)
                    request = ProviderRequest(
                        task=job.task,
                        model=model,
                        messages=(
                            ChatMessage("system", policy.system_prompt),
                            ChatMessage(
                                "user",
                                "Input JSON:\n" + payload_text + "\nReturn the required JSON object.",
                            ),
                        ),
                        max_output_tokens=policy.max_output_tokens,
                        temperature=policy.temperature,
                        timeout_seconds=min(
                            policy.timeout_seconds, self.config.request_timeout_seconds
                        ),
                        require_json=True,
                        thinking_enabled=policy.thinking_enabled,
                    )
                    started = time.monotonic()
                    response = adapter.generate(request)
                    latency_ms = int((time.monotonic() - started) * 1000)
                    payload = parse_and_validate_output(job.task, response.content)
                    actual_cost = estimate_cost(
                        provider_config.name,
                        model,
                        input_tokens=response.input_tokens,
                        cached_input_tokens=response.cached_input_tokens,
                        output_tokens=response.output_tokens,
                    )
                    if actual_cost > job_cap:
                        self.store.complete(
                            reservation,
                            provider=provider_config.name,
                            model=model,
                            actual_cost_usd=actual_cost,
                            input_tokens=response.input_tokens,
                            cached_input_tokens=response.cached_input_tokens,
                            output_tokens=response.output_tokens,
                            latency_ms=latency_ms,
                            provider_request_id=response.provider_request_id,
                        )
                        raise BudgetExceededError(
                            f"Provider usage cost {actual_cost} USD exceeded the {job_cap} USD cap."
                        )
                    self.circuits.success(provider_config.name)
                    self.store.complete(
                        reservation,
                        provider=provider_config.name,
                        model=model,
                        actual_cost_usd=actual_cost,
                        input_tokens=response.input_tokens,
                        cached_input_tokens=response.cached_input_tokens,
                        output_tokens=response.output_tokens,
                        latency_ms=latency_ms,
                        provider_request_id=response.provider_request_id,
                    )
                    result = AiResult(
                        task=job.task,
                        payload=payload,
                        provider=provider_config.name,
                        model=model,
                        prompt_version=policy.prompt_version,
                        correlation_id=job.correlation_id,
                        content_version=job.content_version,
                        input_tokens=response.input_tokens,
                        cached_input_tokens=response.cached_input_tokens,
                        output_tokens=response.output_tokens,
                        estimated_cost_usd=str(actual_cost),
                        latency_ms=latency_ms,
                        attempts=total_attempts,
                        cache_hit=False,
                        redaction_count=redactions,
                        provider_request_id=response.provider_request_id,
                        input_fingerprint=fingerprint,
                        release_sha=self.config.release_sha,
                    )
                    self.store.cache_put(
                        cache_key,
                        result,
                        min(policy.cache_ttl_seconds, self.config.cache_ttl_seconds),
                    )
                    return result
                except ProviderError as error:
                    last_error = error
                    self.circuits.failure(provider_config.name)
                    if not error.retryable or retry_index >= retry_limit:
                        break
                    time.sleep(min(2**retry_index, 4) / 10)
                except BudgetExceededError:
                    raise
                except Exception as error:
                    last_error = error
                    self.circuits.failure(provider_config.name)
                    if retry_index >= retry_limit:
                        break
                    time.sleep(min(2**retry_index, 4) / 10)
        if last_error:
            raise last_error
        raise ProviderError("No AI provider was available.", retryable=True)

    def _event(self, name: str, result: AiResult) -> None:
        self.event_sink(
            name,
            {
                "task": result.task.value,
                "provider": result.provider.value,
                "model": result.model,
                "prompt_version": result.prompt_version,
                "correlation_id": result.correlation_id,
                "content_version": result.content_version,
                "input_fingerprint": result.input_fingerprint,
                "input_tokens": result.input_tokens,
                "cached_input_tokens": result.cached_input_tokens,
                "output_tokens": result.output_tokens,
                "estimated_cost_usd": result.estimated_cost_usd,
                "latency_ms": result.latency_ms,
                "attempts": result.attempts,
                "cache_hit": result.cache_hit,
                "redaction_count": result.redaction_count,
                "provider_request_id": result.provider_request_id,
                "release_sha": result.release_sha,
            },
        )
