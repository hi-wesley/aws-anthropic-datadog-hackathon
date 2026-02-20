# Manual Test Scenarios

1. Select each mock profile and ask "What should this user do in the next 30 days?"
2. Verify report section populates with strengths, risks, and action list.
3. Toggle voice mode, send message, confirm audio playback.
4. Disable Bedrock (`DISABLE_BEDROCK=true`) and ensure fallback reply still returns.
5. Trigger invalid body payload to confirm API validation error behavior.
6. Review Datadog logs for request completion and Bedrock/Polly warnings.
