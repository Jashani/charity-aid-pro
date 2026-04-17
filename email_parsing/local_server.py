"""
Local FastAPI dev server for testing the parse+score pipeline without Azure.

Exposes:
  GET  /health            — liveness check
  POST /score             — score pre-extracted opportunity objects
  POST /parse             — run full LLM extraction + scoring on a raw email dict

Usage:
    cd email_parsing
    uvicorn local_server:app --reload

Reads credentials from local.settings.json automatically.
Does NOT require Azure, Cosmos DB, or Microsoft Graph.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

# ── Load local.settings.json ──────────────────────────────────────────────────

_settings_path = Path(__file__).resolve().parent / "local.settings.json"
if _settings_path.exists():
    _settings = json.loads(_settings_path.read_text())
    for _k, _v in _settings.get("Values", {}).items():
        os.environ[_k] = _v
else:
    raise RuntimeError(
        "local.settings.json not found — copy local.settings.json.example and fill in your keys."
    )

# Clear any conflicting Google credentials
for _var in ["GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT"]:
    os.environ.pop(_var, None)

# ── Patch AzureOpenAI → native Gemini client (same as test_local.py) ─────────

import httpx  # noqa: E402
import openai  # noqa: E402

_GEMINI_NATIVE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class _Choice:
    class _Message:
        def __init__(self, content): self.content = content
    def __init__(self, content): self.message = self._Message(content)


class _Response:
    def __init__(self, content): self.choices = [_Choice(content)]


class _Completions:
    def __init__(self, api_key): self._key = api_key

    def create(self, *, model, messages, temperature=0, timeout=45, **_):
        contents, system = [], None
        for m in messages:
            if m["role"] == "system":
                system = {"parts": [{"text": m["content"]}]}
            elif m["role"] == "user":
                contents.append({"role": "user",  "parts": [{"text": m["content"]}]})
            elif m["role"] == "assistant":
                contents.append({"role": "model", "parts": [{"text": m["content"]}]})

        payload = {"contents": contents, "generationConfig": {"temperature": temperature}}
        if system:
            payload["system_instruction"] = system

        url = _GEMINI_NATIVE.format(model=model)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload, headers={"x-goog-api-key": self._key})
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _Response(text)


class _GeminiAsAzure:
    def __init__(self, *, azure_endpoint=None, api_key, api_version=None, **_):
        self.chat = type("_Chat", (), {"completions": _Completions(api_key)})()


openai.AzureOpenAI = _GeminiAsAzure  # must happen before pipeline imports

# ── App ───────────────────────────────────────────────────────────────────────

import asyncio  # noqa: E402
from typing import Any  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from core.llm_parser import parse_email  # noqa: E402
from scoring.models import OpportunityInput, ScoredOpportunity  # noqa: E402
from scoring.pipeline import score_opportunity  # noqa: E402

app = FastAPI(title="Charity Aid — Local Test Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "model": os.environ.get("AZURE_OPENAI_DEPLOYMENT")}


@app.post("/score", response_model=list[ScoredOpportunity])
async def score(opportunities: list[OpportunityInput]):
    """Score a list of pre-extracted opportunity objects."""
    try:
        results = await asyncio.gather(*(score_opportunity(opp) for opp in opportunities))
        return list(results)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/parse")
async def parse(email_data: dict[str, Any]):
    """
    Run the full pipeline on a raw email dict.

    Expected body:
        {
            "id": "...",
            "subject": "...",
            "from": "...",
            "receivedDateTime": "2026-04-17T10:00:00Z",
            "body": "..."
        }
    """
    try:
        result = parse_email(email_data)
        return result.model_dump(mode="json")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
