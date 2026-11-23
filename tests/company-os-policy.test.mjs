import test from "node:test";
import assert from "node:assert/strict";

import { actionDecision, agentMayPropose, companyActionFailureAlert, companyFailureRetryMinutes, COMPANY_ACTION_POLICY, isCompanyActionType, isEngineeringConnectorCircuitFailure, isPermanentCompanyActionFailure } from "../lib/company-os/policy.ts";
import { companyMetricValue, isCompanyMetricId, isCustomerFacingAiFeature, largestOnboardingStepDrop, latestOnboardingStepCohort, onboardingCohortFunnelRows, onboardingStepFunnel, uniqueEventActors, withLiveCompanyGoalMetrics } from "../lib/company-os/metrics.ts";
import { normalizeCompanyEmail, normalizeEngineeringJob, normalizePreparedSocialContent, normalizeSocialPosts, safeCompanyWebhook, withPreparedSocialTracking } from "../lib/company-os/execution-policy.ts";
import { engineeringConnectorProvider } from "../lib/company-os/engineering-connector.ts";
import { engineeringActionToken, verifyEngineeringActionToken, verifyEngineeringWorkerSecret } from "../lib/company-os/engineering-auth.ts";
import { explicitlyNamedEngineeringPaths, parseEngineeringEdits, parseEngineeringPatch, parseEngineeringSelection, safeEngineeringPath } from "../lib/company-os/engineering-worker-policy.ts";
import { buildCompanyReadiness } from "../lib/company-os/readiness.ts";
import { collectInstagramMediaInsights, normalizeInstagramPublication, publishInstagramImage, socialConnector, socialConnectorProvider } from "../lib/company-os/social-connector.ts";
import { buildOwnerCompanyBrief, ownerBriefSchedule } from "../lib/company-os/owner-brief-format.ts";
import { buildCompanyCapitalReadiness } from "../lib/company-os/capital-readiness.ts";
import { closeSupersededDailyPlans, fallbackDailyPlan } from "../lib/company-os/daily-plan.ts";

test("consequential actions always require owner approval", () => {
  for (const actionType of ["send_customer_email", "reply_company_email", "publish_social_content", "queue_ugc_video", "deploy_code", "change_price", "issue_refund", "change_permissions", "change_budget", "sign_contract"]) {
    const decision = actionDecision({ actionType, mode: "active", autonomy: "bounded", allowedActions: [actionType] });
    assert.equal(decision.canExecute, false, actionType);
    assert.equal(decision.requiresApproval, true, actionType);
  }
});

test("observe mode cannot execute even harmless internal work", () => {
  const decision = actionDecision({ actionType: "create_internal_report", mode: "observe", autonomy: "bounded", allowedActions: ["create_internal_report"] });
  assert.equal(decision.canExecute, false);
  assert.equal(decision.requiresApproval, true);
});

test("guarded draft agent can store allowlisted drafts", () => {
  const decision = actionDecision({ actionType: "prepare_social_content", mode: "guarded", autonomy: "draft", allowedActions: ["prepare_social_content"] });
  assert.equal(decision.canExecute, true);
  assert.equal(decision.risk, "draft");
  assert.equal(decision.requiresApproval, false);
});

test("guarded internal authority clears approval noise without widening consequential authority", () => {
  for (const actionType of ["record_observation", "create_internal_report", "send_owner_alert", "draft_customer_message", "draft_campaign", "prepare_social_content", "prepare_bug_fix", "propose_experiment"]) {
    const decision = actionDecision({ actionType, mode: "guarded", autonomy: "draft", allowedActions: [actionType] });
    assert.equal(decision.canExecute, true, `${actionType} should remain internal`);
    assert.equal(decision.requiresApproval, false);
  }
  for (const actionType of ["send_customer_email", "reply_company_email", "publish_social_content", "deploy_code", "change_price", "issue_refund", "change_permissions", "change_budget", "sign_contract"]) {
    const decision = actionDecision({ actionType, mode: "guarded", autonomy: "draft", allowedActions: [actionType], standingApproval: true });
    assert.equal(decision.canExecute, false, `${actionType} must remain owner-gated`);
    assert.equal(decision.requiresApproval, true);
  }
});

test("an agent cannot grant itself an action outside its allowlist", () => {
  const decision = actionDecision({ actionType: "send_owner_alert", mode: "active", autonomy: "bounded", allowedActions: ["record_observation"] });
  assert.equal(decision.canExecute, false);
  assert.match(decision.reason, /allowlist/i);
  assert.equal(agentMayPropose("queue_engineering_work", ["create_internal_report"]), false);
  assert.equal(agentMayPropose("create_internal_report", ["create_internal_report"]), true);
});

test("transient company-agent failures retry quickly before degrading", () => {
  assert.equal(companyFailureRetryMinutes(1), 15);
  assert.equal(companyFailureRetryMinutes(2), 30);
  assert.equal(companyFailureRetryMinutes(3), 30);
});

test("GitHub engineering failures open the circuit instead of retrying and spamming", () => {
  assert.equal(isPermanentCompanyActionFailure("github_engineering_provider_409"), true);
  assert.equal(isEngineeringConnectorCircuitFailure("github_engineering_provider_409"), true);
  assert.equal(isPermanentCompanyActionFailure("github_engineering_provider_429"), false);
  assert.equal(isPermanentCompanyActionFailure("github_engineering_provider_503"), false);
  const alert = companyActionFailureAlert({ actionType: "queue_engineering_work", title: "Investigate DeepSeek failures", code: "github_engineering_provider_409" });
  assert.match(alert, /Engineering connector unavailable/);
  assert.match(alert, /GitHub-native DeepSeek worker/);
  assert.doesNotMatch(alert, /Investigate DeepSeek failures/);
});

test("active bounded outreach can use an explicit standing owner approval", () => {
  const decision = actionDecision({ actionType: "send_customer_email", mode: "active", autonomy: "bounded", allowedActions: ["send_customer_email"], standingApproval: true });
  assert.equal(decision.canExecute, true);
  assert.equal(decision.requiresApproval, false);
  assert.match(decision.reason, /standing approval/i);
});

test("company inbox replies remain per-message owner decisions", () => {
  const decision = actionDecision({ actionType: "reply_company_email", mode: "active", autonomy: "bounded", allowedActions: ["reply_company_email"], standingApproval: true });
  assert.equal(decision.canExecute, false);
  assert.equal(decision.requiresApproval, true);
});

test("standing approval never covers money, code, permissions or legal commitments", () => {
  for (const actionType of ["queue_ugc_video", "deploy_code", "change_price", "issue_refund", "change_permissions", "change_budget", "sign_contract"]) {
    const decision = actionDecision({ actionType, mode: "active", autonomy: "bounded", allowedActions: [actionType], standingApproval: true });
    assert.equal(decision.canExecute, false, actionType);
    assert.equal(decision.requiresApproval, true, actionType);
  }
});

test("the policy catalog rejects unknown model-generated action names", () => {
  assert.equal(isCompanyActionType("publish_social_content"), true);
  assert.equal(isCompanyActionType("transfer_company_money"), false);
  assert.equal(COMPANY_ACTION_POLICY.sign_contract.risk, "legal");
});

test("company goals count only paid founders and reject invented metrics", () => {
  const metrics = { activeEntitlements: 7, paidFounders: 2, totalUsers: 19, tasksCompleted24h: 4, coachMessages24h: 8, productEvents24h: 31, checkoutPending: 2, openBugs: 1, aiFailuresToday: 0 };
  assert.equal(companyMetricValue("paying_founders", metrics), 2);
  assert.equal(companyMetricValue("active_entitlements", metrics), 7);
  assert.equal(companyMetricValue("tasks_completed_24h", metrics), 4);
  assert.equal(companyMetricValue("viral_growth_score", metrics), null);
  assert.equal(isCompanyMetricId("paying_founders"), true);
  assert.equal(isCompanyMetricId("viral_growth_score"), false);
});

