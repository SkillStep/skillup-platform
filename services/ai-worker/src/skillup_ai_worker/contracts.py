"""Provider-neutral contracts for bounded SkillUp AI tasks."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Mapping, Sequence


class ProviderName(StrEnum):
    DISABLED = "disabled"
    DETERMINISTIC = "deterministic"
    DEEPSEEK = "deepseek"
    GROQ = "groq"
    OPENROUTER = "openrouter"


class TaskName(StrEnum):
    GENERATE_LEVEL = "generate_level"
    GENERATE_DISTRACTORS = "generate_distractors"
    GENERATE_EXPLANATION = "generate_explanation"
    SUMMARIZE = "summarize"
    DIFFICULTY_CLASSIFICATION = "difficulty_classification"
    TRANSLATE_CONTENT = "translate_content"
    QUALITY_REVIEW = "quality_review"


JsonObject = dict[str, Any]


@dataclass(frozen=True)
class AiJob:
    task: TaskName
    payload: Mapping[str, Any]
    correlation_id: str
    content_version: str


@dataclass(frozen=True)
class ChatMessage:
    role: str
    content: str


@dataclass(frozen=True)
class ProviderRequest:
    task: TaskName
    model: str
    messages: Sequence[ChatMessage]
    max_output_tokens: int
    temperature: float
    timeout_seconds: float
    require_json: bool
    thinking_enabled: bool


@dataclass(frozen=True)
class ProviderResponse:
    content: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int = 0
    provider_request_id: str | None = None


@dataclass(frozen=True)
class AiResult:
    task: TaskName
    payload: JsonObject
    provider: ProviderName
    model: str
    prompt_version: str
    correlation_id: str
    content_version: str
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    estimated_cost_usd: str
    latency_ms: int
    attempts: int
    cache_hit: bool
    redaction_count: int
    provider_request_id: str | None
    input_fingerprint: str
    release_sha: str
