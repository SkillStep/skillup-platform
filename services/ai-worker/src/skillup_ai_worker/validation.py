"""Strict task-specific output validation."""

from __future__ import annotations

import json
from typing import Any, Callable

from .contracts import JsonObject, TaskName
from .errors import OutputValidationError


def _require_keys(value: JsonObject, required: set[str], allowed: set[str]) -> None:
    missing = required - value.keys()
    extra = value.keys() - allowed
    if missing:
        raise OutputValidationError(f"Provider output is missing keys: {', '.join(sorted(missing))}.")
    if extra:
        raise OutputValidationError(f"Provider output has unapproved keys: {', '.join(sorted(extra))}.")


def _text(value: Any, name: str, *, minimum: int = 1, maximum: int = 12000) -> str:
    if not isinstance(value, str):
        raise OutputValidationError(f"{name} must be a string.")
    normalized = value.strip()
    if len(normalized) < minimum or len(normalized) > maximum:
        raise OutputValidationError(f"{name} length is outside the approved range.")
    return normalized


def _string_list(value: Any, name: str, *, minimum: int, maximum: int) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise OutputValidationError(f"{name} must contain between {minimum} and {maximum} items.")
    return [_text(item, f"{name}[]", maximum=2000) for item in value]


def _validate_level(value: JsonObject) -> JsonObject:
    keys = {"title", "objective", "introduction", "challenges", "completion_summary"}
    _require_keys(value, keys, keys)
    challenges = value["challenges"]
    if not isinstance(challenges, list) or not 2 <= len(challenges) <= 6:
        raise OutputValidationError("challenges must contain between 2 and 6 items.")
    normalized_challenges: list[JsonObject] = []
    challenge_keys = {"type", "prompt", "answer", "explanation"}
    for index, challenge in enumerate(challenges):
        if not isinstance(challenge, dict):
            raise OutputValidationError(f"challenges[{index}] must be an object.")
        _require_keys(challenge, challenge_keys, challenge_keys)
        normalized_challenges.append(
            {
                "type": _text(challenge["type"], f"challenges[{index}].type", maximum=40),
                "prompt": _text(challenge["prompt"], f"challenges[{index}].prompt"),
                "answer": _text(challenge["answer"], f"challenges[{index}].answer"),
                "explanation": _text(
                    challenge["explanation"], f"challenges[{index}].explanation"
                ),
            }
        )
    return {
        "title": _text(value["title"], "title", maximum=160),
        "objective": _text(value["objective"], "objective", maximum=500),
        "introduction": _text(value["introduction"], "introduction"),
        "challenges": normalized_challenges,
        "completion_summary": _text(value["completion_summary"], "completion_summary"),
    }


def _validate_distractors(value: JsonObject) -> JsonObject:
    keys = {"distractors", "rationale"}
    _require_keys(value, keys, keys)
    distractors = _string_list(value["distractors"], "distractors", minimum=3, maximum=3)
    if len({item.casefold() for item in distractors}) != 3:
        raise OutputValidationError("distractors must be distinct.")
    return {"distractors": distractors, "rationale": _text(value["rationale"], "rationale")}


def _validate_explanation(value: JsonObject) -> JsonObject:
    keys = {"explanation", "misconception", "next_step"}
    _require_keys(value, keys, keys)
    return {key: _text(value[key], key) for key in keys}


def _validate_summary(value: JsonObject) -> JsonObject:
    keys = {"summary", "key_points"}
    _require_keys(value, keys, keys)
    return {
        "summary": _text(value["summary"], "summary"),
        "key_points": _string_list(value["key_points"], "key_points", minimum=2, maximum=8),
    }


def _validate_difficulty(value: JsonObject) -> JsonObject:
    keys = {"level", "confidence", "rationale"}
    _require_keys(value, keys, keys)
    level = _text(value["level"], "level", maximum=20).lower()
    if level not in {"beginner", "intermediate", "advanced"}:
        raise OutputValidationError("level must be beginner, intermediate, or advanced.")
    confidence = value["confidence"]
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        raise OutputValidationError("confidence must be numeric.")
    if not 0 <= float(confidence) <= 1:
        raise OutputValidationError("confidence must be between 0 and 1.")
    return {
        "level": level,
        "confidence": float(confidence),
        "rationale": _text(value["rationale"], "rationale"),
    }


def _validate_translation(value: JsonObject) -> JsonObject:
    keys = {"translated_text", "glossary_applied", "reviewer_notes"}
    _require_keys(value, keys, keys)
    glossary = value["glossary_applied"]
    if not isinstance(glossary, list):
        raise OutputValidationError("glossary_applied must be an array.")
    return {
        "translated_text": _text(value["translated_text"], "translated_text"),
        "glossary_applied": [_text(item, "glossary_applied[]", maximum=300) for item in glossary],
        "reviewer_notes": _text(value["reviewer_notes"], "reviewer_notes", maximum=2000),
    }


def _validate_review(value: JsonObject) -> JsonObject:
    keys = {"verdict", "score", "issues", "required_changes"}
    _require_keys(value, keys, keys)
    verdict = _text(value["verdict"], "verdict", maximum=20).lower()
    if verdict not in {"approve", "revise", "reject"}:
        raise OutputValidationError("verdict must be approve, revise, or reject.")
    score = value["score"]
    if not isinstance(score, (int, float)) or isinstance(score, bool) or not 0 <= score <= 100:
        raise OutputValidationError("score must be numeric from 0 to 100.")
    return {
        "verdict": verdict,
        "score": float(score),
        "issues": _string_list(value["issues"], "issues", minimum=0, maximum=20),
        "required_changes": _string_list(
            value["required_changes"], "required_changes", minimum=0, maximum=20
        ),
    }


_VALIDATORS: dict[TaskName, Callable[[JsonObject], JsonObject]] = {
    TaskName.GENERATE_LEVEL: _validate_level,
    TaskName.GENERATE_DISTRACTORS: _validate_distractors,
    TaskName.GENERATE_EXPLANATION: _validate_explanation,
    TaskName.SUMMARIZE: _validate_summary,
    TaskName.DIFFICULTY_CLASSIFICATION: _validate_difficulty,
    TaskName.TRANSLATE_CONTENT: _validate_translation,
    TaskName.QUALITY_REVIEW: _validate_review,
}


def parse_and_validate_output(task: TaskName, content: str) -> JsonObject:
    if not content.strip():
        raise OutputValidationError("Provider returned empty content.")
    if len(content) > 100000:
        raise OutputValidationError("Provider output exceeds the absolute size limit.")
    try:
        value = json.loads(content)
    except json.JSONDecodeError as error:
        raise OutputValidationError("Provider output is not valid JSON.") from error
    if not isinstance(value, dict):
        raise OutputValidationError("Provider output must be one JSON object.")
    return _VALIDATORS[task](value)