test("owner-facing company goals replace stale cache values with paid founder metrics", () => {
  const metrics = { activeEntitlements: 6, paidFounders: 1, totalUsers: 19, tasksCompleted24h: 4, coachMessages24h: 8, productEvents24h: 31, checkoutPending: 2, openBugs: 1, aiFailuresToday: 0 };
  const goals = [
    { id: 1, metric: "paying_founders", current_value: 7, target_value: 10 },
    { id: 2, metric: "unsupported_metric", current_value: 3, target_value: 4 },
  ];
  assert.deepEqual(withLiveCompanyGoalMetrics(goals, metrics), [
    { id: 1, metric: "paying_founders", current_value: 1, target_value: 10 },
    { id: 2, metric: "unsupported_metric", current_value: 3, target_value: 4 },
  ]);
});

test("funnel metrics count people once per stage instead of inflating repeated events", () => {
  const rows = [
    { event_name: "onboarding_started", user_id: null, anonymous_id: "a" },
    { event_name: "onboarding_started", user_id: null, anonymous_id: "a" },
    { event_name: "onboarding_started", user_id: null, anonymous_id: "b" },
    { event_name: "paywall_viewed", user_id: "user-1", anonymous_id: "a" },
  ];
  assert.equal(uniqueEventActors(rows, "onboarding_started"), 2);
  assert.equal(uniqueEventActors(rows, "paywall_viewed"), 1);
});

test("Company OS identifies the largest unique-founder onboarding transition loss", () => {
  const rows = [
    ...["a", "b", "c", "d", "e"].flatMap((actor) => [
      { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: actor, properties: { screen: "stage", phase: "you", step: 1 } },
      { event_name: "onboarding_step_completed", user_id: null, anonymous_id: actor, properties: { screen: "stage", phase: "you", step: 1 } },
    ]),
    ...["a", "b"].flatMap((actor) => [
      { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: actor, properties: { screen: "outcome", phase: "you", step: 2 } },
      { event_name: "onboarding_step_completed", user_id: null, anonymous_id: actor, properties: { screen: "outcome", phase: "you", step: 2 } },
    ]),
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "a", properties: { screen: "blocker", phase: "you", step: 3 } },
  ];
  const steps = onboardingStepFunnel(rows);
  assert.deepEqual(steps.map(({ screen, viewed, completed }) => ({ screen, viewed, completed })), [
    { screen: "stage", viewed: 5, completed: 5 },
    { screen: "outcome", viewed: 2, completed: 2 },
    { screen: "blocker", viewed: 1, completed: 0 },
  ]);
  assert.deepEqual(largestOnboardingStepDrop(steps), {
    fromScreen: "stage", toScreen: "outcome", fromViewed: 5, toViewed: 2, retentionRate: 0.4,
  });
});

test("Company OS never mixes onboarding screens from different releases", () => {
  const rows = [
    ...["old-a", "old-b", "old-c", "old-d"].map((anonymous_id) => ({ event_name: "onboarding_step_viewed", user_id: null, anonymous_id, created_at: "2026-08-18T10:00:00.000Z", properties: { release: "old-release", screen: "welcome", phase: "diagnostic", step: 1 } })),
    ...["new-a", "new-b", "new-c"].flatMap((anonymous_id) => [
      { event_name: "onboarding_step_viewed", user_id: null, anonymous_id, created_at: "2026-08-19T10:00:00.000Z", properties: { release: "new-release", screen: "stage", phase: "you", step: 1 } },
      { event_name: "onboarding_step_viewed", user_id: null, anonymous_id, created_at: "2026-08-19T10:01:00.000Z", properties: { release: "new-release", screen: "outcome", phase: "you", step: 2 } },
    ]),
  ];
  const cohort = latestOnboardingStepCohort(rows);
  assert.equal(cohort.cohort, "new-release");
  assert.equal(cohort.actorCount, 3);
  assert.deepEqual(onboardingStepFunnel(cohort.rows).map((step) => step.screen), ["stage", "outcome"]);
});

test("Company OS reports a small newest cohort instead of falling back to old UX", () => {
  const rows = [
    ...["old-a", "old-b", "old-c", "old-d"].map((anonymous_id) => ({ event_name: "onboarding_step_viewed", user_id: null, anonymous_id, created_at: "2026-08-19T10:00:00.000Z", properties: { flow_version: "old-v1", screen: "welcome", step: 1 } })),
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "new-a", created_at: "2026-08-20T10:00:00.000Z", properties: { flow_version: "new-v2", screen: "stage", step: 1 } },
  ];
  const cohort = latestOnboardingStepCohort(rows);
  assert.equal(cohort.cohort, "new-v2");
  assert.equal(cohort.actorCount, 1);
});

test("Company OS reports zero evidence for the deployed flow instead of recycling an older release", () => {
  const cohort = latestOnboardingStepCohort([
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "old-a", created_at: "2026-08-19T10:00:00.000Z", properties: { flow_version: "old-v1", screen: "welcome", step: 1 } },
  ], "new-v2");
  assert.equal(cohort.cohort, "new-v2");
  assert.equal(cohort.actorCount, 0);
  assert.deepEqual(cohort.rows, []);
});

test("Company OS refuses to optimise unversioned historical onboarding mixtures", () => {
  const cohort = latestOnboardingStepCohort([
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "a", created_at: "2026-08-19T10:00:00.000Z", properties: { screen: "welcome", step: 1 } },
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "b", created_at: "2026-08-19T10:01:00.000Z", properties: { screen: "stage", step: 1 } },
  ]);
  assert.equal(cohort.cohort, null);
  assert.deepEqual(cohort.rows, []);
});

test("Company OS keeps downstream funnel events inside the selected onboarding cohort", () => {
  const rows = [
    { event_name: "onboarding_step_viewed", user_id: null, anonymous_id: "current", created_at: "2026-08-20T10:00:00.000Z", properties: { flow_version: "current-v2", screen: "stage", step: 1 } },
    { event_name: "onboarding_started", user_id: null, anonymous_id: "current", created_at: "2026-08-20T10:00:01.000Z", properties: { flow_version: "current-v2" } },
    { event_name: "plan_reveal_viewed", user_id: null, anonymous_id: "current", created_at: "2026-08-20T10:05:00.000Z", properties: {} },
    { event_name: "plan_reveal_viewed", user_id: null, anonymous_id: "old", created_at: "2026-08-19T10:05:00.000Z", properties: { flow_version: "old-v1" } },
    { event_name: "paywall_viewed", user_id: null, anonymous_id: "unrelated", created_at: "2026-08-20T10:06:00.000Z", properties: {} },
  ];
  const selected = onboardingCohortFunnelRows(rows, "current-v2");
  assert.equal(uniqueEventActors(selected, "onboarding_started"), 1);
  assert.equal(uniqueEventActors(selected, "plan_reveal_viewed"), 1);
  assert.equal(uniqueEventActors(selected, "paywall_viewed"), 0);
});

test("Company OS reliability excludes its own automation calls", () => {
  assert.equal(isCustomerFacingAiFeature("coach_chat"), true);
  assert.equal(isCustomerFacingAiFeature("plan_full"), true);
  assert.equal(isCustomerFacingAiFeature("company_os_engineering_patch"), false);
  assert.equal(isCustomerFacingAiFeature("company_os_agent_growth"), false);
  assert.equal(isCustomerFacingAiFeature(undefined), true);
});

