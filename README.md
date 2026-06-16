# tea — Texas Electricity Analyzer

A privacy-first web app that turns your **Smart Meter Texas 15-minute interval data** into an
interactive dashboard and a **retail-plan comparison calculator** (free nights/weekends, TDU
delivery charges, bill credits, load-shifting).

Everything runs **entirely in your browser** — your usage data is parsed and analyzed locally and
**never uploaded to any server**.

## Features

- **Upload-driven**: drop in your interval CSV (or *Try with sample data*) and the dashboard builds itself.
- **Usage analysis**: KPIs (annual use, peak demand, load factor), monthly & seasonal patterns,
  year-over-year trends, hourly load profile, a month×hour heatmap, a daily-usage heatmap, and
  day-of-week breakdown.
- **Plan comparison**: model flat, free-nights, free-weekends, and bill-credit plans with TDU
  delivery charges. Free-night/weekend windows are applied **per plan** and costed against your
  **actual** 15-minute data; a load-shift slider estimates savings from moving usage into free hours.
- **Remembered on device**: your parsed data is cached in `localStorage`; an **Upload new data / Reset**
  button clears it and starts over.

## Project structure

```
index.html                       # markup, upload modal, dashboard shell
css/styles.css                   # all styles
js/
  parse.js                       # CSV -> aggregated IV object (in-browser)
  util.js                        # shared constants, formatters, derived basis
  dashboard.js                   # KPIs, charts, heatmaps, calendar, insights
  calculator.js                  # hourly profile + plan comparison calculator
  app.js                         # entry point: modal, upload, persistence, wiring
assets/sample/IntervalData2.csv  # bundled sample for "Try with sample data"
staticwebapp.config.json         # Azure Static Web Apps routing/headers
.github/workflows/               # CI/CD to Azure Static Web Apps
infra/main.bicep                 # optional IaC for the Static Web App
```

There is **no build step** and no runtime dependencies beyond Chart.js (loaded from CDN).
The app uses native ES modules.

## Local development

ES modules and the sample-CSV `fetch` require the files to be served over HTTP (not opened via
`file://`). Use any static server, for example:

```bash
# Python (built in)
python3 -m http.server 8080
# then open http://localhost:8080

# or the Azure Static Web Apps CLI (emulates SWA routing)
npm install -g @azure/static-web-apps-cli
swa start .
```

## Deploy to Azure Static Web Apps

This repo deploys via **GitHub Actions** using **passwordless OIDC** auth — no Azure credentials are
stored in the repo. Two workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/infra.yml` | changes under `infra/**`, or manual | Logs in via OIDC and runs the Bicep (`az deployment sub create`) to provision `rg-tea` + the Static Web App. |
| `.github/workflows/azure-static-web-apps.yml` | app/content changes on `main`, and PRs | Uploads the static site to the Static Web App using its deployment token. |

### Infrastructure (Bicep)

`infra/main.bicep` is **subscription-scoped**: it creates the resource group **`rg-tea`** (in
**South Central US**) and the Static Web App **`swa-tea`**.

> **Region note:** Azure Static Web Apps is only offered in a limited set of regions (Central US,
> East US 2, West US 2, West Europe, East Asia). **South Central US is not supported for the SWA
> resource**, so the resource group lives in South Central US while the app resource is created in
> **Central US** (the closest supported region). Static content is served from a global CDN either way.

Deploy locally (optional — CI does this for you):

```bash
az deployment sub create \
  --location southcentralus \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

### Custom domain

The site is served at **https://tea.dotheneedful.dev** via a Cloudflare **CNAME** (DNS-only / not
proxied) pointing at the Static Web App default hostname. The binding is declared in Bicep
(`customDomain` parameter) and validated automatically through CNAME delegation — no TXT record is
required for a subdomain whose CNAME already resolves to the app. Azure provisions the TLS
certificate automatically.

### Required repo secrets

| Secret | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | OIDC app (service principal) client id for `infra.yml`. |
| `AZURE_TENANT_ID` | Azure tenant id. |
| `AZURE_SUBSCRIPTION_ID` | Target subscription id. |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Static Web App deployment token for content deploys. |

The OIDC service principal is configured with federated credentials for the `main` branch and pull
requests, and granted **Contributor** on the subscription. After provisioning, the SWA deployment
token is read with `az staticwebapp secrets list --name swa-tea --resource-group rg-tea`.

## Data format

A Smart Meter Texas **15-minute interval** CSV with at least these columns:
`USAGE_DATE` (mm/dd/yyyy), `USAGE_START_TIME` (HH:MM), `USAGE_KWH`. For best results provide
**13+ months** (the calculator uses your most recent 12 complete months; 24+ months enables
year-over-year). The importer currently assumes a clean single-meter export.

> Costs are estimates for comparison only.
