import "dotenv/config";
import { readFile } from "node:fs/promises";

const apiKey = process.env.DD_API_KEY;
const appKey = process.env.DD_APP_KEY;
const site = process.env.DD_SITE ?? "datadoghq.com";
const dashboardId = process.env.DD_DASHBOARD_ID?.trim();

if (!apiKey) {
  console.error("DD_API_KEY is required.");
  process.exit(1);
}

if (!appKey) {
  console.error("DD_APP_KEY is required.");
  process.exit(1);
}

const dashboardPath = new URL("./dashboard-credit-health.json", import.meta.url);
const dashboardPayload = JSON.parse(await readFile(dashboardPath, "utf8"));

const endpoint = dashboardId
  ? `https://api.${site}/api/v1/dashboard/${dashboardId}`
  : `https://api.${site}/api/v1/dashboard`;
const method = dashboardId ? "PUT" : "POST";

const response = await fetch(endpoint, {
  method,
  headers: {
    "Content-Type": "application/json",
    "DD-API-KEY": apiKey,
    "DD-APPLICATION-KEY": appKey
  },
  body: JSON.stringify(dashboardPayload)
});

if (!response.ok) {
  const text = await response.text();
  console.error(`Dashboard API request failed (${response.status}): ${text}`);
  process.exit(1);
}

const body = await response.json();
const resolvedDashboardId = dashboardId || body.id;
const dashboardUrl = `https://app.${site}/dashboard/${resolvedDashboardId}`;

console.log(
  `${dashboardId ? "Updated" : "Created"} dashboard: ${dashboardUrl}`
);