test("the autonomous daily plan names the verified onboarding screen loss", () => {
  const plan = fallbackDailyPlan({
    generatedAt: "2026-08-19T07:00:00.000Z", totalUsers: 60, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 20, onboardingCompleted7d: 1, planRevealViewed7d: 3, planRevealCtaClicked7d: 1, journeySaveViewed7d: 1, accountSaveStarted7d: 1, accountSaveCompleted7d: 1,
    paywallViewed7d: 1, paywallCtaClicked7d: 0, checkoutStarted7d: 1, onboardingLargestDrop7d: { fromScreen: "idea", toScreen: "reach", fromViewed: 14, toViewed: 5, retentionRate: 5 / 14 },
    activatedPaidFounders28d: 0, returningPaidFounders28d: 0, openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 20, aiFailuresToday: 0,
    aiCostTodayUsd: 0.03, productEvents24h: 100, tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  });
  assert.match(plan.bottleneck, /idea → reach: 14 viewers became 5 \(36% retained\)/);
  assert.match(plan.hypothesis, /transition from idea to reach/);
});

test("the autonomous daily plan fixes first-answer friction before shortening the commitment journey", () => {
  const plan = fallbackDailyPlan({
    generatedAt: "2026-08-21T07:00:00.000Z", totalUsers: 60, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingLanded7d: 8, onboardingStarted7d: 2, onboardingCompleted7d: 0, planRevealViewed7d: 0, planRevealCtaClicked7d: 0, journeySaveViewed7d: 0, accountSaveStarted7d: 0, accountSaveCompleted7d: 0,
    paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0, activatedPaidFounders28d: 0, returningPaidFounders28d: 0,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 4, aiFailuresToday: 0, aiCostTodayUsd: 0.01, productEvents24h: 12,
    tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  });
  assert.equal(plan.experiment.title, "Make the first answer easy");
  assert.match(plan.bottleneck, /8 founders opened.*only 2 answered/i);
  assert.match(plan.stopCondition, /deeper journey unchanged until five genuine starts/i);
  assert.equal(plan.experiment.targetMetric, "onboarding_start_rate");
});

test("a new company day stops old experiments before agents receive another work order", async () => {
  const operations = [];
  let planReads = 0;
  const builder = (result, table) => {
    const chain = {
      select(columns) { operations.push([table, "select", columns]); return chain; },
      update(value) { operations.push([table, "update", value]); return chain; },
      insert(value) { operations.push([table, "insert", value]); return chain; },
      in(column, values) { operations.push([table, "in", column, values]); return chain; },
      eq(column, value) { operations.push([table, "eq", column, value]); return chain; },
      lt(column, value) { operations.push([table, "lt", column, value]); return chain; },
      order(column, value) { operations.push([table, "order", column, value]); return chain; },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return chain;
  };
  const service = {
    from(table) {
      if (table === "company_daily_plans") {
        planReads += 1;
        return builder(planReads === 1 ? { data: [{ id: 7, local_date: "2026-08-20" }], error: null } : { data: null, error: null }, table);
      }
      if (table === "company_experiments") return builder({ data: [{ id: 11 }], error: null }, table);
      if (table === "company_experiment_signals") return builder({ data: [{ signal_id: 19 }], error: null }, table);
      if (table === "company_trend_signals") return builder({ data: null, error: null }, table);
      if (table === "company_audit_log") return builder({ data: null, error: null }, table);
      throw new Error(`unexpected table ${table}`);
    },
  };
  const result = await closeSupersededDailyPlans(service, "2026-08-21", new Date("2026-08-20T23:45:00.000Z"));
  assert.deepEqual(result, { planIds: [7], stoppedExperimentIds: [11] });
  assert.ok(operations.some(([table, method, value]) => table === "company_experiments" && method === "update" && value.status === "stopped"));
  assert.ok(operations.some(([table, method, value]) => table === "company_daily_plans" && method === "update" && value.status === "abandoned"));
  assert.ok(operations.some(([table, method, value]) => table === "company_trend_signals" && method === "update" && value.status === "watch"));
  assert.ok(operations.some(([table, method, value]) => table === "company_audit_log" && method === "insert" && value.event_type === "daily_plan.superseded"));
});

test("chairman brief runs once in the configured Stockholm hour across summer time", () => {
  const due = ownerBriefSchedule(new Date("2026-08-18T07:15:00.000Z"), "Europe/Stockholm", 9);
  const early = ownerBriefSchedule(new Date("2026-08-18T06:15:00.000Z"), "Europe/Stockholm", 9);
  const evening = ownerBriefSchedule(new Date("2026-08-18T17:15:00.000Z"), "Europe/Stockholm", 9, 19);
  assert.deepEqual(due, { localDate: "2026-08-18", hour: 9, timezone: "Europe/Stockholm", briefHour: 9, eveningHour: 19, phase: "morning", due: true });
  assert.equal(early.due, false);
  assert.equal(early.phase, null);
  assert.equal(evening.phase, "evening");
  assert.equal(evening.due, true);
});

test("chairman brief separates paid founders from no-cost access and gives one priority", () => {
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-18",
    metrics: {
      generatedAt: "2026-08-18T07:15:00.000Z",
      totalUsers: 40,
      activeEntitlements: 6,
      paidFounders: 1,
      testerAccess: 5,
      newPaidFounders24h: 1,
      onboardingStarted7d: 12,
      onboardingCompleted7d: 6,
      planRevealViewed7d: 8,
      planRevealCtaClicked7d: 7,
      journeySaveViewed7d: 7,
      accountSaveStarted7d: 6,
      accountSaveCompleted7d: 5,
      paywallViewed7d: 5,
      paywallCtaClicked7d: 2,
      checkoutStarted7d: 2,
      activatedPaidFounders28d: 1,
      returningPaidFounders28d: 1,
      openBugs: 1,
      blockingBugs: 0,
      checkoutPending: 2,
      aiCallsToday: 10,
      aiFailuresToday: 0,
      aiCostTodayUsd: 0.03,
      productEvents24h: 80,
      tasksCompleted24h: 4,
      coachMessages24h: 7,
      failedDeliveries24h: 0,
    },
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 6, unit: "count" }],
    pendingDecisions: 0,
    failedActions24h: 0,
    failedRuns24h: 0,
    latestCeoSummary: "Focus on the paid conversion path.",
    capital: { stage: "customer_evidence", gatesMet: 1, gatesTotal: 5 },
    messagingPilot: { connectedTotal: 3, repliedWithinDay1: 2, repliedOnDay3: 1, taskCompleters7d: 1, deliveryFailures7d: 0, reportedWrongUserIncidents: 0 },
    site: "https://badger.example.com",
  });
  assert.equal(brief.progress.current, 1);
  assert.equal(brief.progress.remaining, 9);
  assert.match(brief.telegram, /6 active access \(1 paid, 5 no-cost\)/);
  assert.match(brief.telegram, /\$10,000\/month ambition = 205 new \$49 sales\/month; one-time revenue, not MRR/);
  assert.match(brief.telegram, /12 starts → 5 early accounts → 8 plan reveals → 5 paywall views → 2 Checkout starts/);
  assert.match(brief.telegram, /iMessage pilot: 3\/10 connected · 2 replied Day 1 · 1 replied Day 3 · 1 completed a task · 0 delivery failures · 0 wrong-user reports/);
  assert.match(brief.telegram, /Capital evidence: 1\/5 gates met · customer evidence/);
  assert.match(brief.priority, /2 checkouts are pending/);
  assert.doesNotMatch(brief.telegram, /6\/10 paid/);
});

