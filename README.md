# Charity Aid Pro

A funding pipeline tool for UK charities. A React dashboard surfaces grant
opportunities; a small Python pipeline pulls funding emails from a personal
Outlook inbox, parses them with an LLM, scores each opportunity, and writes
the results to Supabase.

---

## Architecture

```
┌────────────────────────────┐         ┌──────────────────────────────────────┐
│  Frontend (React SPA)      │         │  Python pipelines (two CLIs)         │
│                            │         │                                      │
│  - Discover funding        │         │  python -m email_parsing.run         │
│  - Pipeline (Kanban)       │◀────────│    fetch → parse → score → upsert    │
│  - Active funding          │  reads  │    (daily 09:00 UTC)                 │
│  - Reports & analytics     │         │                                      │
│  - Relationships           │         │  python -m email_parsing.reminders.run│
│  - Reminders               │         │    deadline reminders → Graph sendMail│
│                            │         │    (daily 10:00 UTC)                 │
└────────────────────────────┘         └──────────────────────────────────────┘
            │                                          │
            │ Supabase JS client                       │ Supabase Python client
            ▼                                          ▼
        ┌──────────────────────────────────────────────────┐
        │            Supabase (Postgres + RLS)             │
        │   opportunities · funder_contacts ·              │
        │   reminder_rules · reminder_recipients ·         │
        │   reminder_log                                   │
        └──────────────────────────────────────────────────┘

Three GitHub Actions:
  - email-pipeline.yml  → parse inbox (daily 09:00 UTC)
  - reminders.yml       → send deadline reminders (daily 10:00 UTC)
  - deploy-pages.yml    → build + deploy the SPA to GitHub Pages (on push to main)

External services:
  - Microsoft Graph (personal Outlook, MSAL device-code; Mail.ReadWrite + Mail.Send)
  - Groq (Llama 3.3 70B via OpenAI-compatible endpoint, free tier)
```

---

## Repository structure

```
charity-aid-pro/
├── src/                              # React frontend
│   ├── components/                   # UI components (shadcn/ui)
│   ├── pages/                        # Dashboard pages
│   └── lib/                          # FundingOpportunity types + helpers
├── email_parsing/                    # Python pipelines (CLIs, no server)
│   ├── run.py                        # parse-pipeline CLI entry point
│   ├── outlook.py                    # MSAL device-code + Graph (fetch + token)
│   ├── llm.py                        # OpenAI-compatible client + parse()
│   ├── scoring.py                    # gating + algorithmic + heuristic
│   ├── storage.py                    # Supabase upsert
│   ├── schema.py                     # Pydantic models
│   ├── config.py                     # env vars
│   ├── prompts/parse.txt             # single classify+extract prompt
│   ├── reminders/                    # deadline-reminder pipeline
│   │   ├── run.py                    # reminders CLI entry point
│   │   ├── mailer.py                 # Graph sendMail wrapper
│   │   ├── template.py               # HTML email templates
│   │   └── tests/
│   └── tests/
├── supabase/migrations/              # opportunities · funder_contacts · reminder tables
└── .github/workflows/
    ├── email-pipeline.yml            # parse inbox (daily 09:00 UTC)
    ├── reminders.yml                 # send reminders (daily 10:00 UTC)
    └── deploy-pages.yml              # build + deploy SPA to GitHub Pages
```

---

## Frontend

**Tech stack:** React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS,
TanStack Query, React Router v6, Zod, React Hook Form, Supabase JS client.

### Local development

```sh
npm install
cp .env.example .env       # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                # http://localhost:8080
npm test
```

### Pages

| Page | Description |
|---|---|
| Dashboard | Summary metrics and recent activity |
| Discover | Browse and search funding opportunities |
| Pipeline | Kanban — track applications from identified to awarded |
| Funding | Active grants and renewal tracking |
| Reports | Analytics and charts |
| Relationships | Funder organisations derived from opportunity history; optional contact enrichment |
| Reminders | Email reminder rules and recipients |

### Deployment

`.github/workflows/deploy-pages.yml` builds the SPA (`npm ci && npm run build`)
and deploys `dist/` to GitHub Pages on every push to `main` (and on manual
dispatch). It copies `dist/index.html` to `dist/404.html` so client-side
routes resolve on Pages. Vite inlines `VITE_SUPABASE_*` at build time, so
those values must be present in the build environment for the deployed site
to reach Supabase.

---

## Email pipeline

