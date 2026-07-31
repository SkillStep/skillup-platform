from __future__ import annotations

import unittest

from skillup_ai_worker.config import read_worker_config
from skillup_ai_worker.contracts import ProviderName
from skillup_ai_worker.errors import AiConfigurationError


class ConfigTests(unittest.TestCase):
    def test_defaults_are_fail_closed(self) -> None:
        config = read_worker_config({})
        self.assertFalse(config.feature_enabled)
        self.assertEqual(config.primary.name, ProviderName.DISABLED)
        self.assertIsNone(config.fallback)

    def test_enabled_deepseek_requires_secret(self) -> None:
        with self.assertRaisesRegex(AiConfigurationError, "secret API key"):
            read_worker_config(
                {
                    "APP_ENV": "production",
                    "FEATURE_AI_GENERATION_ENABLED": "true",
                    "AI_PROVIDER": "deepseek",
                }
            )

    def test_enabled_deepseek_configuration_is_accepted(self) -> None:
        config = read_worker_config(
            {
                "APP_ENV": "production",
                "FEATURE_AI_GENERATION_ENABLED": "true",
                "AI_PROVIDER": "deepseek",
                "DEEPSEEK_API_KEY": "secret",
                "AI_FALLBACK_PROVIDER": "groq",
                "GROQ_API_KEY": "fallback-secret",
            }
        )
        self.assertTrue(config.feature_enabled)
        self.assertEqual(config.primary.name, ProviderName.DEEPSEEK)
        self.assertEqual(config.fallback.name if config.fallback else None, ProviderName.GROQ)
        self.assertNotIn("secret", repr(config))

    def test_production_rejects_plain_http_provider(self) -> None:
        with self.assertRaisesRegex(AiConfigurationError, "must use HTTPS"):
            read_worker_config(
                {
                    "APP_ENV": "production",
                    "FEATURE_AI_GENERATION_ENABLED": "true",
                    "AI_PROVIDER": "deepseek",
                    "DEEPSEEK_API_KEY": "secret",
                    "DEEPSEEK_API_BASE_URL": "http://example.com",
                }
            )

    def test_fallback_must_differ(self) -> None:
        with self.assertRaisesRegex(AiConfigurationError, "must differ"):
            read_worker_config(
                {
                    "FEATURE_AI_GENERATION_ENABLED": "true",
                    "AI_PROVIDER": "deepseek",
                    "DEEPSEEK_API_KEY": "secret",
                    "AI_FALLBACK_PROVIDER": "deepseek",
                }
            )


if __name__ == "__main__":
    unittest.main()
