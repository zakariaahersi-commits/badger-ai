import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerBriefSchedule } from "./owner-brief-format.ts";
import type { CompanyDailyPlanProposal, CompanyMetrics } from "./types.ts";
import { buildCompanyDailyWorkOrder } from "./work-order.ts";
import { selectGrowthPlaybook } from "./growth-playbooks.ts";

function sourceCode(localDate: string, channel: string): string {
  return `badger-${localDate.replaceAll("-", "")}-${channel}`.slice(0, 64);
}

const UNLAUNCHED_EXPERIMENT_MAX_AGE_MS = 36 * 60 * 60_000;

function resultHasExposure(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const observations = (value as { latestObservations?: unknown }).latestObservations;
  return Array.isArray(observations) && observations.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return Number((item as { value?: unknown }).value) > 0;
  });
}

export function shouldExpireUnlaunchedExperiment(input: {
  planLocalDate: string;
  currentLocalDate: string;
  experimentCreatedAt: string;
  result?: unknown;
  externalExecutions: number;
  now: Date;
}): boolean {
  if (input.planLocalDate >= input.currentLocalDate || input.externalExecutions > 0 || resultHasExposure(input.result)) return false;
  const createdAt = Date.parse(input.experimentCreatedAt);
  return Number.isFinite(createdAt) && input.now.getTime() - createdAt >= UNLAUNCHED_EXPERIMENT_MAX_AGE_MS;
}

