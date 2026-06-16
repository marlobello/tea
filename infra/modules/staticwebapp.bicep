// staticwebapp.bicep — the Static Web App resource (resource-group scoped module).
@description('Static Web App resource name.')
param name string

@description('Region for the Static Web App. Must be a supported SWA region. NOTE: South Central US is NOT supported.')
@allowed([
  'centralus'
  'eastus2'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string = 'centralus'

@description('Hosting plan SKU.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('Optional custom domain to bind (e.g. tea.dotheneedful.dev). Leave empty to skip. The domain must already have a CNAME pointing to the Static Web App default hostname (DNS-only, not proxied) for validation to succeed.')
param customDomain string = ''

resource site 'Microsoft.Web/staticSites@2024-04-01' = {
  name: name
  location: location
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Content is deployed from GitHub Actions using a deployment token.
    // Do not let Azure generate its own workflow or bind a repo here.
    buildProperties: {
      appLocation: '/'
      apiLocation: ''
      outputLocation: ''
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// Custom domain — validated via the existing CNAME delegation (no TXT token needed
// for a subdomain whose CNAME already resolves to the default hostname).
resource domain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomain)) {
  parent: site
  name: customDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output name string = site.name
output defaultHostname string = site.properties.defaultHostname
output customDomain string = customDomain
