"""Environment-driven configuration."""

from __future__ import annotations

import os


def _env(name: str, default: str = "") -> str:
    """Read an env var, treating empty strings as unset.

    GitHub Actions passes unset `vars.*` references through as empty strings;
    without this helper the empty value would override the documented default.
    """
    value = os.environ.get(name)
    return value if value else default


# ── LLM (OpenAI-compatible endpoint) ─────────────────────────────────────────
# Defaults target Groq + Llama 3.3 70B, but any OpenAI-compatible URL works
# (OpenAI, Gemini OpenAI-compat, OpenRouter, Azure, etc.).
LLM_BASE_URL: str = _env("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY: str = _env("LLM_API_KEY")
LLM_MODEL: str = _env("LLM_MODEL", "llama-3.3-70b-versatile")
LLM_TIMEOUT_SECONDS: float = float(_env("LLM_TIMEOUT_SECONDS", "60"))

# ── Microsoft Graph (personal Outlook via MSAL device-code) ──────────────────
# Application (client) ID of the registered Microsoft Entra app.
MSAL_CLIENT_ID: str = _env("MSAL_CLIENT_ID", "9242462a-6cbe-43fe-9baf-54967057b1f1")
# Path to MSAL token cache file. CI can instead provide MSAL_TOKEN_CACHE_B64.
MSAL_CACHE_FILE: str = _env(
    "MSAL_CACHE_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "token_cache.bin"),
)
MSAL_TOKEN_CACHE_B64: str = _env("MSAL_TOKEN_CACHE_B64")

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL: str = _env("SUPABASE_URL")
SUPABASE_KEY: str = _env("SUPABASE_KEY")


def missing_required(*names: str) -> list[str]:
    """Return the names from *names* that are unset / blank in the current config."""
    here = globals()
    return [n for n in names if not here.get(n)]
