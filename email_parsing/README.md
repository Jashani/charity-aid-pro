# Email parsing + scoring pipeline

A small Python pipeline that:

1. pulls recent emails from a personal Outlook account (Microsoft Graph + MSAL device-code),
2. parses each one with a single LLM call (classify + extract opportunities),
3. scores each opportunity (gating + algorithmic + heuristic),
4. upserts the results into Supabase.

It runs as one CLI script (`python -m email_parsing.run`) and is designed to
execute on a GitHub Actions cron — no FastAPI, no Azure Functions, no server.

## Layout

```
email_parsing/
  run.py        — CLI: fetch → parse → score → store
  outlook.py    — MSAL device-code auth + Graph fetch
  llm.py        — OpenAI-compatible client + parse_email()
  scoring.py    — gating, algorithmic, heuristic, weighted final score
  storage.py    — Supabase upsert
  schema.py     — Pydantic models
  config.py     — env vars
  prompts/parse.txt
  tests/
```

The Supabase table is defined in `supabase/migrations/`.

## Configuration

All settings come from env vars:

| Var | Required | Notes |
|---|---|---|
| `LLM_API_KEY` | yes | Groq, OpenAI, Gemini, or any OpenAI-compatible provider |
| `LLM_BASE_URL` | no | default `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | no | default `llama-3.3-70b-versatile` |
| `LLM_TIMEOUT_SECONDS` | no | default `60` |
| `MSAL_CLIENT_ID` | no | default is the registered Entra app id |
| `MSAL_CACHE_FILE` | no | path to MSAL token cache (default `<repo>/token_cache.bin`) |
| `MSAL_TOKEN_CACHE_B64` | CI only | base64-encoded cache contents; overrides the file |
| `SUPABASE_URL` | for storage | Supabase project URL |
| `SUPABASE_KEY` | for storage | Supabase service-role key |

## One-time mailbox auth

The Microsoft Entra app registration must allow public client flows and have
the delegated `Mail.Read` permission. Then run the device-code flow once:

```bash
python -m email_parsing.outlook auth
```

The token cache is written to `MSAL_CACHE_FILE` and refreshes silently
afterwards. To use the cached refresh token in CI, export it as a base64 blob:

```bash
python -m email_parsing.outlook export-cache > cache.b64
# paste into a GitHub Actions secret named MSAL_TOKEN_CACHE_B64
```

## Running locally

```bash
pip install -r email_parsing/requirements.txt
export LLM_API_KEY=...
export SUPABASE_URL=...
export SUPABASE_KEY=...

python -m email_parsing.run --count 10           # parse + score + store
python -m email_parsing.run --count 5 --no-store --output /tmp/parsed.json
```

CLI flags: `--count N`, `--unread-only`, `--mark-read`, `--no-store`, `--no-score`, `--output PATH`.

Pairing `--unread-only` with `--mark-read` gives a self-contained watermark:
each run only sees emails that haven't been processed yet, with no external
state required. Local manual runs leave both off by default so you can re-test
without changing inbox state.

## Tests

```bash
pip install pytest
pytest email_parsing/tests
```

Tests cover JSON parsing, the parse-email envelope, geography fallback, funding
bands, and the scoring pipeline. They do not hit the LLM, Outlook, or Supabase.

## GitHub Actions

`.github/workflows/email-pipeline.yml` runs **daily at 09:00 UTC** (and on
manual dispatch) and uploads the parsed payload as a build artefact. A
`concurrency` lock prevents two pipeline runs from racing on the mailbox.

The cron run uses `--unread-only --mark-read`, so each day picks up only
emails that arrived (and weren't manually read) since the previous run. No
external watermark or state table is needed: the inbox itself is the
source of truth.

The OpenAI SDK uses `max_retries=6` and honors the `Retry-After` header that
Groq returns on 429s, so a single run can absorb multiple TPM-window resets
without any failures bubbling up — no manual sleep padding is needed.

### Repo configuration

**Settings → Secrets and variables → Actions**

Secrets (all required):

| Name | Value |
|---|---|
| `LLM_API_KEY` | Groq API key (`gsk_…`) |
| `MSAL_TOKEN_CACHE_B64` | output of `python -m email_parsing.outlook export-cache` (run locally once after `outlook auth`) |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_KEY` | Supabase service-role key |

Variables (all optional — only set to override the baked-in defaults):

| Name | Default | When to set |
|---|---|---|
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | switch to OpenAI / Gemini OpenAI-compat / OpenRouter / Azure |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | use a different model on the same provider |
| `MSAL_CLIENT_ID` | the registered Entra app id | only if you re-register the Microsoft Entra app |

Once the four secrets are set, the workflow runs automatically every 6 hours
and is also available via **Actions → Email parsing pipeline → Run workflow**
for ad-hoc runs (with optional `count` and `mark_read` inputs).

## Scoring summary

For each extracted opportunity:

1. **Gating** — extraction confidence, geography (LLM with keyword fallback),
   eligibility heuristic. Geography hard-fail short-circuits scoring.
2. **Algorithmic** — funding value bands, days-to-deadline timing, geography
   modifier (Kent 1.10×, regional 1.05×, UK-wide 1.00×).
3. **Heuristic LLM stand-in** — strategic fit / effort / probability /
   strategic value (keyword-based, deliberately simple; replace with a real
   LLM call by editing `_heuristic_scores` in `scoring.py`).
4. **Final score** — weighted composite 0–100:
   `strategic_fit 30% • funding_value 35% • probability 15% •
   strategic_value 15% • effort 5%`.
5. **Suggested tags** — `Quick Win`, `Multi-Year`, `Strong Match`, `High Value`.

Gating statuses: `passed`, `needs_review`, `failed`.
