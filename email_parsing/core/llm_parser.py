"""
Azure OpenAI integration for email classification and opportunity extraction.

Flow
----
1. classify_email()  — GPT-4o-mini classifies the email
2. extract_opportunities()  — GPT-4o-mini (or GPT-4o fallback) extracts structured data
3. parse_email()  — orchestrates both steps with automatic fallback on low confidence
"""

from __future__ import annotations

import json
import logging
import random
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from openai import AzureOpenAI

from . import config
from .schema import ClassificationResult, FundingOpportunity, ParsedEmail

logger = logging.getLogger(__name__)

# ── Prompt loading (cached) ────────────────────────────────────────────────────

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

_LLM_MAX_ATTEMPTS = 3
_LLM_BASE_DELAY_SECONDS = 1.0
_LLM_MAX_DELAY_SECONDS = 8.0
_LLM_TIMEOUT_SECONDS = 45.0
_CLASSIFICATION_FAIL_OPEN = False
_RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


class LLMInvocationError(RuntimeError):
    """Raised when an LLM call fails after retries or with a non-retryable error."""


class LLMOutputError(RuntimeError):
    """Raised when an LLM response cannot be parsed/validated as expected."""


@lru_cache(maxsize=None)
def _load_prompt(name: str) -> str:
    """Load a prompt file once and cache it for the lifetime of the process."""
    path = _PROMPTS_DIR / f"{name}.txt"
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


# ── OpenAI client factory ──────────────────────────────────────────────────────


def _get_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
        api_key=config.AZURE_OPENAI_KEY,
        api_version="2024-10-21",
    )


def _deployment(model: str) -> str:
    """Resolve a model alias ('mini' or 'full') to the configured deployment name."""
    if model == "full":
        return config.AZURE_OPENAI_DEPLOYMENT_FULL
    return config.AZURE_OPENAI_DEPLOYMENT


def _is_retryable_llm_error(exc: Exception) -> bool:
    """Best-effort retryability check across OpenAI SDK exception variants."""
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int) and status_code in _RETRYABLE_STATUS_CODES:
        return True

    class_name = exc.__class__.__name__
    if class_name in {"RateLimitError", "APITimeoutError", "APIConnectionError", "InternalServerError"}:
        return True
    if class_name == "APIError" and isinstance(status_code, int) and status_code >= 500:
        return True
    return False


def _chat_completion_with_retry(
    client: AzureOpenAI,
    *,
    deployment: str,
    messages: list[dict[str, str]],
    stage: str,
    email_id: str = "",
):
    """Call chat completions with bounded retry/backoff for transient failures."""
    delay = _LLM_BASE_DELAY_SECONDS
    last_exc: Exception | None = None

    for attempt in range(1, _LLM_MAX_ATTEMPTS + 1):
        try:
            return client.chat.completions.create(
                model=deployment,
                messages=messages,
                temperature=0,
                timeout=_LLM_TIMEOUT_SECONDS,
            )
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            retryable = _is_retryable_llm_error(exc)
            if retryable and attempt < _LLM_MAX_ATTEMPTS:
                sleep_seconds = min(_LLM_MAX_DELAY_SECONDS, delay) + random.uniform(0, delay * 0.25)
                logger.warning(
                    "LLM call failed at stage=%s email_id=%s deployment=%s attempt=%d/%d: %s — retrying in %.2fs",
                    stage,
                    email_id or "n/a",
                    deployment,
                    attempt,
                    _LLM_MAX_ATTEMPTS,
                    exc,
                    sleep_seconds,
                )
                time.sleep(sleep_seconds)
                delay = min(_LLM_MAX_DELAY_SECONDS, delay * 2)
                continue

            logger.error(
                "LLM call failed at stage=%s email_id=%s deployment=%s attempt=%d/%d retryable=%s: %s",
                stage,
                email_id or "n/a",
                deployment,
                attempt,
                _LLM_MAX_ATTEMPTS,
                retryable,
                exc,
                exc_info=True,
            )
            raise LLMInvocationError(
                f"LLM call failed at stage '{stage}' using deployment '{deployment}'"
            ) from exc

    raise LLMInvocationError(
        f"LLM retry loop exhausted at stage '{stage}' using deployment '{deployment}'"
    ) from last_exc


