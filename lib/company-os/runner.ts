import type { SupabaseClient } from "@supabase/supabase-js";
import { DeepSeekCompletionError } from "@/lib/deepseek-client";
import { estimatedAiCostUsd, recordAiUsage } from "@/lib/ai-usage";
import { sendOwnerTelegramAlert, sendOwnerTelegramDecision } from "@/lib/telegram";
import { withExperimentTrackingLink } from "@/lib/company-os/experiment-attribution";
import { actionDecision, agentMayPropose, companyFailureRetryMinutes, companyOwnerAlertTopic, ENGINEERING_CIRCUIT_COOLDOWN_MS, isCompanyActionType, isEngineeringConnectorCircuitFailure, OWNER_ALERT_COOLDOWN_MS } from "@/lib/company-os/policy";
import { companyMetricValue, loadCompanyMetrics } from "@/lib/company-os/metrics";
import { loadAgentContext } from "@/lib/company-os/context";
import type { AgentAutonomy, CompanyMode } from "@/lib/company-os/types";
import { normalizeCompanyEmail, normalizeEngineeringJob, normalizePreparedSocialContent, normalizeSocialPosts, withPreparedSocialTracking } from "@/lib/company-os/execution-policy";
import { normalizeInstagramPublication, socialConnector } from "@/lib/company-os/social-connector";
import { createHash } from "node:crypto";
import { deepseekKey } from "@/lib/deepseek-config";
import { engineeringConnectorProvider } from "@/lib/company-os/engineering-connector";
import { parseCompanyAgentOutput, requestCompanyAgentAnalysis } from "@/lib/company-os/analysis";
import { currentCompanyDailyPlanRefs, ensureCompanyDailyPlan } from "@/lib/company-os/daily-plan";
import { assignmentForAgent, workOrderAllowsAction } from "@/lib/company-os/work-order";
import { companyAgentEvidenceFingerprint } from "@/lib/company-os/evidence-fingerprint";
import { ownerBriefSchedule } from "@/lib/company-os/owner-brief-format";
import { heyGenConnector } from "@/lib/company-os/ugc-renderer";
import { experimentDeliverableKey } from "@/lib/company-os/deliverable-gate";

type AgentRow = { id: string; label: string; mission: string; status: string; autonomy: AgentAutonomy; schedule_minutes: number; daily_budget_usd: number; allowed_actions: string[]; last_run_at: string | null; next_run_at: string; consecutive_failures: number };
type SettingsRow = { mode: CompanyMode; paused: boolean; pause_reason: string | null; max_daily_ai_spend_usd: number; autonomous_customer_emails: boolean; autonomous_social_posts: boolean };

function idempotency(agentId: string, trigger: string, date = new Date()): string {
  const slot = Math.floor(date.getTime() / (15 * 60_000));
  return `company:${agentId}:${trigger}:${slot}`;
}

async function audit(service: SupabaseClient, input: { actorType: string; actorId: string; eventType: string; objectType: string; objectId: string; details?: Record<string, unknown> }) {
  await service.from("company_audit_log").insert({ actor_type: input.actorType, actor_id: input.actorId, event_type: input.eventType, object_type: input.objectType, object_id: input.objectId, details: input.details ?? {} });
}

async function engineeringConnectorCircuitOpen(service: SupabaseClient, now = Date.now()): Promise<boolean> {
  const since = new Date(now - ENGINEERING_CIRCUIT_COOLDOWN_MS).toISOString();
  const { data, error } = await service.from("company_actions")
    .select("error_code, executed_at")
    .eq("action_type", "queue_engineering_work")
    .eq("status", "failed")
    .gte("executed_at", since)
    .order("executed_at", { ascending: false })
    .limit(20);
  if (error) return false;
  return (data ?? []).some((row) => isEngineeringConnectorCircuitFailure(row.error_code));
}

