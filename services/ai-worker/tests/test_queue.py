from __future__ import annotations

import unittest

from skillup_ai_worker.config import read_worker_config
from skillup_ai_worker.contracts import AiJob, TaskName
from skillup_ai_worker.gateway import AiGateway
from skillup_ai_worker.queue import DurableJobQueue
from skillup_ai_worker.store import GatewayStore
from skillup_ai_worker.worker import run_once


def config():
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


class QueueTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queue = DurableJobQueue(":memory:")
        self.store = GatewayStore(":memory:")
        self.addCleanup(self.queue.close)
        self.addCleanup(self.store.close)

    @staticmethod
    def job(correlation: str) -> AiJob:
        return AiJob(
            TaskName.SUMMARIZE,
            {"source_material": "Reviewed material."},
            correlation,
            "v1",
        )

    def test_claims_highest_priority_first(self) -> None:
        low = self.queue.enqueue(self.job("low"), priority=10)
        high = self.queue.enqueue(self.job("high"), priority=90)
        claimed = self.queue.claim("worker")
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed.job_id if claimed else None, high)
        self.assertEqual(self.queue.status(low), "queued")

    def test_cancels_queued_and_running_jobs(self) -> None:
        queued_id = self.queue.enqueue(self.job("queued"))
        self.assertTrue(self.queue.cancel(queued_id))
        self.assertEqual(self.queue.status(queued_id), "cancelled")

        running_id = self.queue.enqueue(self.job("running"))
        running = self.queue.claim("worker")
        self.assertEqual(running.job_id if running else None, running_id)
        self.assertTrue(self.queue.cancel(running_id))
        self.assertTrue(self.queue.cancellation_requested(running))
        self.queue.mark_cancelled(running)
        self.assertEqual(self.queue.status(running_id), "cancelled")

    def test_worker_completes_deterministic_job(self) -> None:
        job_id = self.queue.enqueue(self.job("complete"))
        gateway = AiGateway(config(), store=self.store, event_sink=lambda *_: None)
        self.assertTrue(run_once(gateway, self.queue, worker_id="worker"))
        self.assertEqual(self.queue.status(job_id), "completed")

    def test_queue_stores_redacted_payload_only(self) -> None:
        job_id = self.queue.enqueue(
            AiJob(
                TaskName.SUMMARIZE,
                {"source_material": "Contact learner@example.com."},
                "redacted-queue",
                "v1",
            )
        )
        claimed = self.queue.claim("worker")
        self.assertEqual(claimed.job_id if claimed else None, job_id)
        self.assertNotIn("learner@example.com", repr(claimed.job.payload if claimed else {}))
        self.assertEqual(claimed.redaction_count if claimed else 0, 1)


if __name__ == "__main__":
    unittest.main()
