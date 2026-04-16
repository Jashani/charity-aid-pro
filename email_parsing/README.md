# Charity Aid Pro: Email Parsing Service

This directory contains a Python 3.11 Azure Functions service that:

1. polls a Microsoft 365 mailbox,
2. classifies each unread email with Azure OpenAI,
3. extracts structured funding opportunities,
4. stores results in Azure Cosmos DB,
5. exposes a read API for the frontend.

## Contents

- [Architecture](#architecture)
- [How The Pipeline Works](#how-the-pipeline-works)
- [Directory Structure](#directory-structure)
- [Data Contracts](#data-contracts)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Running Tests](#running-tests)
- [HTTP Endpoints](#http-endpoints)
- [Error Handling And Reliability](#error-handling-and-reliability)
- [Prompt Engineering Workflow](#prompt-engineering-workflow)
- [Deployment](#deployment)
- [Operations And Troubleshooting](#operations-and-troubleshooting)

## Architecture

Main components:

- `function_app.py`
  - Azure Functions entrypoints (`timer`, `POST /api/scan`, `GET /api/opportunities`)
  - per-email orchestration and dead-letter handling
- `core/email_client.py`
  - Microsoft Graph auth and mailbox operations
  - retry/backoff for Graph HTTP requests
- `core/llm_parser.py`
  - classify and extract pipeline
  - confidence-based escalation from GPT-4o-mini to GPT-4o
  - retry/backoff and timeout handling for LLM calls
- `core/storage.py`
  - Cosmos DB persistence
  - dedup checks, upsert, filtered query, dead-letter writes
- `core/schema.py`
  - Pydantic v2 models for classification, opportunities, parsed emails
- `prompts/`
  - prompt templates used by classification and extraction

## How The Pipeline Works

1. `process_emails()` fetches unread messages from Graph.
2. For each message:
   - skip if already processed (Cosmos point-read by `emailId`),
   - classify (`mini`),
   - if low confidence (`< 0.7`), classify again with `full`,
   - if class is relevant, extract opportunities (`mini`),
   - if extraction confidence is low (or empty), extract again with `full`,
   - upsert parsed email to Cosmos,
   - mark message as read.
3. If any email fails:
   - write dead-letter record,
   - move message to `ParseFailed` folder,
   - continue processing remaining emails.

## Directory Structure

```text
email_parsing/
  function_app.py
  host.json
  local.settings.json.example
  requirements.txt
  requirements-dev.txt
  core/
    __init__.py
    config.py
    email_client.py
    llm_parser.py
    schema.py
    storage.py
  prompts/
    classify.txt
    extract.txt
  sample/
    *.txt
    eml_to_txt.py
  tests/
    conftest.py
    test_email_client.py
    test_llm_parser.py
    test_storage.py
  infra/
    main.bicep
    deploy.sh
    parameters.json
```

## Data Contracts

Primary model: `FundingOpportunity` in `core/schema.py`.

Important fields:

- shared app fields (`id`, `funderName`, `programName`, `amount`, `type`, `deadline`, etc.)
- pipeline metadata field: `extractionConfidence` (`0.0` to `1.0`)

Other models:

- `ClassificationResult`
  - `classification`: `FUNDING_OPPORTUNITY | NEWSLETTER | IRRELEVANT`
  - `confidence`: float (`0.0` to `1.0`)
  - `reason`: string
- `ParsedEmail`
  - top-level stored document with email metadata, classification, model used, and opportunities list

## Environment Variables

All configuration is read from environment variables in `core/config.py`.

Required:

- Graph
  - `GRAPH_TENANT_ID`
  - `GRAPH_CLIENT_ID`
  - `GRAPH_CLIENT_SECRET`
  - `GRAPH_USER_EMAIL`
- Azure OpenAI
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_KEY`
  - `AZURE_OPENAI_DEPLOYMENT` (default: `gpt-4o-mini`)
  - `AZURE_OPENAI_DEPLOYMENT_FULL` (default: `gpt-4o`)
- Cosmos DB
  - `COSMOS_ENDPOINT`
  - `COSMOS_KEY`
  - `COSMOS_DATABASE` (default: `email-parser`)
  - `COSMOS_CONTAINER` (default: `opportunities`)

For local development, copy:

```bash
cp local.settings.json.example local.settings.json
```

Then fill in values.

## Local Development

### Prerequisites

- Python 3.11
- Azure Functions Core Tools v4
- uv (recommended)

### Setup with uv

```bash
cd email_parsing
python3 -m uv python install 3.11
python3 -m uv venv --python 3.11
python3 -m uv pip install --python .venv/bin/python -r requirements-dev.txt
```

### Run locally

```bash
cd email_parsing
source .venv/bin/activate
func start
```

The app starts with route prefix `api` (from `host.json`).

## Running Tests

Use uv and run only the parser test suite:

```bash
cd email_parsing
python3 -m uv run --python .venv/bin/python pytest -q tests
```

Current suite covers:

- Graph retry behavior and mailbox shaping,
- LLM JSON repair, retry/fail-fast behavior, confidence escalation,
- Cosmos dedup/upsert/query/dead-letter behavior.

## HTTP Endpoints

### `POST /api/scan`

Manually trigger processing run.

- Auth level: `FUNCTION`
- Returns summary:

```json
{
  "processed": 10,
  "opportunities": 24,
  "failures": 1
}
```

### `GET /api/opportunities`

Returns flattened opportunity rows from Cosmos.

- Auth level: `ANONYMOUS`
- Optional query params:
  - `type`
  - `status`
  - `funderName`

## Error Handling And Reliability

### What is implemented

- Graph API:
  - exponential backoff on `429` and transient `5xx`, plus transport exceptions.
- LLM calls:
  - bounded retry loop with timeout,
  - retry for rate-limit and transient failures,
  - clear typed errors (`LLMInvocationError`, `LLMOutputError`),
  - one JSON repair attempt when model returns invalid JSON,
  - fail-open toggle for classification fallback (`_CLASSIFICATION_FAIL_OPEN`, default `False`).
- Pipeline robustness:
  - per-email failure isolation,
  - dead-letter persistence,
  - continue processing remaining emails.

### Reliability defaults

- confidence threshold: `0.7`
- LLM max attempts: `3`
- LLM timeout: `45s`

### Cost controls

- default model is `gpt-4o-mini`
- escalate to `gpt-4o` only on low confidence or extraction failure paths

## Prompt Engineering Workflow

Prompt templates are loaded from disk once and cached by process lifetime.

- Classification template: `prompts/classify.txt`
- Extraction template: `prompts/extract.txt`

Use placeholders:

- `{{subject}}`
- `{{body}}`
- `{{email_id}}` (extract only)

Recommended process:

1. update prompt text,
2. run parser tests,
3. run a small sample scan,
4. inspect extracted records and dead-letters,
5. iterate.

## Deployment

Infrastructure and deploy script are in `infra/`.

```bash
cd email_parsing/infra
./deploy.sh --resource-group charity-email-parser-rg --location uksouth
```

After deployment:

1. set Key Vault secret values,
2. set `GRAPH_CLIENT_ID` and `GRAPH_USER_EMAIL` app settings,
3. confirm function health with a manual `POST /api/scan`.

## Operations And Troubleshooting

### Common issues

1. `Pipeline modules failed to import`
   - check env vars and package installation.
2. frequent dead-letters with JSON parse errors
   - tighten extraction prompt output constraints,
   - review model deployment names and API version.
3. no opportunities returned from API
   - verify Cosmos container name and partition-key expectations,
   - confirm documents are being upserted with `id == emailId`.
4. tests fail with import errors
   - run from `email_parsing` and use uv command shown above.

### Observability tips

- monitor:
  - count of processed/failures,
  - dead-letter volume,
  - escalation rate to full model,
  - LLM retry count.
- keep logs structured by stage (`classify`, `extract`, `json_repair`) and `email_id` where available.

## Notes

- This service is designed for safe batch continuation: one bad email does not block the run.
- Keep all secrets in environment/Key Vault references; do not hardcode credentials.
