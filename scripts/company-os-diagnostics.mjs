import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Company OS diagnostics require Supabase server credentials.");

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const since = new Date(Date.now() - 72 * 60 * 60_000).toISOString();

const [settings, agents, goals, runs, actions, usage, activeAccess, paidFounders, testerAccess] = await Promise.all([
  service.from("company_os_settings")
    .select("mode,paused,pause_reason,max_daily_ai_spend_usd,max_daily_emails,max_daily_social_posts,max_daily_engineering_jobs,autonomous_customer_emails,autonomous_social_posts")
    .eq("id", "badger")
    .single(),
  service.from("company_agents")
    .select("id,status,autonomy,consecutive_failures,last_run_at,next_run_at")
    .order("id"),
  service.from("company_goals")
    .select("id,title,metric,target_value,current_value,unit,status,owner_agent_id,ends_at,created_at,updated_at")
    .in("status", ["draft", "active", "achieved"])
    .order("created_at", { ascending: false })
    .limit(50),
  service.from("company_runs")
    .select("id,agent_id,trigger_type,status,error_code,latency_ms,prompt_tokens,completion_tokens,output,created_at,completed_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500),
  service.from("company_actions")
    .select("id,run_id,agent_id,action_type,status,requires_approval,title,error_code,available_at,created_at,executed_at,result")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500),
  service.from("ai_usage_events")
    .select("feature,model,success,error_code,latency_ms,prompt_tokens,completion_tokens,metadata,created_at")
    .like("feature", "company_os_%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500),
  service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active"),
  service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active").not("stripe_payment_intent_id", "is", null),
  service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active").is("stripe_payment_intent_id", null),
]);

for (const result of [settings, agents, goals, runs, actions, usage, activeAccess, paidFounders, testerAccess]) {
  if (result.error) throw result.error;
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) {
    const value = String(row[key] ?? "unknown");
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function connectorConfiguration() {
  const githubEngineering = Boolean((process.env.COMPANY_ENGINEERING_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY) && process.env.COMPANY_ENGINEERING_WORKER_SECRET && process.env.COMPANY_AUTOMATION_CALLBACK_SECRET);
  const webhookEngineering = Boolean(process.env.COMPANY_ENGINEERING_WEBHOOK_URL && process.env.COMPANY_ENGINEERING_WEBHOOK_SECRET);
  const directInstagram = Boolean(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID && process.env.INSTAGRAM_BUSINESS_ACCESS_TOKEN && process.env.INSTAGRAM_EXPECTED_USERNAME);
  const webhookSocial = Boolean(process.env.COMPANY_SOCIAL_WEBHOOK_URL && process.env.COMPANY_SOCIAL_WEBHOOK_SECRET);
  return {
    deepseek: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.DEEPSEEK_API_KEY || process.env.Deepseek_API || process.env.DEEPSEEK_API),
    email: Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET),
    social: directInstagram ? "instagram" : webhookSocial ? "webhook" : null,
    engineering: githubEngineering ? "github" : webhookEngineering ? "webhook" : null,
    ownerEmail: Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.OWNER_EMAILS),
    ownerTelegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID),
  };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

const byFeature = new Map();
for (const event of usage.data ?? []) {
  const row = byFeature.get(event.feature) ?? {
    calls: 0,
    successes: 0,
    failures: {},
    successLatencies: [],
    promptTokens: 0,
    completionTokens: 0,
  };
  row.calls += 1;
  if (event.success) {
    row.successes += 1;
    if (Number.isFinite(event.latency_ms)) row.successLatencies.push(Number(event.latency_ms));
  } else {
    const code = event.error_code || "unknown";
    row.failures[code] = (row.failures[code] ?? 0) + 1;
  }
  row.promptTokens += Number(event.prompt_tokens) || 0;
  row.completionTokens += Number(event.completion_tokens) || 0;
  byFeature.set(event.feature, row);
}

const features = Object.fromEntries([...byFeature.entries()].map(([feature, row]) => [feature, {
  calls: row.calls,
  successes: row.successes,
  successRate: row.calls ? Number((row.successes / row.calls).toFixed(3)) : null,
  failures: row.failures,
  latencyP50Ms: percentile(row.successLatencies, 0.5),
  latencyP95Ms: percentile(row.successLatencies, 0.95),
  promptTokens: row.promptTokens,
  completionTokens: row.completionTokens,
}]));

const recentFailures = (usage.data ?? []).filter((event) => !event.success).slice(0, 25).map((event) => ({
  feature: event.feature,
  errorCode: event.error_code,
  latencyMs: event.latency_ms,
  promptTokens: event.prompt_tokens,
  completionTokens: event.completion_tokens,
  attemptCount: event.metadata && typeof event.metadata === "object" ? event.metadata.attempts ?? null : null,
  createdAt: event.created_at,
}));

