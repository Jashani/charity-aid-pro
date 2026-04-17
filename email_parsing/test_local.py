"""
Local test script — runs the full parse+score pipeline against Gemini.

Usage:
    cd email_parsing
    python3 test_local.py

No Azure, no Cosmos DB, no Graph API required.
Reads AZURE_OPENAI_* from local.settings.json automatically.
"""

import json
import os
import sys
from pathlib import Path

# ── Load local.settings.json into env before importing pipeline modules ───────

settings_path = Path(__file__).resolve().parent / "local.settings.json"
if settings_path.exists():
    settings = json.loads(settings_path.read_text())
    for key, value in settings.get("Values", {}).items():
        os.environ[key] = value
else:
    sys.exit("local.settings.json not found — copy local.settings.json.example and fill in your Gemini key.")

# Clear any Google credentials that could conflict with our Bearer token auth
for _var in ["GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT"]:
    os.environ.pop(_var, None)

# ── Sample emails ─────────────────────────────────────────────────────────────

EMAILS = [
    {
        "id": "test-email-001",
        "subject": "FW: Funding for education, health & community projects",
        "from": "info@music4wellbeing.org.uk",
        "receivedDateTime": "2026-03-03T11:26:09Z",
        "body": """\
We're thrilled to share five upcoming funding opportunities, all closing in March 2026.

1. Technical & vocational education – £25,000
Funding for projects designed to support young practitioners and learners undertaking technical and vocational qualifications.
Deadline: 11 March 2026

2. Medical charities – £10,000
One-off grants for registered medically related charities. Funding can support medical capital projects, equipment, research, medical training, care delivery, and running costs.
Deadline: 16 March 2026

3. Financial education programmes – Up to £1,000,000
Significant long-term funding (up to five years) for programmes delivering financial education at key life moments.
Deadline: 23 March 2026

4. Communication skills for employment – Up to £15,000
Project funding for charities equipping disadvantaged adults (18+) with essential communication skills for the workplace.
Deadline: 24 March 2026

5. West Midlands charities – £25,000
Project grants for charities based in the West Midlands working across community action, vulnerable groups, advice services, education and training, environment, healthcare, the arts, and penal affairs.
Deadline: 29 March 2026
""",
    },
    {
        "id": "test-email-002",
        "subject": "Kent Community Foundation — Wellbeing Fund now open",
        "from": "grants@kcf.org.uk",
        "receivedDateTime": "2026-04-17T09:00:00Z",
        "body": """\
Dear Music4Wellbeing,

We are pleased to announce that the Kent Community Foundation Wellbeing Fund is now open for applications.

Grants of £5,000 to £15,000 are available for registered charities and community organisations in Kent supporting older people, those experiencing isolation and loneliness, and mental health and wellbeing projects.

Multi-year funding of up to two years is available for established organisations.

Deadline: 30 June 2026
More information: https://kcf.org.uk/wellbeing-fund

Best regards,
The Grants Team
Kent Community Foundation
""",
    },
    {
        "id": "test-email-003",
        "subject": "Your Amazon order has shipped",
        "from": "noreply@amazon.co.uk",
        "receivedDateTime": "2026-04-17T08:00:00Z",
        "body": "Your order #123-456 has been dispatched and will arrive by Tuesday.",
    },
]

# ── Patch AzureOpenAI → native Gemini client ──────────────────────────────────
# The AQ. key format only works with x-goog-api-key on Gemini's native endpoint
# (as in the curl quickstart). We replace AzureOpenAI with a thin httpx client
# that calls the native API directly, converting to/from the OpenAI response
# shape that llm_parser.py expects.

import time
import httpx
import openai

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


openai.AzureOpenAI = _GeminiAsAzure  # must happen before llm_parser is imported

# ── Run pipeline ──────────────────────────────────────────────────────────────

from core.llm_parser import parse_email  # noqa: E402 — must be after env setup and patch


def fmt_score(val):
    return f"{val:.1f}" if val is not None else "n/a"


def print_result(result):
    print(f"\n{'='*60}")
    print(f"Email : {result.emailSubject}")
    print(f"Class : {result.classification} (confidence {result.classificationConfidence:.0%})")
    print(f"Opps  : {len(result.opportunities)} found")

    for i, opp in enumerate(result.opportunities, 1):
        print(f"\n  [{i}] {opp.funderName} — {opp.programName}")
        print(f"      Amount   : £{opp.amount:,.0f}" + (f" – £{opp.amountMax:,.0f}" if opp.amountMax else ""))
        print(f"      Location : {opp.location}")
        print(f"      Deadline : {opp.deadline}")
        print(f"      Score    : {fmt_score(opp.final_score)} / 100")
        if opp.gating:
            print(f"      Gating   : {opp.gating.status}")
            print(f"        geography  : {'pass' if opp.gating.geography.pass_ else 'FAIL'} ({opp.gating.geography.location})")
            print(f"        eligibility: {'pass' if opp.gating.eligibility.pass_ else 'FAIL'} — {opp.gating.eligibility.reasoning}")
        if opp.suggested_tags:
            print(f"      Tags     : {', '.join(opp.suggested_tags)}")

    print(f"\n--- Full schema (ParsedEmail) ---")
    print(json.dumps(result.model_dump(mode="json"), indent=2, default=str))


if __name__ == "__main__":
    key = os.environ.get("AZURE_OPENAI_KEY", "")
    if not key or key == "YOUR_GEMINI_API_KEY_HERE":
        sys.exit("Add your Gemini API key to local.settings.json (AZURE_OPENAI_KEY field) and try again.")

    print(f"Endpoint : {os.environ.get('AZURE_OPENAI_ENDPOINT')}")
    print(f"Model    : {os.environ.get('AZURE_OPENAI_DEPLOYMENT')}")
    print(f"Running {len(EMAILS)} test emails...\n")

    for email_data in EMAILS:
        try:
            result = parse_email(email_data)
            print_result(result)
        except Exception as exc:
            print(f"\n[ERROR] {email_data['subject']}: {exc}")

    print(f"\n{'='*60}")
    print("Done.")
