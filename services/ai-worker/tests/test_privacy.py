from __future__ import annotations

import unittest

from skillup_ai_worker.contracts import TaskName
from skillup_ai_worker.errors import PrivacyViolationError
from skillup_ai_worker.policies import policy_for
from skillup_ai_worker.privacy import sanitize_payload


class PrivacyTests(unittest.TestCase):
    def test_redacts_pii_patterns_without_logging_originals(self) -> None:
        cleaned, count = sanitize_payload(
            {
                "prompt": "Explain the answer from learner@example.com or +92 300 1234567.",
                "answer": "Bearer abcdefghijklmnopqrstuvwxyz",
                "expected_answer": "Use the reviewed answer.",
                "source_material": "Reviewed source.",
            },
            policy_for(TaskName.GENERATE_EXPLANATION),
        )
        self.assertGreaterEqual(count, 3)
        encoded = repr(cleaned)
        self.assertNotIn("learner@example.com", encoded)
        self.assertNotIn("1234567", encoded)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz", encoded)

    def test_rejects_private_field_names(self) -> None:
        with self.assertRaisesRegex(PrivacyViolationError, "unapproved fields"):
            sanitize_payload(
                {
                    "source_material": "Reviewed source.",
                    "user_id": "private-user",
                },
                policy_for(TaskName.SUMMARIZE),
            )

    def test_rejects_unknown_task_fields(self) -> None:
        with self.assertRaisesRegex(PrivacyViolationError, "unapproved fields"):
            sanitize_payload(
                {"source_material": "Reviewed source.", "unexpected": "value"},
                policy_for(TaskName.SUMMARIZE),
            )

    def test_rejects_oversized_payload(self) -> None:
        with self.assertRaisesRegex(PrivacyViolationError, "exceeds"):
            sanitize_payload(
                {"source_material": "x" * 40000}, policy_for(TaskName.SUMMARIZE)
            )


if __name__ == "__main__":
    unittest.main()
