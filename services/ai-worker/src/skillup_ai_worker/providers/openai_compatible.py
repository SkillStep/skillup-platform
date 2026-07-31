"""Dependency-free OpenAI-compatible Chat Completions adapter."""

from __future__ import annotations

import json
import socket
from dataclasses import dataclass, field
from http.client import HTTPResponse
from typing import Any, Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..contracts import ProviderName, ProviderRequest, ProviderResponse
from ..errors import ProviderError


class JsonTransport(Protocol):
    def post(
        self,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> tuple[Mapping[str, Any], Mapping[str, str]]: ...


class UrllibJsonTransport:
    _MAX_RESPONSE_BYTES = 2_000_000

    def post(
        self,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> tuple[Mapping[str, Any], Mapping[str, str]]:
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        request = Request(url, data=encoded, headers=dict(headers), method="POST")
        try:
            response: HTTPResponse
            with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - URL is validated configuration
                raw = response.read(self._MAX_RESPONSE_BYTES + 1)
                if len(raw) > self._MAX_RESPONSE_BYTES:
                    raise ProviderError("Provider response exceeded the size limit.", retryable=False)
                parsed = json.loads(raw.decode("utf-8"))
                if not isinstance(parsed, dict):
                    raise ProviderError("Provider response must be a JSON object.", retryable=False)
                return parsed, {key.lower(): value for key, value in response.headers.items()}
        except HTTPError as error:
            retryable = error.code in {408, 409, 425, 429} or 500 <= error.code <= 599
            raise ProviderError(
                f"Provider returned HTTP {error.code}.", retryable=retryable, status_code=error.code
            ) from error
        except (URLError, TimeoutError, socket.timeout) as error:
            raise ProviderError("Provider request failed or timed out.", retryable=True) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ProviderError("Provider returned invalid JSON transport data.", retryable=False) from error


@dataclass(frozen=True)
class OpenAICompatibleAdapter:
    provider: ProviderName
    base_url: str
    api_key: str = field(repr=False)
    transport: JsonTransport = UrllibJsonTransport()
    site_url: str | None = None
    app_name: str = "SkillUp"

    def _endpoint(self) -> str:
        return f"{self.base_url.rstrip('/')}/v1/chat/completions"

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SkillUp-AI-Worker/1.0",
        }
        if self.provider is ProviderName.OPENROUTER:
            if self.site_url:
                headers["HTTP-Referer"] = self.site_url
            headers["X-Title"] = self.app_name

        body: dict[str, Any] = {
            "model": request.model,
            "messages": [
                {"role": message.role, "content": message.content} for message in request.messages
            ],
            "max_tokens": request.max_output_tokens,
            "stream": False,
        }
        if request.require_json:
            body["response_format"] = {"type": "json_object"}
        if self.provider is ProviderName.DEEPSEEK:
            body["thinking"] = {"type": "enabled" if request.thinking_enabled else "disabled"}
            if not request.thinking_enabled:
                body["temperature"] = request.temperature
        else:
            body["temperature"] = request.temperature

        data, response_headers = self.transport.post(
            self._endpoint(), headers, body, request.timeout_seconds
        )
        try:
            choices = data["choices"]
            first = choices[0]
            message = first["message"]
            content = message["content"]
            usage = data.get("usage", {})
        except (KeyError, IndexError, TypeError) as error:
            raise ProviderError("Provider response omitted required fields.", retryable=False) from error
        if not isinstance(content, str):
            raise ProviderError("Provider message content must be text.", retryable=False)
        if not isinstance(usage, dict):
            usage = {}
        details = usage.get("prompt_tokens_details", {})
        if not isinstance(details, dict):
            details = {}
        request_id = response_headers.get("x-request-id")
        if not request_id and isinstance(data.get("id"), str):
            request_id = data["id"]
        return ProviderResponse(
            content=content,
            input_tokens=max(0, int(usage.get("prompt_tokens", 0) or 0)),
            output_tokens=max(0, int(usage.get("completion_tokens", 0) or 0)),
            cached_input_tokens=max(0, int(details.get("cached_tokens", 0) or 0)),
            provider_request_id=request_id,
        )
