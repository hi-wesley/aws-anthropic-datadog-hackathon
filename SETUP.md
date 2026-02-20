# Local Setup

## Prerequisites
- Node.js 20+
- npm 10+
- AWS credentials with Bedrock + Polly access
- Optional Datadog API key for telemetry

## Install
```bash
npm install
```

## Environment
```bash
cp .env.example .env
```

Set at minimum:
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `ENABLE_POLLY=true` for voice output

## Run API
```bash
npm run dev:api
```
API defaults to `http://localhost:4000`.

## Run Web App
In a second terminal:
```bash
npm run dev:web
```
Web defaults to `http://localhost:3000` and calls API at `http://localhost:4000` unless `NEXT_PUBLIC_API_BASE_URL` is set.

## Test Credit Engine
```bash
npm test
```

## Typecheck All Workspaces
```bash
npm run typecheck
```

## CDK (Infra)
```bash
npm run -w infra/cdk cdk:synth
npm run -w infra/cdk cdk:deploy
```
