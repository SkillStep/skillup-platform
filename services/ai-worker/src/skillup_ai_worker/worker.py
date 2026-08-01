"""Single-replica durable AI queue worker."""

from __future__ import annotations

import os
import signal
import socket
import time
from dataclasses import dataclass
from typing import Any

from .api_queue import ApiJobQueue
from .config import read_worker_config
from .gateway import AiGateway
from .observability import emit_event
from .queue import DurableJobQueue
from .store import GatewayStore


@dataclass
class ShutdownState:
    requested: bool = False


def run_once(
    gateway: AiGateway,
    queue: Any,
    *,
    worker_id: str,
    lease_seconds: int = 120,
    max_attempts: int = 3,
) -> bool:
    queued = queue.claim(worker_id, lease_seconds=lease_seconds)
    if queued is None:
        return False
    if queue.cancellation_requested(queued):
        queue.mark_cancelled(queued)
        return True
    try:
        result = gateway.execute(queued.job)
        if queue.cancellation_requested(queued):
            queue.mark_cancelled(queued)
        else:
            queue.complete(queued, result)
        return True
    except Exception as error:
        queue.fail(queued, error, max_attempts=max_attempts)
        return True


def main() -> int:
    config = read_worker_config()
    if not config.feature_enabled:
        emit_event(
            "ai_worker.disabled",
            {"provider": config.primary.name.value, "release_sha": config.release_sha},
        )
        return 0
    store = GatewayStore(config.budget_db_path)
    job_api_url = os.getenv("AI_JOB_API_URL", "").strip()
    worker_secret = os.getenv("AI_WORKER_SHARED_SECRET", "").strip()
    if bool(job_api_url) != bool(worker_secret):
        raise RuntimeError(
            "AI_JOB_API_URL and AI_WORKER_SHARED_SECRET must be configured together."
        )
    queue: Any = (
        ApiJobQueue(
            job_api_url,
            worker_secret,
            timeout_seconds=max(
                1.0,
                min(float(os.getenv("AI_JOB_API_TIMEOUT_SECONDS", "15")), 120.0),
            ),
        )
        if job_api_url
        else DurableJobQueue(config.budget_db_path)
    )
    gateway = AiGateway(config, store=store)
    worker_id = os.getenv("AI_WORKER_ID", f"{socket.gethostname()}:{os.getpid()}")
    poll_seconds = max(0.1, min(float(os.getenv("AI_WORKER_POLL_SECONDS", "1")), 30.0))
    lease_seconds = max(10, min(int(os.getenv("AI_WORKER_LEASE_SECONDS", "120")), 3600))
    max_attempts = max(1, min(int(os.getenv("AI_WORKER_MAX_ATTEMPTS", "3")), 10))
    shutdown = ShutdownState()

    def request_shutdown(signum: int, frame: object) -> None:
        del signum, frame
        shutdown.requested = True

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    emit_event(
        "ai_worker.started",
        {
            "worker_id": worker_id,
            "queue_mode": "api" if job_api_url else "sqlite",
            "provider": config.primary.name.value,
            "fallback_provider": config.fallback.name.value if config.fallback else None,
            "release_sha": config.release_sha,
        },
    )
    try:
        while not shutdown.requested:
            processed = run_once(
                gateway,
                queue,
                worker_id=worker_id,
                lease_seconds=lease_seconds,
                max_attempts=max_attempts,
            )
            if not processed:
                time.sleep(poll_seconds)
    finally:
        queue.close()
        store.close()
        emit_event(
            "ai_worker.stopped", {"worker_id": worker_id, "release_sha": config.release_sha}
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
