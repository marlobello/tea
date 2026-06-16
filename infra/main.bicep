// main.bicep — provisions an Azure Static Web App for the tea analyzer.
// Deploy: az deployment group create -g <rg> -f infra/main.bicep \
//           -p repositoryUrl=https://github.com/marlobello/tea repositoryBranch=main
//
// Note: linking the GitHub repo via Bicep requires a repositoryToken (a GitHub PAT).
// Alternatively omit repositoryToken and connect the repo afterwards in the portal,
// or use `az staticwebapp create` which wires up GitHub Actions automatically.

@description('Name of the Static Web App resource.')
param name string = 'tea-analyzer'

@description('Azure region for the Static Web App (Free tier regions: e.g. eastus2, centralus, westus2, westeurope, eastasia).')
param location string = 'eastus2'

@description('Hosting plan SKU.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('GitHub repository URL to link (optional).')
param repositoryUrl string = ''

@description('Repository branch to deploy from.')
param repositoryBranch string = 'main'

@description('GitHub PAT with repo scope (optional; leave empty to link the repo later).')
@secure()
param repositoryToken string = ''

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // App is a pure static site at the repo root with no build step.
    buildProperties: {
      appLocation: '/'
      apiLocation: ''
      outputLocation: ''
      skipGithubActionWorkflowGeneration: true
    }
    repositoryUrl: empty(repositoryUrl) ? null : repositoryUrl
    branch: empty(repositoryUrl) ? null : repositoryBranch
    repositoryToken: empty(repositoryToken) ? null : repositoryToken
  }
}

@description('The default hostname of the deployed site.')
output defaultHostname string = staticSite.properties.defaultHostname

@description('The Static Web App resource name.')
output staticSiteName string = staticSite.name
