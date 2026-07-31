from __future__ import annotations

import sqlite3
import unittest
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory

from skillup_ai_worker.contracts import ProviderName, TaskName
from skillup_ai_worker.errors import BudgetExceededError, ProviderError
from skillup_ai_worker.store import GatewayStore


class StoreTests(unittest.TestCase):
    def test_reservations_are_durable_and_bounded(self) -> None:
        store = GatewayStore(":memory:")
        self.addCleanup(store.close)
        reservation = store.reserve(
            correlation_id="one",
            task=TaskName.SUMMARIZE,
            provider=ProviderName.DEEPSEEK,
            model="deepseek-v4-flash",
            prompt_version="test.v1",
            content_version="content-v1",
            input_fingerprint="a" * 64,
            release_sha="test",
            redaction_count=0,
            requested_cost_usd=Decimal("0.01"),
            daily_budget_usd=Decimal("0.02"),
            monthly_budget_usd=Decimal("0.02"),
        )
        store.complete(
            reservation,
            provider=ProviderName.DEEPSEEK,
            model="deepseek-v4-flash",
            actual_cost_usd=Decimal("0.005"),
            input_tokens=100,
            cached_input_tokens=10,
            output_tokens=20,
            latency_ms=12,
            provider_request_id="request",
        )
        store.reserve(
            correlation_id="two",
            task=TaskName.SUMMARIZE,
            provider=ProviderName.DEEPSEEK,
            model="deepseek-v4-flash",
            prompt_version="test.v1",
            content_version="content-v1",
            input_fingerprint="b" * 64,
            release_sha="test",
            redaction_count=0,
            requested_cost_usd=Decimal("0.015"),
            daily_budget_usd=Decimal("0.02"),
            monthly_budget_usd=Decimal("0.02"),
        )
        with self.assertRaises(BudgetExceededError):
            store.reserve(
                correlation_id="three",
                task=TaskName.SUMMARIZE,
                provider=ProviderName.DEEPSEEK,
                model="deepseek-v4-flash",
                prompt_version="test.v1",
                content_version="content-v1",
                input_fingerprint="c" * 64,
                release_sha="test",
                redaction_count=0,
                requested_cost_usd=Decimal("0.001"),
                daily_budget_usd=Decimal("0.02"),
                monthly_budget_usd=Decimal("0.02"),
            )


    def test_legacy_unique_constraint_is_migrated_for_retryable_jobs(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "gateway.sqlite3"
            connection = sqlite3.connect(path)
            connection.executescript(
                """
                CREATE TABLE ai_usage_ledger (
                    reservation_id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL,
                    task TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
                    prompt_version TEXT NOT NULL, content_version TEXT NOT NULL,
                    input_fingerprint TEXT NOT NULL, release_sha TEXT NOT NULL,
                    redaction_count INTEGER NOT NULL DEFAULT 0,
                    reserved_cost_usd TEXT NOT NULL, actual_cost_usd TEXT,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER,
                    provider_request_id TEXT, status TEXT NOT NULL,
                    created_at TEXT NOT NULL, completed_at TEXT,
                    UNIQUE(correlation_id, task)
                );
                CREATE INDEX ai_usage_created_at_idx ON ai_usage_ledger(created_at);
                """
            )
            connection.close()

            store = GatewayStore(str(path))
            self.addCleanup(store.close)
            common = {
                "correlation_id": "legacy-retry",
                "task": TaskName.SUMMARIZE,
                "provider": ProviderName.DEEPSEEK,
                "model": "deepseek-v4-flash",
                "prompt_version": "test.v1",
                "content_version": "content-v1",
                "input_fingerprint": "e" * 64,
                "release_sha": "test",
                "redaction_count": 0,
                "requested_cost_usd": Decimal("0.01"),
                "daily_budget_usd": Decimal("0.03"),
                "monthly_budget_usd": Decimal("0.03"),
            }
            first = store.reserve(**common)
            store.fail(first)
            second = store.reserve(**common)
            self.assertNotEqual(first.reservation_id, second.reservation_id)

    def test_failed_job_can_be_reserved_again_without_allowing_active_duplicates(self) -> None:
        store = GatewayStore(":memory:")
        self.addCleanup(store.close)
        common = {
            "correlation_id": "retryable",
            "task": TaskName.SUMMARIZE,
            "provider": ProviderName.DEEPSEEK,
            "model": "deepseek-v4-flash",
            "prompt_version": "test.v1",
            "content_version": "content-v1",
            "input_fingerprint": "d" * 64,
            "release_sha": "test",
            "redaction_count": 0,
            "requested_cost_usd": Decimal("0.01"),
            "daily_budget_usd": Decimal("0.03"),
            "monthly_budget_usd": Decimal("0.03"),
        }
        first = store.reserve(**common)
        store.fail(first)
        second = store.reserve(**common)

        self.assertNotEqual(first.reservation_id, second.reservation_id)
        with self.assertRaises(ProviderError):
            store.reserve(**common)

    def test_failed_requests_keep_their_reservation_for_safety(self) -> None:
        store = GatewayStore(":memory:")
        self.addCleanup(store.close)
        reservation = store.reserve(
            correlation_id="failed",
            task=TaskName.SUMMARIZE,
            provider=ProviderName.DEEPSEEK,
            model="deepseek-v4-flash",
            prompt_version="test.v1",
            content_version="content-v1",
            input_fingerprint="a" * 64,
            release_sha="test",
            redaction_count=0,
            requested_cost_usd=Decimal("0.01"),
            daily_budget_usd=Decimal("0.01"),
            monthly_budget_usd=Decimal("0.01"),
        )
        store.fail(reservation)
        with self.assertRaises(BudgetExceededError):
            store.reserve(
                correlation_id="next",
                task=TaskName.SUMMARIZE,
                provider=ProviderName.DEEPSEEK,
                model="deepseek-v4-flash",
                prompt_version="test.v1",
                content_version="content-v1",
                input_fingerprint="c" * 64,
                release_sha="test",
                redaction_count=0,
                requested_cost_usd=Decimal("0.001"),
                daily_budget_usd=Decimal("0.01"),
                monthly_budget_usd=Decimal("0.01"),
            )


if __name__ == "__main__":
    unittest.main()
