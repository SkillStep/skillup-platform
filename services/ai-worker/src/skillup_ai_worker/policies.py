"""Approved AI task and model policies.

Prices are intentionally explicit and version-controlled. Operators must review them against
provider documentation before enabling or changing a model in production.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping

from .contracts import ProviderName, TaskName
from .errors import UnknownTaskError


@dataclass(frozen=True)
class ModelPrice:
    input_per_million: Decimal
    cached_input_per_million: Decimal
    output_per_million: Decimal
    production_approved: bool = True


@dataclass(frozen=True)
class TaskPolicy:
    task: TaskName
    prompt_version: str
    system_prompt: str
    allowed_input_fields: frozenset[str]
    required_input_fields: frozenset[str]
    max_input_characters: int
    max_output_tokens: int
    temperature: float
    timeout_seconds: int
    max_retries: int
    max_cost_usd: Decimal
    cache_ttl_seconds: int
    thinking_enabled: bool
    preferred_models: Mapping[ProviderName, str]


MODEL_PRICES: Mapping[tuple[ProviderName, str], ModelPrice] = {
    (ProviderName.DEEPSEEK, "deepseek-v4-flash"): ModelPrice(
        Decimal("0.14"), Decimal("0.0028"), Decimal("0.28")
    ),
    (ProviderName.DEEPSEEK, "deepseek-v4-pro"): ModelPrice(
        Decimal("0.435"), Decimal("0.003625"), Decimal("0.87")
    ),
    (ProviderName.GROQ, "openai/gpt-oss-20b"): ModelPrice(
        Decimal("0.075"), Decimal("0.075"), Decimal("0.30")
    ),
    (ProviderName.GROQ, "openai/gpt-oss-120b"): ModelPrice(
        Decimal("0.15"), Decimal("0.15"), Decimal("0.60")
    ),
    (ProviderName.OPENROUTER, "openrouter/free"): ModelPrice(
        Decimal("0"), Decimal("0"), Decimal("0"), production_approved=False
    ),
    (ProviderName.DETERMINISTIC, "deterministic-v1"): ModelPrice(
        Decimal("0"), Decimal("0"), Decimal("0"), production_approved=False
    ),
}


_COMMON_MODELS = {
    ProviderName.DEEPSEEK: "deepseek-v4-flash",
    ProviderName.GROQ: "openai/gpt-oss-20b",
    ProviderName.OPENROUTER: "openrouter/free",
    ProviderName.DETERMINISTIC: "deterministic-v1",
}


def _json_prompt(instruction: str) -> str:
    return (
        "You are SkillUp's bounded educational content assistant. "
        "Use only the supplied source material and instructions. Never invent citations, learner "
        "identity, payment data, or private profile data. Return one valid JSON object only, with "
        "no markdown, commentary, or chain-of-thought. "
        + instruction
    )


TASK_POLICIES: Mapping[TaskName, TaskPolicy] = {
    TaskName.GENERATE_LEVEL: TaskPolicy(
        task=TaskName.GENERATE_LEVEL,
        prompt_version="generate-level.v1",
        system_prompt=_json_prompt(
            "JSON keys: title, objective, introduction, challenges, completion_summary. "
            "challenges must be an array of 2 to 6 objects with keys type, prompt, answer, "
            "explanation."
        ),
        allowed_input_fields=frozenset(
            {
                "skill_title",
                "path_title",
                "lesson_title",
                "level_title",
                "learning_outcomes",
                "source_material",
                "locale",
                "audience",
            }
        ),
        required_input_fields=frozenset(
            {"skill_title", "level_title", "learning_outcomes", "source_material"}
        ),
        max_input_characters=24000,
        max_output_tokens=1800,
        temperature=0.25,
        timeout_seconds=40,
        max_retries=2,
        max_cost_usd=Decimal("0.01"),
        cache_ttl_seconds=604800,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.GENERATE_DISTRACTORS: TaskPolicy(
        task=TaskName.GENERATE_DISTRACTORS,
        prompt_version="generate-distractors.v1",
        system_prompt=_json_prompt(
            "JSON keys: distractors, rationale. distractors must contain exactly three concise, "
            "plausible, unambiguous wrong answers and must not repeat the correct answer."
        ),
        allowed_input_fields=frozenset(
            {"question", "correct_answer", "source_material", "locale", "audience"}
        ),
        required_input_fields=frozenset({"question", "correct_answer", "source_material"}),
        max_input_characters=10000,
        max_output_tokens=500,
        temperature=0.35,
        timeout_seconds=25,
        max_retries=2,
        max_cost_usd=Decimal("0.003"),
        cache_ttl_seconds=604800,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.GENERATE_EXPLANATION: TaskPolicy(
        task=TaskName.GENERATE_EXPLANATION,
        prompt_version="generate-explanation.v1",
        system_prompt=_json_prompt(
            "JSON keys: explanation, misconception, next_step. Be supportive, concise, and based "
            "only on the expected answer and source material."
        ),
        allowed_input_fields=frozenset(
            {"prompt", "answer", "expected_answer", "source_material", "locale", "audience"}
        ),
        required_input_fields=frozenset(
            {"prompt", "answer", "expected_answer", "source_material"}
        ),
        max_input_characters=12000,
        max_output_tokens=700,
        temperature=0.2,
        timeout_seconds=25,
        max_retries=2,
        max_cost_usd=Decimal("0.004"),
        cache_ttl_seconds=86400,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.SUMMARIZE: TaskPolicy(
        task=TaskName.SUMMARIZE,
        prompt_version="summarize.v1",
        system_prompt=_json_prompt(
            "JSON keys: summary, key_points. key_points must be an array of 2 to 8 strings."
        ),
        allowed_input_fields=frozenset({"source_material", "locale", "audience", "max_words"}),
        required_input_fields=frozenset({"source_material"}),
        max_input_characters=30000,
        max_output_tokens=900,
        temperature=0.15,
        timeout_seconds=30,
        max_retries=2,
        max_cost_usd=Decimal("0.006"),
        cache_ttl_seconds=604800,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.DIFFICULTY_CLASSIFICATION: TaskPolicy(
        task=TaskName.DIFFICULTY_CLASSIFICATION,
        prompt_version="difficulty-classification.v1",
        system_prompt=_json_prompt(
            "JSON keys: level, confidence, rationale. level must be beginner, intermediate, or "
            "advanced. confidence must be a number from 0 to 1."
        ),
        allowed_input_fields=frozenset({"item", "rubric", "source_material", "locale"}),
        required_input_fields=frozenset({"item", "rubric"}),
        max_input_characters=12000,
        max_output_tokens=450,
        temperature=0,
        timeout_seconds=20,
        max_retries=1,
        max_cost_usd=Decimal("0.002"),
        cache_ttl_seconds=2592000,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.TRANSLATE_CONTENT: TaskPolicy(
        task=TaskName.TRANSLATE_CONTENT,
        prompt_version="translate-content.v1",
        system_prompt=_json_prompt(
            "JSON keys: translated_text, glossary_applied, reviewer_notes. Preserve meaning, "
            "formatting markers, and approved glossary terms. Do not localize factual claims."
        ),
        allowed_input_fields=frozenset(
            {"source_text", "source_locale", "target_locale", "glossary", "audience"}
        ),
        required_input_fields=frozenset({"source_text", "target_locale"}),
        max_input_characters=30000,
        max_output_tokens=2400,
        temperature=0.1,
        timeout_seconds=35,
        max_retries=2,
        max_cost_usd=Decimal("0.012"),
        cache_ttl_seconds=2592000,
        thinking_enabled=False,
        preferred_models=_COMMON_MODELS,
    ),
    TaskName.QUALITY_REVIEW: TaskPolicy(
        task=TaskName.QUALITY_REVIEW,
        prompt_version="quality-review.v1",
        system_prompt=_json_prompt(
            "JSON keys: verdict, score, issues, required_changes. verdict must be approve, revise, "
            "or reject; score must be 0 to 100. This is advisory only and never publishes content."
        ),
        allowed_input_fields=frozenset({"artifact", "rubric", "source_material", "locale"}),
        required_input_fields=frozenset({"artifact", "rubric", "source_material"}),
        max_input_characters=40000,
        max_output_tokens=1400,
        temperature=0,
        timeout_seconds=50,
        max_retries=1,
        max_cost_usd=Decimal("0.02"),
        cache_ttl_seconds=86400,
        thinking_enabled=True,
        preferred_models={
            **_COMMON_MODELS,
            ProviderName.DEEPSEEK: "deepseek-v4-pro",
            ProviderName.GROQ: "openai/gpt-oss-120b",
        },
    ),
}


def policy_for(task: TaskName) -> TaskPolicy:
    try:
        return TASK_POLICIES[task]
    except KeyError as error:
        raise UnknownTaskError(f"No approved policy exists for task {task.value}.") from error


def model_for(policy: TaskPolicy, provider: ProviderName, override: str | None = None) -> str:
    if override:
        return override
    try:
        return policy.preferred_models[provider]
    except KeyError as error:
        raise UnknownTaskError(
            f"Task {policy.task.value} has no approved model for provider {provider.value}."
        ) from error


def price_for(provider: ProviderName, model: str) -> ModelPrice:
    try:
        return MODEL_PRICES[(provider, model)]
    except KeyError as error:
        raise UnknownTaskError(
            f"No reviewed price policy exists for {provider.value}/{model}."
        ) from error
