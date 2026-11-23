import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !serviceKey) throw new Error("Supabase environment is incomplete");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Byqqa-${crypto.randomUUID()}!`;
const suffix = crypto.randomUUID();
const createdUsers = [];
const createdStripeEvents = [];
const createdAiUsage = [];
const createdCompanyRuns = [];

async function userClient(email) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Could not create test user");
  createdUsers.push(created.data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { client, id: created.data.user.id };
}

try {
  const a = await userClient(`byqqa-rls-a-${suffix}@example.com`);
  const b = await userClient(`byqqa-rls-b-${suffix}@example.com`);

  const profiles = await Promise.all([
    a.client.from("profiles").insert({ user_id: a.id, email: `a-${suffix}@example.com`, name: "A" }),
    b.client.from("profiles").insert({ user_id: b.id, email: `b-${suffix}@example.com`, name: "B" }),
  ]);
  if (profiles.some((result) => result.error)) throw new Error("Profile insert policy failed");
  const aProfiles = await a.client.from("profiles").select("user_id");
  if (aProfiles.error || aProfiles.data?.length !== 1 || aProfiles.data[0].user_id !== a.id) throw new Error("Profile tenant isolation failed");

  const unpaidPost = await a.client.from("posts").insert({ user_id: a.id, name: "A", body: "Must stay private", week: "Week 1" });
  if (!unpaidPost.error) throw new Error("Unpaid accounts must not publish community posts");
  const paidAccess = await admin.from("entitlements").insert([
    { user_id: a.id, product: "badger-28-day", status: "active", stripe_checkout_session_id: `cs_smoke_a_${suffix}` },
    { user_id: b.id, product: "badger-28-day", status: "active", stripe_checkout_session_id: `cs_smoke_b_${suffix}` },
  ]);
  if (paidAccess.error) throw paidAccess.error;

  const post = await a.client.from("posts").insert({ user_id: a.id, name: "A", body: "RLS smoke test", week: "Week 1" }).select("id").single();
  if (post.error || !post.data) throw post.error ?? new Error("Post insert failed");
  const firstFire = await b.client.from("post_fires").insert({ post_id: post.data.id, user_id: b.id });
  const duplicateFire = await b.client.from("post_fires").insert({ post_id: post.data.id, user_id: b.id });
  if (firstFire.error || !duplicateFire.error) throw new Error("One-fire-per-user constraint failed");
  const countedPost = await a.client.from("posts").select("fire").eq("id", post.data.id).single();
  if (countedPost.error || countedPost.data.fire !== 1) throw new Error("Fire counter trigger failed");

  const runId = crypto.randomUUID();
  const runInsert = await admin.from("coach_runs").insert({ id: runId, user_id: a.id, idempotency_key: `smoke-${suffix}`, mode: "sprint", status: "completed" });
  if (runInsert.error) throw runInsert.error;
  const [aRuns, bRuns] = await Promise.all([
    a.client.from("coach_runs").select("id").eq("id", runId),
    b.client.from("coach_runs").select("id").eq("id", runId),
  ]);
  if (aRuns.error || aRuns.data?.length !== 1 || bRuns.error || bRuns.data?.length !== 0) throw new Error("Coach-run tenant isolation failed");

  const venture = await admin.from("venture_entities").insert({
    user_id: a.id,
    kind: "evidence",
    name: "Smoke evidence",
    summary: "A founder-brain RLS verification row",
    confidence: 1,
    source_type: "system",
    source_ref: "smoke-test",
    canonical_key: `smoke:${suffix}:evidence`,
  }).select("id").single();
  if (venture.error || !venture.data) throw venture.error ?? new Error("Venture entity insert failed");
  const commitment = await admin.from("founder_commitments").insert({
    user_id: a.id,
    title: "Complete the smoke test",
    outcome: "The live schema works",
    due_at: new Date(Date.now() + 60_000).toISOString(),
    evidence_required: "Passing output",
    idempotency_key: `smoke:${suffix}:commitment`,
  }).select("id").single();
  if (commitment.error || !commitment.data) throw commitment.error ?? new Error("Commitment insert failed");
  const [aBrain, bBrain, aCommitments, bCommitments] = await Promise.all([
    a.client.from("venture_entities").select("id").eq("id", venture.data.id),
    b.client.from("venture_entities").select("id").eq("id", venture.data.id),
    a.client.from("founder_commitments").select("id").eq("id", commitment.data.id),
    b.client.from("founder_commitments").select("id").eq("id", commitment.data.id),
  ]);
  if (aBrain.error || aBrain.data?.length !== 1 || bBrain.error || bBrain.data?.length !== 0) throw new Error("Venture-brain tenant isolation failed");
  if (aCommitments.error || aCommitments.data?.length !== 1 || bCommitments.error || bCommitments.data?.length !== 0) throw new Error("Commitment tenant isolation failed");
  const privateWakeRead = await a.client.from("coach_wakes").select("id").limit(1);
  if (!privateWakeRead.error) throw new Error("Wake internals must not be client-readable");

  const [ownEntitlement, otherEntitlement, clientEntitlementWrite] = await Promise.all([
    a.client.from("entitlements").select("status").eq("user_id", a.id),
    b.client.from("entitlements").select("status").eq("user_id", a.id),
    a.client.from("entitlements").update({ status: "revoked" }).eq("user_id", a.id),
  ]);
  if (ownEntitlement.error || ownEntitlement.data?.length !== 1 || ownEntitlement.data[0].status !== "active") throw new Error("Own entitlement read failed");
  if (otherEntitlement.error || otherEntitlement.data?.length !== 0) throw new Error("Entitlement tenant isolation failed");
  if (!clientEntitlementWrite.error) throw new Error("Entitlements must be server-writable only");

  const eventRead = await a.client.from("product_events").select("id").limit(1);
  const eventWrite = await a.client.from("product_events").insert({
    user_id: a.id,
    event_name: "page_view",
    path: "/smoke",
  });
  if (!eventRead.error || !eventWrite.error) throw new Error("Product events must be server-only");

  const testerAccount = await admin.from("tester_accounts").insert({
    user_id: a.id,
    cohort: "smoke-test",
    owner_notes: "Private owner-only verification",
  });
  if (testerAccount.error) throw testerAccount.error;
  const [testerRead, testerWrite] = await Promise.all([
    a.client.from("tester_accounts").select("user_id").eq("user_id", a.id),
    a.client.from("tester_accounts").update({ owner_notes: "forbidden" }).eq("user_id", a.id),
  ]);
  if (!testerRead.error || !testerWrite.error) throw new Error("Tester operations data must be server-only");

  const aiUsage = await admin.from("ai_usage_events").insert({
    user_id: a.id,
    feature: "smoke_test",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    prompt_tokens: 10,
    completion_tokens: 5,
    estimated_cost_usd: 0.0000028,
  }).select("id").single();
  if (aiUsage.error || !aiUsage.data) throw aiUsage.error ?? new Error("AI usage service insert failed");
  createdAiUsage.push(aiUsage.data.id);
  const [aiUsageRead, aiUsageWrite] = await Promise.all([
    a.client.from("ai_usage_events").select("id").eq("id", aiUsage.data.id),
    a.client.from("ai_usage_events").insert({ feature: "forbidden", provider: "x", model: "x" }),
  ]);
  if (!aiUsageRead.error || !aiUsageWrite.error) throw new Error("AI usage ledger must be server-only");

  const stripeEventId = `evt_smoke_${suffix}`;
  const stripeLedger = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: stripeEventId,
    event_type: "checkout.session.completed",
    status: "processing",
  });
  if (stripeLedger.error) throw stripeLedger.error;
  createdStripeEvents.push(stripeEventId);
  const [stripeRead, stripeWrite] = await Promise.all([
    a.client.from("stripe_webhook_events").select("stripe_event_id").eq("stripe_event_id", stripeEventId),
    a.client.from("stripe_webhook_events").update({ status: "processed" }).eq("stripe_event_id", stripeEventId),
  ]);
  if (!stripeRead.error || !stripeWrite.error) throw new Error("Stripe webhook ledger must be server-only");

  const companySettings = await admin.from("company_os_settings").select("id, mode, paused").eq("id", "badger").single();
  const companyAgents = await admin.from("company_agents").select("id, autonomy");
  if (companySettings.error || companySettings.data.id !== "badger" || companyAgents.error || (companyAgents.data?.length ?? 0) !== 8) {
    throw new Error("Company OS seed or service-role access failed");
  }
  const companyRun = await admin.from("company_runs").insert({
    agent_id: "qa",
    trigger_type: "manual",
    status: "completed",
    summary: "Security smoke test",
    idempotency_key: `company-smoke:${suffix}`,
  }).select("id").single();
  if (companyRun.error || !companyRun.data) throw companyRun.error ?? new Error("Company run service insert failed");
  createdCompanyRuns.push(companyRun.data.id);
  const [companySettingsRead, companyAgentWrite, companyRunRead, companyActionWrite, companyAuditRead] = await Promise.all([
    a.client.from("company_os_settings").select("id"),
    a.client.from("company_agents").update({ autonomy: "bounded" }).eq("id", "qa"),
    a.client.from("company_runs").select("id").eq("id", companyRun.data.id),
    a.client.from("company_actions").insert({ run_id: companyRun.data.id, agent_id: "qa", action_type: "record_observation", risk: "read", title: "Forbidden", rationale: "Must stay private", idempotency_key: `forbidden:${suffix}` }),
    a.client.from("company_audit_log").select("id").limit(1),
  ]);
  if (!companySettingsRead.error || !companyAgentWrite.error || !companyRunRead.error || !companyActionWrite.error || !companyAuditRead.error) {
    throw new Error("Company OS control plane must be completely server-only");
  }

  console.log("Supabase RLS smoke test passed");
} finally {
  if (createdCompanyRuns.length) {
    await admin.from("company_runs").delete().in("id", createdCompanyRuns);
  }
  if (createdAiUsage.length) {
    await admin.from("ai_usage_events").delete().in("id", createdAiUsage);
  }
  if (createdStripeEvents.length) {
    await admin.from("stripe_webhook_events").delete().in("stripe_event_id", createdStripeEvents);
  }
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
}
