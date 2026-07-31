"""Privacy-safe structured AI gateway events."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from typing import Any, Mapping


def emit_event(name: str, fields: Mapping[str, Any]) -> None:
    """Write one JSON event without prompt, output, credentials, or learner identifiers."""

    event = {
        "timestamp": datetime.now(UTC).isoformat(),
        "event": name,
        **fields,
    }
    json.dump(event, sys.stderr, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    sys.stderr.write("\n")
