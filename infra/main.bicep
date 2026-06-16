// main.bicep — subscription-scoped IaC for the tea analyzer.
// Creates the resource group `rg-tea` and the Static Web App inside it.
//
// Deploy:
//   az deployment sub create \
//     --location southcentralus \
//     --template-file infra/main.bicep \
//     --parameters infra/main.parameters.json
//
// IMPORTANT: Static Web Apps is only offered in a limited set of regions
// (Central US, East US 2, West US 2, West Europe, East Asia). South Central US
// is NOT a supported SWA region, so the resource group lives in South Central US
// while the Static Web App resource is created in Central US (the closest
// supported region). Static content is served from a global CDN either way.

targetScope = 'subscription'

@description('Resource group name.')
param resourceGroupName string = 'rg-tea'

@description('Resource group location (metadata only; South Central US is fine here).')
param resourceGroupLocation string = 'southcentralus'

@description('Static Web App resource name.')
param staticWebAppName string = 'swa-tea'

@description('Static Web App region (supported SWA region; NOT South Central US).')
@allowed([
  'centralus'
  'eastus2'
  'westus2'
  'westeurope'
  'eastasia'
])
param staticWebAppLocation string = 'centralus'

@description('Hosting plan SKU.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: resourceGroupLocation
}

module swa 'modules/staticwebapp.bicep' = {
  scope: rg
  name: 'staticwebapp'
  params: {
    name: staticWebAppName
    location: staticWebAppLocation
    sku: sku
  }
}

@description('Default hostname of the deployed site.')
output defaultHostname string = swa.outputs.defaultHostname

@description('Static Web App resource name.')
output staticWebAppName string = swa.outputs.name

@description('Resource group the app was deployed into.')
output resourceGroupName string = rg.name
