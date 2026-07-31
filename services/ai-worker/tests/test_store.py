from __future__ import annotations

import unittest
from decimal import Decimal

from skillup_ai_worker.contracts import ProviderName, TaskName
from skillup_ai_worker.errors import BudgetExceededError
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
