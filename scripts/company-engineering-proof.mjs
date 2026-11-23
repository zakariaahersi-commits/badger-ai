import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const command = process.argv[2];
const actionId = process.argv[3];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("The engineering proof requires Supabase server credentials.");
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function prepare() {
  const existing = await service.from("company_actions")
    .select("id,status,title,created_at")
    .eq("action_type", "queue_engineering_work")
    .in("status", ["proposed", "approved", "executing", "delegated"])
    .order("created_at", { ascending: false })
    .limit(10);
  if (existing.error) throw existing.error;
  if (existing.data?.length) {
    process.stdout.write(`${JSON.stringify({ prepared: false, reason: "engineering_action_already_pending", actions: existing.data }, null, 2)}\n`);
    return;
  }

  const now = new Date().toISOString();
  const proofId = randomUUID();
  const run = await service.from("company_runs").insert({
    agent_id: "engineering",
    trigger_type: "manual",
    status: "waiting_approval",
    summary: "Controlled documentation-only proof for the GitHub-native DeepSeek connector.",
    input: { qa: true, purpose: "deepseek_github_connection_proof" },
    output: {},
    idempotency_key: `company:engineering:connection-proof:${proofId}`,
    started_at: now,
    completed_at: now,
  }).select("id").single();
  if (run.error || !run.data) throw run.error ?? new Error("Could not create the controlled engineering run.");

  const action = await service.from("company_actions").insert({
    run_id: run.data.id,
    agent_id: "engineering",
    action_type: "queue_engineering_work",
    risk: "code",
    status: "proposed",
    requires_approval: true,
    title: "Controlled proof: document the engineering connection",
    rationale: "Ask the bounded DeepSeek worker to make one documentation-only clarification and open a reviewable pull request. It must not merge, deploy, touch credentials, billing or customers.",
    payload: {
      title: "Clarify the controlled engineering proof in Company OS documentation",
      problem: "In docs/BADGER-COMPANY-OS.md, add one concise sentence stating that a documentation-only pull request is the required first proof after configuring a new engineering connector. Do not change application code or any other file.",
      evidence: [
        "The GitHub workflow claims one queued Company OS job with a dedicated worker secret and receives a scoped per-action callback token.",
        "The worker can change only existing allowlisted files and must pass the repository launch checks.",
      ],
      acceptanceCriteria: [
        "Only docs/BADGER-COMPANY-OS.md is changed.",
        "A reviewable pull request is opened; it is not merged or deployed.",
        "No credentials, billing, permissions or customer data are accessed or changed.",
      ],
    },
    idempotency_key: `company:engineering:connection-proof-action:${proofId}`,
    expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  }).select("id").single();
  if (action.error || !action.data) {
    await service.from("company_runs").delete().eq("id", run.data.id);
    throw action.error ?? new Error("Could not create the controlled engineering action.");
  }
  process.stdout.write(`${JSON.stringify({ prepared: true, runId: run.data.id, actionId: action.data.id, next: "Approve this exact documentation-only action in /ops/company." }, null, 2)}\n`);
}

async function status() {
  if (!UUID.test(actionId || "")) throw new Error("Usage: company-engineering-proof.mjs status <action id>");
  const action = await service.from("company_actions")
    .select("id,status,error_code,result,attempt_count,approved_at,executed_at,created_at")
    .eq("id", actionId)
    .eq("action_type", "queue_engineering_work")
    .single();
  if (action.error) throw action.error;
  const result = action.data.result && typeof action.data.result === "object" ? action.data.result : {};
  process.stdout.write(`${JSON.stringify({
    action: {
      ...action.data,
      result: {
        provider: result.provider ?? null,
        state: result.state ?? null,
        conversationUrl: result.conversationUrl ?? null,
        providerDiagnostic: result.providerDiagnostic ?? null,
      },
    },
  }, null, 2)}\n`);
}

async function expireStale() {
  const cutoff = "2026-08-18T17:06:45.000Z";
  const stale = await service.from("company_actions")
    .select("id,title,created_at")
    .eq("action_type", "queue_engineering_work")
    .eq("status", "proposed")
    .ilike("title", "%deepseek-v4-flash%")
    .lt("created_at", cutoff)
    .order("created_at");
  if (stale.error) throw stale.error;
  const expired = [];
  for (const action of stale.data ?? []) {
    const update = await service.from("company_actions")
      .update({ status: "expired", error_code: "resolved_before_approval" })
      .eq("id", action.id)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) continue;
    const audit = await service.from("company_audit_log").insert({
      actor_type: "system",
      actor_id: "engineering_proof",
      event_type: "action.expired",
      object_type: "company_action",
      object_id: action.id,
      details: { reason: "resolved_before_approval", resolvedBy: ["951f943", "45b1d99"] },
    });
    if (audit.error) throw audit.error;
    expired.push(action);
  }
  process.stdout.write(`${JSON.stringify({ expiredCount: expired.length, expired }, null, 2)}\n`);
}

async function expireResolvedAiRetryActions() {
  const resolved = await service.from("company_actions")
    .select("id,title,status,created_at")
    .eq("action_type", "queue_engineering_work")
    .in("status", ["proposed", "approved"])
    .in("title", [
      "Verify deepseek-v4-flash retry/fallback fix against today's 4 AI failures",
      "Verify deepseek-v4-flash retry/fallback fix against today's AI failures",
    ])
    .order("created_at");
  if (resolved.error) throw resolved.error;
  const expired = [];
  for (const action of resolved.data ?? []) {
    const update = await service.from("company_actions")
      .update({ status: "expired", error_code: "resolved_before_execution" })
      .eq("id", action.id)
      .in("status", ["proposed", "approved"])
      .select("id")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) continue;
    const audit = await service.from("company_audit_log").insert({
      actor_type: "system",
      actor_id: "engineering_proof",
      event_type: "action.expired",
      object_type: "company_action",
      object_id: action.id,
      details: {
        reason: "resolved_before_execution",
        evidence: "Production DeepSeek coaching/planner smoke and launch readiness passed on 2026-08-20.",
      },
    });
    if (audit.error) throw audit.error;
    expired.push(action);
  }
  process.stdout.write(`${JSON.stringify({ expiredCount: expired.length, expired }, null, 2)}\n`);
}

if (command === "prepare") await prepare();
else if (command === "status") await status();
else if (command === "expire-stale") await expireStale();
else if (command === "expire-resolved-ai-retry") await expireResolvedAiRetryActions();
else throw new Error("Usage: company-engineering-proof.mjs prepare | status <action id> | expire-stale | expire-resolved-ai-retry");
