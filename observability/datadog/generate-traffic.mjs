import "dotenv/config";
import { randomUUID } from "node:crypto";

const apiBase =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";
const requestCount = Number(process.env.TRAFFIC_REQUESTS ?? "30");
const delayMs = Number(process.env.TRAFFIC_DELAY_MS ?? "150");

const userMessages = [
  "What changes would most improve this profile?",
  "Which action should I do first this month?",
  "Can you give me a 30 day plan?",
  "How much should I lower utilization?",
  "What should I avoid doing right now?"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
}

const health = await fetchJson(`${apiBase}/health`);
console.log(
  `Connected to API ${apiBase}. trace=${health.datadogTraceEnabled} logs=${health.datadogLogsEnabled}`
);
if (!health.datadogLogsEnabled) {
  console.warn(
    "Warning: datadogLogsEnabled=false on API. Dashboard log widgets will stay blank until logs are enabled and API is restarted. If you run via npm workspaces, ensure API loads the repo-root .env."
  );
}
if (!health.datadogTraceEnabled) {
  console.warn(
    "Warning: datadogTraceEnabled=false on API. APM widgets will stay blank until tracing is enabled and API is restarted."
  );
}

const profiles = await fetchJson(`${apiBase}/profiles`);
if (!Array.isArray(profiles) || profiles.length === 0) {
  throw new Error("No profiles found from /profiles.");
}

let successCount = 0;
for (let i = 0; i < requestCount; i += 1) {
  const profile = profiles[i % profiles.length];
  const message = userMessages[i % userMessages.length];
  const conversationId = randomUUID();

  try {
    const result = await fetchJson(`${apiBase}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        profileId: profile.id,
        message,
        responseMode: "text",
        conversationId
      })
    });

    successCount += 1;
    console.log(
      `[${successCount}/${requestCount}] profile=${profile.id} usedBedrock=${result.meta.usedBedrock} band=${result.report.band}`
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error(`[${i + 1}/${requestCount}] traffic request failed: ${messageText}`);
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

console.log(`Traffic run complete. Successful requests: ${successCount}/${requestCount}`);
