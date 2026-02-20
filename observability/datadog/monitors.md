# Datadog Monitor Suggestions

## API Reliability
- `p95 latency > 3s for 10m` on `trace.fastify.request.duration{service:credit-coach-api}`
- `error rate > 2% for 10m` on `trace.fastify.request.errors{service:credit-coach-api}`

## LLM Quality / Availability
- `fallback ratio > 20%` on custom metric `credit_coach.llm.fallback`
- `bedrock request failures spike` from logs query `@message:bedrock_converse_failed`

## Voice Pipeline
- `polly failures > 5 in 10m` from logs query `@message:polly_synthesis_failed`

## Minimum Tags
- `service:credit-coach-api`
- `env:dev|staging|prod`
- `model:<bedrock-model-id>`
- `profile_id:<mock-profile-id>`