const now = Date.now();
const actionRows = actions.data ?? [];
const goalRows = goals.data ?? [];
const agentRows = agents.data ?? [];
const pendingDecisions = actionRows.filter((action) => action.status === "proposed");
const delegatedWork = actionRows.filter((action) => action.status === "delegated");
const queuedExecution = actionRows.filter((action) => action.status === "approved" || action.status === "executing");
const recentActionFailures = actionRows.filter((action) => action.status === "failed").slice(0, 25).map((action) => ({
  id: action.id,
  agentId: action.agent_id,
  actionType: action.action_type,
  title: action.title,
  errorCode: action.error_code,
  createdAt: action.created_at,
  executedAt: action.executed_at,
}));
const scheduler = {
  activeAgents: agentRows.filter((agent) => agent.status === "active" && agent.autonomy !== "disabled").length,
  degradedAgents: agentRows.filter((agent) => agent.status === "degraded").map((agent) => agent.id),
  overdueAgents: agentRows.filter((agent) => agent.status === "active" && agent.autonomy !== "disabled" && Date.parse(agent.next_run_at) < now - 15 * 60_000).map((agent) => ({ id: agent.id, nextRunAt: agent.next_run_at })),
  lastScheduledRunAt: (runs.data ?? []).find((run) => run.trigger_type === "schedule")?.created_at ?? null,
};
const recentOwnerBriefs = (runs.data ?? []).filter((run) => run.agent_id === "ceo" && run.trigger_type === "event" && run.status === "completed" && run.output && typeof run.output === "object");
const ownerChannelDelivered = (channel) => recentOwnerBriefs.some((run) => {
  const delivery = run.output?.delivery;
  return delivery && typeof delivery === "object" && delivery[channel] === "sent";
});

const report = {
  generatedAt: new Date().toISOString(),
  windowHours: 72,
  settings: settings.data,
  connectors: {
    configurationSource: "local_process_only_not_production_authoritative",
    locallyConfigured: connectorConfiguration(),
    recentOperationalEvidence: {
      deepseek: (usage.data ?? []).some((event) => event.success),
      email: actionRows.some((action) => action.action_type === "send_customer_email" && action.status === "completed"),
      social: actionRows.some((action) => action.action_type === "publish_social_content" && action.status === "completed"),
      engineering: actionRows.some((action) => action.action_type === "queue_engineering_work" && ["delegated", "completed"].includes(action.status)),
      ownerAlerts: actionRows.some((action) => {
        if (action.action_type !== "send_owner_alert" || action.status !== "completed" || !action.result || typeof action.result !== "object") return false;
        const delivery = action.result.delivery;
        return delivery === "sent" || Boolean(delivery && typeof delivery === "object" && delivery.sent === true);
      }),
      ownerEmail: ownerChannelDelivered("email"),
      ownerTelegram: ownerChannelDelivered("telegram"),
    },
  },
  direction: {
    revenueTruth: {
      activeAccess: activeAccess.count ?? 0,
      paidFounders: paidFounders.count ?? 0,
      testerAccess: testerAccess.count ?? 0,
    },
    activeGoalCount: goalRows.filter((goal) => goal.status === "active").length,
    draftGoalCount: goalRows.filter((goal) => goal.status === "draft").length,
    goals: goalRows,
  },
  execution: {
    actionStatusCounts: countBy(actionRows, "status"),
    actionTypeCounts: countBy(actionRows, "action_type"),
    pendingDecisionCount: pendingDecisions.length,
    pendingDecisions: pendingDecisions.slice(0, 25).map((action) => ({ id: action.id, agentId: action.agent_id, actionType: action.action_type, title: action.title, createdAt: action.created_at })),
    delegatedCount: delegatedWork.length,
    delegatedWork: delegatedWork.slice(0, 25).map((action) => ({ id: action.id, agentId: action.agent_id, actionType: action.action_type, title: action.title, createdAt: action.created_at, result: action.result })),
    queuedCount: queuedExecution.length,
    recentActionFailures,
  },
  scheduler,
  agents: agentRows,
  features,
  recentFailures,
  recentSuccesses: (usage.data ?? []).filter((event) => event.success).slice(0, 25).map((event) => ({
    feature: event.feature,
    model: event.model,
    latencyMs: event.latency_ms,
    promptTokens: event.prompt_tokens,
    completionTokens: event.completion_tokens,
    attempts: event.metadata && typeof event.metadata === "object" ? event.metadata.attempts ?? null : null,
    recovered: event.metadata && typeof event.metadata === "object" ? event.metadata.recovered ?? null : null,
    attemptErrors: event.metadata && typeof event.metadata === "object" ? event.metadata.attemptErrors ?? null : null,
    createdAt: event.created_at,
  })),
  recentRunFailures: (runs.data ?? []).filter((run) => run.status === "failed").slice(0, 25),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
