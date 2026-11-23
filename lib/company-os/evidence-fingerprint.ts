import { createHash } from "node:crypto";
import type { CompanyMetrics } from "./types.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stableContext(agentContext: Record<string, unknown>) {
  const shared = record(agentContext.sharedOperatingMemory);
  const plan = record(shared?.currentDailyPlan);
  const experiment = record(list(plan?.company_experiments)[0]);
  const result = record(experiment?.result);
  return {
    workOrder: agentContext.currentWorkOrder ?? null,
    experiment: experiment ? {
      id: experiment.id ?? null,
      status: experiment.status ?? null,
      targetMetric: experiment.target_metric ?? null,
      successThreshold: experiment.success_threshold ?? null,
      latestObservations: list(result?.latestObservations),
      targetReached: result?.targetReached === true,
    } : null,
    ownerRevisionRequests: list(shared?.recentWork).flatMap((item) => {
      const value = record(item);
      return typeof value?.ownerRevisionFeedback === "string"
        ? [{ agent: value.agent ?? null, type: value.type ?? null, title: value.title ?? null, feedback: value.ownerRevisionFeedback }]
        : [];
    }),
    eventCounts7d: agentContext.eventCounts7d ?? null,
    customerCandidates: list(agentContext.customerCandidates).map((candidate) => {
      const value = record(candidate);
      return value ? {
        userRef: value.userRef ?? null,
        journeyDay: value.journeyDay ?? null,
        inactiveDays: value.inactiveDays ?? null,
        tasksCompleted: value.tasksCompleted ?? null,
        coachMessages: value.coachMessages ?? null,
        lastEvent: value.lastEvent ?? null,
      } : null;
    }),
    openBugs: list(agentContext.openBugs).map((bug) => {
      const value = record(bug);
      return value ? { category: value.category ?? null, severity: value.severity ?? null, status: value.status ?? null, summary: value.summary ?? null, path: value.path ?? null } : null;
    }),
    recentAiFailures: list(agentContext.recentAiFailures).map((failure) => {
      const value = record(failure);
      return value ? { feature: value.feature ?? null, model: value.model ?? null, errorCode: value.error_code ?? null, createdAt: value.created_at ?? null } : null;
    }),
    publicSiteHealth: list(agentContext.publicSiteHealth).map((health) => {
      const value = record(health);
      return value ? { path: value.path ?? null, expected: value.expected ?? null, status: value.status ?? null, healthy: value.healthy ?? null } : null;
    }),
  };
}

export function companyAgentEvidenceFingerprint(input: {
  agentId: string;
  localDate: string;
  planId: number | null;
  experimentId: number | null;
  metrics: CompanyMetrics;
  agentContext: Record<string, unknown>;
}): string {
  const metrics = input.metrics;
  const evidence = {
    agentId: input.agentId,
    // The CEO gets one fresh daily planning cycle. Specialists do not recreate
    // yesterday's deliverable just because the calendar changed.
    planningCycle: input.agentId === "ceo" ? input.localDate : null,
    planId: input.planId,
    experimentId: input.experimentId,
    metrics: {
      paidFounders: metrics.paidFounders,
      newPaidFounders24h: metrics.newPaidFounders24h,
      onboardingLanded7d: metrics.onboardingLanded7d ?? null,
      onboardingStarted7d: metrics.onboardingStarted7d,
      onboardingCaptured7d: metrics.onboardingCaptured7d ?? 0,
      onboardingResumeScheduled7d: metrics.onboardingResumeScheduled7d ?? 0,
      onboardingCompleted7d: metrics.onboardingCompleted7d,
      planRevealViewed7d: metrics.planRevealViewed7d,
      planRevealCtaClicked7d: metrics.planRevealCtaClicked7d,
      accountSaveStarted7d: metrics.accountSaveStarted7d,
      accountSaveCompleted7d: metrics.accountSaveCompleted7d,
      paywallViewed7d: metrics.paywallViewed7d,
      paywallCtaClicked7d: metrics.paywallCtaClicked7d,
      checkoutStarted7d: metrics.checkoutStarted7d,
      checkoutPending: metrics.checkoutPending,
      openBugs: metrics.openBugs,
      blockingBugs: metrics.blockingBugs,
      aiFailuresToday: metrics.aiFailuresToday,
      productEvents24h: metrics.productEvents24h,
      tasksCompleted24h: metrics.tasksCompleted24h,
      coachMessages24h: metrics.coachMessages24h,
      failedDeliveries24h: metrics.failedDeliveries24h,
    },
    context: stableContext(input.agentContext),
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}
