"""Non-sensitive health metadata for the SkillUp AI worker."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass

from .config import read_worker_config
from .errors import AiConfigurationError
from .policies import TASK_POLICIES


@dataclass(frozen=True)
class Health:
    status: str
    service: str
    version: str
    provider: str
    fallback_provider: str | None
    feature_enabled: bool
    approved_task_count: int
    release_sha: str
    configuration_error: str | None = None


def current_health() -> Health:
    try:
        config = read_worker_config()
    except AiConfigurationError as error:
        return Health(
            status="misconfigured",
            service="skillup-ai-worker",
            version="1.0.0",
            provider=os.getenv("AI_PROVIDER", "disabled"),
            fallback_provider=os.getenv("AI_FALLBACK_PROVIDER") or None,
            feature_enabled=os.getenv("FEATURE_AI_GENERATION_ENABLED", "false") == "true",
            approved_task_count=len(TASK_POLICIES),
            release_sha=os.getenv("RELEASE_SHA", "local"),
            configuration_error=str(error),
        )

    status = "ready" if config.feature_enabled else "disabled"
    return Health(
        status=status,
        service="skillup-ai-worker",
        version="1.0.0",
        provider=config.primary.name.value,
        fallback_provider=config.fallback.name.value if config.fallback else None,
        feature_enabled=config.feature_enabled,
        approved_task_count=len(TASK_POLICIES),
        release_sha=config.release_sha,
    )


def main() -> int:
    health = current_health()
    json.dump(asdict(health), sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 1 if health.status == "misconfigured" else 0


if __name__ == "__main__":
    raise SystemExit(main())
