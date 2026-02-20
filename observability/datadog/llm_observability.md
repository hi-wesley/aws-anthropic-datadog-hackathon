# LLM Observability Instrumentation Notes

For each `/chat` request, emit:
- model name
- request latency
- fallback used (boolean)
- prompt/response token counts (when available)
- profile id and health band

In Datadog, map these to:
- APM span tags on request spans
- logs for warnings/errors
- custom counters for fallback and voice failures

Recommended log events already present in API starter:
- `chat_request_completed`
- `bedrock_converse_failed`
- `polly_synthesis_failed`
