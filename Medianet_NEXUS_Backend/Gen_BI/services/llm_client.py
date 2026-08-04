"""
llm_client.py
Single chat() entrypoint with a provider fallback chain: Groq -> Mistral.

Each provider is a thin adapter behind a common signature. A provider whose API
key is not configured is skipped silently, so you can run with only the
providers you have set up (e.g. just Groq in dev).

Env vars (all optional; a provider with no config is skipped):
    GROQ_API_KEY          -> enables Groq
    GROQ_MODEL            -> default "openai/gpt-oss-120b"
    MISTRAL_API_KEY       -> enables Mistral
    MISTRAL_MODEL         -> default "mistral-large-latest"
    GENBI_LLM_CHAIN       -> comma list to override order, e.g. "groq,mistral"

Provider SDKs (install only the ones you use):
    pip install groq mistralai
"""

import os
import logging

logger = logging.getLogger("genbi.llm")


class AllProvidersFailed(RuntimeError):
    """Raised when every configured provider in the chain failed."""


# ── Provider adapters ────────────────────────────────────────────────────────
# Each adapter exposes:
#   .name              short id used in the chain
#   .is_configured()   whether env config is present
#   .chat(messages, max_tokens, temperature) -> str


class _GroqProvider:
    name = "groq"

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        self._client = None

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _get_client(self):
        if self._client is None:
            from groq import Groq
            self._client = Groq(api_key=self.api_key)
        return self._client

    def chat(self, messages, max_tokens, temperature) -> str:
        resp = self._get_client().chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.choices[0].message.content


class _MistralProvider:
    name = "mistral"

    def __init__(self):
        self.api_key = os.getenv("MISTRAL_API_KEY")
        self.model = os.getenv("MISTRAL_MODEL", "mistral-large-latest")
        self._client = None

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _get_client(self):
        if self._client is None:
            # mistralai v2.x: sync + async are consolidated into `Mistral`,
            # imported from the package root. The legacy `MistralClient`
            # (v0.x) no longer exists and must not be referenced.
            from mistralai import Mistral
            self._client = Mistral(api_key=self.api_key)
        return self._client

    def chat(self, messages, max_tokens, temperature) -> str:
        # v2.x accepts plain {"role", "content"} dicts — no ChatMessage wrapper.
        resp = self._get_client().chat.complete(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.choices[0].message.content


_REGISTRY = {
    "groq": _GroqProvider,
    "mistral": _MistralProvider,
}

_DEFAULT_CHAIN = ["groq", "mistral"]


def _build_chain():
    override = os.getenv("GENBI_LLM_CHAIN")
    order = (
        [p.strip() for p in override.split(",") if p.strip()]
        if override
        else _DEFAULT_CHAIN
    )
    return [_REGISTRY[name]() for name in order if name in _REGISTRY]


def chat(messages, max_tokens: int = 800, temperature: float = 0.1) -> str:
    """
    Try each configured provider in chain order. Return the first success.
    Raise AllProvidersFailed if every configured provider errors, or if none
    is configured at all.

    `messages` is the OpenAI-style list of {"role", "content"} dicts — both
    SDKs accept this shape.
    """
    chain = _build_chain()
    configured = [p for p in chain if p.is_configured()]

    if not configured:
        raise AllProvidersFailed(
            "No LLM provider is configured. Set GROQ_API_KEY or MISTRAL_API_KEY."
        )

    errors = []
    for provider in configured:
        try:
            content = provider.chat(messages, max_tokens, temperature)
            if content:
                return content
            errors.append(f"{provider.name}: empty response")
        except Exception as e:  # noqa: BLE001 — we want to fall through on any error
            logger.warning("LLM provider '%s' failed: %s", provider.name, e)
            errors.append(f"{provider.name}: {e}")

    raise AllProvidersFailed("All providers failed -> " + " | ".join(errors))