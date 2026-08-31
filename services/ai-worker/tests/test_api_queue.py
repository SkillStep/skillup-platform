from __future__ import annotations

import unittest
from unittest.mock import Mock

from skillup_ai_worker.api_queue import ApiJobQueue, ApiQueuedJob, _api_cost
from skillup_ai_worker.contracts import AiJob, AiResult, ProviderName, TaskName


class ApiJobQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queue = ApiJobQueue(
            "https://skillup-api.internal",
            "worker-shared-secret-at-least-32-characters",
        )
        self.queued = ApiQueuedJob(
            request_id="11111111-1111-4111-8111-111111111111",
            lease_token="22222222-2222-4222-8222-222222222222",
            attempt_number=2,
            job=AiJob(
                task=TaskName.GENERATE_LEVEL,
                payload={"topic": "interview"},
                correlation_id="correlation-1",
                content_version="v1",
            ),
        )

    def test_claim_strips_queue_envelope_metadata_before_provider_validation(self) -> None:
        self.queue._request = Mock(  # type: ignore[method-assign]
            return_value={
                "requestId": "11111111-1111-4111-8111-111111111111",
                "leaseToken": "22222222-2222-4222-8222-222222222222",
                "attemptNumber": 1,
                "job": {
                    "task": "summarize",
                    "correlationId": "correlation-qa",
                    "contentVersion": "summarize.v1",
                    "payload": {
                        "source_material": "Reviewed source text.",
                        "locale": "en",
                        "target_type": "staging_qa",
                        "target_id": "qa-1",
                        "requested_items": 1,
                    },
                },
            }
        )

        claimed = self.queue.claim("worker-qa")

        self.assertIsNotNone(claimed)
        assert claimed is not None
        self.assertEqual(
            claimed.job.payload,
            {"source_material": "Reviewed source text.", "locale": "en"},
        )

    def test_claim_removes_locale_when_the_worker_task_policy_does_not_allow_it(self) -> None:
        self.queue._request = Mock(  # type: ignore[method-assign]
            return_value={
                "requestId": "11111111-1111-4111-8111-111111111111",
                "leaseToken": "22222222-2222-4222-8222-222222222222",
                "attemptNumber": 1,
                "job": {
                    "task": "translate_content",
                    "correlationId": "correlation-translate",
                    "contentVersion": "translate-content.v1",
                    "payload": {
                        "source_text": "Hello",
                        "target_locale": "ur",
                        "locale": "ur",
                        "target_type": "staging_qa",
                        "target_id": None,
                        "requested_items": 1,
                    },
                },
            }
        )

        claimed = self.queue.claim("worker-qa")

        self.assertIsNotNone(claimed)
        assert claimed is not None
        self.assertEqual(claimed.job.payload, {"source_text": "Hello", "target_locale": "ur"})

    def test_cancellation_status_uses_encoded_lease_and_stops_inactive_work(self) -> None:
        request = Mock(return_value={"active": False, "cancelled": True})
        self.queue._request = request  # type: ignore[method-assign]

        self.assertTrue(self.queue.cancellation_requested(self.queued))
        request.assert_called_once_with(
            "GET",
            "/v1/internal/ai/jobs/11111111-1111-4111-8111-111111111111/status?"
            "leaseToken=22222222-2222-4222-8222-222222222222",
            None,
        )

    def test_active_job_continues(self) -> None:
        self.queue._request = Mock(  # type: ignore[method-assign]
            return_value={"active": True, "cancelled": False}
        )
        self.assertFalse(self.queue.cancellation_requested(self.queued))

    def test_cancelled_job_is_acknowledged_without_using_failure_retry_logic(self) -> None:
        request = Mock(return_value={"cancelled": True})
        self.queue._request = request  # type: ignore[method-assign]

        self.queue.mark_cancelled(self.queued)
        request.assert_called_once_with(
            "POST",
            "/v1/internal/ai/jobs/11111111-1111-4111-8111-111111111111/cancelled",
            {"leaseToken": "22222222-2222-4222-8222-222222222222"},
        )

    def test_empty_status_response_fails_closed(self) -> None:
        self.queue._request = Mock(return_value=None)  # type: ignore[method-assign]
        with self.assertRaisesRegex(RuntimeError, "status response was empty"):
            self.queue.cancellation_requested(self.queued)

    def test_completion_normalizes_cached_result_for_internal_api_contract(self) -> None:
        request = Mock(return_value={"completed": True, "artifactId": "artifact-1"})
        self.queue._request = request  # type: ignore[method-assign]
        result = AiResult(
            task=TaskName.SUMMARIZE,
            payload={"summary": "Reviewed summary", "key_points": ["One", "Two"]},
            provider=ProviderName.DEEPSEEK,
            model="deepseek-v4-flash",
            prompt_version="summarize.v1",
            correlation_id="correlation-cache-hit",
            content_version="summarize.v1",
            input_tokens=0,
            cached_input_tokens=0,
            output_tokens=0,
            estimated_cost_usd="0E-8",
            latency_ms=0,
            attempts=0,
            cache_hit=True,
            redaction_count=0,
            provider_request_id=None,
            input_fingerprint="a" * 64,
            release_sha="release-sha",
        )

        self.queue.complete(self.queued, result)

        request.assert_called_once()
        method, path, payload = request.call_args.args
        self.assertEqual(method, "POST")
        self.assertEqual(
            path,
            "/v1/internal/ai/jobs/11111111-1111-4111-8111-111111111111/complete",
        )
        self.assertEqual(payload["estimatedCostUsd"], "0")
        self.assertEqual(payload["attempts"], 1)
        self.assertEqual(payload["provider"], "deepseek")
        self.assertEqual(payload["task"], "summarize")

    def test_completion_cost_is_plain_fixed_decimal(self) -> None:
        self.assertEqual(_api_cost("1.2300E-5"), "0.0000123")
        self.assertEqual(_api_cost("0.01000000"), "0.01")
        with self.assertRaisesRegex(ValueError, "finite non-negative"):
            _api_cost("-0.01")


if __name__ == "__main__":
    unittest.main()
