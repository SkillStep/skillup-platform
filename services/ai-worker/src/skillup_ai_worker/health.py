"""Dependency-free bootstrap health check for the SkillUp AI worker."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Health:
    status: str
    service: str
    version: str
    provider: str
    release_sha: str


def current_health() -> Health:
    """Return non-sensitive health metadata.

    The worker remains deliberately disabled until a provider, durable job contract,
    schema validation, and cost policy are configured.
    """

    provider = os.getenv("AI_PROVIDER", "disabled")
    return Health(
        status="ok" if provider == "disabled" else "configured",
        service="skillup-ai-worker",
        version="0.0.0",
        provider=provider,
        release_sha=os.getenv("RELEASE_SHA", "local"),
    )


def main() -> int:
    json.dump(asdict(current_health()), sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
