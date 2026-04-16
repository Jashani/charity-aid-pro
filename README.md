# Charity Aid Pro

A funding pipeline management tool for UK charities. It combines a React dashboard for tracking grant opportunities with an automated email parser that reads funding emails and extracts structured opportunity data using Azure OpenAI.

---

## Architecture

```
┌─────────────────────────────────┐     ┌──────────────────────────────────────┐
│  Frontend (React SPA)           │     │  Email Parser (Azure Functions)       │
│                                 │     │                                        │
│  - Discover funding             │────▶│  GET /api/opportunities               │
│  - Pipeline (Kanban)            │     │  POST /api/scan                       │
│  - Active funding               │     │  GET /api/dead-letters                │
│  - Reports & analytics          │     │  POST /api/dead-letters/{id}/retry    │
│  - Relationships & contacts     │     │                                        │
│  - Reminders                    │     │  Timer: polls mailbox every 15 min    │
└─────────────────────────────────┘     └──────────────────────────────────────┘
                                                        │
                                         ┌──────────────┴──────────────┐
                                         │                             │
                                   Microsoft 365               Azure Cosmos DB
                                   (Graph API)                 (free tier)
                                   + Azure OpenAI
```

---

## Repository structure

```
charity-aid-pro/
├── src/                        # React frontend
│   ├── components/             # UI components (shadcn/ui)
│   ├── pages/                  # Dashboard pages
│   └── lib/mock-data.ts        # FundingOpportunity interface + mock data
├── email_parsing/              # Azure Functions email parser (Python 3.11)
│   ├── function_app.py         # All 5 Azure Functions
│   ├── core/                   # Business logic modules
│   ├── prompts/                # LLM prompt files (editable without code changes)
│   ├── sample/                 # Real sample emails for testing
│   ├── tests/                  # pytest unit + integration tests
│   └── infra/                  # Azure Bicep IaC + deploy script
└── .github/
    └── copilot-instructions.md # GitHub Copilot context for this repo
```

---

## Frontend

**Tech stack:** React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS, TanStack Query, React Router v6, Zod, React Hook Form

### Local development

```sh
# Install dependencies
npm install

# Start dev server (http://localhost:8080)
npm run dev

# Run tests
npm test
```

### Pages

| Page | Description |
|---|---|
| Dashboard | Summary metrics and recent activity |
| Discover | Browse and search funding opportunities |
| Pipeline | Kanban board — track applications from identified to awarded |
| Funding | Active grants and renewal tracking |
| Reports | Analytics and charts |
| Relationships | Funder contacts and communication history |
| Reminders | Email reminder rules and recipients |

---

## Email Parser

Automatically reads a Microsoft 365 mailbox every 15 minutes, classifies emails (funding opportunity / newsletter / irrelevant), extracts structured opportunity data using Azure OpenAI, and stores results in Cosmos DB.

**Tech stack:** Python 3.11, Azure Functions v2, Microsoft Graph API, Azure OpenAI (GPT-4o-mini + GPT-4o fallback), Azure Cosmos DB (NoSQL free tier), Pydantic v2, httpx, MarkItDown

**Estimated annual cost: ~$18** (within Azure for Nonprofits $2,000/year credits)

### How it works

1. **Fetch** — Graph API retrieves unread emails (up to 25 per poll)
2. **Dedup** — skips emails already in Cosmos DB
3. **Classify** — GPT-4o-mini labels each email: `FUNDING_OPPORTUNITY`, `NEWSLETTER`, or `IRRELEVANT`
4. **Extract** — GPT-4o-mini pulls structured fields from relevant emails; auto-escalates to GPT-4o if confidence falls below `CONFIDENCE_THRESHOLD` (default 0.7, configurable)
5. **Validate** — Pydantic schema enforces the `FundingOpportunity` contract
6. **Store** — upserted to Cosmos DB
7. **Mark read** — email marked as read in mailbox; failures moved to `ParseFailed` folder

### API endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/opportunities` | None | All parsed opportunities (filterable by `type`, `status`, `funderName`) |
| `POST` | `/api/scan` | Function key | Manually trigger a mailbox poll |
| `GET` | `/api/dead-letters` | Function key | List failed emails awaiting manual review |
| `POST` | `/api/dead-letters/{email_id}/retry` | Function key | Reprocess a specific failed email |

### Failed email handling

Emails that fail parsing are:
- Stored in the Cosmos DB `dead-letters` container with the error message, retry count, and original email data
- Moved to a `ParseFailed` folder in the mailbox

Use `GET /api/dead-letters` to list them and `POST /api/dead-letters/{email_id}/retry` to reprocess. On successful retry, the entry is marked resolved and the opportunity is stored normally.

### Local development

Prerequisites:
- Python 3.11
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) (`npm install -g azure-functions-core-tools@4`)

```sh
cd email_parsing

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your Azure credentials

# Run locally
func start

# Run tests
pytest tests/
```

### Configuration

All settings are read from environment variables. Copy `local.settings.json.example` to `local.settings.json` for local dev (gitignored — never commit secrets).

