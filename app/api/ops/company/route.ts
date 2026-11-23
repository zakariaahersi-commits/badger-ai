import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { COMPANY_AGENT_IDS, type AgentAutonomy, type CompanyMode } from "@/lib/company-os/types";
import { isCompanyMetricId, loadCompanyMetrics, withLiveCompanyGoalMetrics } from "@/lib/company-os/metrics";
import { runCompanyAgent } from "@/lib/company-os/runner";
import { deepseekKey } from "@/lib/deepseek-config";
import { engineeringConnectorProvider } from "@/lib/company-os/engineering-connector";
import { buildCompanyReadiness } from "@/lib/company-os/readiness";
import { socialConnectorProvider } from "@/lib/company-os/social-connector";
import { buildCompanyCapitalReadiness } from "@/lib/company-os/capital-readiness";
import { loadMessagingPilotMetrics } from "@/lib/messaging/metrics";
import { messagingConfigured } from "@/lib/messaging/crypto";
import { buildCompanyDailyWorkOrder } from "@/lib/company-os/work-order";
import { companyInboxConnectorReady, companyInboxWebhookReady } from "@/lib/company-os/agentmail";
import { heyGenConnector } from "@/lib/company-os/ugc-renderer";
import { loadGrowthRadar } from "@/lib/company-os/trend-radar";
import { ownerBriefSchedule } from "@/lib/company-os/owner-brief-format";
import { mayRecordWarmOutreachStatus, WARM_OUTREACH_FOLLOW_UP, WARM_OUTREACH_OPENER, warmOutreachReply, warmOutreachTrackingUrl } from "@/lib/company-os/warm-outreach";

async function owner(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return { error: NextResponse.json({ error: "authentication required" }, { status: 401 }) };
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) return { error: NextResponse.json({ error: "Google owner access required" }, { status: 403 }) };
  return { auth };
}

