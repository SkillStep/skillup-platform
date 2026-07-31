from __future__ import annotations

import json
import unittest

from skillup_ai_worker.contracts import TaskName
from skillup_ai_worker.errors import OutputValidationError
from skillup_ai_worker.validation import parse_and_validate_output


class ValidationTests(unittest.TestCase):
    def test_validates_distractors(self) -> None:
        value = parse_and_validate_output(
            TaskName.GENERATE_DISTRACTORS,
            json.dumps(
                {
                    "distractors": ["One", "Two", "Three"],
                    "rationale": "All are distinct.",
                }
            ),
        )
        self.assertEqual(value["distractors"], ["One", "Two", "Three"])

    def test_rejects_markdown_or_invalid_json(self) -> None:
        with self.assertRaisesRegex(OutputValidationError, "valid JSON"):
            parse_and_validate_output(TaskName.SUMMARIZE, "```json\n{}\n```")

    def test_rejects_unapproved_output_keys(self) -> None:
        with self.assertRaisesRegex(OutputValidationError, "unapproved keys"):
            parse_and_validate_output(
                TaskName.SUMMARIZE,
                json.dumps(
                    {
                        "summary": "Summary",
                        "key_points": ["A", "B"],
                        "private_notes": "not allowed",
                    }
                ),
            )

    def test_review_is_advisory_structured_output(self) -> None:
        value = parse_and_validate_output(
            TaskName.QUALITY_REVIEW,
            json.dumps(
                {
                    "verdict": "revise",
                    "score": 84,
                    "issues": ["Needs source confirmation"],
                    "required_changes": ["Verify the claim"],
                }
            ),
        )
        self.assertEqual(value["verdict"], "revise")
        self.assertEqual(value["score"], 84.0)


if __name__ == "__main__":
    unittest.main()