test("chairman Telegram brief includes the approved daily experiment and stop rule", () => {
  const metrics = {
    generatedAt: "2026-08-19T07:00:00.000Z", totalUsers: 60, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 69, onboardingCompleted7d: 1, planRevealViewed7d: 3, planRevealCtaClicked7d: 1, journeySaveViewed7d: 1, accountSaveStarted7d: 1, accountSaveCompleted7d: 1,
    paywallViewed7d: 1, paywallCtaClicked7d: 0, checkoutStarted7d: 1, activatedPaidFounders28d: 0, returningPaidFounders28d: 0,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 30, aiFailuresToday: 0, aiCostTodayUsd: 0.03, productEvents24h: 100,
    tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  };
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-19", phase: "morning", metrics,
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 2, unit: "count" }],
    pendingDecisions: 1, failedActions24h: 0, failedRuns24h: 0, site: "https://badger.example.com",
    dailyPlan: { objective: "Reach the personal plan.", bottleneck: "69 starts produced 3 plan reveals.", hypothesis: "Remove the largest diagnostic wait.", leading_signal: "Plan reveal rate.", stop_condition: "Stop after 20 starts without improvement.", experiment: { title: "Reach the plan", channel: "product", target_metric: "plan_reveal_rate" } },
    experimentEvidence: { targetMetric: "attributed_onboarding_starts", successThreshold: 1, targetValue: 1, targetReached: true, observations: [{ metric: "instagram_reach", value: 83, unit: "count", source: "instagram" }, { metric: "attributed_onboarding_starts", value: 1, unit: "founders", source: "product_events" }] },
  });
  assert.match(brief.telegram, /TARGET · 2\/10 paid founders/);
  assert.match(brief.telegram, /EXPERIMENT · Reach the plan via product/);
  assert.match(brief.telegram, /STOP · Stop after 20 starts/);
  assert.match(brief.telegram, /EVIDENCE · 83 IG reach · 1 attributed onboarding starts/);
  assert.match(brief.telegram, /TARGET SIGNAL · attributed onboarding starts 1\/1 ✓/);
  assert.match(brief.telegram, /DECISIONS · 1 waiting/);
  assert.doesNotMatch(brief.paragraphs.join("\n"), /83 IG reach|attributed onboarding starts 1\/1/);
});

test("chairman brief names the agents assigned to today's experiment", () => {
  const metrics = {
    generatedAt: "2026-08-19T07:00:00.000Z", totalUsers: 60, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 20, onboardingCompleted7d: 5, planRevealViewed7d: 10, planRevealCtaClicked7d: 8, journeySaveViewed7d: 8, accountSaveStarted7d: 7, accountSaveCompleted7d: 6,
    paywallViewed7d: 5, paywallCtaClicked7d: 2, checkoutStarted7d: 1, activatedPaidFounders28d: 1, returningPaidFounders28d: 1,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 12, aiFailuresToday: 0, aiCostTodayUsd: 0.02, productEvents24h: 50,
    tasksCompleted24h: 2, coachMessages24h: 4, failedDeliveries24h: 0,
  };
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-19", phase: "morning", metrics,
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 2, unit: "count" }],
    pendingDecisions: 0, failedActions24h: 0, failedRuns24h: 0, site: "https://badger.example.com",
    dailyPlan: { objective: "Show Bo's follow-up.", bottleneck: "Qualified traffic is low.", hypothesis: "A concrete conversation will create intent.", leading_signal: "Attributed starts.", stop_condition: "Stop after three posts without a start.", experiment: { title: "Bo follows up", channel: "instagram", target_metric: "attributed_onboarding_starts" }, assignments: [{ agentId: "growth", deliverable: "Define the hook." }, { agentId: "content", deliverable: "Draft the post." }, { agentId: "revenue", deliverable: "Check the CTA." }] },
  });
  assert.match(brief.telegram, /TEAM · growth → content → revenue/);
  assert.match(brief.paragraphs.join("\n"), /Assigned team: growth — Define the hook/);
});

test("chairman brief carries the prepared acquisition move into Telegram and email", () => {
  const metrics = {
    generatedAt: "2026-08-21T07:00:00.000Z", totalUsers: 9, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 0, onboardingCompleted7d: 0, planRevealViewed7d: 0, planRevealCtaClicked7d: 0, journeySaveViewed7d: 0, accountSaveStarted7d: 0, accountSaveCompleted7d: 0,
    paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0, activatedPaidFounders28d: 0, returningPaidFounders28d: 0,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 0, aiFailuresToday: 0, aiCostTodayUsd: 0, productEvents24h: 0,
    tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  };
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-21", phase: "morning", metrics,
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 2, unit: "count" }],
    pendingDecisions: 0, failedActions24h: 0, failedRuns24h: 0, site: "https://badger.example.com",
    preparedMove: { title: "Warm-DM appendix", content: "P.S. You mentioned [their blocker]. See the Day 1 Bo builds: https://badger.example.com/start?utm_source=badger_company_os&utm_medium=other&utm_campaign=badger-20260821-other" },
  });
  assert.match(brief.telegram, /READY · Warm-DM appendix/);
  assert.match(brief.telegram, /utm_campaign=badger-20260821-other/);
  assert.match(brief.paragraphs.join("\n"), /Prepared move: Warm-DM appendix/);
});

test("chairman brief turns an untouched warm cohort into one copy-ready action", () => {
  const metrics = {
    generatedAt: "2026-08-25T07:00:00.000Z", totalUsers: 9, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 1, onboardingCompleted7d: 0, planRevealViewed7d: 0, planRevealCtaClicked7d: 0, journeySaveViewed7d: 0, accountSaveStarted7d: 1, accountSaveCompleted7d: 1,
    paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0, activatedPaidFounders28d: 0, returningPaidFounders28d: 0,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 0, aiFailuresToday: 0, aiCostTodayUsd: 0, productEvents24h: 0,
    tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  };
  const opener = "Hey — quick one. I made something for people who have an idea but keep putting off the next step. Want me to send it?";
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-25", phase: "morning", metrics,
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 2, unit: "count" }],
    pendingDecisions: 0, failedActions24h: 0, failedRuns24h: 0, site: "https://badger.example.com",
    warmOutreach: { sent: 0, replies: 0, linksShared: 0, maxContacts: 5, opener },
  });
  assert.match(brief.telegram, /ACTION · Send this first note to 5 people you already know:/);
  assert.match(brief.telegram, /Hey — quick one/);
  assert.match(brief.telegram, /TRACK · https:\/\/badger\.example\.com\/ops\/company#outreach/);
  assert.match(brief.paragraphs.join("\n"), /Action ready: send this first note to 5 people/);
});

test("chairman brief asks for tracked follow-up after a warm reply", () => {
  const metrics = {
    generatedAt: "2026-08-25T17:00:00.000Z", totalUsers: 9, activeEntitlements: 6, paidFounders: 2, testerAccess: 4, newPaidFounders24h: 0,
    onboardingStarted7d: 1, onboardingCompleted7d: 0, planRevealViewed7d: 0, planRevealCtaClicked7d: 0, journeySaveViewed7d: 0, accountSaveStarted7d: 1, accountSaveCompleted7d: 1,
    paywallViewed7d: 0, paywallCtaClicked7d: 0, checkoutStarted7d: 0, activatedPaidFounders28d: 0, returningPaidFounders28d: 0,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 0, aiFailuresToday: 0, aiCostTodayUsd: 0, productEvents24h: 0,
    tasksCompleted24h: 0, coachMessages24h: 0, failedDeliveries24h: 0,
  };
  const brief = buildOwnerCompanyBrief({
    localDate: "2026-08-25", phase: "evening", metrics,
    goals: [{ title: "Reach 10 paying founders", metric: "paying_founders", target_value: 10, current_value: 2, unit: "count" }],
    pendingDecisions: 0, failedActions24h: 0, failedRuns24h: 0, site: "https://badger.example.com",
    warmOutreach: { sent: 5, replies: 2, linksShared: 1, maxContacts: 5, opener: "First note" },
  });
  assert.match(brief.telegram, /ACTION · 1 reply needs a response/);
  assert.match(brief.telegram, /copy each tracked follow-up/);
});

