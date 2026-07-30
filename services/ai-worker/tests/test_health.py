from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from skillup_ai_worker.health import current_health


class HealthTests(unittest.TestCase):
    def test_provider_is_disabled_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            health = current_health()

        self.assertEqual(health.status, "ok")
        self.assertEqual(health.provider, "disabled")
        self.assertEqual(health.release_sha, "local")

    def test_configured_provider_is_reported_without_secret_material(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "test-adapter",
                "DEEPSEEK_API_KEY": "must-not-be-returned",
                "RELEASE_SHA": "abc123",
            },
            clear=True,
        ):
            health = current_health()

        self.assertEqual(health.status, "configured")
        self.assertEqual(health.provider, "test-adapter")
        self.assertEqual(health.release_sha, "abc123")
        self.assertNotIn("must-not-be-returned", repr(health))


if __name__ == "__main__":
    unittest.main()
