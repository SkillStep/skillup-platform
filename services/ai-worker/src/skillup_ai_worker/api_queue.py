"""Authenticated PostgreSQL-backed job queue accessed through the SkillUp API."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .contracts import AiJob, AiResult, TaskName
from .policies import policy_for


@dataclass(frozen=True)
class ApiQueuedJob:
    request_id: str
    lease_token: str
    attempt_number: int
    job: AiJob


_API_ENVELOPE_FIELDS = frozenset({"target_type", "target_id", "requested_items"})


def _provider_payload(task: TaskName, payload: dict[str, Any]) -> dict[str, Any]:
    """Remove queue-envelope metadata without hiding genuinely invalid provider input fields."""
    cleaned = {key: value for key, value in payload.items() if key not in _API_ENVELOPE_FIELDS}
    if "locale" not in policy_for(task).allowed_input_fields:
        cleaned.pop("locale", None)
    return cleaned


def _api_cost(value: str) -> str:
    """Return the canonical fixed-point decimal accepted by the internal completion API."""
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError("AI result cost is not a valid decimal.") from error
    if not parsed.is_finite() or parsed < 0:
        raise ValueError("AI result cost must be a finite non-negative decimal.")
    if parsed == 0:
        return "0"
    normalized = format(parsed, "f")
    whole, separator, fraction = normalized.partition(".")
    if separator:
        fraction = fraction.rstrip("0")
    if len(fraction) > 12:
        raise ValueError("AI result cost exceeds the internal API decimal precision.")
    return whole if not fraction else f"{whole}.{fraction}"


def _api_attempts(value: int) -> int:
    """Preserve provider-attempt semantics while satisfying one claimed queue completion."""
    if value < 0:
        raise ValueError("AI result attempts cannot be negative.")
    return max(1, value)


class ApiJobQueue:
    def __init__(self, base_url: str, shared_secret: str, *, timeout_seconds: float = 15.0) -> None:
        normalized = base_url.strip().rstrip("/")
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("AI_JOB_API_URL must be an absolute HTTP(S) URL.")
        if len(shared_secret) < 32:
            raise ValueError("AI_WORKER_SHARED_SECRET must contain at least 32 characters.")
        self._base_url = normalized
        self._shared_secret = shared_secret
        self._timeout_seconds = timeout_seconds
        self._worker_id = "unassigned"
        self._lease_seconds = 120

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None,
        *,
        allow_no_content: bool = False,
    ) -> dict[str, Any] | None:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            f"{self._base_url}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._shared_secret}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "skillup-ai-worker/1.0",
            },
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                if response.status == 204 and allow_no_content:
                    return None
                raw = response.read(2_000_000)
        except HTTPError as error:
            detail = error.read(8192).decode("utf-8", errors="replace")
            raise RuntimeError(f"AI job API returned HTTP {error.code}: {detail}") from error
        except URLError as error:
            raise RuntimeError(f"AI job API is unavailable: {error.reason}") from error
        if not raw:
            return None
        parsed = json.loads(raw.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise RuntimeError("AI job API returned a non-object response.")
        return parsed

    def claim(
        self,
        worker_id: str,
        *,
        lease_seconds: int = 120,
    ) -> ApiQueuedJob | None:
        self._worker_id = worker_id
        self._lease_seconds = lease_seconds
        response = self._request(
            "POST",
            "/v1/internal/ai/jobs/claim",
            {"workerId": worker_id, "leaseSeconds": lease_seconds},
            allow_no_content=True,
        )
        if response is None:
            return None
        job_data = response.get("job")
        if not isinstance(job_data, dict):
            raise RuntimeError("AI job API response has no job object.")
        payload = job_data.get("payload")
        if not isinstance(payload, dict):
            raise RuntimeError("AI job API response has no payload object.")
        task = TaskName(str(job_data["task"]))
        return ApiQueuedJob(
            request_id=str(response["requestId"]),
            lease_token=str(response["leaseToken"]),
            attempt_number=int(response["attemptNumber"]),
            job=AiJob(
                task=task,
                payload=_provider_payload(task, payload),
                correlation_id=str(job_data["correlationId"]),
                content_version=str(job_data["contentVersion"]),
            ),
        )

    def cancellation_requested(self, queued: ApiQueuedJob) -> bool:
        query = urlencode({"leaseToken": queued.lease_token})
        response = self._request(
            "GET",
            f"/v1/internal/ai/jobs/{queued.request_id}/status?{query}",
            None,
        )
        if response is None:
            raise RuntimeError("AI job status response was empty.")
        return bool(response.get("cancelled")) or not bool(response.get("active"))

    def mark_cancelled(self, queued: ApiQueuedJob) -> None:
        self._request(
            "POST",
            f"/v1/internal/ai/jobs/{queued.request_id}/cancelled",
            {"leaseToken": queued.lease_token},
        )

    def complete(self, queued: ApiQueuedJob, result: AiResult) -> None:
        result_data = asdict(result)
        provider = result_data["provider"]
        task = result_data["task"]
        self._request(
            "POST",
            f"/v1/internal/ai/jobs/{queued.request_id}/complete",
            {
                "leaseToken": queued.lease_token,
                "provider": provider.value if hasattr(provider, "value") else str(provider),
                "model": result.model,
                "promptVersion": result.prompt_version,
                "task": task.value if hasattr(task, "value") else str(task),
                "payload": result.payload,
                "inputTokens": result.input_tokens,
                "cachedInputTokens": result.cached_input_tokens,
                "outputTokens": result.output_tokens,
                "estimatedCostUsd": _api_cost(result.estimated_cost_usd),
                "latencyMs": result.latency_ms,
                "attempts": _api_attempts(result.attempts),
                "inputFingerprint": result.input_fingerprint,
                "providerRequestId": result.provider_request_id,
                "releaseSha": result.release_sha,
                "redactionCount": result.redaction_count,
            },
        )

    def fail(self, queued: ApiQueuedJob, error: Exception, *, max_attempts: int = 3) -> None:
        retryable = not isinstance(error, (ValueError, KeyError, TypeError))
        self._request(
            "POST",
            f"/v1/internal/ai/jobs/{queued.request_id}/fail",
            {
                "leaseToken": queued.lease_token,
                "provider": "worker",
                "model": "unresolved",
                "errorCode": type(error).__name__[:100],
                "errorMessage": str(error)[:2000] or "AI job execution failed.",
                "retryable": retryable,
                "maxAttempts": max_attempts,
            },
        )

    def close(self) -> None:
        return None
