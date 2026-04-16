"""
Configuration module — reads all settings from environment variables.
"""

import os


# ── Microsoft Graph ────────────────────────────────────────────────────────────

GRAPH_TENANT_ID: str = os.environ.get("GRAPH_TENANT_ID", "")
GRAPH_CLIENT_ID: str = os.environ.get("GRAPH_CLIENT_ID", "")
GRAPH_CLIENT_SECRET: str = os.environ.get("GRAPH_CLIENT_SECRET", "")
GRAPH_USER_EMAIL: str = os.environ.get("GRAPH_USER_EMAIL", "")

# ── Azure OpenAI ───────────────────────────────────────────────────────────────

AZURE_OPENAI_ENDPOINT: str = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_KEY: str = os.environ.get("AZURE_OPENAI_KEY", "")
# Deployment name for GPT-4o-mini (primary, cheaper)
AZURE_OPENAI_DEPLOYMENT: str = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
# Deployment name for GPT-4o (fallback when confidence is low)
AZURE_OPENAI_DEPLOYMENT_FULL: str = os.environ.get("AZURE_OPENAI_DEPLOYMENT_FULL", "gpt-4o")
# Confidence threshold below which the parser escalates to the full model (0.0–1.0)
CONFIDENCE_THRESHOLD: float = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.7"))

# ── Cosmos DB ──────────────────────────────────────────────────────────────────

COSMOS_ENDPOINT: str = os.environ.get("COSMOS_ENDPOINT", "")
COSMOS_KEY: str = os.environ.get("COSMOS_KEY", "")
COSMOS_DATABASE: str = os.environ.get("COSMOS_DATABASE", "email-parser")
COSMOS_CONTAINER: str = os.environ.get("COSMOS_CONTAINER", "opportunities")


def validate() -> list[str]:
    """Return a list of missing required environment variable names."""
    required = {
        "GRAPH_TENANT_ID": GRAPH_TENANT_ID,
        "GRAPH_CLIENT_ID": GRAPH_CLIENT_ID,
        "GRAPH_CLIENT_SECRET": GRAPH_CLIENT_SECRET,
        "GRAPH_USER_EMAIL": GRAPH_USER_EMAIL,
        "AZURE_OPENAI_ENDPOINT": AZURE_OPENAI_ENDPOINT,
        "AZURE_OPENAI_KEY": AZURE_OPENAI_KEY,
        "COSMOS_ENDPOINT": COSMOS_ENDPOINT,
        "COSMOS_KEY": COSMOS_KEY,
    }
    return [name for name, value in required.items() if not value]