export async function GET(req: NextRequest) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const service = access.auth.service!;
  const [settings, agents, goals, runs, actions, audit, metrics, messagingPilot, dailyPlan, companyInbox, growthRadar, warmOutreach] = await Promise.all([
    service.from("company_os_settings").select("*").eq("id", "badger").single(),
    service.from("company_agents").select("*").order("id"),
    service.from("company_goals").select("*").in("status", ["draft", "active", "achieved"]).order("created_at", { ascending: false }).limit(20),
    service.from("company_runs").select("id, agent_id, trigger_type, status, summary, output, estimated_cost_usd, latency_ms, error_code, started_at, completed_at, created_at").order("created_at", { ascending: false }).limit(50),
    service.from("company_actions").select("id, run_id, agent_id, action_type, risk, status, requires_approval, title, rationale, payload, result, error_code, created_at, approved_at, rejected_at, executed_at").order("created_at", { ascending: false }).limit(100),
    service.from("company_audit_log").select("id, actor_type, actor_id, event_type, object_type, object_id, details, created_at").order("created_at", { ascending: false }).limit(100),
    loadCompanyMetrics(service).catch(() => null),
    loadMessagingPilotMetrics(service).catch(() => null),
    service.from("company_daily_plans").select("id,local_date,status,objective,bottleneck,hypothesis,leading_signal,stop_condition,company_experiments(id,title,status,channel,cta,source_code,target_metric,success_threshold,stop_condition,result,learning,playbook_slug,playbook_version)").order("local_date", { ascending: false }).limit(1).maybeSingle(),
    service.from("company_email_messages").select("id,sender_email,sender_name,subject,preview,body_text,received_at,status,triage,action_id,error_code").order("received_at", { ascending: false }).limit(25),
    loadGrowthRadar(service, 8),
    service.from("company_outreach_batches").select("id,experiment_id,status,max_contacts,opener,follow_up,starts_at,completed_at,company_experiments(source_code,channel),company_outreach_contacts(id,slot,status,sent_at,replied_at)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const failure = [settings, agents, goals, runs, actions, audit, dailyPlan, companyInbox, warmOutreach].find((result) => result.error)?.error;
  if (failure) return NextResponse.json({ error: "Company OS data unavailable" }, { status: 503 });
  const engineeringProvider = engineeringConnectorProvider();
  const socialProvider = socialConnectorProvider();
  let ugcRenderer = false;
  try { ugcRenderer = Boolean(heyGenConnector()); } catch { ugcRenderer = false; }
  const liveGoals = metrics ? withLiveCompanyGoalMetrics(goals.data ?? [], metrics) : goals.data ?? [];
  const connectors = {
    deepseek: Boolean(deepseekKey().key),
    email: Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET),
    social: Boolean(socialProvider),
    engineering: Boolean(engineeringProvider),
    ownerEmail: Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.OWNER_EMAILS),
    ownerTelegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID),
    messaging: messagingConfigured(),
    companyInbox: companyInboxConnectorReady() && companyInboxWebhookReady(),
    ugcRenderer,
  };
  const readiness = buildCompanyReadiness({
    paused: Boolean(settings.data.paused),
    mode: settings.data.mode,
    metricsAvailable: Boolean(metrics),
    activeEntitlements: Number(metrics?.activeEntitlements ?? 0),
    autonomousCustomerEmails: Boolean(settings.data.autonomous_customer_emails),
    autonomousSocialPosts: Boolean(settings.data.autonomous_social_posts),
    engineeringProvider,
    socialProvider,
    connectors,
    platform: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      cron: Boolean(process.env.CRON_SECRET),
      ownerAllowlist: Boolean(process.env.OWNER_EMAILS),
      automationCallback: Boolean(process.env.COMPANY_AUTOMATION_CALLBACK_SECRET),
    },
    agents: agents.data ?? [],
    runs: runs.data ?? [],
    actions: actions.data ?? [],
  });
  const capitalReadiness = buildCompanyCapitalReadiness(metrics);
  const workOrder = buildCompanyDailyWorkOrder(dailyPlan.data ?? null);
  const warmBatch = warmOutreach.data ? (() => {
    const experiment = Array.isArray(warmOutreach.data.company_experiments) ? warmOutreach.data.company_experiments[0] : warmOutreach.data.company_experiments;
    const sourceCode = typeof experiment?.source_code === "string" ? experiment.source_code : "";
    const contacts = [...(warmOutreach.data.company_outreach_contacts ?? [])].sort((left, right) => Number(left.slot) - Number(right.slot));
    return {
      ...warmOutreach.data,
      sourceCode,
      contacts: contacts.map((contact) => ({
        ...contact,
        trackingUrl: warmOutreachTrackingUrl({ sourceCode, slot: Number(contact.slot) }),
        reply: warmOutreachReply({ sourceCode, slot: Number(contact.slot) }),
      })),
      company_experiments: undefined,
      company_outreach_contacts: undefined,
    };
  })() : null;
  return NextResponse.json({
    generatedAt: new Date().toISOString(), settings: settings.data, agents: agents.data ?? [], goals: liveGoals, runs: runs.data ?? [], actions: actions.data ?? [], audit: audit.data ?? [], metrics,
    connectors,
    engineeringProvider,
    socialProvider,
    readiness,
    capitalReadiness,
    messagingPilot,
    companyInbox: {
      configured: companyInboxConnectorReady(),
      webhookConfigured: companyInboxWebhookReady(),
      pending: (companyInbox.data ?? []).filter((message) => ["new", "failed", "escalated"].includes(message.status)).length,
      messages: companyInbox.data ?? [],
    },
    dailyPlan: dailyPlan.data ?? null,
    workOrder,
    growthRadar,
    warmOutreach: warmBatch,
  });
}

