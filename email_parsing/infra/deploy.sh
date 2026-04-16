#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Provision infrastructure and publish the Function App
#
# Usage:
#   ./deploy.sh [--resource-group <name>] [--location <region>]
#
# Prerequisites:
#   - Azure CLI (az) authenticated:  az login
#   - Azure Functions Core Tools:    func --version
#   - jq installed for JSON parsing: jq --version
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults (can be overridden via CLI flags)
# ---------------------------------------------------------------------------
RESOURCE_GROUP="charity-email-parser-rg"
LOCATION="uksouth"
TEMPLATE_FILE="$(dirname "$0")/main.bicep"
PARAMETERS_FILE="$(dirname "$0")/parameters.json"

# ---------------------------------------------------------------------------
# Parse optional CLI arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)
      RESOURCE_GROUP="$2"; shift 2 ;;
    --location|-l)
      LOCATION="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--resource-group <name>] [--location <region>]"
      exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
err()  { echo "[ERROR] $*" >&2; }
die()  { err "$*"; exit 1; }

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
require_tool az
require_tool func
require_tool jq

log "Checking Azure CLI authentication..."
az account show --output none 2>/dev/null || die "Not logged in to Azure CLI. Run: az login"

SUBSCRIPTION_ID=$(az account show --query id --output tsv)
log "Using subscription: $SUBSCRIPTION_ID"

# ---------------------------------------------------------------------------
# Step 1: Create resource group
# ---------------------------------------------------------------------------
log "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
log "Resource group ready."

# ---------------------------------------------------------------------------
# Step 2: Deploy Bicep template
# ---------------------------------------------------------------------------
DEPLOYMENT_NAME="charity-email-parser-$(date -u '+%Y%m%dT%H%M%S')"

log "Starting Bicep deployment '$DEPLOYMENT_NAME'..."
DEPLOYMENT_OUTPUT=$(
  az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "@$PARAMETERS_FILE" \
    --query properties.outputs \
    --output json
)

if [[ -z "$DEPLOYMENT_OUTPUT" ]]; then
  die "Deployment produced no output — check the Azure portal for errors."
fi

log "Deployment succeeded."

# ---------------------------------------------------------------------------
# Step 3: Extract outputs
# ---------------------------------------------------------------------------
FUNCTION_APP_NAME=$(echo "$DEPLOYMENT_OUTPUT"  | jq -r '.functionAppName.value')
COSMOS_ENDPOINT=$(echo "$DEPLOYMENT_OUTPUT"    | jq -r '.cosmosEndpoint.value')
OPENAI_ENDPOINT=$(echo "$DEPLOYMENT_OUTPUT"    | jq -r '.openAiEndpoint.value')
KEY_VAULT_NAME=$(echo "$DEPLOYMENT_OUTPUT"     | jq -r '.keyVaultName.value')
FUNCTION_HOSTNAME=$(echo "$DEPLOYMENT_OUTPUT"  | jq -r '.functionAppHostname.value')

log "Function App name  : $FUNCTION_APP_NAME"
log "Function App URL   : https://$FUNCTION_HOSTNAME"
log "Cosmos DB endpoint : $COSMOS_ENDPOINT"
log "Azure OpenAI URL   : $OPENAI_ENDPOINT"
log "Key Vault name     : $KEY_VAULT_NAME"

# ---------------------------------------------------------------------------
# Step 4: Publish Function App code
# ---------------------------------------------------------------------------
# Resolve the project root (one level above infra/)
FUNC_PROJECT_ROOT="$(dirname "$(dirname "$0")")"

log "Publishing Function App '$FUNCTION_APP_NAME' from $FUNC_PROJECT_ROOT ..."
(
  cd "$FUNC_PROJECT_ROOT"
  func azure functionapp publish "$FUNCTION_APP_NAME" \
    --python \
    --build remote
)
log "Function App published."

# ---------------------------------------------------------------------------
# Step 5: Deployment summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Deployment complete"
echo "============================================================"
echo "  Resource Group   : $RESOURCE_GROUP"
echo "  Function App     : $FUNCTION_APP_NAME"
echo "  Endpoint (scan)  : https://$FUNCTION_HOSTNAME/api/scan"
echo "  Endpoint (opps)  : https://$FUNCTION_HOSTNAME/api/opportunities"
echo "  Cosmos DB        : $COSMOS_ENDPOINT"
echo "  Azure OpenAI     : $OPENAI_ENDPOINT"
echo "  Key Vault        : $KEY_VAULT_NAME"
echo ""
echo "  IMPORTANT — post-deployment steps:"
echo "  1. Update Key Vault secrets via the Azure portal or:"
echo "       az keyvault secret set --vault-name $KEY_VAULT_NAME \\"
echo "         --name GRAPH-CLIENT-SECRET --value '<your-secret>'"
echo "       az keyvault secret set --vault-name $KEY_VAULT_NAME \\"
echo "         --name AZURE-OPENAI-KEY --value '<your-key>'"
echo "       az keyvault secret set --vault-name $KEY_VAULT_NAME \\"
echo "         --name COSMOS-KEY --value '<your-key>'"
echo "  2. Set GRAPH_CLIENT_ID and GRAPH_USER_EMAIL app settings:"
echo "       az functionapp config appsettings set \\"
echo "         --name $FUNCTION_APP_NAME \\"
echo "         --resource-group $RESOURCE_GROUP \\"
echo "         --settings GRAPH_CLIENT_ID='<id>' GRAPH_USER_EMAIL='<email>'"
echo "============================================================"
