"""Durable priority queue with leases, bounded retries, and cancellation."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from .contracts import AiJob, AiResult, TaskName
from .errors import AiConfigurationError, ProviderError
from .policies import policy_for
from .privacy import sanitize_payload


@dataclass(frozen=True)
class QueuedJob:
    job_id: str
    job: AiJob
    priority: int
    attempts: int
    redaction_count: int
    lease_owner: str


class DurableJobQueue:
    """SQLite queue for the initial single-replica worker.

    The queue stores only policy-approved, redacted payloads. Operators must put the database on
    encrypted persistent storage. Horizontal scaling requires the PostgreSQL queue implementation
    described in the AI operations runbook.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._memory_uri = (
            f"file:skillup-ai-queue-{uuid4()}?mode=memory&cache=shared"
            if path == ":memory:"
            else None
        )
        self._keeper: sqlite3.Connection | None = None
        if path == ":memory:":
            self._keeper = sqlite3.connect(self._memory_uri, uri=True, isolation_level=None)
        else:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def close(self) -> None:
        if self._keeper is not None:
            self._keeper.close()
            self._keeper = None

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self._memory_uri or self.path,
            timeout=10,
            isolation_level=None,
            uri=self._memory_uri is not None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        if self.path != ":memory:":
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = FULL")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS ai_job_queue (
                    job_id TEXT PRIMARY KEY,
                    correlation_id TEXT NOT NULL,
                    task TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    content_version TEXT NOT NULL,
                    priority INTEGER NOT NULL CHECK(priority BETWEEN 0 AND 100),
                    redaction_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL CHECK(status IN (
                        'queued','running','cancel_requested','cancelled','completed','failed'
                    )),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    available_at TEXT NOT NULL,
                    lease_owner TEXT,
                    lease_until TEXT,
                    result_json TEXT,
                    error_type TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(correlation_id, task)
                );
                CREATE INDEX IF NOT EXISTS ai_job_queue_claim_idx
                    ON ai_job_queue(status, available_at, priority DESC, created_at);
                """
            )

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)

    def enqueue(self, job: AiJob, *, priority: int = 50) -> str:
        if not 0 <= priority <= 100:
            raise AiConfigurationError("AI job priority must be between 0 and 100.")
        policy = policy_for(job.task)
        sanitized, redactions = sanitize_payload(job.payload, policy)
        now = self._now().isoformat()
        job_id = str(uuid4())
        try:
            with self._connection() as connection:
                connection.execute(
                    """INSERT INTO ai_job_queue
                       (job_id, correlation_id, task, payload_json, content_version, priority,
                        redaction_count, status, attempts, available_at, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)""",
                    (
                        job_id,
                        job.correlation_id,
                        job.task.value,
                        json.dumps(sanitized, ensure_ascii=False, sort_keys=True),
                        job.content_version,
                        priority,
                        redactions,
                        now,
                        now,
                        now,
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise AiConfigurationError(
                "The same correlation_id and task are already queued or completed."
            ) from error
        return job_id

    def claim(self, worker_id: str, *, lease_seconds: int = 120) -> QueuedJob | None:
        if not worker_id or len(worker_id) > 128:
            raise AiConfigurationError("worker_id must be between 1 and 128 characters.")
        if not 10 <= lease_seconds <= 3600:
            raise AiConfigurationError("lease_seconds must be between 10 and 3600.")
        now = self._now()
        with self._lock, self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """UPDATE ai_job_queue
                   SET status = 'queued', lease_owner = NULL, lease_until = NULL,
                       available_at = ?, updated_at = ?
                   WHERE status = 'running' AND lease_until <= ?""",
                (now.isoformat(), now.isoformat(), now.isoformat()),
            )
            row = connection.execute(
                """SELECT * FROM ai_job_queue
                   WHERE status = 'queued' AND available_at <= ?
                   ORDER BY priority DESC, created_at ASC
                   LIMIT 1""",
                (now.isoformat(),),
            ).fetchone()
            if not row:
                connection.execute("COMMIT")
                return None
            lease_until = now + timedelta(seconds=lease_seconds)
            connection.execute(
                """UPDATE ai_job_queue
                   SET status = 'running', lease_owner = ?, lease_until = ?,
                       attempts = attempts + 1, updated_at = ?
                   WHERE job_id = ? AND status = 'queued'""",
                (worker_id, lease_until.isoformat(), now.isoformat(), row["job_id"]),
            )
            connection.execute("COMMIT")
        payload = json.loads(row["payload_json"])
        return QueuedJob(
            job_id=str(row["job_id"]),
            job=AiJob(
                task=TaskName(str(row["task"])),
                payload=payload,
                correlation_id=str(row["correlation_id"]),
                content_version=str(row["content_version"]),
            ),
            priority=int(row["priority"]),
            attempts=int(row["attempts"]) + 1,
            redaction_count=int(row["redaction_count"]),
            lease_owner=worker_id,
        )

    def heartbeat(self, queued: QueuedJob, *, lease_seconds: int = 120) -> bool:
        now = self._now()
        with self._connection() as connection:
            cursor = connection.execute(
                """UPDATE ai_job_queue SET lease_until = ?, updated_at = ?
                   WHERE job_id = ? AND status = 'running' AND lease_owner = ?""",
                (
                    (now + timedelta(seconds=lease_seconds)).isoformat(),
                    now.isoformat(),
                    queued.job_id,
                    queued.lease_owner,
                ),
            )
            return cursor.rowcount == 1

    def cancel(self, job_id: str) -> bool:
        now = self._now().isoformat()
        with self._connection() as connection:
            cursor = connection.execute(
                """UPDATE ai_job_queue
                   SET status = CASE WHEN status = 'running' THEN 'cancel_requested' ELSE 'cancelled' END,
                       updated_at = ?
                   WHERE job_id = ? AND status IN ('queued','running')""",
                (now, job_id),
            )
            return cursor.rowcount == 1

    def cancellation_requested(self, queued: QueuedJob) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT status FROM ai_job_queue WHERE job_id = ?", (queued.job_id,)
            ).fetchone()
            return bool(row and row["status"] == "cancel_requested")

    def mark_cancelled(self, queued: QueuedJob) -> None:
        with self._connection() as connection:
            connection.execute(
                """UPDATE ai_job_queue
                   SET status = 'cancelled', lease_owner = NULL, lease_until = NULL, updated_at = ?
                   WHERE job_id = ? AND status IN ('running','cancel_requested')""",
                (self._now().isoformat(), queued.job_id),
            )

    def complete(self, queued: QueuedJob, result: AiResult) -> None:
        metadata = {
            "provider": result.provider.value,
            "model": result.model,
            "prompt_version": result.prompt_version,
            "content_version": result.content_version,
            "input_fingerprint": result.input_fingerprint,
            "estimated_cost_usd": result.estimated_cost_usd,
            "cache_hit": result.cache_hit,
            "release_sha": result.release_sha,
        }
        with self._connection() as connection:
            cursor = connection.execute(
                """UPDATE ai_job_queue
                   SET status = 'completed', result_json = ?, lease_owner = NULL, lease_until = NULL,
                       updated_at = ?
                   WHERE job_id = ? AND status IN ('running','cancel_requested')
                     AND lease_owner = ?""",
                (
                    json.dumps(metadata, sort_keys=True),
                    self._now().isoformat(),
                    queued.job_id,
                    queued.lease_owner,
                ),
            )
            if cursor.rowcount != 1:
                raise ProviderError("The AI job lease was lost before completion.", retryable=True)

    def fail(
        self,
        queued: QueuedJob,
        error: Exception,
        *,
        max_attempts: int = 3,
        backoff_seconds: int = 30,
    ) -> None:
        retryable = isinstance(error, ProviderError) and error.retryable
        should_retry = retryable and queued.attempts < max_attempts
        status = "queued" if should_retry else "failed"
        available_at = self._now() + timedelta(seconds=backoff_seconds if should_retry else 0)
        with self._connection() as connection:
            connection.execute(
                """UPDATE ai_job_queue
                   SET status = ?, available_at = ?, lease_owner = NULL, lease_until = NULL,
                       error_type = ?, updated_at = ?
                   WHERE job_id = ? AND lease_owner = ?""",
                (
                    status,
                    available_at.isoformat(),
                    type(error).__name__,
                    self._now().isoformat(),
                    queued.job_id,
                    queued.lease_owner,
                ),
            )

    def status(self, job_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT status FROM ai_job_queue WHERE job_id = ?", (job_id,)
            ).fetchone()
            return str(row["status"]) if row else None
