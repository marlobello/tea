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

### Option A — `az` CLI (auto-wires GitHub Actions)

```bash
az staticwebapp create \
  --name tea-analyzer \
  --resource-group <your-rg> \
  --source https://github.com/marlobello/tea \
  --branch main \
  --app-location "/" \
  --output-location "" \
  --login-with-github
```

This provisions the resource, adds the deployment token as the `AZURE_STATIC_WEB_APPS_API_TOKEN`
repo secret, and triggers the workflow in `.github/workflows/`.

### Option B — Bicep (IaC)

```bash
az group create -n <your-rg> -l eastus2
az deployment group create -g <your-rg> -f infra/main.bicep -p name=tea-analyzer
```

Then add the deployment token as a repo secret named `AZURE_STATIC_WEB_APPS_API_TOKEN`
(`az staticwebapp secrets list`) so the GitHub Actions workflow can deploy.

## Data format

A Smart Meter Texas **15-minute interval** CSV with at least these columns:
`USAGE_DATE` (mm/dd/yyyy), `USAGE_START_TIME` (HH:MM), `USAGE_KWH`. For best results provide
**13+ months** (the calculator uses your most recent 12 complete months; 24+ months enables
year-over-year). The importer currently assumes a clean single-meter export.

> Costs are estimates for comparison only.