test("capital room prepares evidence without pretending two customers are fundraise-ready", () => {
  const capital = buildCompanyCapitalReadiness({
    generatedAt: "2026-08-18T07:15:00.000Z", totalUsers: 40, activeEntitlements: 6, paidFounders: 2, testerAccess: 4,
    newPaidFounders24h: 0, onboardingStarted7d: 12, onboardingCompleted7d: 2, planRevealViewed7d: 8, planRevealCtaClicked7d: 7,
    journeySaveViewed7d: 7, accountSaveStarted7d: 5, accountSaveCompleted7d: 4, paywallViewed7d: 5,
    paywallCtaClicked7d: 2, checkoutStarted7d: 2, activatedPaidFounders28d: 1, returningPaidFounders28d: 0,
    openBugs: 1, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 20, aiFailuresToday: 0,
    aiCostTodayUsd: 0.03, productEvents24h: 80, tasksCompleted24h: 4, coachMessages24h: 7, failedDeliveries24h: 0,
  });
  assert.equal(capital.stage, "customer_evidence");
  assert.equal(capital.canBeginInvestorOutreach, false);
  assert.equal(capital.monthlySalesNeeded, 205);
  assert.match(capital.verifiedFacts[0], /one-time access/);
  assert.ok(capital.heldUntilReady.includes("Investor outreach"));
  assert.equal(capital.capitalPack.deckOutline.length, 8);
  assert.equal(capital.capitalPack.termSheetStatus, "not_started");
  assert.match(capital.capitalPack.fundraiseRecommendation, /customer-evidence mode/i);
  assert.match(capital.capitalPack.deckOutline.find((item) => item.title.includes("Customer evidence")).evidence, /2 verified paid founders/);
  assert.match(capital.capitalPack.objectionLog.find((item) => item.question.includes("tester")).honestAnswer, /2 paid founders and 4 no-cost/);
});

test("capital room opens outreach only after every verified gate is met", () => {
  const capital = buildCompanyCapitalReadiness({
    generatedAt: "2026-08-18T07:15:00.000Z", totalUsers: 100, activeEntitlements: 14, paidFounders: 10, testerAccess: 4,
    newPaidFounders24h: 1, onboardingStarted7d: 90, onboardingCompleted7d: 18, planRevealViewed7d: 70, planRevealCtaClicked7d: 68,
    journeySaveViewed7d: 68, accountSaveStarted7d: 65, accountSaveCompleted7d: 60, paywallViewed7d: 55,
    paywallCtaClicked7d: 18, checkoutStarted7d: 12, activatedPaidFounders28d: 7, returningPaidFounders28d: 4,
    openBugs: 0, blockingBugs: 0, checkoutPending: 0, aiCallsToday: 100, aiFailuresToday: 2,
    aiCostTodayUsd: 0.3, productEvents24h: 280, tasksCompleted24h: 14, coachMessages24h: 22, failedDeliveries24h: 0,
  });
  assert.equal(capital.stage, "outreach_ready");
  assert.equal(capital.canBeginInvestorOutreach, true);
  assert.ok(capital.gates.every((item) => item.status === "met"));
  assert.equal(capital.capitalPack.termSheetStatus, "owner_decision_required");
  assert.match(capital.capitalPack.fundraiseRecommendation, /owner-reviewed process/i);
  assert.equal(capital.capitalPack.deckOutline.find((item) => item.title.includes("Raise")).status, "partial");
});

test("customer-success execution accepts only a bounded user reference and complete copy", () => {
  const email = normalizeCompanyEmail({ userRef: "35f5eab4-73bd-4a28-95a8-b73b3ac7787f", subject: "Your next step", content: "You have not failed. Let us find the part that feels unclear." });
  assert.equal(email.subject, "Your next step");
  assert.throws(() => normalizeCompanyEmail({ userRef: "not-a-user", subject: "Hi", content: "Body" }), /invalid_user_ref/);
  assert.throws(() => normalizeCompanyEmail({ userRef: "35f5eab4-73bd-4a28-95a8-b73b3ac7787f", subject: "Hi", content: "x".repeat(3001) }), /invalid_content/);
  assert.throws(() => normalizeCompanyEmail({ userRef: "35f5eab4-73bd-4a28-95a8-b73b3ac7787f", subject: "Where are you?", content: "You've been quiet for 11 days. What's actually blocking you?" }), /invalid_customer_tone/);
});

test("social execution applies the actual channel limits", () => {
  const posts = normalizeSocialPosts({ posts: { x: "A specific product lesson", linkedin: "A longer founder lesson" } });
  assert.equal(posts.x, "A specific product lesson");
  assert.throws(() => normalizeSocialPosts({ posts: { x: "x".repeat(281) } }), /invalid_x_post/);
  assert.throws(() => normalizeSocialPosts({ posts: { unknown: "hello" } }), /invalid_social_posts/);
  assert.throws(() => normalizeSocialPosts({ posts: { x: "valid", unknown: "hello" } }), /invalid_social_posts/);
  assert.throws(() => normalizeSocialPosts({ posts: { tiktok: "x".repeat(2201) } }), /invalid_tiktok_post/);
});

test("prepared social content is a complete, transparent X and TikTok production bundle", () => {
  const content = normalizePreparedSocialContent({
    posts: {
      x: "Bo gives you one daily task, then adjusts the plan from what actually happened.",
      tiktok: "Bo follows up on your daily task and uses your proof to choose the next move. #buildinpublic",
    },
    ugc: {
      platform: "tiktok",
      format: "ai_founder_avatar",
      disclosure: "AI-generated presenter",
      hook: "Bo does not give you another list. He gives you one task and follows up.",
      durationSeconds: 30,
      script: "Bo gives a founder one daily task. When the founder replies with proof, Bo adjusts the plan and chooses the next move.",
      scenes: [
        { visual: "Founder closes a crowded notes app", onScreenText: "Too many ideas", voiceover: "A long list is not a plan." },
        { visual: "Badger Today screen shows one task", onScreenText: "One move today", voiceover: "Bo gives you one task that fits where you are." },
        { visual: "Evidence is checked and the plan changes", onScreenText: "Proof changes the plan", voiceover: "Reply with proof and Bo adjusts the next move." },
      ],
      cta: "Start your 28-day plan with Bo.",
    },
  });
  assert.equal(content.posts.x.length < 281, true);
  assert.equal(content.ugc.format, "ai_founder_avatar");
  assert.equal(content.ugc.scenes.length, 3);
  assert.equal(content.ugc.disclosure, "AI-generated presenter");
});

test("prepared X and TikTok posts receive the exact bounded experiment link", () => {
  const trackingUrl = "https://badger.example.com/start?utm_source=badger_company_os&utm_medium=social&utm_campaign=badger-20260821-social";
  const content = withPreparedSocialTracking({
    posts: {
      x: `${"Bo gives one daily task and follows up on the proof. ".repeat(3)} https://badger.example.com/start?utm_campaign=wrong`,
      tiktok: "Bo follows up on your task and adjusts the plan from the evidence.",
    },
    ugc: {
      platform: "tiktok", format: "screen_demo", disclosure: null, hook: "Bo turns proof into the next task.", durationSeconds: 20,
      script: "Bo gives one task. You return with proof. Bo adjusts the plan and gives the next move.",
      scenes: [
        { visual: "Today screen", onScreenText: "One task", voiceover: "Bo gives one task." },
        { visual: "Evidence card", onScreenText: "Add proof", voiceover: "You show what happened." },
        { visual: "Plan updates", onScreenText: "Next move", voiceover: "Bo adjusts the plan." },
      ],
      cta: "Start your 28-day plan with Bo.",
    },
  }, trackingUrl);
  assert.equal(content.posts.x.length <= 280, true);
  assert.equal(content.posts.x.endsWith(trackingUrl), true);
  assert.equal(content.posts.x.includes("utm_campaign=wrong"), false);
  assert.equal(content.posts.tiktok.endsWith(trackingUrl), true);
});

