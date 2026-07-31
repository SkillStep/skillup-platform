from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from skillup_ai_worker.health import current_health


class HealthTests(unittest.TestCase):
    def test_provider_is_disabled_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            health = current_health()

        self.assertEqual(health.status, "disabled")
        self.assertEqual(health.provider, "disabled")
        self.assertFalse(health.feature_enabled)
        self.assertEqual(health.release_sha, "local")
        self.assertGreater(health.approved_task_count, 0)

    def test_configured_provider_is_reported_without_secret_material(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "test",
                "FEATURE_AI_GENERATION_ENABLED": "true",
                "AI_PROVIDER": "deepseek",
                "DEEPSEEK_API_KEY": "must-not-be-returned",
                "RELEASE_SHA": "abc123",
            },
            clear=True,
        ):
            health = current_health()

        self.assertEqual(health.status, "ready")
        self.assertEqual(health.provider, "deepseek")
        self.assertEqual(health.release_sha, "abc123")
        self.assertNotIn("must-not-be-returned", repr(health))

    def test_misconfiguration_is_safe_and_non_secret(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "FEATURE_AI_GENERATION_ENABLED": "true",
                "AI_PROVIDER": "deepseek",
            },
            clear=True,
        ):
            health = current_health()
        self.assertEqual(health.status, "misconfigured")
        self.assertIn("secret API key", health.configuration_error or "")


if __name__ == "__main__":
    unittest.main()