The pipeline is a single Python CLI script. It runs on a daily GitHub
Actions cron — there is no Azure Functions runtime, no FastAPI server, no
Cosmos DB.

**Tech stack:** Python 3.11, Microsoft Graph (personal Outlook via MSAL
device-code, scope `Mail.ReadWrite`), Groq + Llama 3.3 70B over the OpenAI-
compatible endpoint, Supabase, Pydantic v2, httpx, MarkItDown.

### How it works

For each run:

1. **Fetch** — Microsoft Graph returns the most recent inbox messages.
   With `--unread-only` (the cron default), `$filter=isRead eq false`
   restricts the query to messages we haven't processed yet.
2. **Parse** — one LLM call per email returns
   `{classification, confidence, opportunities[]}`. Newsletter / irrelevant
   emails come back with an empty list.
3. **Score** — each opportunity goes through gating (extraction confidence,
   geography with LLM + keyword fallback, eligibility heuristic),
   algorithmic scoring (funding band, days-to-deadline, geography
   modifier), and a weighted composite score (0–100). Suggested tags are
   added: `Quick Win`, `Multi-Year`, `Strong Match`, `High Value`.
4. **Store** — opportunities are upserted to the `opportunities` table on
   the deterministic id `{emailId}#{idx}`, so reruns are idempotent.
5. **Mark read** — only after both LLM and storage succeed. If anything
   earlier fails, the email stays unread and the next run retries it.

### Local runs

```sh
# One-time: register a Microsoft Entra app (any-org-or-personal account
# type, Mail.ReadWrite delegated permission, public client flow enabled),
# then authenticate from the repo root:
python -m email_parsing.outlook auth

# Set credentials and run:
export LLM_API_KEY=<groq key>            # gsk_...
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_KEY=<service-role key>

python -m email_parsing.run --count 10                    # full pipeline
python -m email_parsing.run --count 5 --no-store --output /tmp/parsed.json
```

CLI flags: `--count N`, `--unread-only`, `--mark-read`, `--no-store`,
`--no-score`, `--output PATH`. Locally, `--unread-only` and `--mark-read`
are off by default so you can re-test without changing inbox state. The
cron run sets both.

Tests:

```sh
pip install -r email_parsing/requirements.txt pytest
pytest email_parsing/tests
```

### Configuration

Pipeline settings come from environment variables ([config.py](email_parsing/config.py)):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LLM_API_KEY` | yes | — | Groq, OpenAI, Gemini OpenAI-compat, OpenRouter, Azure |
| `LLM_BASE_URL` | no | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | no | `llama-3.3-70b-versatile` | |
| `LLM_TIMEOUT_SECONDS` | no | `60` | |
| `MSAL_CLIENT_ID` | no | (registered Entra app) | only override if you re-register |
| `MSAL_CACHE_FILE` | no | `<repo>/token_cache.bin` | local token cache |
| `MSAL_TOKEN_CACHE_B64` | CI only | — | base64-encoded cache (overrides the file) |
| `SUPABASE_URL` | for storage | — | |
| `SUPABASE_KEY` | for storage | — | service-role key |

The OpenAI client uses `max_retries=6` and honors the `Retry-After` header,
so a single run absorbs Groq TPM-window resets without bubbling failures.

### GitHub Actions

`.github/workflows/email-pipeline.yml` runs **daily at 09:00 UTC** and on
manual dispatch. A `concurrency` lock prevents two runs from racing on the
mailbox. The cron uses `--unread-only --mark-read`, so each day picks up
only what's actually new.

**Settings → Secrets and variables → Actions**

Secrets (required):

| Name | Value |
|---|---|
| `LLM_API_KEY` | Groq API key (`gsk_…`) |
| `MSAL_TOKEN_CACHE_B64` | output of `python -m email_parsing.outlook export-cache` after running `outlook auth` locally |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_KEY` | Supabase service-role key |

Variables (optional — only set to override defaults):

| Name | Default |
|---|---|
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | `llama-3.3-70b-versatile` |
| `MSAL_CLIENT_ID` | the registered Entra app id |

To rotate the Outlook auth, run `outlook auth` again locally and re-export
the cache to `MSAL_TOKEN_CACHE_B64`.

### Tuning the prompt

The single LLM prompt is `email_parsing/prompts/parse.txt` — edit and
commit, no code changes needed. Pydantic validation enforces the schema
on the way back, so malformed opportunities are dropped with a warning
rather than blowing up the run.

---

## Reminders pipeline