def _response_text(response: Any, *, stage: str) -> str:
    """Extract assistant content from a completion response with clear failures."""
    try:
        raw = response.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        raise LLMOutputError(f"{stage}: malformed completion response") from exc

    if not raw.strip():
        raise LLMOutputError(f"{stage}: empty completion response")
    return raw


# ── JSON cleaning ──────────────────────────────────────────────────────────────


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json … ``` or ``` … ``` wrappers that models sometimes emit."""
    stripped = text.strip()
    # Remove opening fence (```json or ```)
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
    # Remove closing fence
    stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _parse_json_response(
    raw: str,
    retry_with_client: AzureOpenAI | None = None,
    deployment: str = "",
    messages: list | None = None,
    stage: str = "llm",
    email_id: str = "",
) -> Any:
    """
    Attempt to parse *raw* as JSON.  If it fails and retry parameters are
    supplied, ask the model once more with an explicit repair instruction.
    """
    cleaned = _strip_markdown_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as first_err:
        if retry_with_client is None or not messages:
            raise LLMOutputError(f"{stage}: invalid JSON from model: {first_err}") from first_err

        logger.warning("JSON parse failed (%s) — retrying with repair prompt", first_err)
        repair_messages = messages + [
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    "Your previous response was not valid JSON. "
                    "Please return ONLY the corrected JSON with no additional text."
                ),
            },
        ]
        repair_response = _chat_completion_with_retry(
            retry_with_client,
            deployment=deployment,
            messages=repair_messages,
            stage=f"{stage}:json_repair",
            email_id=email_id,
        )
        repaired_raw = _response_text(repair_response, stage=f"{stage}:json_repair")
        repaired_cleaned = _strip_markdown_fences(repaired_raw)
        try:
            return json.loads(repaired_cleaned)
        except json.JSONDecodeError as second_err:
            raise LLMOutputError(
                f"{stage}: invalid JSON after repair attempt: {second_err}"
            ) from second_err


# ── Public API ────────────────────────────────────────────────────────────────


def classify_email(subject: str, body_text: str, model: str = "mini") -> ClassificationResult:
    """
    Classify an email using the classify prompt.

    Args:
        subject:   Email subject line.
        body_text: Plain-text email body.
        model:     'mini' for GPT-4o-mini, 'full' for GPT-4o.

    Returns:
        A :class:`ClassificationResult` instance.
    """
    prompt_template = _load_prompt("classify")
    prompt = (
        prompt_template
        .replace("{{subject}}", subject)
        .replace("{{body}}", body_text[:8000])  # guard against very long bodies
    )

    deployment = _deployment(model)
    client = _get_client()

    messages = [{"role": "user", "content": prompt}]

    logger.debug("Classifying email with deployment '%s'", deployment)
    response = _chat_completion_with_retry(
        client,
        deployment=deployment,
        messages=messages,
        stage="classify",
    )
    raw = _response_text(response, stage="classify")

    data = _parse_json_response(
        raw,
        retry_with_client=client,
        deployment=deployment,
        messages=messages,
        stage="classify",
    )
    try:
        result = ClassificationResult(**data)
    except Exception as exc:  # noqa: BLE001
        raise LLMOutputError("classify: response failed ClassificationResult validation") from exc
    logger.info(
        "Classification: %s (confidence=%.2f)", result.classification, result.confidence
    )
    return result


def extract_opportunities(
    subject: str,
    body_text: str,
    email_id: str = "",
    model: str = "mini",
) -> list[FundingOpportunity]:
    """
    Extract structured funding opportunities from an email body.

    Args:
        subject:   Email subject line.
        body_text: Plain-text email body.
        email_id:  Graph API message ID used to stamp the ``source`` field.
        model:     'mini' for GPT-4o-mini, 'full' for GPT-4o.

    Returns:
        A (possibly empty) list of :class:`FundingOpportunity` instances.
    """
    prompt_template = _load_prompt("extract")
    prompt = (
        prompt_template
        .replace("{{subject}}", subject)
        .replace("{{body}}", body_text[:8000])
        .replace("{{email_id}}", email_id)
    )

    deployment = _deployment(model)
    client = _get_client()

    messages = [{"role": "user", "content": prompt}]

    logger.debug("Extracting opportunities with deployment '%s'", deployment)
    response = _chat_completion_with_retry(
        client,
        deployment=deployment,
        messages=messages,
        stage="extract",
        email_id=email_id,
    )
    raw = _response_text(response, stage="extract")

    raw_list: list[dict] = _parse_json_response(
        raw,
        retry_with_client=client,
        deployment=deployment,
        messages=messages,
        stage="extract",
        email_id=email_id,
    )

    if not isinstance(raw_list, list):
        logger.warning("Model returned non-list JSON for extraction; wrapping in list")
        raw_list = [raw_list]

    opportunities: list[FundingOpportunity] = []
    for item in raw_list:
        try:
            opp = FundingOpportunity(**item)
            opportunities.append(opp)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping malformed opportunity dict: %s — %s", item, exc)

    logger.info("Extracted %d opportunity/opportunities", len(opportunities))
    return opportunities


def parse_email(email_data: dict[str, Any]) -> ParsedEmail:
    """
    Full pipeline for a single email: classify, then extract if relevant.

    Escalation rules:
    - If classification confidence < config.CONFIDENCE_THRESHOLD, re-classify with GPT-4o.
    - If any opportunity has extractionConfidence < config.CONFIDENCE_THRESHOLD, re-extract
      the whole email with GPT-4o.

    Args:
        email_data: Dict with keys: id, subject, from, receivedDateTime, body.

    Returns:
        A fully populated :class:`ParsedEmail` instance.
    """
    email_id: str = email_data["id"]
    subject: str = email_data.get("subject", "")
    body: str = email_data.get("body", "")
    from_address: str = email_data.get("from", "")
    received_at_str: str = email_data.get("receivedDateTime", "")

    try:
        received_at = datetime.fromisoformat(received_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        received_at = datetime.now(timezone.utc)

    parsed_at = datetime.now(timezone.utc)
    model_used = config.AZURE_OPENAI_DEPLOYMENT  # may be upgraded below

    # ── Step 1: Classify ───────────────────────────────────────────────────────
    try:
        classification_result = classify_email(subject, body, model="mini")
    except (LLMInvocationError, LLMOutputError):
        if _CLASSIFICATION_FAIL_OPEN:
            logger.warning(
                "Classification failed for email %s; continuing with fail-open policy",
                email_id,
                exc_info=True,
            )
            classification_result = ClassificationResult(
                classification="IRRELEVANT",
                confidence=0.0,
                reason="Fail-open classification fallback",
            )
        else:
            raise

    if classification_result.confidence < config.CONFIDENCE_THRESHOLD:
        logger.info(
            "Low classification confidence (%.2f) — escalating to GPT-4o",
            classification_result.confidence,
        )
        try:
            classification_result = classify_email(subject, body, model="full")
            model_used = config.AZURE_OPENAI_DEPLOYMENT_FULL
        except (LLMInvocationError, LLMOutputError):
            if _CLASSIFICATION_FAIL_OPEN:
                logger.warning(
                    "Escalated classification failed for email %s; continuing with fail-open policy",
                    email_id,
                    exc_info=True,
                )
                classification_result = ClassificationResult(
                    classification="IRRELEVANT",
                    confidence=0.0,
                    reason="Fail-open classification fallback (escalated)",
                )
            else:
                raise

    # ── Step 2: Extract (only for relevant emails) ────────────────────────────
    opportunities: list[FundingOpportunity] = []

    if classification_result.classification in {"FUNDING_OPPORTUNITY", "NEWSLETTER"}:
        opportunities = extract_opportunities(subject, body, email_id=email_id, model="mini")

        low_confidence = any(
            opp.extractionConfidence < config.CONFIDENCE_THRESHOLD for opp in opportunities
        )
        if low_confidence or not opportunities:
            if not opportunities:
                logger.info(
                    "No opportunities extracted by mini — escalating to GPT-4o for email %s",
                    email_id,
                )
            else:
                logger.info(
                    "Low extraction confidence detected — escalating to GPT-4o for email %s",
                    email_id,
                )
            opportunities = extract_opportunities(subject, body, email_id=email_id, model="full")
            model_used = config.AZURE_OPENAI_DEPLOYMENT_FULL
    else:
        logger.info("Email %s classified as %s — skipping extraction", email_id,
                    classification_result.classification)

    return ParsedEmail(
        emailId=email_id,
        emailSubject=subject,
        emailFrom=from_address,
        emailReceivedAt=received_at,
        parsedAt=parsed_at,
        modelUsed=model_used,
        classification=classification_result.classification,
        classificationConfidence=classification_result.confidence,
        opportunities=opportunities,
    )
