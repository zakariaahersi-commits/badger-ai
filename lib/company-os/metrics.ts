import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_ONBOARDING_FLOW_VERSION } from "../onboarding-version.ts";
import { COMPANY_METRIC_IDS, type CompanyMetricId, type CompanyMetrics } from "./types.ts";

export function isCompanyMetricId(value: string): value is CompanyMetricId {
  return (COMPANY_METRIC_IDS as readonly string[]).includes(value);
}

function count(value: number | null): number { return value ?? 0; }
function amount(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
type FunnelEventRow = { event_name: string; user_id: string | null; anonymous_id: string | null; properties?: unknown; created_at?: string };

function actorKey(row: Pick<FunnelEventRow, "user_id" | "anonymous_id">): string | null {
  if (row.user_id) return `user:${row.user_id}`;
  if (row.anonymous_id) return `anonymous:${row.anonymous_id}`;
  return null;
}

function eventProperties(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function uniqueEventActors(rows: Array<{ event_name: string; user_id: string | null; anonymous_id: string | null }>, eventName: string): number {
  return new Set(rows.flatMap((row) => {
    if (row.event_name !== eventName) return [];
    if (row.user_id) return [`user:${row.user_id}`];
    if (row.anonymous_id) return [`anonymous:${row.anonymous_id}`];
    return [];
  })).size;
}

export function onboardingStepFunnel(rows: FunnelEventRow[]) {
  const steps = new Map<string, { screen: string; phase: string; step: number; viewed: Set<string>; completed: Set<string> }>();
  for (const row of rows) {
    if (row.event_name !== "onboarding_step_viewed" && row.event_name !== "onboarding_step_completed") continue;
    const actor = actorKey(row);
    if (!actor) continue;
    const properties = eventProperties(row.properties);
    const screen = typeof properties.screen === "string" ? properties.screen.trim().slice(0, 80) : "";
    const ordinal = Number(properties.step);
    if (!screen || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > 40) continue;
    const current = steps.get(screen) ?? {
      screen,
      phase: typeof properties.phase === "string" ? properties.phase.trim().slice(0, 80) : "",
      step: ordinal,
      viewed: new Set<string>(),
      completed: new Set<string>(),
    };
    current.step = Math.min(current.step, ordinal);
    if (row.event_name === "onboarding_step_viewed") current.viewed.add(actor);
    else current.completed.add(actor);
    steps.set(screen, current);
  }
  return [...steps.values()]
    .sort((left, right) => left.step - right.step || left.screen.localeCompare(right.screen))
    .map((item) => ({ screen: item.screen, phase: item.phase, step: item.step, viewed: item.viewed.size, completed: item.completed.size }));
}

export function latestOnboardingStepCohort(rows: FunnelEventRow[], expectedCohort?: string) {
  const groups = new Map<string, { cohort: string; rows: FunnelEventRow[]; actors: Set<string>; latestAt: number }>();
  for (const row of rows) {
    if (row.event_name !== "onboarding_step_viewed" && row.event_name !== "onboarding_step_completed") continue;
    const properties = eventProperties(row.properties);
    const flowVersion = typeof properties.flow_version === "string" && properties.flow_version.trim() ? properties.flow_version.trim().slice(0, 40) : null;
    const release = typeof properties.release === "string" && properties.release.trim() ? properties.release.trim().slice(0, 40) : null;
    const cohort = flowVersion ?? release;
    if (!cohort) continue;
    const group = groups.get(cohort) ?? { cohort, rows: [], actors: new Set<string>(), latestAt: 0 };
    group.rows.push(row);
    const actor = actorKey(row);
    if (actor) group.actors.add(actor);
    const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
    if (Number.isFinite(createdAt)) group.latestAt = Math.max(group.latestAt, createdAt);
    groups.set(cohort, group);
  }
  if (expectedCohort) {
    const selected = groups.get(expectedCohort);
    return selected
      ? { cohort: selected.cohort, rows: selected.rows, actorCount: selected.actors.size }
      : { cohort: expectedCohort, rows: [], actorCount: 0 };
  }
  const ordered = [...groups.values()].sort((left, right) => right.latestAt - left.latestAt || right.actors.size - left.actors.size);
  // Never fall back to a larger historical release: a small current cohort is
  // evidence that we need more observations, not permission to mix old UX.
  const selected = ordered[0] ?? null;
  return selected ? { cohort: selected.cohort, rows: selected.rows, actorCount: selected.actors.size } : { cohort: null, rows: [], actorCount: 0 };
}

function onboardingCohortName(row: FunnelEventRow): string | null {
  const properties = eventProperties(row.properties);
  const flowVersion = typeof properties.flow_version === "string" && properties.flow_version.trim() ? properties.flow_version.trim().slice(0, 40) : null;
  const release = typeof properties.release === "string" && properties.release.trim() ? properties.release.trim().slice(0, 40) : null;
  return flowVersion ?? release;
}

/**
 * Downstream events from an onboarding session did not historically carry the
 * flow version. Keep only events belonging to actors who entered the selected
 * cohort, at or after their first versioned step. Explicitly versioned events
 * from another flow are always excluded.
 */
export function onboardingCohortFunnelRows(rows: FunnelEventRow[], cohort: string | null): FunnelEventRow[] {
  if (!cohort) return [];
  const actorStartedAt = new Map<string, number>();
  for (const row of rows) {
    if (onboardingCohortName(row) !== cohort) continue;
    const actor = actorKey(row);
    if (!actor) continue;
    const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
    if (!Number.isFinite(createdAt)) continue;
    actorStartedAt.set(actor, Math.min(actorStartedAt.get(actor) ?? createdAt, createdAt));
  }
  return rows.filter((row) => {
    const explicitCohort = onboardingCohortName(row);
    if (explicitCohort) return explicitCohort === cohort;
    const actor = actorKey(row);
    const startedAt = actor ? actorStartedAt.get(actor) : undefined;
    const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
    return startedAt !== undefined && Number.isFinite(createdAt) && createdAt >= startedAt;
  });
}

export function isCustomerFacingAiFeature(feature: unknown): boolean {
  return typeof feature !== "string" || !feature.startsWith("company_os_");
}

export function largestOnboardingStepDrop(steps: ReturnType<typeof onboardingStepFunnel>) {
  let largest: { fromScreen: string; toScreen: string; fromViewed: number; toViewed: number; retentionRate: number } | null = null;
  for (let index = 0; index < steps.length - 1; index += 1) {
    const from = steps[index];
    const to = steps[index + 1];
    if (from.viewed < 3 || to.step <= from.step) continue;
    const retentionRate = Math.min(1, to.viewed / Math.max(1, from.viewed));
    const loss = from.viewed - to.viewed;
    const currentLoss = largest ? largest.fromViewed - largest.toViewed : -1;
    if (loss > currentLoss || (loss === currentLoss && retentionRate < (largest?.retentionRate ?? 1))) {
      largest = { fromScreen: from.screen, toScreen: to.screen, fromViewed: from.viewed, toViewed: to.viewed, retentionRate };
    }
  }
  return largest;
}

export async function loadCompanyMetrics(service: SupabaseClient): Promise<CompanyMetrics> {
  const now = Date.now();
  const since24h = new Date(now - 86_400_000).toISOString();
  const since7d = new Date(now - 7 * 86_400_000).toISOString();
  const since28d = new Date(now - 28 * 86_400_000).toISOString();
  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const [users, entitlements, paidFounders, testerAccess, newPaidFounders, funnelEvents, bugs, blocking, recoveries, events, tasks, messages, deliveries, usage] = await Promise.all([
    service.from("profiles").select("user_id", { count: "exact", head: true }),
    service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active"),
    service.from("entitlements").select("user_id", { count: "exact" }).eq("status", "active").not("stripe_payment_intent_id", "is", null),
    service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active").is("stripe_payment_intent_id", null),
    service.from("entitlements").select("user_id", { count: "exact", head: true }).eq("status", "active").not("stripe_payment_intent_id", "is", null).gte("granted_at", since24h),
    service.from("product_events").select("event_name, user_id, anonymous_id, properties, created_at")
      .in("event_name", ["onboarding_landed", "onboarding_started", "onboarding_account_captured", "onboarding_resume_scheduled", "onboarding_step_viewed", "onboarding_step_completed", "onboarding_completed", "plan_reveal_viewed", "plan_reveal_cta_clicked", "journey_save_viewed", "account_save_started", "account_save_completed", "paywall_viewed", "paywall_cta_clicked", "checkout_started"])
      .gte("created_at", since7d)
      .limit(10000),
    service.from("bug_reports").select("id", { count: "exact", head: true }).in("status", ["new", "triaged", "in_progress"]),
    service.from("bug_reports").select("id", { count: "exact", head: true }).eq("severity", "blocking").in("status", ["new", "triaged", "in_progress"]),
    service.from("checkout_recoveries").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
    service.from("product_events").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    service.from("product_events").select("id", { count: "exact", head: true }).eq("event_name", "task_completed").gte("created_at", since24h),
    service.from("product_events").select("id", { count: "exact", head: true }).eq("event_name", "coach_message_sent").gte("created_at", since24h),
    service.from("coach_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since24h),
    service.from("ai_usage_events").select("feature, estimated_cost_usd, success").gte("created_at", today).limit(10000),
  ]);
  const errors = [users, entitlements, paidFounders, testerAccess, newPaidFounders, funnelEvents, bugs, blocking, recoveries, events, tasks, messages, deliveries, usage].flatMap((result) => result.error ? [result.error.message] : []);
  if (errors.length) throw new Error(`company_metrics_unavailable:${errors[0]}`);
  const paidFounderIds = (paidFounders.data ?? []).flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []);
  const founderActivity = paidFounderIds.length
    ? await service.from("product_events").select("user_id, event_name, created_at")
      .in("user_id", paidFounderIds)
      .in("event_name", ["task_completed", "coach_message_sent"])
      .gte("created_at", since28d)
      .order("created_at", { ascending: true })
      .limit(10000)
    : { data: [], error: null };
  if (founderActivity.error) throw new Error(`company_metrics_unavailable:${founderActivity.error.message}`);
  const activatedFounderIds = new Set<string>();
  const activeDates = new Map<string, Set<string>>();
  for (const row of founderActivity.data ?? []) {
    if (typeof row.user_id !== "string" || typeof row.created_at !== "string") continue;
    if (row.event_name === "task_completed") activatedFounderIds.add(row.user_id);
    const dates = activeDates.get(row.user_id) ?? new Set<string>();
    dates.add(row.created_at.slice(0, 10));
    activeDates.set(row.user_id, dates);
  }
  const returningPaidFounders28d = [...activeDates.values()].filter((dates) => dates.size >= 2).length;
  const funnelRows = (funnelEvents.data ?? []) as FunnelEventRow[];
  const onboardingCohort = latestOnboardingStepCohort(funnelRows, CURRENT_ONBOARDING_FLOW_VERSION);
  const cohortFunnelRows = onboardingCohortFunnelRows(funnelRows, onboardingCohort.cohort);
  const onboardingSteps7d = onboardingStepFunnel(onboardingCohort.rows);
  const usageRows = usage.data ?? [];
  const customerAiRows = usageRows.filter((row) => isCustomerFacingAiFeature(row.feature));
  return {
    generatedAt: new Date().toISOString(), totalUsers: count(users.count), activeEntitlements: count(entitlements.count),
    paidFounders: count(paidFounders.count), testerAccess: count(testerAccess.count), newPaidFounders24h: count(newPaidFounders.count),
    onboardingLanded7d: uniqueEventActors(cohortFunnelRows, "onboarding_landed"), onboardingStarted7d: uniqueEventActors(cohortFunnelRows, "onboarding_started"), onboardingCaptured7d: uniqueEventActors(cohortFunnelRows, "onboarding_account_captured"), onboardingResumeScheduled7d: uniqueEventActors(cohortFunnelRows, "onboarding_resume_scheduled"), onboardingCompleted7d: uniqueEventActors(cohortFunnelRows, "onboarding_completed"),
    planRevealViewed7d: uniqueEventActors(cohortFunnelRows, "plan_reveal_viewed"), planRevealCtaClicked7d: uniqueEventActors(cohortFunnelRows, "plan_reveal_cta_clicked"), journeySaveViewed7d: uniqueEventActors(cohortFunnelRows, "journey_save_viewed"),
    accountSaveStarted7d: uniqueEventActors(cohortFunnelRows, "account_save_started"), accountSaveCompleted7d: uniqueEventActors(cohortFunnelRows, "account_save_completed"),
    paywallViewed7d: uniqueEventActors(cohortFunnelRows, "paywall_viewed"), paywallCtaClicked7d: uniqueEventActors(cohortFunnelRows, "paywall_cta_clicked"), checkoutStarted7d: uniqueEventActors(cohortFunnelRows, "checkout_started"),
    onboardingSteps7d,
    onboardingStepCohort7d: onboardingCohort.cohort,
    onboardingLargestDrop7d: largestOnboardingStepDrop(onboardingSteps7d),
    activatedPaidFounders28d: activatedFounderIds.size, returningPaidFounders28d,
    openBugs: count(bugs.count), blockingBugs: count(blocking.count), checkoutPending: count(recoveries.count),
    aiCallsToday: customerAiRows.length, aiFailuresToday: customerAiRows.filter((row) => !row.success).length,
    aiCostTodayUsd: usageRows.reduce((sum, row) => sum + amount(row.estimated_cost_usd), 0),
    productEvents24h: count(events.count), tasksCompleted24h: count(tasks.count), coachMessages24h: count(messages.count),
    failedDeliveries24h: count(deliveries.count),
  };
}

export function companyMetricValue(metric: string, metrics: CompanyMetrics): number | null {
  const values: Record<CompanyMetricId, number> = {
    paying_founders: metrics.paidFounders,
    active_entitlements: metrics.activeEntitlements,
    total_users: metrics.totalUsers,
    tasks_completed_24h: metrics.tasksCompleted24h,
    coach_messages_24h: metrics.coachMessages24h,
    product_events_24h: metrics.productEvents24h,
    pending_checkouts: metrics.checkoutPending,
    open_bugs: metrics.openBugs,
    ai_failures_today: metrics.aiFailuresToday,
  };
  return isCompanyMetricId(metric) ? values[metric] : null;
}

type MeasurableCompanyGoal = {
  metric: string;
  current_value: number | string | null;
};

/**
 * Goal progress stored in Postgres is a cache updated by agent runs. Owner-facing
 * reads must use the metrics collected for that request so a deleted entitlement,
 * completed task, or new checkout is never shown as stale progress.
 */
export function withLiveCompanyGoalMetrics<T extends MeasurableCompanyGoal>(goals: T[], metrics: CompanyMetrics): T[] {
  return goals.map((goal) => {
    const measured = companyMetricValue(goal.metric, metrics);
    return measured === null ? goal : { ...goal, current_value: measured };
  });
}