async function hasOpenEngineeringAction(service: SupabaseClient): Promise<boolean> {
  const query = await service
    .from("company_actions")
    .select("id")
    .eq("action_type", "queue_engineering_work")
    .in("status", ["proposed", "approved", "executing", "delegated"])
    .limit(1)
    .maybeSingle();
  if (query.error) throw query.error;
  return Boolean(query.data);
}

async function ownerAlertRecentlySent(service: SupabaseClient, topic: string, now = Date.now()): Promise<boolean> {
  const since = new Date(now - OWNER_ALERT_COOLDOWN_MS).toISOString();
  const { data, error } = await service.from("company_actions")
    .select("title, rationale, result, executed_at")
    .eq("action_type", "send_owner_alert")
    .eq("status", "completed")
    .gte("executed_at", since)
    .order("executed_at", { ascending: false })
    .limit(50);
  if (error) return false;
  return (data ?? []).some((row) => {
    const result = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
    const stored = typeof result?.alertTopic === "string" ? result.alertTopic : null;
    return (stored ?? companyOwnerAlertTopic(`${row.title ?? ""}\n${row.rationale ?? ""}`)) === topic;
  });
}

async function failAgentRun(service: SupabaseClient, agent: AgentRow, runId: string, code: string, summary: string) {
  const failures = agent.consecutive_failures + 1;
  const degraded = failures >= 3;
  const now = new Date().toISOString();
  const retryMinutes = companyFailureRetryMinutes(failures);
  await Promise.all([
    service.from("company_runs").update({ status: "failed", summary, error_code: code, completed_at: now }).eq("id", runId),
    service.from("company_agents").update({ status: degraded ? "degraded" : "active", last_run_at: now, next_run_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(), consecutive_failures: failures, updated_at: now }).eq("id", agent.id),
    audit(service, { actorType: "system", actorId: "agent_runner", eventType: degraded ? "agent.degraded" : "run.failed", objectType: "company_run", objectId: runId, details: { agentId: agent.id, code, failures, retryMinutes } }),
  ]);
  if (failures === 3) await sendOwnerTelegramAlert(`🦡 ${agent.label} agent paused after 3 failures\n${code}\nReview it in Company OS.`);
}

