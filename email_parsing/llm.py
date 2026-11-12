"""LLM-driven email parsing.

Single call: classify + extract. The model returns PARSE_SCHEMA. For
NEWSLETTER / IRRELEVANT classifications, opportunities is `[]`.

Each prompt in prompts/ is the system message; the data (email, opportunity)
goes in the user message so the model treats it as data, not instructions.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, get_args

from openai import OpenAI

from . import config
from .schema import FundingOpportunity, FundingType, ParseResult


logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"


class LLMError(RuntimeError):
    """Raised when an LLM call or its output cannot be processed."""


class DailyLimitError(LLMError):
    """The provider's daily token limit is used up. Later calls will fail too."""


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """Read prompts/<name>.txt and insert the shared charity profile."""
    text = (_PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")
    if "{{profile}}" in text:
        text = text.replace("{{profile}}", load_prompt("profile").strip())
    return text


def _nullable(type_: str) -> dict[str, Any]:
    return {"type": [type_, "null"]}


# Strict JSON schemas: every key is required and no other keys are allowed.
_OPPORTUNITY_SCHEMA = {
    "type": "object",
    "properties": {
        "funder_name": {"type": "string"},
        "program_name": _nullable("string"),
        "amount_min": _nullable("number"),
        "amount_max": _nullable("number"),
        "amount_typical": _nullable("number"),
        "type": {"type": "string", "enum": list(get_args(FundingType))},
        "deadline": {"type": "string"},
        "location": {"type": "string"},
        "duration_months": _nullable("integer"),
        "description": {"type": "string"},
        "notes": {"type": "string"},
        "website": _nullable("string"),
        "contact_name": _nullable("string"),
        "contact_email": _nullable("string"),
    },
}
PARSE_SCHEMA = {
    "type": "object",
    "properties": {
        "classification": {"type": "string", "enum": ["FUNDING_OPPORTUNITY", "NEWSLETTER", "IRRELEVANT"]},
        "confidence": {"type": "number"},
        "opportunities": {"type": "array", "items": _OPPORTUNITY_SCHEMA},
    },
}


def _strict(schema: dict[str, Any]) -> dict[str, Any]:
    """Mark every object in *schema* as closed with all keys required."""
    if schema.get("type") == "object":
        props = {k: _strict(v) for k, v in schema["properties"].items()}
        return {**schema, "properties": props, "required": list(props), "additionalProperties": False}
    if schema.get("type") == "array":
        return {**schema, "items": _strict(schema["items"])}
    return schema


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


def _chat(system: str, user: str, *, stage: str, schema: dict[str, Any]) -> str:
    client = _client()
    if config.LLM_STRICT_SCHEMA:
        response_format = {
            "type": "json_schema",
            "json_schema": {"name": stage, "strict": True, "schema": _strict(schema)},
        }
    else:
        response_format = {"type": "json_object"}
    extra_body = {}
    if config.LLM_REASONING_EFFORT != "off":
        extra_body["reasoning_effort"] = config.LLM_REASONING_EFFORT
    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model=config.LLM_MODEL,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format=response_format,
                temperature=0,
                timeout=config.LLM_TIMEOUT_SECONDS,
                extra_body=extra_body or None,
            )
            break
        except Exception as exc:
            # Groq rejects output that breaks the schema; one new try usually passes.
            if attempt == 0 and "json_validate_failed" in str(exc):
                logger.info("%s: output did not match the schema — trying again", stage)
                continue
            if "tokens per day" in str(exc):
                raise DailyLimitError(f"{stage}: daily token limit reached: {exc}") from exc
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


# Email domains of newsletter publishers and of M4W. An address at one of these
# domains is the newsletter sender or the person who forwarded the email, not
# the funder's contact. Add a domain here if wrong contacts come through.
NOT_FUNDER_CONTACT_DOMAINS = (
    "idoxgroup.com",
    "funded.team",
    "music4wellbeing.org.uk",
    "music4wellbeing.org",
)


def _sender_address(sender: str) -> str:
    match = re.search(r"[^<>\s]+@[^<>\s]+", sender or "")
    return match.group(0).casefold() if match else ""


def _clear_wrong_contact(opp: FundingOpportunity, sender: str) -> None:
    """Remove a contact that is the newsletter sender or the forwarder."""
    address = (opp.contact_email or "").strip().casefold()
    if not address:
        return
    domain = address.rsplit("@", 1)[-1]
    if address == _sender_address(sender) or domain in NOT_FUNDER_CONTACT_DOMAINS:
        logger.info("Removing contact %s %s — not the funder", opp.contact_name, address)
        opp.contact_name = None
        opp.contact_email = None


def _to_opportunity(item: dict[str, Any], idx: int) -> FundingOpportunity:
    """Convert one LLM opportunity to the model."""
    item = dict(item)
    item["id"] = f"opp-{idx}"
    low, high = item.get("amount_min"), item.get("amount_max")
    if item.get("amount_typical") is None and low and high and high > low:
        # The email gives a range but no typical award: use the midpoint.
        item["amount_typical"] = round((low + high) / 2)
    return FundingOpportunity(**item)


def parse_email(email: dict[str, Any]) -> ParseResult:
    """Classify and extract opportunities from a single email in one LLM call."""
    user = (
        f"Email date: {(email.get('receivedDateTime') or '')[:10] or 'unknown'}\n"
        f"From: {email.get('from', '')}\n"
        f"Subject: {email.get('subject', '')}\n\n"
        f"{(email.get('body') or '')[:config.EMAIL_MAX_CHARS]}"
    )

    # Length only at INFO: the CI logs of a public repository are public.
    logger.info("parse: sending %d characters of email text to the LLM", len(user))
    raw = _chat(load_prompt("parse"), user, stage="parse", schema=PARSE_SCHEMA)
    # The email text and the raw answer appear only with LOG_LEVEL=DEBUG (local runs).
    logger.debug("parse: text sent to the LLM:\n%s", user)
    logger.debug("parse: raw LLM answer:\n%s", raw)
    data = _parse_json(raw, stage="parse")

    if not isinstance(data, dict):
        raise LLMError("parse: response is not a JSON object")

    classification = data.get("classification", "IRRELEVANT")
    confidence = float(data.get("confidence", 0.0))
    raw_opps = data.get("opportunities", []) or []
    if not isinstance(raw_opps, list):
        raw_opps = [raw_opps]

    opportunities: list[FundingOpportunity] = []
    seen: set[tuple[str, str]] = set()
    for idx, item in enumerate(raw_opps):
        try:
            opp = _to_opportunity(item, idx)
        except Exception as exc:
            logger.warning("Skipping malformed opportunity %s: %s", item, exc)
            continue
        # Newsletters sometimes list the same fund twice.
        key = (opp.funder_name.casefold().strip(), opp.program_name.casefold().strip())
        if key in seen:
            logger.info("Skipping repeated opportunity %s — %s", opp.funder_name, opp.program_name)
            continue
        seen.add(key)
        _clear_wrong_contact(opp, email.get("from", ""))
        opportunities.append(opp)

    return ParseResult(
        classification=classification,
        classification_confidence=max(0.0, min(1.0, confidence)),
        opportunities=opportunities,
    )
