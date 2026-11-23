import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const site = (process.env.BADGER_QA_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://badger.example.com").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!site.startsWith("https://") || !secret) throw new Error("The Company OS scheduler smoke test requires the production site and cron credential.");

const response = await fetch(`${site}/api/company/run`, {
  method: "GET",
  headers: { authorization: `Bearer ${secret}` },
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Company OS scheduler returned ${response.status}.`);
const results = Array.isArray(body.results) ? body.results.map((result) => ({
  status: result.status,
  reason: result.reason ?? null,
  agentId: result.agentId,
  runId: result.runId ?? null,
  completedActions: result.completedActions ?? null,
  executionQueued: result.executionQueued ?? null,
})) : [];

process.stdout.write(`${JSON.stringify({ passed: true, configured: body.configured === true, processed: body.processed ?? 0, results }, null, 2)}\n`);
