# GitHub Copilot Instructions — Charity Aid Pro

## Project overview

**Charity Aid Pro** is a funding pipeline management tool for a UK charity. It has two parts:

1. **Frontend** (`src/`) — React 18 + TypeScript + Vite SPA. Uses shadcn/ui, Tailwind CSS, TanStack Query, React Router v6, Zod, React Hook Form. Currently uses mock data from `src/lib/mock-data.ts`.

2. **Email parser** (`email_parsing/`) — Python 3.11 Azure Functions v2 app. Polls a Microsoft 365 mailbox via Graph API every 15 minutes, classifies and extracts funding opportunities using Azure OpenAI, and stores results in Azure Cosmos DB (NoSQL API, free tier).

---

## Email parser architecture

```
email_parsing/
├── function_app.py        # 5 Azure Functions (timer poll, POST /api/scan, GET /api/opportunities, GET /api/dead-letters, POST /api/dead-letters/{id}/retry)
├── core/
│   ├── config.py          # os.environ settings — never hardcode secrets
│   ├── schema.py          # Pydantic v2 models (FundingOpportunity, ParsedEmail, ClassificationResult)
│   ├── email_client.py    # Microsoft Graph API wrapper (auth, fetch, mark-read, move-to-folder)
│   ├── llm_parser.py      # Azure OpenAI classify + extract pipeline with GPT-4o-mini/GPT-4o fallback
│   └── storage.py         # Cosmos DB NoSQL — upsert, dedup, query, dead-letter
├── prompts/
│   ├── classify.txt       # Classification prompt — uses {{subject}} and {{body}} placeholders
│   └── extract.txt        # Extraction prompt — uses {{subject}}, {{body}}, {{email_id}}
├── sample/                # Real sample emails (.txt) for testing and prompt tuning
│   └── eml_to_txt.py      # Converts .eml files to .txt for use as test fixtures
└── infra/
    ├── main.bicep          # All Azure resources as IaC
    └── deploy.sh           # One-command deployment
```

---

## Key conventions

### Python (email_parsing/)
- **Python 3.11**, Azure Functions v2 decorator model
- **Pydantic v2** — use `model_dump(mode="json")` not `.dict()`
- All modules use `logging.getLogger(__name__)` — never call `logging.basicConfig()`
- External HTTP calls use **httpx** (not requests), with `_retry_request()` for exponential backoff
- Azure OpenAI client: `AzureOpenAI(azure_endpoint=..., api_key=..., api_version="2024-10-21")`
- Cosmos DB document `id` field = `emailId` (Graph message ID) for dedup via point-read
- Prompt files in `prompts/` are loaded once via `@lru_cache` — edit the `.txt` files to tune, not the Python
- HTML email bodies are converted to Markdown via **MarkItDown** (`_html_to_markdown()` in `email_client.py`) — preserves lists, headings, tables for better LLM parsing
- Confidence threshold for GPT-4o escalation is `CONFIDENCE_THRESHOLD` in `config.py` (env var, default `0.7`) — not hardcoded
- Error handling: catch and log individual email failures, store in dead-letters container, never let one bad email crash the batch

### TypeScript (src/)
- Path alias `@/` maps to `src/`
- shadcn/ui components live in `src/components/ui/` — use these before creating new ones
- The `FundingOpportunity` interface in `src/lib/mock-data.ts` is the contract between backend and frontend — do not change field names without updating the Pydantic schema too
- TanStack Query for all async data fetching

---

## Data schema — FundingOpportunity

The core shared type (TypeScript source of truth in `src/lib/mock-data.ts:5`):

```typescript
interface FundingOpportunity {
  id: string;
  funderName: string;
  programName: string;
  amount: number;
  amountMax?: number;
  type: 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
  deadline: string;           // ISO 8601 date string
  location: string;
  duration: 'single-year' | 'multi-year';
  durationMonths: number;
  relationship: 'new' | 'previously-applied' | 'existing-funder' | 're-eligible';
  status: 'identified' | 'researching' | 'applying' | 'submitted' | 'awarded' | 'rejected';
  score: number;
  tags: string[];
  description: string;
  eligibility: string;
  notes: string;
  website: string;
  contactName?: string;
  contactEmail?: string;
  source: string;
}
```

The Python `FundingOpportunity` Pydantic model in `core/schema.py` mirrors this exactly, with one addition: `extractionConfidence: float`.

---

## Environment variables

All config is read from environment variables in `core/config.py`. Never hardcode values. For local dev, copy `local.settings.json.example` to `local.settings.json` (gitignored).

| Variable | Purpose |
|---|---|
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | Azure AD app registration for Graph API |
| `GRAPH_USER_EMAIL` | Mailbox to poll |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY` | Azure OpenAI service |
| `AZURE_OPENAI_DEPLOYMENT` | Primary model deployment name (default: `gpt-4o-mini`) — matches Bicep `openAiModelPrimary` param |
| `AZURE_OPENAI_DEPLOYMENT_FULL` | Fallback model deployment name (default: `gpt-4o`) — matches Bicep `openAiModelFallback` param |
| `CONFIDENCE_THRESHOLD` | Float 0–1; below this the parser escalates to the fallback model (default: `0.7`) |
| `COSMOS_ENDPOINT`, `COSMOS_KEY` | Cosmos DB account |
| `COSMOS_DATABASE`, `COSMOS_CONTAINER` | Defaults: `email-parser`, `opportunities` |

In production, `GRAPH_CLIENT_SECRET`, `AZURE_OPENAI_KEY`, and `COSMOS_KEY` are stored in Azure Key Vault and referenced via Key Vault references in the Function App settings.

---

## Cost constraints

This runs on **Azure for Nonprofits ($2,000/year credits)**. Keep costs minimal:
- Use **GPT-4o-mini** by default; only escalate to GPT-4o when confidence < 0.7
- Cosmos DB is on the **free tier** (1,000 RU/s, 25GB) — one free account per subscription
- Azure Functions on **Consumption plan** (Y1) — pay per execution, not per hour
- Estimated total: ~$18/year

---

## Testing

- Unit tests go in `email_parsing/tests/` using **pytest**
- Sample emails for fixtures are in `email_parsing/sample/*.txt`
- Use `eml_to_txt.py` to convert new `.eml` files to text fixtures
- Mock all external services (Graph API, Azure OpenAI, Cosmos DB) in unit tests
- The `config.validate()` helper returns a list of missing env vars — useful in test setup

---

## Deployment

```bash
cd email_parsing/infra
./deploy.sh --resource-group charity-email-parser-rg --location uksouth
```

After deploying, set Key Vault secrets and the `GRAPH_CLIENT_ID` / `GRAPH_USER_EMAIL` app settings (the deploy script prints the exact commands).
