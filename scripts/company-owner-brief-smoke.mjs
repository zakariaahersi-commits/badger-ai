import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (process.env.BADGER_CONFIRM_OWNER_BRIEF !== "send") {
  throw new Error("Set BADGER_CONFIRM_OWNER_BRIEF=send for the one-time owner delivery proof.");
}

const site = (process.env.BADGER_QA_BASE_URL ?? "https://badger.example.com").replace(/\/$/, "");
const secret = process.env.CRON_SECRET?.trim();
if (!site.startsWith("https://") || !secret) throw new Error("The production site and cron credential are required.");

const response = await fetch(`${site}/api/company/brief?force=1`, {
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(30_000),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Owner brief proof returned ${response.status}.`);
if (body?.result?.status === "duplicate") {
  process.stdout.write(`${JSON.stringify({ verified: true, duplicate: true, localDate: body.result.localDate }, null, 2)}\n`);
  process.exit(0);
}
if (body?.result?.delivery?.telegram !== "sent" || body?.result?.delivery?.email !== "sent") {
  throw new Error(`Owner brief delivery was incomplete: ${JSON.stringify(body?.result?.delivery ?? null)}`);
}
process.stdout.write(`${JSON.stringify({ verified: true, localDate: body.result.localDate, delivery: body.result.delivery, progress: body.result.progress, priority: body.result.priority }, null, 2)}\n`);
