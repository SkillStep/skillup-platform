"""Durable SQLite budget ledger, idempotency record, and response cache."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

from .contracts import AiResult, ProviderName, TaskName
from .errors import BudgetExceededError, ProviderError


@dataclass(frozen=True)
class Reservation:
    reservation_id: str
    reserved_cost_usd: Decimal


class GatewayStore:
    """A durable single-worker store.

    SQLite WAL mode safely supports the initial single-replica worker. The database path must be
    placed on persistent encrypted storage outside tests. Multi-replica execution requires moving
    the same contracts to the platform PostgreSQL database before scaling horizontally.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._memory_uri = (
            f"file:skillup-ai-{uuid4()}?mode=memory&cache=shared" if path == ":memory:" else None
        )
        self._keeper: sqlite3.Connection | None = None
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        else:
            self._keeper = sqlite3.connect(self._memory_uri, uri=True, isolation_level=None)
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
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        if self.path != ":memory:":
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = FULL")
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS ai_usage_ledger (
                    reservation_id TEXT PRIMARY KEY,
                    correlation_id TEXT NOT NULL,
                    task TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    content_version TEXT NOT NULL,
                    input_fingerprint TEXT NOT NULL,
                    release_sha TEXT NOT NULL,
                    redaction_count INTEGER NOT NULL DEFAULT 0,
                    reserved_cost_usd TEXT NOT NULL,
                    actual_cost_usd TEXT,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    latency_ms INTEGER,
                    provider_request_id TEXT,
                    status TEXT NOT NULL CHECK (status IN ('reserved','completed','failed')),
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx
                    ON ai_usage_ledger(created_at);
                CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_active_job_idx
                    ON ai_usage_ledger(correlation_id, task)
                    WHERE status IN ('reserved','completed');
                CREATE TABLE IF NOT EXISTS ai_job_results (
                    correlation_id TEXT NOT NULL,
                    task TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(correlation_id, task)
                );
                CREATE TABLE IF NOT EXISTS ai_response_cache (
                    cache_key TEXT PRIMARY KEY,
                    result_json TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            self._migrate_legacy_usage_constraint(connection)

    @staticmethod
    def _migrate_legacy_usage_constraint(connection: sqlite3.Connection) -> None:
        row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ai_usage_ledger'"
        ).fetchone()
        table_sql = str(row["sql"] if row else "")
        if "UNIQUE(correlation_id, task)" not in table_sql:
            return

        try:
            connection.executescript(
                """
                BEGIN IMMEDIATE;
                CREATE TABLE ai_usage_ledger_v2 (
                    reservation_id TEXT PRIMARY KEY,
                    correlation_id TEXT NOT NULL,
                    task TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    content_version TEXT NOT NULL,
                    input_fingerprint TEXT NOT NULL,
                    release_sha TEXT NOT NULL,
                    redaction_count INTEGER NOT NULL DEFAULT 0,
                    reserved_cost_usd TEXT NOT NULL,
                    actual_cost_usd TEXT,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    latency_ms INTEGER,
                    provider_request_id TEXT,
                    status TEXT NOT NULL CHECK (status IN ('reserved','completed','failed')),
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                );
                INSERT INTO ai_usage_ledger_v2 SELECT * FROM ai_usage_ledger;
                DROP TABLE ai_usage_ledger;
                ALTER TABLE ai_usage_ledger_v2 RENAME TO ai_usage_ledger;
                CREATE INDEX ai_usage_created_at_idx ON ai_usage_ledger(created_at);
                CREATE UNIQUE INDEX ai_usage_active_job_idx
                    ON ai_usage_ledger(correlation_id, task)
                    WHERE status IN ('reserved','completed');
                COMMIT;
                """
            )
        except Exception:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)

    def reserve(
        self,
        *,
        correlation_id: str,
        task: TaskName,
        provider: ProviderName,
        model: str,
        prompt_version: str,
        content_version: str,
        input_fingerprint: str,
        release_sha: str,
        redaction_count: int,
        requested_cost_usd: Decimal,
        daily_budget_usd: Decimal,
        monthly_budget_usd: Decimal,
    ) -> Reservation:
        now = self._now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = day_start.replace(day=1)
        reservation_id = str(uuid4())
        with self._lock, self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            day_total = Decimal(
                str(
                    connection.execute(
                        """SELECT COALESCE(SUM(CAST(COALESCE(actual_cost_usd, reserved_cost_usd) AS REAL)), 0)
                           FROM ai_usage_ledger WHERE created_at >= ?""",
                        (day_start.isoformat(),),
                    ).fetchone()[0]
                )
            )
            month_total = Decimal(
                str(
                    connection.execute(
                        """SELECT COALESCE(SUM(CAST(COALESCE(actual_cost_usd, reserved_cost_usd) AS REAL)), 0)
                           FROM ai_usage_ledger WHERE created_at >= ?""",
                        (month_start.isoformat(),),
                    ).fetchone()[0]
                )
            )
            if day_total + requested_cost_usd > daily_budget_usd:
                connection.execute("ROLLBACK")
                raise BudgetExceededError("The AI daily budget would be exceeded.")
            if month_total + requested_cost_usd > monthly_budget_usd:
                connection.execute("ROLLBACK")
                raise BudgetExceededError("The AI monthly budget would be exceeded.")
            try:
                connection.execute(
                    """INSERT INTO ai_usage_ledger
                       (reservation_id, correlation_id, task, provider, model, prompt_version,
                        content_version, input_fingerprint, release_sha, redaction_count,
                        reserved_cost_usd, status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)""",
                    (
                        reservation_id,
                        correlation_id,
                        task.value,
                        provider.value,
                        model,
                        prompt_version,
                        content_version,
                        input_fingerprint,
                        release_sha,
                        redaction_count,
                        str(requested_cost_usd),
                        now.isoformat(),
                    ),
                )
            except sqlite3.IntegrityError as error:
                connection.execute("ROLLBACK")
                raise ProviderError(
                    "The same AI job is already reserved or completed.", retryable=True
                ) from error
            connection.execute("COMMIT")
        return Reservation(reservation_id, requested_cost_usd)

    def complete(
        self,
        reservation: Reservation,
        *,
        provider: ProviderName,
        model: str,
        actual_cost_usd: Decimal,
        input_tokens: int,
        cached_input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        provider_request_id: str | None,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """UPDATE ai_usage_ledger
                   SET provider = ?, model = ?, actual_cost_usd = ?, input_tokens = ?,
                       cached_input_tokens = ?, output_tokens = ?, latency_ms = ?,
                       provider_request_id = ?, status = 'completed', completed_at = ?
                   WHERE reservation_id = ? AND status = 'reserved'""",
                (
                    provider.value,
                    model,
                    str(actual_cost_usd),
                    input_tokens,
                    cached_input_tokens,
                    output_tokens,
                    latency_ms,
                    provider_request_id,
                    self._now().isoformat(),
                    reservation.reservation_id,
                ),
            )

    def fail(self, reservation: Reservation) -> None:
        with self._connection() as connection:
            connection.execute(
                """UPDATE ai_usage_ledger
                   SET actual_cost_usd = reserved_cost_usd, status = 'failed', completed_at = ?
                   WHERE reservation_id = ? AND status = 'reserved'""",
                (self._now().isoformat(), reservation.reservation_id),
            )

    @staticmethod
    def _result_json(result: AiResult) -> str:
        return json.dumps(
            {
                "task": result.task.value,
                "payload": result.payload,
                "provider": result.provider.value,
                "model": result.model,
                "prompt_version": result.prompt_version,
                "correlation_id": result.correlation_id,
                "content_version": result.content_version,
                "input_tokens": result.input_tokens,
                "cached_input_tokens": result.cached_input_tokens,
                "output_tokens": result.output_tokens,
                "estimated_cost_usd": result.estimated_cost_usd,
                "latency_ms": result.latency_ms,
                "attempts": result.attempts,
                "redaction_count": result.redaction_count,
                "provider_request_id": result.provider_request_id,
                "input_fingerprint": result.input_fingerprint,
                "release_sha": result.release_sha,
            },
            ensure_ascii=False,
            sort_keys=True,
        )

    def job_get(self, correlation_id: str, task: TaskName) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT result_json FROM ai_job_results WHERE correlation_id = ? AND task = ?",
                (correlation_id, task.value),
            ).fetchone()
            if not row:
                return None
            value = json.loads(row["result_json"])
            return value if isinstance(value, dict) else None

    def job_put(self, result: AiResult) -> None:
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO ai_job_results(correlation_id, task, result_json, created_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(correlation_id, task) DO NOTHING""",
                (
                    result.correlation_id,
                    result.task.value,
                    self._result_json(result),
                    self._now().isoformat(),
                ),
            )

    def cache_get(self, cache_key: str) -> dict[str, Any] | None:
        now = self._now().isoformat()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT result_json FROM ai_response_cache WHERE cache_key = ? AND expires_at > ?",
                (cache_key, now),
            ).fetchone()
            if not row:
                connection.execute(
                    "DELETE FROM ai_response_cache WHERE cache_key = ?", (cache_key,)
                )
                return None
            value = json.loads(row["result_json"])
            return value if isinstance(value, dict) else None

    def cache_put(self, cache_key: str, result: AiResult, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        now = self._now()
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO ai_response_cache(cache_key, result_json, expires_at, created_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(cache_key) DO UPDATE SET
                     result_json = excluded.result_json,
                     expires_at = excluded.expires_at,
                     created_at = excluded.created_at""",
                (
                    cache_key,
                    self._result_json(result),
                    (now + timedelta(seconds=ttl_seconds)).isoformat(),
                    now.isoformat(),
                ),
            )