A second Python CLI (`python -m email_parsing.reminders.run`) emails deadline
reminders for active opportunities. It runs on its own daily cron
(`.github/workflows/reminders.yml`, **10:00 UTC** — one hour after parsing so
the day's new opportunities are included).

### How it works

For each enabled rule in `reminder_rules` (cadence `before_deadline`) and each
enabled recipient in `reminder_recipients`:

1. Load active opportunities (`identified`, `on_hold`, `researching`,
   `applying`, `submitted`) with a future deadline.
2. For every opportunity whose days-to-deadline equals one of the rule's
   `offsets_days`, claim a `reminder_log` row. The row's unique constraint is
   the dedup key, so a reminder is sent **at most once** per
   (opportunity, rule, recipient, offset).
3. Send the HTML email via Microsoft Graph `sendMail` (needs the `Mail.Send`
   scope, already in the cached token). If the send fails, the log claim is
   rolled back so the next run retries.

The template ([template.py](email_parsing/reminders/template.py)) mirrors the
preview shown on the Reminders page.

### Local runs

```sh
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_KEY=<service-role key>

python -m email_parsing.reminders.run --dry-run        # log intended sends only
python -m email_parsing.reminders.run --rule-id deadline
python -m email_parsing.reminders.run --test you@example.com   # one fake email
```

CLI flags: `--dry-run`, `--rule-id ID`, `--test EMAIL`. The cron passes
neither flag (live send, all rules); manual dispatch can set `dry_run` or
`rule_id` from the Actions UI.

The workflow needs the `MSAL_TOKEN_CACHE_B64`, `SUPABASE_URL`, and
`SUPABASE_KEY` secrets (the same ones the parsing pipeline uses) plus the
optional `MSAL_CLIENT_ID` variable. It does **not** need `LLM_API_KEY`.

---

## Data schema

The Supabase schema lives in [supabase/migrations/](supabase/migrations).
Pydantic mirror in [email_parsing/schema.py](email_parsing/schema.py);
TypeScript source of truth in [src/lib/](src/lib).

Tables: `opportunities`, `funder_contacts`, `reminder_rules`,
`reminder_recipients`, `reminder_log`.

### FundingOpportunity

Shared contract between the pipeline and the frontend.

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | — | Deterministic `{emailId}#{idx}` |
| `funderName` | `string` | — | Funding organisation |
| `programName` | `string` | — | Specific grant programme |
| `amount` | `number` | — | Minimum award (GBP) |
| `amountMax` | `number \| null` | `null` | Max award if a range is given |
| `type` | `"grant" \| "trust" \| "lottery" \| "corporate" \| "government"` | — | |
| `deadline` | `string` | — | ISO 8601 date or `"unknown"` |
| `location` | `string` | — | Geographic eligibility |
| `duration` | `"single-year" \| "multi-year"` | — | |
| `durationMonths` | `number` | `12` | |
| `status` | `"identified" \| "on_hold" \| "researching" \| "applying" \| "submitted" \| "awarded" \| "funds_received" \| "rejected" \| "dismissed"` | `"identified"` | Pipeline stage |
| `score` | `number` (0–100) | `0` | Mirrors `final_score` after scoring |
| `tags` | `string[]` | `[]` | LLM-suggested + scoring-suggested tags |
| `description` | `string` | `""` | 2–3 sentence summary |
| `eligibility` | `string` | `""` | Key criteria |
| `notes` | `string` | `""` | Free-form |
| `website` | `string` | `""` | URL |
| `contactName` | `string \| null` | `null` | |
| `contactEmail` | `string \| null` | `null` | |
| `source` | `string` | `""` | e.g. `"email:AAMkAG..."` |
| `extractionConfidence` | `float` (0–1) | `0` | LLM confidence |

After scoring, opportunities also carry `gating`, `scores`, `timing`,
`final_score`, `suggested_tags`, and `scored_at`. See
[email_parsing/README.md](email_parsing/README.md) for the scoring detail.

### FunderContact

Optional enrichment for funder organisations. The Relationships page
derives per-funder stats (applications, awards, total funded) directly
from the `opportunities` table grouped by `funder_name`; `funder_contacts`
holds manually added contact details only.

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | auto | Primary key |
| `organisation` | `string` | — | Funder org name (case-insensitive unique) |
| `name` | `string` | `""` | Contact person name |
| `email` | `string` | `""` | Contact email |
| `notes` | `string` | `""` | Free-form notes (e.g. relationship context) |

The `organisation` column has a case-insensitive unique index so lookups
and upserts from the frontend normalise to `lower(organisation)`.