test("prepared TikTok work cannot omit production details or disguise an AI presenter", () => {
  const base = {
    posts: { x: "Bo gives one daily task and follows up.", tiktok: "Bo adjusts your plan from proof after each task." },
    ugc: {
      platform: "tiktok", format: "ai_founder_avatar", disclosure: "Founder testimonial", hook: "Bo follows up after each task.", durationSeconds: 30,
      script: "Bo follows up after the task, reads the proof and adjusts the plan.",
      scenes: [
        { visual: "One", onScreenText: "One", voiceover: "Bo gives one task." },
        { visual: "Two", onScreenText: "Two", voiceover: "The founder sends proof." },
        { visual: "Three", onScreenText: "Three", voiceover: "Bo adjusts the plan." },
      ],
      cta: "Start with Bo and get one task.",
    },
  };
  assert.throws(() => normalizePreparedSocialContent(base), /invalid_ugc_disclosure/);
  assert.throws(() => normalizePreparedSocialContent({ ...base, posts: { x: base.posts.x } }), /invalid_prepared_social_posts/);
  assert.throws(() => normalizePreparedSocialContent({ ...base, ugc: { ...base.ugc, disclosure: "AI-generated presenter", durationSeconds: 90 } }), /invalid_ugc_duration/);
  assert.throws(() => normalizePreparedSocialContent({ ...base, ugc: { ...base.ugc, disclosure: "AI-generated presenter", scenes: base.ugc.scenes.slice(0, 2) } }), /invalid_ugc_scenes/);
  assert.throws(() => normalizePreparedSocialContent({ ...base, posts: { x: "Supercharge your startup with Bo. Are you ready?", tiktok: base.posts.tiktok }, ugc: { ...base.ugc, disclosure: "AI-generated presenter" } }), /invalid_x_copy_quality/);
  assert.throws(() => normalizePreparedSocialContent({ ...base, posts: { x: "Bo doesn't let you coast. Evidence, not promises: show proof of the task.", tiktok: base.posts.tiktok }, ugc: { ...base.ugc, disclosure: "AI-generated presenter" } }), /invalid_x_copy_quality/);
});

test("social webhooks must be public HTTPS endpoints without embedded credentials", () => {
  assert.equal(safeCompanyWebhook("https://automation.example.com/badger")?.hostname, "automation.example.com");
  for (const value of ["http://automation.example.com", "https://localhost/hook", "https://127.0.0.1/hook", "https://172.20.0.1/hook", "https://user:secret@example.com/hook"]) {
    assert.equal(safeCompanyWebhook(value), null, value);
  }
});

test("direct Instagram configuration is preferred and partial configuration fails closed", () => {
  const direct = {
    NEXT_PUBLIC_SITE_URL: "https://badger.example.com",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1234567890",
    INSTAGRAM_BUSINESS_ACCESS_TOKEN: "instagram-access-token-long-enough",
    INSTAGRAM_EXPECTED_USERNAME: "badger.example.com",
    INSTAGRAM_GRAPH_API_VERSION: "v26.0",
    COMPANY_SOCIAL_WEBHOOK_URL: "https://automation.example.com/badger",
    COMPANY_SOCIAL_WEBHOOK_SECRET: "webhook-secret-long-enough",
  };
  assert.equal(socialConnectorProvider(direct), "instagram");
  assert.equal(socialConnector(direct)?.provider, "instagram");
  assert.equal(socialConnectorProvider({ ...direct, INSTAGRAM_BUSINESS_ACCESS_TOKEN: "" }), null);
  assert.equal(socialConnectorProvider({ COMPANY_SOCIAL_WEBHOOK_URL: "https://automation.example.com/badger", COMPANY_SOCIAL_WEBHOOK_SECRET: "webhook-secret-long-enough" }), "webhook");
});

test("Instagram publications can reference only the committed Badger asset catalogue", () => {
  const site = new URL("https://badger.example.com");
  const publication = normalizeInstagramPublication({ posts: { instagram: "Tell Bo what happened. He adjusts tomorrow's task from your proof, not from a generic template." }, instagramAsset: "daily_stage" }, site);
  assert.equal(publication.imageUrl, "https://badger.example.com/brand/bo-daily-stage-social.jpg");
  assert.throws(() => normalizeInstagramPublication({ posts: { instagram: "Bo adjusts the plan after every proof." } }, site), /invalid_instagram_asset/);
  assert.throws(() => normalizeInstagramPublication({ posts: { instagram: "Caption", x: "Also X" }, instagramAsset: "daily_stage" }, site), /invalid_instagram_publication/);
  assert.throws(() => normalizeInstagramPublication({ posts: { instagram: "Bo adjusts the plan after every proof." }, instagramAsset: "https://evil.example/image.jpg" }, site), /invalid_instagram_asset/);
  assert.throws(() => normalizeInstagramPublication({ posts: { instagram: "Most founders don't need another tool. Are you ready? 🚀" }, instagramAsset: "daily_stage" }, site), /invalid_instagram_copy_quality/);
  assert.throws(() => normalizeInstagramPublication({ posts: { instagram: "A generic motivational caption without product mechanics." }, instagramAsset: "daily_stage" }, site), /invalid_instagram_copy_quality/);
});

test("Instagram publishing verifies the destination and checkpoints the media container", async () => {
  const connector = socialConnector({
    NEXT_PUBLIC_SITE_URL: "https://badger.example.com",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1234567890",
    INSTAGRAM_BUSINESS_ACCESS_TOKEN: "instagram-access-token-long-enough",
    INSTAGRAM_EXPECTED_USERNAME: "badger.example.com",
    INSTAGRAM_GRAPH_API_VERSION: "v26.0",
  });
  assert.equal(connector?.provider, "instagram");
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, method: init.method ?? "GET", body: init.body?.toString() ?? "" });
    if (url.pathname.endsWith("/1234567890") && url.searchParams.has("fields")) return Response.json({ id: "1234567890", username: "badger.example.com" });
    if (url.pathname.endsWith("/1234567890/media") && (init.method ?? "GET") === "GET") return Response.json({ data: [] });
    if (url.pathname.endsWith("/1234567890/media") && init.method === "POST") return Response.json({ id: "3333333333" });
    if (url.pathname.endsWith("/3333333333")) return Response.json({ id: "3333333333", status_code: "FINISHED" });
    if (url.pathname.endsWith("/1234567890/media_publish")) return Response.json({ id: "4444444444" });
    if (url.pathname.endsWith("/4444444444")) return Response.json({ id: "4444444444", caption: "Tell Bo what happened. He adjusts tomorrow's task from your proof, not from a generic template.", permalink: "https://www.instagram.com/p/badger-test/" });
    return new Response(null, { status: 404 });
  };
  let checkpoint = null;
  const result = await publishInstagramImage({
    connector,
    caption: "Tell Bo what happened. He adjusts tomorrow's task from your proof, not from a generic template.",
    imageUrl: "https://badger.example.com/brand/bo-daily-stage-social.jpg",
    fetcher,
    delay: async () => {},
    onContainerCreated: async (id) => { checkpoint = id; },
  });
  assert.equal(checkpoint, "3333333333");
  assert.equal(result.mediaId, "4444444444");
  assert.equal(result.permalink, "https://www.instagram.com/p/badger-test/");
  assert.equal(result.recovered, false);
  assert.ok(calls.some((call) => call.url.includes("graph.instagram.com/v26.0/1234567890/media")));
  assert.ok(calls.some((call) => call.body.includes("image_url=https%3A%2F%2Fbadger.example.com")));
});