export async function runCompanyAgent(service: SupabaseClient, agentId: string, triggerType: "schedule" | "manual" | "event" | "recovery" = "schedule") {
  const [{ data: settings, error: settingsError }, { data: agent, error: agentError }] = await Promise.all([
    service.from("company_os_settings").select("mode, paused, pause_reason, max_daily_ai_spend_usd, autonomous_customer_emails, autonomous_social_posts").eq("id", "badger").single<SettingsRow>(),
    service.from("company_agents").select("id, label, mission, status, autonomy, schedule_minutes, daily_budget_usd, allowed_actions, last_run_at, next_run_at, consecutive_failures").eq("id", agentId).single<AgentRow>(),
  ]);
  if (settingsError || agentError || !settings || !agent) return { status: "unavailable", agentId };
  if (settings.paused || agent.status !== "active" || agent.autonomy === "disabled") return { status: "skipped", reason: settings.paused ? "company_paused" : "agent_paused", agentId };

  const key = idempotency(agent.id, triggerType);
  const { data: run, error: runError } = await service.from("company_runs").insert({ agent_id: agent.id, trigger_type: triggerType, status: "running", started_at: new Date().toISOString(), idempotency_key: key }).select("id").single();
  if (runError) return { status: runError.code === "23505" ? "duplicate" : "unavailable", agentId };

  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { data: costs, error: costError } = await service.from("company_runs").select("agent_id, estimated_cost_usd").gte("created_at", today);
  if (costError) {
    await failAgentRun(service, agent, run.id, "budget_unavailable", "Budget ledger unavailable; run stopped safely.");
    return { status: "failed", reason: "budget_unavailable", agentId, runId: run.id };
  }
  const companyCost = (costs ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const agentCost = (costs ?? []).filter((row) => row.agent_id === agent.id).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  if (companyCost >= Number(settings.max_daily_ai_spend_usd) || agentCost >= Number(agent.daily_budget_usd)) {
    await Promise.all([
      service.from("company_runs").update({ status: "budget_exhausted", summary: "Daily AI budget reached.", completed_at: new Date().toISOString() }).eq("id", run.id),
      service.from("company_agents").update({ last_run_at: new Date().toISOString(), next_run_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", agent.id),
      audit(service, { actorType: "system", actorId: "budget", eventType: "run.blocked", objectType: "company_run", objectId: run.id, details: { companyCost, agentCost } }),
    ]);
    return { status: "budget_exhausted", agentId, runId: run.id };
  }

  let metrics;
  try {
    metrics = await loadCompanyMetrics(service);
  } catch {
    await failAgentRun(service, agent, run.id, "metrics_unavailable", "Verified metrics were unavailable; no action was executed.");
    return { status: "failed", reason: "metrics_unavailable", agentId, runId: run.id };
  }
  const { data: goals, error: goalsError } = await service.from("company_goals").select("id, title, metric, target_value, current_value, unit, owner_agent_id, ends_at").eq("status", "active").or(`owner_agent_id.is.null,owner_agent_id.eq.${agent.id}`).order("created_at", { ascending: false }).limit(10);
  if (goalsError) {
    await failAgentRun(service, agent, run.id, "goals_unavailable", "Company goals were unavailable; no action was executed.");
    return { status: "failed", reason: "goals_unavailable", agentId, runId: run.id };
  }
  const measuredGoals = (goals ?? []).map((goal) => {
    const measured = companyMetricValue(goal.metric, metrics);
    return measured === null ? goal : { ...goal, current_value: measured };
  });
  await Promise.all(measuredGoals.flatMap((goal) => Number(goal.current_value) === Number((goals ?? []).find((item) => item.id === goal.id)?.current_value) ? [] : [
    service.from("company_goals").update({ current_value: goal.current_value, status: Number(goal.current_value) >= Number(goal.target_value) ? "achieved" : "active", updated_at: new Date().toISOString() }).eq("id", goal.id),
  ]));
  let agentContext: Record<string, unknown>;
  try {
    agentContext = await loadAgentContext(service, agent.id);
  } catch {
    await failAgentRun(service, agent, run.id, "context_unavailable", "Agent-specific evidence was unavailable; no action was executed.");
    return { status: "failed", reason: "context_unavailable", agentId, runId: run.id };
  }
  const prePlanRefs = await currentCompanyDailyPlanRefs(service);
  const evidenceFingerprint = companyAgentEvidenceFingerprint({
    agentId: agent.id,
    localDate: ownerBriefSchedule().localDate,
    planId: prePlanRefs.planId,
    experimentId: prePlanRefs.experimentId,
    metrics,
    agentContext,
  });
  if (triggerType === "schedule") {
    const prior = await service.from("company_runs")
      .select("input")
      .eq("agent_id", agent.id)
      .in("status", ["completed", "waiting_approval"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const priorInput = prior.data?.input && typeof prior.data.input === "object" && !Array.isArray(prior.data.input)
      ? prior.data.input as Record<string, unknown>
      : null;
    if (!prior.error && priorInput?.evidenceFingerprint === evidenceFingerprint) {
      const completedAt = new Date().toISOString();
      await Promise.all([
        service.from("company_runs").update({
          status: "completed",
          summary: "No verified company evidence changed; the agent remained quiet.",
          input: { metrics, goals: measuredGoals, dailyPlanId: prePlanRefs.planId, experimentId: prePlanRefs.experimentId, evidenceFingerprint },
          output: { suppressed: true, reason: "evidence_unchanged" },
          completed_at: completedAt,
        }).eq("id", run.id),
        service.from("company_agents").update({ last_run_at: completedAt, next_run_at: new Date(Date.now() + agent.schedule_minutes * 60_000).toISOString(), consecutive_failures: 0, updated_at: completedAt }).eq("id", agent.id),
        audit(service, { actorType: "system", actorId: "evidence_gate", eventType: "run.suppressed", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, reason: "evidence_unchanged", dailyPlanId: prePlanRefs.planId, experimentId: prePlanRefs.experimentId } }),
      ]);
      return { status: "skipped", reason: "evidence_unchanged", agentId, runId: run.id };
    }
  }
  const { key: apiKey } = deepseekKey();
  if (!apiKey) {
    await failAgentRun(service, agent, run.id, "not_configured", "DeepSeek is not configured.");
    return { status: "failed", reason: "not_configured", agentId, runId: run.id };
  }

  try {
    const messageInput = { label: agent.label, mission: agent.mission, allowedActions: agent.allowed_actions, goals: measuredGoals, metrics, agentContext, mode: settings.mode };
    const completion = await requestCompanyAgentAnalysis({ apiKey, messages: messageInput });
    const output = parseCompanyAgentOutput(completion.text)!;
    const planState = agent.id === "ceo"
      ? await ensureCompanyDailyPlan(service, output.dailyPlan, metrics)
      : null;
    const planRefs = planState
      ? { planId: planState.plan.id, experimentId: planState.experiment?.id ?? null }
      : prePlanRefs;
    const currentWorkOrder = planState?.workOrder
      ? assignmentForAgent(planState.workOrder, agent.id)
      : agentContext.currentWorkOrder;
    const experimentTrackingUrl = currentWorkOrder && typeof currentWorkOrder === "object" && !Array.isArray(currentWorkOrder)
      && typeof (currentWorkOrder as Record<string, unknown>).trackingUrl === "string"
      ? (currentWorkOrder as Record<string, unknown>).trackingUrl as string
      : null;
    const engineeringCircuitOpen = output.actions.some((action) => action.type === "queue_engineering_work")
      ? await engineeringConnectorCircuitOpen(service)
      : false;
    let engineeringActionOpen = output.actions.some((action) => action.type === "queue_engineering_work")
      ? await hasOpenEngineeringAction(service)
      : false;
    let waitingApproval = false;
    let completedActions = 0;
    let executionQueued = 0;
    let acceptedWorkActions = 0;
    const ownerDecisions: Array<{ id: string; agent_id: string; action_type: string; risk: string; title: string; rationale: string }> = [];
    for (const [index, proposed] of output.actions.entries()) {
      if (!isCompanyActionType(proposed.type)) continue;
      if (!workOrderAllowsAction(currentWorkOrder, proposed.type, output.health)) {
        await audit(service, { actorType: "system", actorId: "work_order_validator", eventType: "action.dropped", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "outside_current_work_order" } });
        continue;
      }
      if (!agentMayPropose(proposed.type, agent.allowed_actions)) {
        await audit(service, { actorType: "system", actorId: "allowlist_validator", eventType: "action.dropped", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "outside_agent_allowlist" } });
        continue;
      }
      if (proposed.type === "queue_engineering_work" && engineeringCircuitOpen && triggerType !== "manual") {
        await audit(service, { actorType: "system", actorId: "connector_circuit", eventType: "action.suppressed", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "recent_permanent_connector_failure", cooldownMinutes: ENGINEERING_CIRCUIT_COOLDOWN_MS / 60_000 } });
        continue;
      }
      if (proposed.type === "queue_engineering_work" && engineeringActionOpen) {
        await audit(service, { actorType: "system", actorId: "engineering_deduplicator", eventType: "action.suppressed", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "engineering_action_already_open" } });
        continue;
      }
      const standingApproval = proposed.type === "send_customer_email" ? settings.autonomous_customer_emails : proposed.type === "publish_social_content" ? settings.autonomous_social_posts : false;
      const decision = actionDecision({ actionType: proposed.type, mode: settings.mode, autonomy: agent.autonomy, allowedActions: agent.allowed_actions, standingApproval });
      const canExecute = decision.canExecute;
      const connectorAction = ["send_customer_email", "publish_social_content", "queue_engineering_work"].includes(proposed.type);
      if (connectorAction || proposed.type === "prepare_social_content") {
        try {
          if (proposed.type === "send_customer_email") normalizeCompanyEmail(proposed.payload ?? {});
          else if (proposed.type === "prepare_social_content") normalizePreparedSocialContent(proposed.payload ?? {});
          else if (proposed.type === "publish_social_content") {
            const connector = socialConnector();
            if (connector?.provider === "instagram") normalizeInstagramPublication(proposed.payload ?? {}, connector.site);
            else normalizeSocialPosts(proposed.payload ?? {});
          }
          else normalizeEngineeringJob(proposed.payload ?? {});
        } catch {
          await audit(service, { actorType: "system", actorId: "payload_validator", eventType: "action.dropped", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "invalid_payload" } });
          continue;
        }
      }
      const actionPayload = proposed.type === "draft_campaign" && experimentTrackingUrl
        ? { ...(proposed.payload ?? {}), content: withExperimentTrackingLink(proposed.payload?.content, experimentTrackingUrl) }
        : proposed.type === "prepare_social_content"
          ? withPreparedSocialTracking(proposed.payload ?? {}, experimentTrackingUrl)
          : proposed.payload ?? {};
      if (proposed.type === "draft_campaign" && experimentTrackingUrl && (!("content" in actionPayload) || !actionPayload.content)) {
        await audit(service, { actorType: "system", actorId: "payload_validator", eventType: "action.dropped", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "invalid_payload" } });
        continue;
      }
      const deliverableKey = experimentDeliverableKey({ experimentId: planRefs.experimentId, agentId: agent.id, actionType: proposed.type });
      if (deliverableKey) {
        const existingDeliverable = await service.from("company_actions")
          .select("id,payload")
          .eq("experiment_id", planRefs.experimentId)
          .eq("agent_id", agent.id)
          .eq("action_type", proposed.type)
          .in("status", ["proposed", "approved", "executing", "delegated", "completed"])
          .limit(1)
          .maybeSingle();
        if (existingDeliverable.error) throw existingDeliverable.error;
        if (existingDeliverable.data) {
          let stillValid = true;
          if (proposed.type === "prepare_social_content") {
            try {
              normalizePreparedSocialContent(existingDeliverable.data.payload && typeof existingDeliverable.data.payload === "object" && !Array.isArray(existingDeliverable.data.payload)
                ? existingDeliverable.data.payload as Record<string, unknown>
                : {});
            } catch {
              stillValid = false;
              await service.from("company_actions").update({
                status: "rejected",
                result: { stored: true, published: false, superseded: true, reason: "copy_quality_policy_updated" },
                executed_at: new Date().toISOString(),
              }).eq("id", existingDeliverable.data.id).eq("status", "completed");
              await audit(service, { actorType: "system", actorId: "copy_quality_gate", eventType: "action.rejected", objectType: "company_action", objectId: existingDeliverable.data.id, details: { reason: "copy_quality_policy_updated", experimentId: planRefs.experimentId } });
            }
          }
          if (!stillValid) {
            // The current proposal is validated below and may replace the
            // superseded artifact using a content-bound revision key.
          } else {
          await audit(service, { actorType: "system", actorId: "deliverable_gate", eventType: "action.suppressed", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "experiment_deliverable_already_exists", experimentId: planRefs.experimentId } });
          continue;
          }
        }
      }
      const deliverableRevision = createHash("sha256").update(JSON.stringify(actionPayload)).digest("hex").slice(0, 16);
      const actionKey = deliverableKey ? `${deliverableKey}:${deliverableRevision}` : (connectorAction
        ? `company:${agent.id}:${proposed.type}:${createHash("sha256").update(JSON.stringify(actionPayload)).digest("hex").slice(0, 32)}`
        : `${key}:${index}:${proposed.type}`);
      const connectorReady = proposed.type === "send_customer_email"
        ? Boolean(process.env.RESEND_API_KEY && process.env.NUDGE_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET)
        : proposed.type === "publish_social_content"
          ? Boolean(socialConnector())
          : proposed.type === "queue_engineering_work"
            ? Boolean(engineeringConnectorProvider())
            : true;
      const queuedConnector = canExecute && connectorAction && connectorReady;
      const effectiveExecution = canExecute && (!connectorAction || connectorReady);
      const insertedAction = await service.from("company_actions").insert({ run_id: run.id, agent_id: agent.id, daily_plan_id: planRefs.planId, experiment_id: planRefs.experimentId, action_type: proposed.type, risk: decision.risk, status: queuedConnector ? "approved" : effectiveExecution ? "executing" : "proposed", requires_approval: decision.requiresApproval || !effectiveExecution, title: proposed.title, rationale: proposed.rationale, payload: actionPayload, idempotency_key: actionKey }).select("id,agent_id,action_type,risk,title,rationale").single();
      if (insertedAction.error?.code === "23505" && deliverableKey) {
        await audit(service, { actorType: "system", actorId: "deliverable_gate", eventType: "action.suppressed", objectType: "company_run", objectId: run.id, details: { agentId: agent.id, actionType: proposed.type, reason: "experiment_deliverable_already_exists", experimentId: planRefs.experimentId } });
        continue;
      }
      if (insertedAction.error) throw insertedAction.error;
      const action = insertedAction.data;
      if (!action) continue;
      if (proposed.type === "queue_engineering_work") engineeringActionOpen = true;
      acceptedWorkActions += 1;
      if (queuedConnector) {
        executionQueued += 1;
      } else if (effectiveExecution) {
        let result: Record<string, unknown> = proposed.type === "prepare_social_content" ? { stored: true, published: false } : { stored: true };
        if (proposed.type === "send_owner_alert") {
          const alertTopic = companyOwnerAlertTopic(`${proposed.title}\n${proposed.rationale}`);
          const duplicate = await ownerAlertRecentlySent(service, alertTopic);
          result = duplicate
            ? { delivery: { sent: false, reason: "duplicate_suppressed" }, alertTopic, suppressed: true }
            : { delivery: await sendOwnerTelegramAlert(`🦡 ${agent.label}\n${proposed.title}\n${proposed.rationale}`), alertTopic, suppressed: false };
        }
        await service.from("company_actions").update({ status: "completed", result, executed_at: new Date().toISOString() }).eq("id", action.id);
        completedActions += 1;
        const preparedFormat = proposed.type === "prepare_social_content"
          ? (actionPayload as { ugc?: { format?: unknown } }).ugc?.format
          : null;
        if (preparedFormat === "ai_founder_avatar") {
          let rendererReady = false;
          try { rendererReady = Boolean(heyGenConnector()); } catch { rendererReady = false; }
          if (rendererReady) {
            const renderDecision = actionDecision({ actionType: "queue_ugc_video", mode: settings.mode, autonomy: agent.autonomy, allowedActions: ["queue_ugc_video"] });
            const renderPayload = { preparedActionId: action.id, title: proposed.title.slice(0, 120), prepared: actionPayload };
            const render = await service.from("company_actions").insert({
              run_id: run.id,
              agent_id: agent.id,
              daily_plan_id: planRefs.planId,
              experiment_id: planRefs.experimentId,
              action_type: "queue_ugc_video",
              risk: renderDecision.risk,
              status: "proposed",
              requires_approval: true,
              title: `Render AI-avatar video: ${proposed.title}`.slice(0, 180),
              rationale: "Creates one private 9:16 video from the exact prepared script and spends HeyGen provider credits. Publishing remains a separate owner decision.",
              payload: renderPayload,
              idempotency_key: `company:${agent.id}:queue_ugc_video:${action.id}`,
            }).select("id,agent_id,action_type,risk,title,rationale").maybeSingle();
            if (render.data) {
              waitingApproval = true;
              ownerDecisions.push(render.data);
            }
          } else {
            await audit(service, { actorType: "system", actorId: "ugc_renderer", eventType: "action.suppressed", objectType: "company_action", objectId: action.id, details: { reason: "renderer_not_configured", provider: "heygen" } });
          }
        }
      } else {
        waitingApproval = true;
        ownerDecisions.push(action);
      }
    }
    const estimatedCost = estimatedAiCostUsd({ provider: "deepseek", model: completion.model, promptTokens: completion.promptTokens, completionTokens: completion.completionTokens });
    const experimentActivation = acceptedWorkActions > 0 && agent.id !== "ceo" && planRefs.experimentId
      ? service.from("company_experiments").update({ status: "running", starts_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", planRefs.experimentId).eq("status", "planned")
      : Promise.resolve({ error: null });
    await Promise.all([
      service.from("company_runs").update({ status: waitingApproval ? "waiting_approval" : "completed", summary: output.summary, input: { metrics, goals: measuredGoals, agentContext, dailyPlanId: planRefs.planId, experimentId: planRefs.experimentId, evidenceFingerprint }, output, estimated_cost_usd: estimatedCost, prompt_tokens: completion.promptTokens, completion_tokens: completion.completionTokens, latency_ms: completion.latencyMs, completed_at: new Date().toISOString() }).eq("id", run.id),
      service.from("company_agents").update({ last_run_at: new Date().toISOString(), next_run_at: new Date(Date.now() + agent.schedule_minutes * 60_000).toISOString(), consecutive_failures: 0, updated_at: new Date().toISOString() }).eq("id", agent.id),
      recordAiUsage({ service, feature: `company_os_${agent.id}`, provider: "deepseek", model: completion.model, promptTokens: completion.promptTokens, completionTokens: completion.completionTokens, latencyMs: completion.latencyMs, metadata: { runId: run.id, trigger: triggerType, attempts: completion.attempts, recovered: completion.priorErrorCodes.length > 0, attemptErrors: completion.priorErrorCodes.join(",") || null } }),
      audit(service, { actorType: "agent", actorId: agent.id, eventType: "run.completed", objectType: "company_run", objectId: run.id, details: { health: output.health, completedActions, executionQueued, waitingApproval } }),
      experimentActivation,
      ...ownerDecisions.map((action) => sendOwnerTelegramDecision(action)),
    ]);
    return { status: waitingApproval ? "waiting_approval" : "completed", agentId, runId: run.id, summary: output.summary, completedActions, executionQueued };
  } catch (error) {
    const code = error instanceof DeepSeekCompletionError ? error.code : "run_failed";
    const promptTokens = error instanceof DeepSeekCompletionError ? error.promptTokens : 0;
    const completionTokens = error instanceof DeepSeekCompletionError ? error.completionTokens : 0;
    const latencyMs = error instanceof DeepSeekCompletionError ? error.latencyMs : 0;
    const attempts = error instanceof DeepSeekCompletionError ? error.attempts : 1;
    const attemptErrors = error instanceof DeepSeekCompletionError ? error.attemptCodes.join(",") : code;
    await Promise.all([
      failAgentRun(service, agent, run.id, code, "Agent analysis failed safely; no action was executed."),
      service.from("company_runs").update({ input: { metrics, goals: measuredGoals, agentContext, dailyPlanId: prePlanRefs.planId, experimentId: prePlanRefs.experimentId, evidenceFingerprint }, prompt_tokens: promptTokens, completion_tokens: completionTokens, latency_ms: latencyMs }).eq("id", run.id),
      recordAiUsage({ service, feature: `company_os_${agent.id}`, provider: "deepseek", model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash", promptTokens, completionTokens, latencyMs, success: false, errorCode: code, metadata: { runId: run.id, trigger: triggerType, attempts, attemptErrors } }),
    ]);
    return { status: "failed", reason: code, agentId, runId: run.id };
  }
}
