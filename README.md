https://imgur.com/a/Ozp6qG0

luma.com/n84hk0l9

# Credit Coach (AWS + Bedrock + Datadog)

Monorepo MVP for a credit-health coaching app with:
- A Next.js dashboard for mock personas and AI chat
- A Fastify API that combines deterministic credit analysis with Amazon Bedrock responses
- Datadog tracing/log hooks and dashboard automation scripts
- AWS CDK infrastructure scaffolding

## Current Repository Flow

1. Select a mock credit profile in the web app.
2. Send a chat question.
3. API computes a deterministic credit report and asks Bedrock for a short coach response.
4. Datadog telemetry is emitted when enabled.

## Tech Stack

- Node.js + npm workspaces
- `apps/web`: Next.js 15 + React 19 + Recharts
- `apps/api`: Fastify + AWS SDK (Bedrock) + `dd-trace`
- `packages/credit-engine`: deterministic credit scoring/action engine
- `packages/prompts`: system/user prompt builders
- `packages/shared-types`: shared domain and API types
- `infra/cdk`: AWS CDK v2 scaffold
- `observability/datadog`: dashboard JSON + traffic/dashboard scripts

## Repository Layout

```text
apps/
  api/
  web/
data/
  mock-users/users.json
infra/
  cdk/
observability/
  datadog/
packages/
  credit-engine/
  prompts/
  shared-types/
tests/
  scenarios.md
```

## Prerequisites

- Node.js 20+
- npm 10+
- AWS credentials with Bedrock model access
- Optional: Datadog API/App keys for log forwarding and dashboard automation

## Setup

```bash
npm install
```

Create `.env` at the repository root and set the variables you need.

Minimal local `.env`:

```bash
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

Useful optional `.env` values:

```bash
# API
PORT=4000
LOG_LEVEL=info
DISABLE_BEDROCK=false

# Datadog tracing/logs
DD_TRACE_ENABLED=true
DD_LOGS_ENABLED=true
DD_SERVICE=credit-coach-api
DD_ENV=dev
DD_VERSION=0.1.0
DD_SITE=datadoghq.com
DD_API_KEY=
DD_APP_KEY=
DD_DASHBOARD_ID=

# Web/API routing
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
API_BASE_URL=http://localhost:4000

# Traffic script tuning
TRAFFIC_REQUESTS=30
TRAFFIC_DELAY_MS=150
```

## Run Locally

Terminal 1 (API):

```bash
npm run dev:api
```

Terminal 2 (Web):

```bash
npm run dev:web
```

Defaults:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## API Endpoints

- `GET /health`
  - Returns service status, region/model, and Datadog flags.
- `GET /profiles`
  - Returns profiles from `data/mock-users/users.json`.
- `POST /chat`
  - Input: `{ profileId, message, responseMode?, conversationId? }`
  - Output: advisor text, credit report, optional voice payload, metadata.

## Observability (Datadog)

Generate demo traffic (API must be running):

```bash
npm run dd:traffic
```

Create or update dashboard from `observability/datadog/dashboard-credit-health.json`:

```bash
npm run dd:dashboard:create
```

## Tests and Typechecking

Run tests:

```bash
npm test
```

Run workspace typechecks:

```bash
npm run typecheck
```

Current status in this repository:
- `npm test`: passing (`packages/credit-engine` vitest tests)
- `npm run typecheck`: currently failing in `packages/credit-engine/test/index.test.ts` (ESM import extension + implicit `any`)

## Infrastructure (CDK)

```bash
npm run -w infra/cdk cdk:synth
npm run -w infra/cdk cdk:deploy
```

The CDK stack provisions DynamoDB, S3, API Gateway, alarms, and a Lambda placeholder handler. Deploying `apps/api` as the Lambda package is not fully wired yet.

## License

MIT (`LICENSE`).