test("Instagram retry recovery detects the existing caption and does not publish twice", async () => {
  const connector = socialConnector({
    NEXT_PUBLIC_SITE_URL: "https://badger.example.com",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1234567890",
    INSTAGRAM_BUSINESS_ACCESS_TOKEN: "instagram-access-token-long-enough",
    INSTAGRAM_EXPECTED_USERNAME: "badger.example.com",
  });
  assert.equal(connector?.provider, "instagram");
  let calls = 0;
  const fetcher = async (input) => {
    calls += 1;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/1234567890") && url.searchParams.has("fields")) return Response.json({ id: "1234567890", username: "badger.example.com" });
    return Response.json({ data: [{ id: "5555555555", caption: "Already there", permalink: "https://www.instagram.com/p/existing/" }] });
  };
  const result = await publishInstagramImage({ connector, caption: "Already there", imageUrl: "https://badger.example.com/brand/bo-solo-path-social.jpg", fetcher });
  assert.equal(result.recovered, true);
  assert.equal(result.mediaId, "5555555555");
  assert.equal(calls, 2);
});

test("Instagram publishing refuses a token aimed at another account", async () => {
  const connector = socialConnector({
    NEXT_PUBLIC_SITE_URL: "https://badger.example.com",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1234567890",
    INSTAGRAM_BUSINESS_ACCESS_TOKEN: "instagram-access-token-long-enough",
    INSTAGRAM_EXPECTED_USERNAME: "badger.example.com",
  });
  assert.equal(connector?.provider, "instagram");
  await assert.rejects(() => publishInstagramImage({
    connector,
    caption: "Never publish this",
    imageUrl: "https://badger.example.com/brand/bo-solo-path-social.jpg",
    fetcher: async () => Response.json({ id: "1234567890", username: "personal_account" }),
  }), /instagram_account_mismatch/);
});

test("Instagram evidence reads owned media metrics without exposing the token in the URL", async () => {
  const connector = socialConnector({
    NEXT_PUBLIC_SITE_URL: "https://badger.example.com",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1234567890",
    INSTAGRAM_BUSINESS_ACCESS_TOKEN: "instagram-access-token-long-enough",
    INSTAGRAM_EXPECTED_USERNAME: "badger.example.com",
    INSTAGRAM_GRAPH_API_VERSION: "v26.0",
  });
  assert.equal(connector?.provider, "instagram");
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, authorization: init.headers?.Authorization });
    if (url.pathname.endsWith("/1234567890")) return Response.json({ id: "1234567890", username: "badger.example.com" });
    if (url.pathname.endsWith("/6666666666/insights")) return Response.json({ data: [
      { name: "views", total_value: { value: 120 } },
      { name: "reach", values: [{ value: 82 }] },
      { name: "saved", total_value: { value: 4 } },
      { name: "shares", total_value: { value: 3 } },
      { name: "total_interactions", total_value: { value: 19 } },
    ] });
    if (url.pathname.endsWith("/6666666666")) return Response.json({ id: "6666666666", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/test/", like_count: 11, comments_count: 1 });
    return new Response(null, { status: 404 });
  };
  const result = await collectInstagramMediaInsights({ connector, mediaIds: ["6666666666", "6666666666", "invalid"], observedAt: new Date("2026-08-19T10:00:00Z"), fetcher });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].metrics, { views: 120, reach: 82, saved: 4, shares: 3, total_interactions: 19, likes: 11, comments: 1 });
  assert.equal(result[0].mediaProductType, "REELS");
  assert.ok(calls.every((call) => !call.url.includes("instagram-access-token")));
  assert.ok(calls.every((call) => call.authorization === "Bearer instagram-access-token-long-enough"));
});

test("engineering handoffs contain evidence and testable acceptance criteria", () => {
  const job = normalizeEngineeringJob({ title: "Fix the mobile footer", problem: "The footer covers the final control.", evidence: ["Blocking bug report on /app/bo"], acceptanceCriteria: ["The control is visible at 390px", "The mobile build passes"] });
  assert.equal(job.acceptanceCriteria.length, 2);
  assert.throws(() => normalizeEngineeringJob({ title: "Do things", problem: "Unknown", evidence: [], acceptanceCriteria: [] }), /invalid_engineering_job/);
});

test("the GitHub DeepSeek worker is preferred and partial connectors fail closed", () => {
  const github = { COMPANY_ENGINEERING_GITHUB_REPOSITORY: "example-org/badger-ai", COMPANY_ENGINEERING_WORKER_SECRET: "github-worker-secret-long-enough-123", COMPANY_AUTOMATION_CALLBACK_SECRET: "callback-secret-long-enough", NEXT_PUBLIC_SITE_URL: "https://badger.example.com" };
  assert.equal(engineeringConnectorProvider({ ...github, COMPANY_ENGINEERING_WEBHOOK_URL: "https://worker.example.com", COMPANY_ENGINEERING_WEBHOOK_SECRET: "long-generalstaff-secret" }), "github");
  assert.equal(engineeringConnectorProvider(github), "github");
  assert.equal(engineeringConnectorProvider({ COMPANY_ENGINEERING_GITHUB_REPOSITORY: github.COMPANY_ENGINEERING_GITHUB_REPOSITORY, COMPANY_ENGINEERING_WORKER_SECRET: github.COMPANY_ENGINEERING_WORKER_SECRET }), null);
  assert.equal(engineeringConnectorProvider({ COMPANY_ENGINEERING_WEBHOOK_URL: "https://worker.example.com", COMPANY_ENGINEERING_WEBHOOK_SECRET: "long-generalstaff-secret" }), "webhook");
});

test("engineering tokens are scoped to one action and reject tampering", () => {
  const secret = "callback-secret-long-enough";
  const actionId = "166a0a84-6daa-4fca-b74b-3b8f8f6032b9";
  const token = engineeringActionToken(actionId, secret);
  assert.equal(verifyEngineeringActionToken(actionId, token, secret), true);
  assert.equal(verifyEngineeringActionToken("266a0a84-6daa-4fca-b74b-3b8f8f6032b9", token, secret), false);
  assert.equal(verifyEngineeringWorkerSecret("github-worker-secret-long-enough-123", "github-worker-secret-long-enough-123"), true);
  assert.equal(verifyEngineeringWorkerSecret("github-worker-secret-long-enough-124", "github-worker-secret-long-enough-123"), false);
});

