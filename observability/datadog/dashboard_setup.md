# Datadog Dashboard Setup (Implemented)

## 1) Enable tracing and logs
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. In `.env`, confirm:
   - `DD_TRACE_ENABLED=true`
   - `DD_SERVICE=credit-coach-api`
   - `DD_ENV=dev`
   - `DD_LOGS_ENABLED=true`
   - `DD_API_KEY=<your_datadog_api_key>`
   - `DD_APP_KEY=<your_datadog_app_key>`
   - `DD_SITE=datadoghq.com` (or your Datadog site)

## 2) Run API and generate traffic
1. Start API:
   ```bash
   npm run dev:api
   ```
2. In another terminal, generate data:
   ```bash
   npm run dd:traffic
   ```

This seeds:
- APM traces (`service:credit-coach-api`)
- Log events (`chat_request_completed`, `bedrock_converse_failed`, `polly_synthesis_failed`)

## 3) Create dashboard from repo template
```bash
npm run dd:dashboard:create
```

The script prints the dashboard URL.

## 4) Included widgets (required)
The dashboard template contains:
1. API p95 latency/error (APM service `credit-coach-api`)
2. Chat volume from logs (`chat_request_completed`)
3. Bedrock usage split (`usedBedrock`, `@datadog.model`)
4. Health band/profile breakdown (`@healthBand`, `@profileId`)

## 5) Template variables for judges
The dashboard includes:
- `env` template variable
- `service` template variable

Use these to filter quickly during demos/judging.

