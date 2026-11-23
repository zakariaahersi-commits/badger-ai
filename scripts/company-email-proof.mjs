import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const command = process.argv[2];
const firstArg = process.argv[3];
const secondArg = process.argv[4];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("The email proof requires Supabase server credentials.");
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "")) throw new Error(`Invalid ${label}.`);
  return value;
}

async function prepare(recipient) {
  const email = recipient?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@agentmail\.to$/.test(email)) throw new Error("The controlled proof only accepts an owner-managed @agentmail.to inbox.");
  const existing = await service.from("profiles").select("user_id").eq("email", email).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("That AgentMail inbox is already attached to a Badger account; use a fresh test inbox or clean up the prior proof first.");

  const created = await service.auth.admin.createUser({
    email,
    password: `Qa-${randomUUID()}-9!`,
    email_confirm: true,
    app_metadata: { badger_qa: true, purpose: "company_email_proof" },
    user_metadata: { name: "Badger QA" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Could not create the synthetic email-proof account.");
  const userId = created.data.user.id;
  try {
    const now = new Date().toISOString();
    const setup = await Promise.all([
      service.from("profiles").insert({ user_id: userId, email, name: "Badger QA", notify: true }),
      service.from("entitlements").insert({ user_id: userId, product: "badger-28-day", status: "active", granted_at: now, updated_at: now }),
      service.from("email_preferences").insert({ user_id: userId, journey_nudges_enabled: true, unsubscribed_at: null, updated_at: now }),
    ]);
    const setupError = setup.find((result) => result.error)?.error;
    if (setupError) throw setupError;

    const run = await service.from("company_runs").insert({
      agent_id: "customer_success",
      trigger_type: "manual",
      status: "waiting_approval",
      summary: "Controlled owner-inbox proof for the customer-success email connector.",
      input: { qa: true, purpose: "company_email_proof" },
      output: {},
      idempotency_key: `company:customer_success:email-proof:${userId}`,
      started_at: now,
      completed_at: now,
    }).select("id").single();
    if (run.error || !run.data) throw run.error ?? new Error("Could not create the controlled Company OS run.");

    const action = await service.from("company_actions").insert({
      run_id: run.data.id,
      agent_id: "customer_success",
      action_type: "send_customer_email",
      risk: "external",
      status: "proposed",
      requires_approval: true,
      title: "Controlled proof: customer-success delivery",
      rationale: "Send one clearly labelled test message to the owner-managed AgentMail inbox. This proves approval, eligibility, Resend delivery, webhook tracking and unsubscribe without contacting a founder.",
      payload: {
        userRef: userId,
        subject: "Badger Company OS delivery test",
        content: "This is a controlled delivery test to an owner-managed inbox. No action is needed.\n\nThis message proves that Badger only sends after approval and honours journey-email preferences. You can use the unsubscribe link below to verify the opt-out flow.",
      },
      idempotency_key: `company:customer_success:email-proof-action:${userId}`,
    }).select("id").single();
    if (action.error || !action.data) throw action.error ?? new Error("Could not create the controlled email action.");
    process.stdout.write(`${JSON.stringify({ prepared: true, recipient: email, userId, runId: run.data.id, actionId: action.data.id, next: "Approve this exact action in the owner control room." }, null, 2)}\n`);
  } catch (error) {
    await service.auth.admin.deleteUser(userId).catch(() => null);
    throw error;
  }
}

async function status(userId, actionId) {
  assertUuid(userId, "user ID");
  assertUuid(actionId, "action ID");
  const [action, preference, events, readyActions] = await Promise.all([
    service.from("company_actions").select("id,status,error_code,result,attempt_count,approved_at,executed_at").eq("id", actionId).single(),
    service.from("email_preferences").select("journey_nudges_enabled,unsubscribed_at").eq("user_id", userId).maybeSingle(),
    service.from("email_events").select("event_type,occurred_at").eq("user_id", userId).order("occurred_at", { ascending: true }),
    service.from("company_actions").select("id,action_type,title").eq("status", "approved").in("action_type", ["send_customer_email", "publish_social_content", "queue_engineering_work"]).lte("available_at", new Date().toISOString()).order("available_at"),
  ]);
  for (const result of [action, preference, events, readyActions]) if (result.error) throw result.error;
  process.stdout.write(`${JSON.stringify({
    action: action.data,
    preference: preference.data,
    events: (events.data ?? []).map((event) => ({ type: event.event_type, occurredAt: event.occurred_at })),
    readyActions: readyActions.data ?? [],
  }, null, 2)}\n`);
}

async function cleanup(userId, actionId) {
  assertUuid(userId, "user ID");
  assertUuid(actionId, "action ID");
  const action = await service.from("company_actions").select("status").eq("id", actionId).single();
  if (action.error) throw action.error;
  if (!["completed", "cancelled", "failed", "rejected"].includes(action.data.status)) throw new Error(`Refusing cleanup while the controlled action is ${action.data.status}.`);
  const removed = await service.auth.admin.deleteUser(userId);
  if (removed.error) throw removed.error;
  process.stdout.write(`${JSON.stringify({ cleaned: true, userId, retainedActionId: actionId, retainedActionStatus: action.data.status }, null, 2)}\n`);
}

async function verifyCleanup(userId) {
  assertUuid(userId, "user ID");
  const [authUser, profile, entitlement, preference, productEvents] = await Promise.all([
    service.auth.admin.getUserById(userId),
    service.from("profiles").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("email_preferences").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("product_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  for (const result of [profile, entitlement, preference, productEvents]) if (result.error) throw result.error;
  const report = {
    userExists: Boolean(authUser.data.user),
    profileRows: profile.count ?? 0,
    entitlementRows: entitlement.count ?? 0,
    preferenceRows: preference.count ?? 0,
    productEventRows: productEvents.count ?? 0,
  };
  if (report.userExists || Object.entries(report).some(([key, value]) => key !== "userExists" && value !== 0)) throw new Error(`Synthetic account cleanup is incomplete: ${JSON.stringify(report)}`);
  process.stdout.write(`${JSON.stringify({ verified: true, userId, ...report }, null, 2)}\n`);
}

if (command === "prepare") await prepare(firstArg);
else if (command === "status") await status(firstArg, secondArg);
else if (command === "cleanup") await cleanup(firstArg, secondArg);
else if (command === "verify-cleanup") await verifyCleanup(firstArg);
else throw new Error("Usage: company-email-proof.mjs prepare <agentmail inbox> | status <user id> <action id> | cleanup <user id> <action id> | verify-cleanup <user id>");
