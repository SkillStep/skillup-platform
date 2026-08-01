from __future__ import annotations

import unittest
from unittest.mock import Mock

from skillup_ai_worker.api_queue import ApiJobQueue, ApiQueuedJob
from skillup_ai_worker.contracts import AiJob, TaskName


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


if __name__ == "__main__":
    unittest.main()
