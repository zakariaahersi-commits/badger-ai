import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const site = (process.env.BADGER_QA_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://badger.example.com").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!site.startsWith("https://") || !secret) throw new Error("The Company OS action smoke test requires the production site and cron credential.");

const response = await fetch(`${site}/api/company/actions/run`, {
  method: "GET",
  headers: { authorization: `Bearer ${secret}` },
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Company OS action scheduler returned ${response.status}.`);
const results = Array.isArray(body.results) ? body.results.map((result) => ({
  id: result.id,
  status: result.status,
  message: result.message,
})) : [];
const polls = Array.isArray(body.polls) ? body.polls.map((result) => ({
  id: result.id,
  status: result.status,
  message: result.message,
})) : [];

process.stdout.write(`${JSON.stringify({ passed: true, configured: body.configured === true, processed: body.processed ?? 0, polled: body.polled ?? 0, results, polls }, null, 2)}\n`);
