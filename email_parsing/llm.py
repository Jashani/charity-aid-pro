"""LLM-driven email parsing.

Single call: classify + extract. The model returns an envelope:
    {
        "classification": "FUNDING_OPPORTUNITY|NEWSLETTER|IRRELEVANT",
        "confidence": 0.0-1.0,
        "opportunities": [ ... ]
    }

For NEWSLETTER / IRRELEVANT classifications, opportunities is `[]`.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from openai import OpenAI

from . import config
from .schema import FundingOpportunity, ParseResult


logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"


class LLMError(RuntimeError):
    """Raised when an LLM call or its output cannot be processed."""


@lru_cache(maxsize=None)
def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    if not config.LLM_API_KEY:
        raise LLMError("LLM_API_KEY is not set")
    # max_retries=6: Groq's 12k TPM window can lock us out for ~60s once we
    # exceed it; the SDK honors the Retry-After header on 429, so a higher
    # ceiling lets a single run absorb several window-resets without failing.
    return OpenAI(
        base_url=config.LLM_BASE_URL,
        api_key=config.LLM_API_KEY,
        max_retries=6,
    )


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _chat(prompt: str, *, stage: str) -> str:
    client = _client()
    try:
        resp = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            timeout=config.LLM_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        raise LLMError(f"{stage}: LLM call failed: {exc}") from exc

    content = (resp.choices[0].message.content or "").strip()
    if not content:
        raise LLMError(f"{stage}: empty completion")
    return content


def _parse_json(raw: str, *, stage: str) -> Any:
    cleaned = _strip_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMError(f"{stage}: invalid JSON: {exc}") from exc


def parse_email(email: dict[str, Any]) -> ParseResult:
    """Classify and extract opportunities from a single email in one LLM call."""
    subject = email.get("subject", "")
    body = (email.get("body") or "")[:8000]
    email_id = email.get("id") or email.get("emailId", "")

    prompt = (
        _load_prompt("parse")
        .replace("{{subject}}", subject)
        .replace("{{body}}", body)
        .replace("{{email_id}}", email_id)
    )

    raw = _chat(prompt, stage="parse")
    data = _parse_json(raw, stage="parse")

    if not isinstance(data, dict):
        raise LLMError("parse: response is not a JSON object")

    classification = data.get("classification", "IRRELEVANT")
    confidence = float(data.get("confidence", 0.0))
    raw_opps = data.get("opportunities", []) or []
    if not isinstance(raw_opps, list):
        raw_opps = [raw_opps]

    opportunities: list[FundingOpportunity] = []
    for item in raw_opps:
        try:
            opportunities.append(FundingOpportunity(**item))
        except Exception as exc:
            logger.warning("Skipping malformed opportunity %s: %s", item, exc)

    return ParseResult(
        classification=classification,
        classificationConfidence=max(0.0, min(1.0, confidence)),
        opportunities=opportunities,
    )
