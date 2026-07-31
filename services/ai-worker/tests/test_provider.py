from __future__ import annotations

import unittest
from typing import Any, Mapping

from skillup_ai_worker.contracts import ChatMessage, ProviderName, ProviderRequest, TaskName
from skillup_ai_worker.providers.openai_compatible import OpenAICompatibleAdapter


class FakeTransport:
    def __init__(self) -> None:
        self.url = ""
        self.headers: Mapping[str, str] = {}
        self.body: Mapping[str, Any] = {}

    def post(
        self,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> tuple[Mapping[str, Any], Mapping[str, str]]:
        self.url = url
        self.headers = headers
        self.body = body
        self.timeout_seconds = timeout_seconds
        return (
            {
                "id": "provider-id",
                "choices": [{"message": {"content": '{"summary":"Ok","key_points":["A","B"]}'}}],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "prompt_tokens_details": {"cached_tokens": 30},
                },
            },
            {"x-request-id": "request-id"},
        )


class ProviderTests(unittest.TestCase):
    def _request(self, thinking: bool = False) -> ProviderRequest:
        return ProviderRequest(
            task=TaskName.SUMMARIZE,
            model="deepseek-v4-flash",
            messages=(ChatMessage("system", "Return JSON."), ChatMessage("user", "Input JSON.")),
            max_output_tokens=500,
            temperature=0.2,
            timeout_seconds=12,
            require_json=True,
            thinking_enabled=thinking,
        )

    def test_deepseek_disables_thinking_for_low_cost_tasks(self) -> None:
        transport = FakeTransport()
        adapter = OpenAICompatibleAdapter(
            ProviderName.DEEPSEEK,
            "https://api.deepseek.com",
            "secret",
            transport=transport,
        )
        response = adapter.generate(self._request())
        self.assertEqual(transport.url, "https://api.deepseek.com/v1/chat/completions")
        self.assertEqual(transport.body["thinking"], {"type": "disabled"})
        self.assertEqual(transport.body["response_format"], {"type": "json_object"})
        self.assertEqual(transport.body["temperature"], 0.2)
        self.assertEqual(response.cached_input_tokens, 30)
        self.assertEqual(response.provider_request_id, "request-id")
        self.assertNotIn("secret", repr(adapter))

    def test_deepseek_thinking_omits_temperature(self) -> None:
        transport = FakeTransport()
        adapter = OpenAICompatibleAdapter(
            ProviderName.DEEPSEEK,
            "https://api.deepseek.com",
            "secret",
            transport=transport,
        )
        adapter.generate(self._request(thinking=True))
        self.assertEqual(transport.body["thinking"], {"type": "enabled"})
        self.assertNotIn("temperature", transport.body)

    def test_openrouter_identifies_application_without_secret_leak(self) -> None:
        transport = FakeTransport()
        adapter = OpenAICompatibleAdapter(
            ProviderName.OPENROUTER,
            "https://openrouter.ai/api",
            "secret",
            transport=transport,
            site_url="https://skillup.example",
            app_name="SkillUp",
        )
        adapter.generate(self._request())
        self.assertEqual(transport.headers["HTTP-Referer"], "https://skillup.example")
        self.assertEqual(transport.headers["X-Title"], "SkillUp")


if __name__ == "__main__":
    unittest.main()
