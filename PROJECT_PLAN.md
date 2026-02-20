# Credit Health Coach - Build Plan

## Product Goal
Build a voice-and-text assistant that explains a user's credit health from mock personas and provides concrete steps to improve credit score behavior.

## Technical Requirements Coverage
- AWS: Amazon Bedrock, Transcribe/Polly-ready architecture, DynamoDB, S3, Lambda, API Gateway.
- Datadog: APM/log tracing, LLM observability fields, dashboard templates, monitor templates.

## Monorepo Structure
- `apps/web`: Next.js app for text/voice interaction.
- `apps/api`: Fastify API for orchestration and Bedrock calls.
- `packages/credit-engine`: Deterministic credit health analysis and recommendations.
- `packages/prompts`: Prompt builders and conversation policy.
- `packages/shared-types`: Shared request/response domain types.
- `data/mock-users`: Scenario personas used by API and tests.
- `infra/cdk`: AWS infrastructure scaffolding.
- `observability/datadog`: Dashboard/monitor templates and setup notes.

## Feature Placement
- Credit logic and score simulations: `packages/credit-engine`.
- Safety and educational response shape: `packages/prompts`.
- UI and interaction modes (text + voice): `apps/web`.
- Runtime orchestration for LLM and voice services: `apps/api`.
- Cloud deployment resources and IAM controls: `infra/cdk`.
- Reliability and LLM telemetry: `observability/datadog`.

## MVP Persona Scenarios
- One credit line, high utilization, prior late payments.
- Multiple lines, good score, healthy utilization.
- Thin credit file/new borrower.
- Rebuilding from derogatory marks.
- Good score but too many recent hard inquiries.