export async function closeSupersededDailyPlans(service: SupabaseClient, localDate: string, now = new Date()) {
  const prior = await service.from("company_daily_plans")
    .select("id,local_date")
    .in("status", ["draft", "active"])
    .lt("local_date", localDate)
    .order("local_date", { ascending: true });
  if (prior.error) throw new Error("daily_plan_reconciliation_failed");
  const planIds = (prior.data ?? []).map((plan) => Number(plan.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!planIds.length) return { planIds: [], stoppedExperimentIds: [] };

  const reconciledAt = now.toISOString();
  const experiments = await service.from("company_experiments").update({
    status: "stopped",
    ends_at: reconciledAt,
    learning: `Superseded by the ${localDate} daily plan before its success threshold was reached.`,
    updated_at: reconciledAt,
  }).in("daily_plan_id", planIds)
    .in("status", ["planned", "running", "measuring"])
    .select("id");
  if (experiments.error) throw new Error("daily_plan_reconciliation_failed");

  const stoppedExperimentIds = (experiments.data ?? []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (stoppedExperimentIds.length) {
    const links = await service.from("company_experiment_signals").select("signal_id").in("experiment_id", stoppedExperimentIds);
    if (links.error) throw new Error("daily_plan_reconciliation_failed");
    const signalIds = (links.data ?? []).map((row) => Number(row.signal_id)).filter((id) => Number.isInteger(id) && id > 0);
    if (signalIds.length) {
      const released = await service.from("company_trend_signals").update({ status: "watch", updated_at: reconciledAt }).in("id", signalIds).eq("status", "testing");
      if (released.error) throw new Error("daily_plan_reconciliation_failed");
    }
  }

  const plans = await service.from("company_daily_plans").update({ status: "abandoned", updated_at: reconciledAt })
    .in("id", planIds)
    .in("status", ["draft", "active"]);
  if (plans.error) throw new Error("daily_plan_reconciliation_failed");

  await service.from("company_audit_log").insert({
    actor_type: "system",
    actor_id: "company_daily_plan",
    event_type: "daily_plan.superseded",
    object_type: "company_daily_plan",
    object_id: String(planIds.at(-1)),
    details: { localDate, planIds, stoppedExperimentIds },
  });
  return { planIds, stoppedExperimentIds };
}

export function fallbackDailyPlan(metrics: CompanyMetrics): CompanyDailyPlanProposal {
  if (metrics.blockingBugs > 0 || metrics.aiFailuresToday > 1) {
    return {
      objective: "Protect the path from onboarding to a usable Day 1 plan.",
      bottleneck: `${metrics.blockingBugs} blocking bugs and ${metrics.aiFailuresToday} AI failures are verified today.`,
      hypothesis: "If the critical journey is reliable, more founders who start onboarding will reach a usable plan instead of dropping because the product failed.",
      leadingSignal: "A clean production journey and no unresolved blocking failure.",
      stopCondition: "Stop acquisition work if a blocking journey failure is reproduced; reopen only after a verified fix.",
      experiment: {
        title: "Protect the first value moment",
        audience: "Founders currently entering Badger onboarding",
        channel: "product",
        cta: "Complete onboarding and view Day 1",
        targetMetric: "plan_reveal_viewed",
        successThreshold: 1,
      },
    };
  }
  const onboardingLandings = metrics.onboardingLanded7d
    ?? metrics.onboardingSteps7d?.find((step) => step.step === 1)?.viewed
    ?? 0;
  if (onboardingLandings >= 5 && metrics.onboardingStarted7d / Math.max(1, onboardingLandings) < 0.5) {
    return {
      objective: "Turn qualified onboarding visits into a first honest answer.",
      bottleneck: `${onboardingLandings} founders opened the current diagnostic but only ${metrics.onboardingStarted7d} answered the first question in seven days.`,
      hypothesis: "If the first screen makes the time, value, price and reversibility obvious, more qualified visitors will choose their starting point without weakening the deeper commitment journey.",
      leadingSignal: "At least half of genuine onboarding landings become first answers.",
      stopCondition: "Keep the deeper journey unchanged until five genuine starts; change the entry treatment only if the next 20 landings remain below 50% start rate.",
      experiment: {
        title: "Make the first answer easy",
        audience: "Qualified founders who open the Badger diagnostic",
        channel: "product",
        cta: "Choose your starting point",
        targetMetric: "onboarding_start_rate",
        successThreshold: 0.5,
      },
    };
  }
  if (metrics.onboardingStarted7d >= 5 && metrics.planRevealViewed7d / Math.max(1, metrics.onboardingStarted7d) < 0.35) {
    const drop = metrics.onboardingLargestDrop7d;
    const dropEvidence = drop
      ? ` The largest verified screen loss is ${drop.fromScreen} → ${drop.toScreen}: ${drop.fromViewed} viewers became ${drop.toViewed} (${Math.round(drop.retentionRate * 100)}% retained).`
      : "";
    const exactChange = drop
      ? `If the transition from ${drop.fromScreen} to ${drop.toScreen} is reduced to one clear decision, more existing intent will reach the plan before more traffic is purchased.`
      : "If the largest onboarding drop is removed, more existing intent will reach the plan before more traffic is purchased.";
    return {
      objective: "Get more interested founders to the personalised plan they came to see.",
      bottleneck: `${metrics.onboardingStarted7d} onboarding starts produced ${metrics.planRevealViewed7d} plan reveals in seven days.${dropEvidence}`,
      hypothesis: exactChange,
      leadingSignal: "Plan reveals per genuine onboarding start improve on the next cohort.",
      stopCondition: "Stop after one bounded funnel change if the next 20 genuine starts show no improvement.",
      experiment: {
        title: "Reach the plan",
        audience: "Idea-stage founders who start the Badger diagnostic",
        channel: "product",
        cta: "See your 28-day plan",
        targetMetric: "plan_reveal_rate",
        successThreshold: 0.35,
      },
    };
  }
  return {
    objective: `Move from ${metrics.paidFounders}/10 to the next verified paying founder.`,
    bottleneck: `${metrics.paywallViewed7d} paywall views and ${metrics.checkoutStarted7d} Checkout starts were verified in seven days.`,
    hypothesis: "If five people who already know the founder receive one short personal question, interested people will ask for the link and start the diagnostic.",
    leadingSignal: "Replies first, then attributed onboarding starts, paywall views and payments.",
    stopCondition: "Stop after five messages. Do not run another batch until replies and attributed product behaviour have been reviewed.",
    experiment: {
      title: "Five warm founder conversations",
      audience: "Five people who already know the founder and have shown interest in starting something",
      channel: "warm_dm",
      cta: "Ask whether they want the link; share it only after they say yes",
      targetMetric: "attributed_onboarding_starts",
      successThreshold: 1,
    },
  };
}

export async function ensureCompanyDailyPlan(
  service: SupabaseClient,
  proposal: CompanyDailyPlanProposal | undefined,
  metrics: CompanyMetrics,
  now = new Date(),
) {
  const localDate = ownerBriefSchedule(now).localDate;
  const today = await service.from("company_daily_plans")
    .select("id,local_date,status,objective,bottleneck,hypothesis,leading_signal,stop_condition,owner_summary,created_at")
    .eq("local_date", localDate)
    .maybeSingle();
  if (today.error) throw new Error("daily_plan_unavailable");

  // An experiment is a learning loop, not a calendar-day disposable. Carry the
  // latest active plan across midnight until its measured target is reached or
  // it is deliberately stopped. Replacing it every morning destroys attribution
  // and lets the agent change strategy before the agreed evidence threshold.
  const carried = today.data ? { data: null, error: null } : await service.from("company_daily_plans")
    .select("id,local_date,status,objective,bottleneck,hypothesis,leading_signal,stop_condition,owner_summary,created_at")
    .in("status", ["draft", "active"])
    .order("local_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (carried.error) throw new Error("daily_plan_unavailable");
  const existing = today.data ?? carried.data;
  let forceFallback = false;
  if (existing) {
    const experiment = await service.from("company_experiments")
      .select("id,daily_plan_id,title,status,channel,source_code,target_metric,success_threshold,stop_condition,starts_at,result,created_at")
      .eq("daily_plan_id", existing.id)
      .in("status", ["planned", "running", "measuring"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (experiment.error) throw new Error("daily_plan_unavailable");
    if (!experiment.data) {
      // A completed/stopped experiment closes the work order for the rest of
      // that local day. The next morning may create the next hypothesis.
      if (existing.local_date === localDate) return { plan: existing, experiment: null, workOrder: null, created: false };
      await service.from("company_daily_plans").update({ status: "abandoned", updated_at: new Date().toISOString() }).eq("id", existing.id).in("status", ["draft", "active"]);
    } else {
      const external = existing.local_date < localDate
        ? await service.from("company_actions")
          .select("id", { count: "exact", head: true })
          .eq("experiment_id", experiment.data.id)
          .in("action_type", ["publish_social_content", "send_customer_email", "reply_company_email"])
          .eq("status", "completed")
        : { count: 0, error: null };
      if (external.error) throw new Error("daily_plan_unavailable");
      if (shouldExpireUnlaunchedExperiment({
        planLocalDate: existing.local_date,
        currentLocalDate: localDate,
        experimentCreatedAt: experiment.data.created_at,
        result: experiment.data.result,
        externalExecutions: external.count ?? 0,
        now,
      })) {
        await closeSupersededDailyPlans(service, localDate, now);
        forceFallback = true;
      } else {
      const workOrder = buildCompanyDailyWorkOrder({ ...existing, experiment: experiment.data });
      if (workOrder) {
        const actions = await service.from("company_actions").select("id", { count: "exact", head: true }).eq("daily_plan_id", existing.id);
        if (!actions.error && (actions.count ?? 0) === 0) {
          await service.from("company_agents").update({ next_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", workOrder.assignments.filter((item) => item.agentId !== "ceo").map((item) => item.agentId));
        }
      }
      return { plan: existing, experiment: experiment.data, workOrder, created: false };
      }
    }
  }

  // Once an experiment spent 36 hours producing only drafts, choose from fresh
  // verified funnel evidence instead of asking the model to paraphrase it again.
  const plan = forceFallback ? fallbackDailyPlan(metrics) : proposal ?? fallbackDailyPlan(metrics);
  const playbook = selectGrowthPlaybook(metrics, plan);
  const trendSignals = await service.from("company_trend_signals")
    .select("id")
    .in("status", ["fresh", "watch"])
    .gte("score", 18)
    .gte("badger_relevance", 4)
    .order("score", { ascending: false })
    .limit(3);
  if (trendSignals.error) throw new Error("daily_plan_unavailable");
  const goal = await service.from("company_goals")
    .select("id")
    .eq("status", "active")
    .eq("metric", "paying_founders")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (goal.error) throw new Error("daily_plan_unavailable");

  const inserted = await service.from("company_daily_plans").insert({
    local_date: localDate,
    goal_id: goal.data?.id ?? null,
    status: "active",
    objective: plan.objective,
    bottleneck: plan.bottleneck,
    hypothesis: plan.hypothesis,
    leading_signal: plan.leadingSignal,
    stop_condition: plan.stopCondition,
    owner_summary: `${plan.objective} ${plan.leadingSignal}`.slice(0, 2000),
    source_metrics: metrics,
    created_by_agent_id: "ceo",
  }).select("id,local_date,status,objective,bottleneck,hypothesis,leading_signal,stop_condition,owner_summary").single();
  if (inserted.error || !inserted.data) throw new Error("daily_plan_unavailable");

  const experiment = await service.from("company_experiments").insert({
    daily_plan_id: inserted.data.id,
    owner_agent_id: plan.experiment.channel === "product" ? "growth" : "content",
    status: "planned",
    title: plan.experiment.title,
    hypothesis: plan.hypothesis,
    audience: plan.experiment.audience,
    channel: plan.experiment.channel,
    cta: plan.experiment.cta,
    source_code: sourceCode(localDate, plan.experiment.channel),
    target_metric: plan.experiment.targetMetric,
    success_threshold: plan.experiment.successThreshold,
    stop_condition: plan.stopCondition,
    playbook_slug: playbook.slug,
    playbook_version: playbook.version,
  }).select("id,daily_plan_id,title,status,channel,source_code,target_metric,success_threshold,stop_condition,starts_at,result,playbook_slug,playbook_version").single();
  if (experiment.error || !experiment.data) throw new Error("daily_plan_unavailable");
  const signalIds = (trendSignals.data ?? []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (signalIds.length) {
    const linked = await service.from("company_experiment_signals").insert(signalIds.map((signalId) => ({ experiment_id: experiment.data.id, signal_id: signalId })));
    if (linked.error) throw new Error("daily_plan_unavailable");
    await service.from("company_trend_signals").update({ status: "testing", updated_at: new Date().toISOString() }).in("id", signalIds).in("status", ["fresh", "watch"]);
  }
  const workOrder = buildCompanyDailyWorkOrder({ ...inserted.data, experiment: experiment.data });
  if (workOrder) {
    const assignedAgents = workOrder.assignments.filter((item) => item.agentId !== "ceo").map((item) => item.agentId);
    const scheduledAt = new Date().toISOString();
    await Promise.all([
      service.from("company_agents").update({ next_run_at: scheduledAt, updated_at: scheduledAt }).in("id", assignedAgents),
      service.from("company_audit_log").insert({
        actor_type: "system",
        actor_id: "company_work_order",
        event_type: "work_order.activated",
        object_type: "company_daily_plan",
        object_id: String(inserted.data.id),
        details: { experimentId: experiment.data.id, channel: experiment.data.channel, assignedAgents },
      }),
    ]);
  }
  return { plan: inserted.data, experiment: experiment.data, workOrder, created: true };
}

export async function currentCompanyDailyPlanRefs(service: SupabaseClient) {
  const plan = await service.from("company_daily_plans")
    .select("id")
    .in("status", ["draft", "active"])
    .order("local_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plan.error) throw new Error("daily_plan_unavailable");
  if (!plan.data) return { planId: null, experimentId: null };
  const experiment = await service.from("company_experiments")
    .select("id")
    .eq("daily_plan_id", plan.data.id)
    .in("status", ["planned", "running", "measuring"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (experiment.error) throw new Error("daily_plan_unavailable");
  return { planId: plan.data.id, experimentId: experiment.data?.id ?? null };
}
