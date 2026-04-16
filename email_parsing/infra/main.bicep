// ============================================================================
// charity-email-parser — Azure infrastructure
// ============================================================================
// Resources provisioned:
//   - Log Analytics Workspace
//   - Application Insights
//   - Storage Account  (Functions runtime)
//   - App Service Plan (Consumption / Y1)
//   - Function App     (Python 3.11, Linux)
//   - Key Vault        (secrets: GRAPH_CLIENT_SECRET, AZURE_OPENAI_KEY, COSMOS_KEY)
//   - Cosmos DB Account + database + containers
//   - Azure OpenAI Service + model deployments
// ============================================================================

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Short name used as a prefix for all resources.')
param projectName string = 'charity-email-parser'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Enable Cosmos DB free tier (only one per subscription).')
param cosmosFreeTier bool = true

@description('Azure OpenAI model name for the primary (cheaper) deployment.')
param openAiModelPrimary string = 'gpt-4o-mini'

@description('Model version for the primary deployment. Update here when upgrading.')
param openAiModelPrimaryVersion string = '2024-07-18'

@description('Azure OpenAI model name for the fallback (higher quality) deployment.')
param openAiModelFallback string = 'gpt-4o'

@description('Model version for the fallback deployment. Update here when upgrading.')
param openAiModelFallbackVersion string = '2024-11-20'

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

var uniqueSuffix = uniqueString(resourceGroup().id)
var storageAccountName = replace(toLower('${projectName}${uniqueSuffix}'), '-', '')
var storageAccountNameShort = length(storageAccountName) > 24
  ? substring(storageAccountName, 0, 24)
  : storageAccountName
var functionAppName = '${projectName}-func-${uniqueSuffix}'
var appServicePlanName = '${projectName}-plan-${uniqueSuffix}'
var appInsightsName = '${projectName}-ai-${uniqueSuffix}'
var logAnalyticsName = '${projectName}-law-${uniqueSuffix}'
var keyVaultName = '${projectName}-kv-${take(uniqueSuffix, 6)}'
var cosmosAccountName = '${projectName}-cosmos-${uniqueSuffix}'
var openAiName = '${projectName}-oai-${uniqueSuffix}'
var cosmosDatabaseName = 'email-parser'

// ---------------------------------------------------------------------------
// Log Analytics Workspace
// ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Application Insights
// ---------------------------------------------------------------------------

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    RetentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Storage Account (Functions runtime)
// ---------------------------------------------------------------------------

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountNameShort
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// ---------------------------------------------------------------------------
// App Service Plan — Consumption (Y1)
// ---------------------------------------------------------------------------

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true  // required for Linux
  }
}

// ---------------------------------------------------------------------------
// Key Vault
// ---------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enabledForTemplateDeployment: false
  }
}

// Placeholder secrets — values must be set post-deployment or via CI pipeline
resource secretGraphClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'GRAPH-CLIENT-SECRET'
  properties: {
    value: 'PLACEHOLDER — update after deployment'
  }
}

resource secretOpenAiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-OPENAI-KEY'
  properties: {
    value: 'PLACEHOLDER — update after deployment'
  }
}

resource secretCosmosKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-KEY'
  properties: {
    value: 'PLACEHOLDER — update after deployment'
  }
}

// ---------------------------------------------------------------------------
// Cosmos DB Account
// ---------------------------------------------------------------------------

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: cosmosFreeTier
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: []
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosContainerOpportunities 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'opportunities'
  properties: {
    resource: {
      id: 'opportunities'
      partitionKey: {
        paths: ['/emailId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/"_etag"/?' }
        ]
      }
      defaultTtl: -1
    }
  }
}

resource cosmosContainerDeadLetters 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'dead-letters'
  properties: {
    resource: {
      id: 'dead-letters'
      partitionKey: {
        paths: ['/emailId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/"_etag"/?' }
        ]
      }
      defaultTtl: 2592000  // 30 days
    }
  }
}

// ---------------------------------------------------------------------------
// Azure OpenAI Service
// ---------------------------------------------------------------------------

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource deploymentPrimary 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiModelPrimary
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelPrimary
      version: openAiModelPrimaryVersion
    }
    // Auto-update to next supported version when this one is retired.
    // Does NOT switch model families — update openAiModelPrimary param for that.
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

resource deploymentFallback 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiModelFallback
  dependsOn: [deploymentPrimary]  // deployments must be sequential
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelFallback
      version: openAiModelFallbackVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// ---------------------------------------------------------------------------
// Function App
// ---------------------------------------------------------------------------

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    reserved: true  // Linux
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      pythonVersion: '3.11'
      http20Enabled: true
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
          // Add your frontend origin here, e.g.:
          // 'https://charity-aid-pro.azurewebsites.net'
        ]
        supportCredentials: false
      }
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        // ── Microsoft Graph ──────────────────────────────────────────────
        {
          name: 'GRAPH_TENANT_ID'
          value: subscription().tenantId
        }
        {
          name: 'GRAPH_CLIENT_ID'
          value: ''  // set post-deployment
        }
        {
          name: 'GRAPH_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=GRAPH-CLIENT-SECRET)'
        }
        {
          name: 'GRAPH_USER_EMAIL'
          value: ''  // set post-deployment
        }
        // ── Azure OpenAI ─────────────────────────────────────────────────
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openAi.properties.endpoint
        }
        {
          name: 'AZURE_OPENAI_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=AZURE-OPENAI-KEY)'
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: openAiModelPrimary
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT_FULL'
          value: openAiModelFallback
        }
        // ── Cosmos DB ────────────────────────────────────────────────────
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=COSMOS-KEY)'
        }
        {
          name: 'COSMOS_DATABASE'
          value: cosmosDatabaseName
        }
        {
          name: 'COSMOS_CONTAINER'
          value: 'opportunities'
        }
      ]
    }
  }
}

// Grant the Function App's managed identity read access to Key Vault secrets
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output openAiEndpoint string = openAi.properties.endpoint
output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
