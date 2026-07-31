from __future__ import annotations

import json
import unittest
from dataclasses import replace

from skillup_ai_worker.config import read_worker_config
from skillup_ai_worker.contracts import AiJob, ProviderName, ProviderRequest, ProviderResponse, TaskName
from skillup_ai_worker.errors import AiDisabledError, AiGatewayError, ProviderError
from skillup_ai_worker.gateway import AiGateway
from skillup_ai_worker.providers.deterministic import DeterministicAdapter
from skillup_ai_worker.store import GatewayStore


class FailingAdapter:
    def __init__(self, retryable: bool = True) -> None:
        self.calls = 0
        self.retryable = retryable

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        del request
        self.calls += 1
        raise ProviderError("upstream unavailable", retryable=self.retryable, status_code=503)


class StaticAdapter:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response
        self.calls = 0

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        del request
        self.calls += 1
        return ProviderResponse(json.dumps(self.response), 100, 20, provider_request_id="static")


def deterministic_config():
    return read_worker_config(
        {
            "APP_ENV": "test",
            "FEATURE_AI_GENERATION_ENABLED": "true",
            "AI_PROVIDER": "deterministic",
            "AI_BUDGET_DB_PATH": ":memory:",
            "AI_DAILY_BUDGET_USD": "1",
            "AI_MONTHLY_BUDGET_USD": "1",
        }
    )


class GatewayTests(unittest.TestCase):
    def test_disabled_feature_refuses_execution(self) -> None:
        gateway = AiGateway(read_worker_config({}), store=GatewayStore(":memory:"), event_sink=lambda *_: None)
        with self.assertRaises(AiDisabledError):
            gateway.execute(
                AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "disabled", "v1")
            )

    def test_deterministic_execution_and_cache(self) -> None:
        gateway = AiGateway(deterministic_config(), store=GatewayStore(":memory:"), event_sink=lambda *_: None)
        job = AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "cache-one", "v1")
        first = gateway.execute(job)
        second = gateway.execute(replace(job, correlation_id="cache-two"))
        self.assertFalse(first.cache_hit)
        self.assertTrue(second.cache_hit)
        self.assertEqual(second.estimated_cost_usd, "0")
        self.assertEqual(first.payload, second.payload)

    def test_primary_failure_uses_reviewed_fallback(self) -> None:
        config = read_worker_config(
            {
                "APP_ENV": "test",
                "FEATURE_AI_GENERATION_ENABLED": "true",
                "AI_PROVIDER": "deepseek",
                "DEEPSEEK_API_KEY": "secret",
                "AI_FALLBACK_PROVIDER": "groq",
                "GROQ_API_KEY": "fallback",
                "AI_MAX_RETRIES": "0",
                "AI_BUDGET_DB_PATH": ":memory:",
                "AI_DAILY_BUDGET_USD": "1",
                "AI_MONTHLY_BUDGET_USD": "1",
            }
        )
        failing = FailingAdapter()
        fallback = StaticAdapter(
            {"summary": "Fallback summary", "key_points": ["First", "Second"]}
        )
        gateway = AiGateway(
            config,
            store=GatewayStore(":memory:"),
            adapters={ProviderName.DEEPSEEK: failing, ProviderName.GROQ: fallback},
            event_sink=lambda *_: None,
        )
        result = gateway.execute(
            AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "fallback", "v1")
        )
        self.assertEqual(result.provider, ProviderName.GROQ)
        self.assertEqual(failing.calls, 1)
        self.assertEqual(fallback.calls, 1)

    def test_same_correlation_is_idempotent_and_rejects_changed_input(self) -> None:
        gateway = AiGateway(
            deterministic_config(), store=GatewayStore(":memory:"), event_sink=lambda *_: None
        )
        first = gateway.execute(
            AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "same-job", "v1")
        )
        repeated = gateway.execute(
            AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "same-job", "v1")
        )
        self.assertTrue(repeated.cache_hit)
        self.assertEqual(first.payload, repeated.payload)
        with self.assertRaisesRegex(AiGatewayError, "different sanitized input"):
            gateway.execute(
                AiJob(TaskName.SUMMARIZE, {"source_material": "Changed"}, "same-job", "v1")
            )

    def test_malformed_output_cannot_escape_gateway(self) -> None:
        config = deterministic_config()
        invalid = StaticAdapter({"unexpected": "field"})
        gateway = AiGateway(
            config,
            store=GatewayStore(":memory:"),
            adapters={ProviderName.DETERMINISTIC: invalid},
            event_sink=lambda *_: None,
        )
        with self.assertRaises(AiGatewayError):
            gateway.execute(
                AiJob(TaskName.SUMMARIZE, {"source_material": "Text"}, "invalid", "v1")
            )

    def test_redaction_is_reported_without_private_value_in_result(self) -> None:
        gateway = AiGateway(deterministic_config(), store=GatewayStore(":memory:"), event_sink=lambda *_: None)
        result = gateway.execute(
            AiJob(
                TaskName.SUMMARIZE,
                {"source_material": "Contact learner@example.com for help."},
                "redacted",
                "v1",
            )
        )
        self.assertEqual(result.redaction_count, 1)
        self.assertNotIn("learner@example.com", repr(result))


if __name__ == "__main__":
    unittest.main()