| Variable | Description |
|---|---|
| `GRAPH_TENANT_ID` | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | App registration secret (Key Vault in production) |
| `GRAPH_USER_EMAIL` | Mailbox address to poll |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI service URL |
| `AZURE_OPENAI_KEY` | Azure OpenAI key (Key Vault in production) |
| `AZURE_OPENAI_DEPLOYMENT` | Primary model deployment name (default: `gpt-4o-mini`) |
| `AZURE_OPENAI_DEPLOYMENT_FULL` | Fallback model deployment name (default: `gpt-4o`) |
| `CONFIDENCE_THRESHOLD` | Score below which parser escalates to fallback model (default: `0.7`) |
| `COSMOS_ENDPOINT` | Cosmos DB account URL |
| `COSMOS_KEY` | Cosmos DB key (Key Vault in production) |
| `COSMOS_DATABASE` | Database name (default: `email-parser`) |
| `COSMOS_CONTAINER` | Container name (default: `opportunities`) |

### Deployment

Prerequisites: Azure CLI, Azure Functions Core Tools, `jq`

```sh
# Log in to Azure
az login

# Deploy infrastructure + publish function code
cd email_parsing/infra
chmod +x deploy.sh
./deploy.sh --resource-group charity-email-parser-rg --location uksouth
```

The script provisions all Azure resources via Bicep and prints the exact commands to set secrets in Key Vault after deployment.

**Azure prerequisites (one-time, requires admin):**
1. Create an Azure AD App Registration with `Mail.Read` application permission on Microsoft Graph
2. Grant admin consent for the permission
3. Create a client secret and add it to Key Vault post-deployment

### Tuning the prompts

The LLM prompts are in `email_parsing/prompts/` as plain text files. Edit them directly to improve extraction accuracy — no code changes needed. Add sample emails to `email_parsing/sample/` and run the integration tests to validate changes.

### Switching models

If a model family is retired entirely, update `email_parsing/infra/parameters.json` and redeploy — no code changes needed:

```json
"openAiModelPrimary": { "value": "<new-model-name>" },
"openAiModelPrimaryVersion": { "value": "<new-version>" }
```

```sh
./deploy.sh
```

Within the same model family, `versionUpgradeOption: OnceCurrentVersionExpired` in the Bicep handles version bumps automatically.

---

## Data schema

### ParsedEmail

The top-level document stored in Cosmos DB for every processed email. Contains email metadata and a list of extracted opportunities.

| Field | Type | Description |
|---|---|---|
| `emailId` | `string` | Graph API message ID — used as the Cosmos document `id` |
| `emailSubject` | `string` | Email subject line |
| `emailFrom` | `string` | Sender address |
| `emailReceivedAt` | `datetime` | When the email arrived (UTC) |
| `parsedAt` | `datetime` | When the pipeline processed it (UTC) |
| `modelUsed` | `string` | OpenAI deployment name used for final extraction |
| `classification` | `"FUNDING_OPPORTUNITY" \| "NEWSLETTER" \| "IRRELEVANT"` | Email classification |
| `classificationConfidence` | `float` (0–1) | Model confidence in the classification |
| `opportunities` | `FundingOpportunity[]` | Extracted opportunities (empty for irrelevant emails) |

### FundingOpportunity

The shared contract between the email parser and the frontend. TypeScript source of truth: `src/lib/mock-data.ts`. Python mirror: `email_parsing/core/schema.py`.

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | — | Unique identifier (generated slug) |
| `funderName` | `string` | — | Name of the funding organisation |
| `programName` | `string` | — | Name of the specific grant programme |
| `amount` | `number` | — | Minimum award amount (GBP) |
| `amountMax` | `number \| null` | `null` | Maximum award amount if a range is given |
| `type` | `"grant" \| "trust" \| "lottery" \| "corporate" \| "government"` | — | Category of funder |
| `deadline` | `string` | — | Application deadline (ISO 8601 or `"unknown"`) |
| `location` | `string` | — | Geographic eligibility area |
| `duration` | `"single-year" \| "multi-year"` | — | Grant duration |
| `durationMonths` | `number` | — | Duration in months |
| `relationship` | `"new" \| "previously-applied" \| "existing-funder" \| "re-eligible"` | `"new"` | Charity's relationship with this funder |
| `status` | `"identified" \| "researching" \| "applying" \| "submitted" \| "awarded" \| "rejected"` | `"identified"` | Pipeline stage |
| `score` | `number` (0–100) | `0` | Relevance/fit score (set manually or by a scoring step) |
| `tags` | `string[]` | `[]` | e.g. `"Quick Win"`, `"Multi-Year"`, `"Capital Cost"` |
| `description` | `string` | — | 2–3 sentence summary of the fund |
| `eligibility` | `string` | — | Key eligibility criteria |
| `notes` | `string` | `""` | Additional notes |
| `website` | `string` | — | Application or information URL |
| `contactName` | `string \| null` | `null` | Contact person's name |
| `contactEmail` | `string \| null` | `null` | Contact person's email |
| `source` | `string` | — | Origin, e.g. `"email:AAMkAG..."` |
| `extractionConfidence` | `float` (0–1) | `0` | LLM confidence in extracted data |
