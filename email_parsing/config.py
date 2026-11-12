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
# Defaults target Groq + GPT-OSS 120B (free plan), but any OpenAI-compatible
# URL works (OpenAI, Gemini OpenAI-compat, OpenRouter, Azure, etc.).
LLM_BASE_URL: str = _env("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY: str = _env("LLM_API_KEY")
LLM_MODEL: str = _env("LLM_MODEL", "openai/gpt-oss-120b")
# "low" keeps reasoning tokens (and the free-plan token budget) small.
# Set "off" for models without a reasoning_effort parameter.
LLM_REASONING_EFFORT: str = _env("LLM_REASONING_EFFORT", "low")
# true: strict JSON schema output. Set "false" for models without structured
# outputs; they then get plain JSON mode.
LLM_STRICT_SCHEMA: bool = _env("LLM_STRICT_SCHEMA", "true").lower() == "true"
LLM_TIMEOUT_SECONDS: float = float(_env("LLM_TIMEOUT_SECONDS", "60"))
# Maximum characters of email text sent to the LLM. The Groq free plan allows
# about 8,000 tokens per minute for this model, and the prompt itself uses about
# 1,500, so raise this value with care.
EMAIL_MAX_CHARS: int = int(_env("EMAIL_MAX_CHARS", "8000"))

# ── Microsoft Graph (funding mailbox in Microsoft 365) ───────────────────────
# The mailbox is a work account (Microsoft 365), not a personal Outlook account.
MAILBOX_USER: str = _env("MAILBOX_USER", "fundingopps@music4wellbeing.org.uk")
# Directory (tenant) ID, or a verified domain name, of the Microsoft 365 tenant.
MSAL_TENANT_ID: str = _env("MSAL_TENANT_ID", "music4wellbeing.org.uk")
# Application (client) ID of an Entra app registered in that tenant. No default:
# the old app was for personal accounts and cannot sign in to a work account.
MSAL_CLIENT_ID: str = _env("MSAL_CLIENT_ID")
# If set, the pipeline uses app-only access (client credentials, no user login).
# This is the recommended mode for CI. If empty, it uses the device-code login.
MSAL_CLIENT_SECRET: str = _env("MSAL_CLIENT_SECRET")
# Device-code mode only: path to the MSAL token cache file. CI can instead
# provide MSAL_TOKEN_CACHE_B64.
MSAL_CACHE_FILE: str = _env(
    "MSAL_CACHE_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "token_cache.bin"),
)
MSAL_TOKEN_CACHE_B64: str = _env("MSAL_TOKEN_CACHE_B64")

# ── Airtable ─────────────────────────────────────────────────────────────────
# Personal access token with data.records:read + data.records:write on the base.
AIRTABLE_TOKEN: str = _env("AIRTABLE_TOKEN")
# IDs of the Music4Wellbeing base and its Opportunities table. IDs (not names) survive renames.
AIRTABLE_BASE_ID: str = _env("AIRTABLE_BASE_ID", "apptkzNqMPnlzdyhA")
AIRTABLE_OPPORTUNITIES_TABLE: str = _env("AIRTABLE_OPPORTUNITIES_TABLE", "tbla8L8gUX6xN1XeO")


def missing_required(*names: str) -> list[str]:
    """Return the names from *names* that are unset / blank in the current config."""
    here = globals()
    return [n for n in names if not here.get(n)]
