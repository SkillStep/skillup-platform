"""Data minimization and deterministic redaction before provider calls."""

from __future__ import annotations

import json
import re
from typing import Any, Mapping

from .errors import PrivacyViolationError
from .policies import TaskPolicy


_PROHIBITED_KEY_FRAGMENTS = {
    "email",
    "phone",
    "password",
    "session",
    "cookie",
    "token",
    "payment",
    "merchant",
    "card",
    "cnic",
    "address",
    "display_name",
    "user_id",
    "learner_id",
    "ip_address",
}
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)")
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}", re.I)
_SECRET_LIKE = re.compile(r"\b(?:sk|pk|rk|ghp|github_pat)[-_][A-Za-z0-9_-]{12,}\b", re.I)


def _redact_text(value: str) -> tuple[str, int]:
    redactions = 0
    result = value
    for pattern in (_EMAIL, _PHONE, _BEARER, _SECRET_LIKE):
        result, count = pattern.subn("[REDACTED]", result)
        redactions += count
    return result, redactions


def _sanitize(value: Any) -> tuple[Any, int]:
    if value is None or isinstance(value, (bool, int, float)):
        return value, 0
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, Mapping):
        output: dict[str, Any] = {}
        total = 0
        for key, child in value.items():
            if not isinstance(key, str):
                raise PrivacyViolationError("AI payload object keys must be strings.")
            normalized = key.strip().lower()
            if any(fragment in normalized for fragment in _PROHIBITED_KEY_FRAGMENTS):
                raise PrivacyViolationError(f"AI payload field {key!r} is prohibited.")
            cleaned, redactions = _sanitize(child)
            output[key] = cleaned
            total += redactions
        return output, total
    if isinstance(value, (list, tuple)):
        output_list: list[Any] = []
        total = 0
        for child in value:
            cleaned, redactions = _sanitize(child)
            output_list.append(cleaned)
            total += redactions
        return output_list, total
    raise PrivacyViolationError(f"Unsupported AI payload value type: {type(value).__name__}.")


def sanitize_payload(payload: Mapping[str, Any], policy: TaskPolicy) -> tuple[dict[str, Any], int]:
    supplied = frozenset(payload.keys())
    unknown = supplied - policy.allowed_input_fields
    missing = policy.required_input_fields - supplied
    if unknown:
        raise PrivacyViolationError(
            f"Task {policy.task.value} received unapproved fields: {', '.join(sorted(unknown))}."
        )
    if missing:
        raise PrivacyViolationError(
            f"Task {policy.task.value} is missing fields: {', '.join(sorted(missing))}."
        )

    cleaned, redactions = _sanitize(dict(payload))
    assert isinstance(cleaned, dict)
    encoded = json.dumps(cleaned, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(encoded) > policy.max_input_characters:
        raise PrivacyViolationError(
            f"Task {policy.task.value} input exceeds {policy.max_input_characters} characters."
        )
    return cleaned, redactions