test("the DeepSeek worker cannot select or patch protected code", () => {
  const inventory = new Set(["app/start/page.tsx", "lib/coach-service.ts", "app/api/checkout/route.ts"]);
  assert.deepEqual(parseEngineeringSelection('{"files":["app/start/page.tsx","app/api/checkout/route.ts"]}', inventory), ["app/start/page.tsx"]);
  assert.equal(safeEngineeringPath(".github/workflows/launch-gate.yml"), null);
  assert.equal(safeEngineeringPath("supabase/migrations/attack.sql"), null);
  assert.equal(safeEngineeringPath("public/customer-export.csv"), null);
  const patch = 'diff --git a/app/start/page.tsx b/app/start/page.tsx\n--- a/app/start/page.tsx\n+++ b/app/start/page.tsx\n@@ -1 +1 @@\n-old\n+new';
  assert.deepEqual(parseEngineeringPatch(JSON.stringify({ patch, summary: "Updates the page." }), new Set(["app/start/page.tsx"])), { patch, summary: "Updates the page." });
  assert.equal(parseEngineeringPatch(JSON.stringify({ patch: patch.replaceAll("app/start/page.tsx", "app/api/checkout/route.ts"), summary: "Unsafe." }), new Set(["app/start/page.tsx"])), null);
  assert.equal(parseEngineeringPatch(JSON.stringify({ patch: patch.replace("+++ b/app/start/page.tsx", "+++ b/lib/coach-service.ts"), summary: "Header substitution." }), new Set(["app/start/page.tsx"])), null);
  assert.equal(parseEngineeringPatch(JSON.stringify({ patch: patch.replace("diff --git a/app/start/page.tsx b/app/start/page.tsx", "diff --git a/app/start/page.tsx b/lib/coach-service.ts"), summary: "Rename." }), new Set(["app/start/page.tsx", "lib/coach-service.ts"])), null);
});

test("an invalid AI selection can fall back only to safe files explicitly named by the job", () => {
  const inventory = new Set(["docs/BADGER-COMPANY-OS.md", "app/start/page.tsx", "app/api/checkout/route.ts"]);
  assert.deepEqual(explicitlyNamedEngineeringPaths({ problem: "Update docs/BADGER-COMPANY-OS.md only." }, inventory), ["docs/BADGER-COMPANY-OS.md"]);
  assert.deepEqual(explicitlyNamedEngineeringPaths({ problem: "Inspect the checkout route." }, inventory), []);
  assert.deepEqual(explicitlyNamedEngineeringPaths({ problem: "Change app/api/checkout/route.ts." }, inventory), []);
});

test("bounded engineering edits must match exact allowlisted file text once", () => {
  const files = new Map([["docs/BADGER-COMPANY-OS.md", "First paragraph.\n\nSecond paragraph.\n"]]);
  const valid = JSON.stringify({ edits: [{ path: "docs/BADGER-COMPANY-OS.md", find: "Second paragraph.", replace: "Second paragraph.\n\nControlled proof." }], summary: "Documents the proof." });
  assert.deepEqual(parseEngineeringEdits(valid, files), { edits: [{ path: "docs/BADGER-COMPANY-OS.md", find: "Second paragraph.", replace: "Second paragraph.\n\nControlled proof." }], summary: "Documents the proof." });
  assert.equal(parseEngineeringEdits(JSON.stringify({ edits: [{ path: "docs/BADGER-COMPANY-OS.md", find: "Missing", replace: "New" }], summary: "Bad." }), files), null);
  assert.equal(parseEngineeringEdits(JSON.stringify({ edits: [{ path: "app/api/checkout/route.ts", find: "x", replace: "y" }], summary: "Unsafe." }), files), null);
  const repeated = new Map([["docs/BADGER-COMPANY-OS.md", "same same"]]);
  assert.equal(parseEngineeringEdits(JSON.stringify({ edits: [{ path: "docs/BADGER-COMPANY-OS.md", find: "same", replace: "different" }], summary: "Ambiguous." }), repeated), null);
});

function readinessInput(overrides = {}) {
  return {
    now: new Date("2026-08-18T12:00:00.000Z"), paused: false, mode: "guarded", metricsAvailable: true, activeEntitlements: 6,
    autonomousCustomerEmails: false, autonomousSocialPosts: false, engineeringProvider: null,
    connectors: { deepseek: true, email: true, social: false, engineering: false, ownerEmail: true, ownerTelegram: true },
    platform: { supabase: true, stripe: true, stripeWebhook: true, cron: true, ownerAllowlist: true, automationCallback: false },
    agents: [{ status: "active" }], runs: [
      { status: "completed", created_at: "2026-08-18T10:00:00.000Z" },
      { agent_id: "ceo", trigger_type: "event", status: "completed", created_at: "2026-08-18T09:17:00.000Z", output: { delivery: { email: "sent", telegram: "sent" } } },
    ], actions: [],
    ...overrides,
  };
}

test("readiness does not call configured external capabilities operational", () => {
  const result = buildCompanyReadiness(readinessInput());
  assert.equal(result.state, "limited");
  assert.equal(result.capabilities.find((item) => item.id === "agent_loop")?.status, "operational");
  assert.equal(result.capabilities.find((item) => item.id === "engineering")?.status, "setup");
  assert.equal(result.capabilities.find((item) => item.id === "social")?.status, "setup");
  assert.equal(result.capabilities.find((item) => item.id === "ugc_rendering")?.status, "setup");
  assert.ok(result.humanSetup.some((item) => /GitHub-native DeepSeek/i.test(item)));
  assert.ok(result.humanSetup.some((item) => /X\/TikTok/i.test(item)));
});

test("readiness requires recent evidence before declaring the full operating system operational", () => {
  const result = buildCompanyReadiness(readinessInput({
    mode: "active", autonomousCustomerEmails: true, autonomousSocialPosts: true, engineeringProvider: "github",
    connectors: { deepseek: true, email: true, social: true, engineering: true, ownerEmail: true, ownerTelegram: true, ugcRenderer: true },
    platform: { supabase: true, stripe: true, stripeWebhook: true, cron: true, ownerAllowlist: true, automationCallback: true },
    actions: [
      { action_type: "send_customer_email", status: "completed", created_at: "2026-08-18T09:00:00.000Z" },
      { action_type: "queue_engineering_work", status: "completed", created_at: "2026-08-18T09:00:00.000Z" },
      { action_type: "publish_social_content", status: "completed", created_at: "2026-08-18T09:00:00.000Z" },
      { action_type: "queue_ugc_video", status: "completed", created_at: "2026-08-18T09:00:00.000Z", executed_at: "2026-08-18T09:10:00.000Z" },
    ],
  }));
  assert.equal(result.state, "operational");
  assert.equal(result.operationalCount, result.totalCount);
  assert.equal(result.humanSetup.length, 0);
});

test("the global kill switch always overrides an otherwise healthy readiness state", () => {
  const result = buildCompanyReadiness(readinessInput({ paused: true }));
  assert.equal(result.state, "paused");
  assert.equal(result.capabilities.find((item) => item.id === "agent_loop")?.status, "attention");
});

test("owner readiness requires both private channels and recent delivery evidence", () => {
  const missingTelegram = buildCompanyReadiness(readinessInput({
    connectors: { deepseek: true, email: true, social: false, engineering: false, ownerEmail: true, ownerTelegram: false },
  }));
  const capability = missingTelegram.capabilities.find((item) => item.id === "owner_safety");
  assert.equal(capability?.status, "setup");
  assert.match(capability?.detail ?? "", /Telegram/);

  const stale = buildCompanyReadiness(readinessInput({ runs: [{ status: "completed", created_at: "2026-08-18T10:00:00.000Z" }] }));
  assert.equal(stale.capabilities.find((item) => item.id === "owner_safety")?.status, "configured");
});

test("readiness reports a recent permanent GitHub engineering failure as attention", () => {
  const result = buildCompanyReadiness(readinessInput({
    engineeringProvider: "github",
    connectors: { deepseek: true, email: true, social: false, engineering: true, ownerEmail: true, ownerTelegram: true },
    actions: [{ action_type: "queue_engineering_work", status: "failed", error_code: "github_engineering_provider_409", executed_at: "2026-08-18T11:30:00.000Z", created_at: "2026-08-18T11:29:00.000Z" }],
  }));
  const engineering = result.capabilities.find((item) => item.id === "engineering");
  assert.equal(engineering?.status, "attention");
  assert.match(engineering?.detail ?? "", /provider rejected a handoff/);
  assert.match(engineering?.next ?? "", /GitHub DeepSeek connector/i);
});