export async function PATCH(req: NextRequest) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const service = access.auth.service!;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const command = typeof body?.command === "string" ? body.command : "";
  if (command === "start_warm_outreach") {
    const now = new Date();
    const metrics = await loadCompanyMetrics(service).catch(() => null);
    if (!metrics) return NextResponse.json({ error: "Verified metrics are unavailable" }, { status: 503 });
    if (metrics.blockingBugs > 0) return NextResponse.json({ error: "Resolve the blocking product issue before inviting another cohort" }, { status: 409 });
    const localDate = ownerBriefSchedule(now).localDate;
    const sourceCode = `badger-${localDate.replaceAll("-", "")}-warm-dm-${Math.floor(now.getTime() / 1000).toString(36)}`.slice(0, 64);
    const result = await service.rpc("start_company_warm_outreach", {
      p_actor_id: access.auth.userId,
      p_local_date: localDate,
      p_source_code: sourceCode,
      p_source_metrics: metrics,
      p_opener: WARM_OUTREACH_OPENER,
      p_follow_up: WARM_OUTREACH_FOLLOW_UP,
    });
    if (result.error) return NextResponse.json({ error: "Warm outreach cohort could not be started" }, { status: 503 });
    return NextResponse.json({ warmOutreach: Array.isArray(result.data) ? result.data[0] : result.data });
  }
  if (command === "warm_outreach_contact") {
    const batchId = Number(body?.batchId);
    const slot = Number(body?.slot);
    const nextStatus = String(body?.status ?? "");
    if (!Number.isInteger(batchId) || batchId <= 0 || !Number.isInteger(slot) || slot < 1 || slot > 5) return NextResponse.json({ error: "invalid outreach contact" }, { status: 400 });
    const batch = await service.from("company_outreach_batches").select("id,status,experiment_id").eq("id", batchId).maybeSingle();
    if (batch.error || !batch.data || batch.data.status !== "active") return NextResponse.json({ error: "Active outreach cohort not found" }, { status: 404 });
    const current = await service.from("company_outreach_contacts").select("id,status,sent_at,replied_at").eq("batch_id", batchId).eq("slot", slot).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ error: "Outreach contact not found" }, { status: 404 });
    if (!mayRecordWarmOutreachStatus(current.data.status, nextStatus)) return NextResponse.json({ error: "That outcome cannot follow the current state" }, { status: 409 });
    const now = new Date().toISOString();
    const patch = {
      status: nextStatus,
      sent_at: current.data.sent_at ?? now,
      replied_at: ["replied", "interested", "not_interested"].includes(nextStatus) ? current.data.replied_at ?? now : current.data.replied_at,
      updated_at: now,
    };
    const updated = await service.from("company_outreach_contacts").update(patch).eq("id", current.data.id).eq("status", current.data.status).select("id,slot,status,sent_at,replied_at").maybeSingle();
    if (updated.error || !updated.data) return NextResponse.json({ error: "Outcome was not recorded" }, { status: 409 });
    if (["replied", "interested", "not_interested"].includes(nextStatus)) {
      await service.from("company_experiments").update({ status: "measuring", updated_at: now }).eq("id", batch.data.experiment_id).in("status", ["planned", "running"]);
    }
    await service.from("company_agents").update({ next_run_at: now, updated_at: now }).in("id", nextStatus === "sent" ? ["growth"] : ["growth", "revenue"]);
    await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: "warm_outreach.outcome_recorded", object_type: "company_outreach_contact", object_id: String(current.data.id), details: { batchId, slot, from: current.data.status, to: nextStatus } });
    return NextResponse.json({ contact: updated.data });
  }
  if (command === "settings") {
    const patch: Record<string, unknown> = { updated_by: access.auth.userId, updated_at: new Date().toISOString() };
    if (["observe", "guarded", "active"].includes(String(body?.mode))) patch.mode = body?.mode as CompanyMode;
    if (typeof body?.paused === "boolean") patch.paused = body.paused;
    if (typeof body?.pauseReason === "string") patch.pause_reason = body.pauseReason.trim().slice(0, 500) || null;
    if (typeof body?.autonomousCustomerEmails === "boolean") {
      if (body.autonomousCustomerEmails && !(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET)) return NextResponse.json({ error: "Customer email connector is not configured" }, { status: 409 });
      patch.autonomous_customer_emails = body.autonomousCustomerEmails;
    }
    if (typeof body?.autonomousSocialPosts === "boolean") {
      if (body.autonomousSocialPosts && !socialConnectorProvider()) return NextResponse.json({ error: "Social publishing connector is not configured" }, { status: 409 });
      patch.autonomous_social_posts = body.autonomousSocialPosts;
    }
    for (const [requestKey, column, max] of [["maxDailyAiSpendUsd", "max_daily_ai_spend_usd", 10000], ["maxDailyEmails", "max_daily_emails", 100000], ["maxDailySocialPosts", "max_daily_social_posts", 1000], ["maxDailyDeploys", "max_daily_deploys", 100], ["maxDailyEngineeringJobs", "max_daily_engineering_jobs", 1000]] as const) {
      if (body?.[requestKey] !== undefined) { const value = Number(body[requestKey]); if (!Number.isFinite(value) || value < 0 || value > max) return NextResponse.json({ error: `invalid ${requestKey}` }, { status: 400 }); patch[column] = value; }
    }
    const { data, error } = await service.from("company_os_settings").update(patch).eq("id", "badger").select("*").single();
    if (error) return NextResponse.json({ error: "Settings update failed" }, { status: 503 });
    await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: "settings.updated", object_type: "company_os", object_id: "badger", details: patch });
    return NextResponse.json({ settings: data });
  }
  if (command === "agent") {
    const agentId = String(body?.agentId ?? "");
    if (!COMPANY_AGENT_IDS.includes(agentId as typeof COMPANY_AGENT_IDS[number])) return NextResponse.json({ error: "invalid agent" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (["active", "paused", "degraded"].includes(String(body?.status))) { patch.status = body?.status; if (body?.status === "active") patch.consecutive_failures = 0; }
    if (["observe", "draft", "bounded", "disabled"].includes(String(body?.autonomy))) patch.autonomy = body?.autonomy as AgentAutonomy;
    if (body?.scheduleMinutes !== undefined) { const value = Number(body.scheduleMinutes); if (!Number.isInteger(value) || value < 15 || value > 10080) return NextResponse.json({ error: "invalid schedule" }, { status: 400 }); patch.schedule_minutes = value; }
    if (body?.dailyBudgetUsd !== undefined) { const value = Number(body.dailyBudgetUsd); if (!Number.isFinite(value) || value < 0 || value > 1000) return NextResponse.json({ error: "invalid budget" }, { status: 400 }); patch.daily_budget_usd = value; }
    const { data, error } = await service.from("company_agents").update(patch).eq("id", agentId).select("*").single();
    if (error) return NextResponse.json({ error: "Agent update failed" }, { status: 503 });
    await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: "agent.updated", object_type: "company_agent", object_id: agentId, details: patch });
    return NextResponse.json({ agent: data });
  }
  if (command === "goal") {
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 180) : "";
    const metric = typeof body?.metric === "string" ? body.metric.trim().slice(0, 100) : "";
    const targetValue = Number(body?.targetValue);
    const unit = typeof body?.unit === "string" ? body.unit.trim().slice(0, 30) : "count";
    const ownerAgentId = body?.ownerAgentId ? String(body.ownerAgentId) : null;
    if (!title || !isCompanyMetricId(metric) || !Number.isFinite(targetValue) || targetValue < 0 || !unit || (ownerAgentId && !COMPANY_AGENT_IDS.includes(ownerAgentId as typeof COMPANY_AGENT_IDS[number]))) return NextResponse.json({ error: "invalid goal" }, { status: 400 });
    const goalId = Number(body?.goalId);
    const goalPatch = { title, metric, target_value: targetValue, unit, owner_agent_id: ownerAgentId, updated_at: new Date().toISOString() };
    const result = Number.isInteger(goalId) && goalId > 0
      ? await service.from("company_goals").update(goalPatch).eq("id", goalId).select("*").single()
      : await service.from("company_goals").insert(goalPatch).select("*").single();
    if (result.error) return NextResponse.json({ error: "Goal update failed" }, { status: 503 });
    await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: Number.isInteger(goalId) && goalId > 0 ? "goal.updated" : "goal.created", object_type: "company_goal", object_id: String(result.data.id), details: { metric, targetValue, unit, ownerAgentId } });
    return NextResponse.json({ goal: result.data });
  }
  return NextResponse.json({ error: "unknown command" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const body = await req.json().catch(() => null) as { agentId?: string } | null;
  const agentId = String(body?.agentId ?? "");
  if (!COMPANY_AGENT_IDS.includes(agentId as typeof COMPANY_AGENT_IDS[number])) return NextResponse.json({ error: "invalid agent" }, { status: 400 });
  return NextResponse.json(await runCompanyAgent(access.auth.service!, agentId, "manual"));
}
