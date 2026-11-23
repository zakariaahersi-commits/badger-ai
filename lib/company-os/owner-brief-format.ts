import type { CompanyMetrics } from "./types.ts";

const PRICE_USD = 49;
const MONTHLY_REVENUE_AMBITION_USD = 10_000;
const MONTHLY_FULL_PRICE_SALES_TARGET = Math.ceil(MONTHLY_REVENUE_AMBITION_USD / PRICE_USD);

type CompanyGoal = {
  title: string;
  metric: string;
  target_value: number | string;
  current_value: number | string;
  unit: string;
};

type CompanyBriefInput = {
  localDate: string;
  phase?: "morning" | "evening";
  metrics: CompanyMetrics;
  goals: CompanyGoal[];
  pendingDecisions: number;
  failedActions24h: number;
  failedRuns24h: number;
  latestCeoSummary?: string | null;
  capital?: { stage: string; gatesMet: number; gatesTotal: number } | null;
  messagingPilot?: { connectedTotal: number; repliedWithinDay1: number; repliedOnDay3: number; taskCompleters7d: number; deliveryFailures7d: number; reportedWrongUserIncidents: number } | null;
  site: string;
  dailyPlan?: {
    objective: string;
    bottleneck: string;
    hypothesis: string;
    leading_signal: string;
    stop_condition: string;
    experiment?: { title: string; channel: string; target_metric: string } | null;
    assignments?: Array<{ agentId: string; deliverable: string }>;
  } | null;
  experimentEvidence?: {
    targetMetric: string | null;
    successThreshold: number | null;
    targetValue: number | null;
    targetReached: boolean;
    observations: Array<{ metric: string; value: number; unit: string; source: string }>;
  } | null;
  preparedMove?: { title: string; content: string } | null;
  warmOutreach?: {
    sent: number;
    replies: number;
    linksShared: number;
    maxContacts: number;
    opener: string;
  } | null;
};

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function dateParts(now: Date, timezone: string): { localDate: string; hour: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
    const hour = Number(parts.hour);
    if (!parts.year || !parts.month || !parts.day || !Number.isInteger(hour)) return null;
    return { localDate: `${parts.year}-${parts.month}-${parts.day}`, hour };
  } catch {
    return null;
  }
}

export function ownerBriefSchedule(
  now = new Date(),
  timezone = process.env.COMPANY_OWNER_TIMEZONE?.trim() || "UTC",
  briefHour = boundedInteger(process.env.COMPANY_OWNER_BRIEF_HOUR, 9, 0, 23),
  eveningHour = boundedInteger(process.env.COMPANY_OWNER_EVENING_HOUR, 19, 0, 23),
) {
  const configured = dateParts(now, timezone);
  const effectiveTimezone = configured ? timezone : "UTC";
  const local = configured ?? dateParts(now, effectiveTimezone)!;
  const phase = local.hour === briefHour ? "morning" as const : local.hour === eveningHour ? "evening" as const : null;
  return { ...local, timezone: effectiveTimezone, briefHour, eveningHour, phase, due: phase !== null };
}

function goalProgress(goals: CompanyGoal[], metrics: CompanyMetrics) {
  const paidGoal = goals.find((goal) => goal.metric === "paying_founders");
  const target = Math.max(1, Number(paidGoal?.target_value) || 10);
  return { title: paidGoal?.title || "Reach 10 paying founders", current: metrics.paidFounders, target };
}

function metricLabel(metric: string): string {
  return metric.replace(/^instagram_/, "IG ").replace(/^attributed_/, "attributed ").replaceAll("_", " ");
}

function experimentEvidenceLine(input: CompanyBriefInput): string | null {
  const evidence = input.experimentEvidence;
  if (!evidence) return null;
  const priority = ["instagram_views", "instagram_reach", "instagram_total_interactions", "instagram_saved", "instagram_shares", "attributed_landing_visits", "attributed_onboarding_starts", "attributed_checkout_starts", "attributed_checkout_completions"];
  const byMetric = new Map(evidence.observations.map((item) => [item.metric, item]));
  const visible = priority.flatMap((metric) => byMetric.has(metric) ? [byMetric.get(metric)!] : []).slice(0, 6);
  if (!visible.length) return "No verified experiment observation yet.";
  return visible.map((item) => `${item.value} ${metricLabel(item.metric)}`).join(" · ");
}

function warmOutreachInstruction(input: CompanyBriefInput): { telegram: string[]; paragraph: string } | null {
  const cohort = input.warmOutreach;
  if (!cohort || cohort.maxContacts <= 0) return null;
  const remaining = Math.max(0, cohort.maxContacts - cohort.sent);
  const repliesToHandle = Math.max(0, cohort.replies - cohort.linksShared);
  const consoleUrl = `${input.site}/ops/company#outreach`;

  if (remaining > 0) return {
    telegram: [
      `ACTION · Send this first note to ${remaining} ${remaining === 1 ? "person" : "people"} you already know:`,
      cohort.opener,
      `TRACK · ${consoleUrl}`,
    ],
    paragraph: `Action ready: send this first note to ${remaining} ${remaining === 1 ? "person" : "people"} you already know.\n${cohort.opener}\nRecord only the outcome: ${consoleUrl}`,
  };
  if (repliesToHandle > 0) return {
    telegram: [
      `ACTION · ${repliesToHandle} ${repliesToHandle === 1 ? "reply needs" : "replies need"} a response. Open the cohort and copy each tracked follow-up.`,
      `TRACK · ${consoleUrl}`,
    ],
    paragraph: `Action ready: ${repliesToHandle} ${repliesToHandle === 1 ? "reply needs" : "replies need"} a response. Open the cohort and copy each tracked follow-up: ${consoleUrl}`,
  };
  return {
    telegram: [`COHORT · ${cohort.sent}/${cohort.maxContacts} sent · ${cohort.replies} replies · ${cohort.linksShared} links shared`, `REVIEW · ${consoleUrl}`],
    paragraph: `Warm cohort: ${cohort.sent}/${cohort.maxContacts} sent, ${cohort.replies} replies and ${cohort.linksShared} links shared. Review the evidence: ${consoleUrl}`,
  };
}

function priorityFor(input: CompanyBriefInput, remaining: number): string {
  if (input.metrics.blockingBugs > 0) return `Protect conversion first: ${input.metrics.blockingBugs} blocking product issue${input.metrics.blockingBugs === 1 ? " is" : "s are"} open.`;
  if (input.pendingDecisions > 0) return `Unblock execution: decide the ${input.pendingDecisions} item${input.pendingDecisions === 1 ? "" : "s"} waiting in Company OS.`;
  if (input.metrics.checkoutPending > 0) return `Recover intent: ${input.metrics.checkoutPending} checkout${input.metrics.checkoutPending === 1 ? " is" : "s are"} pending. Review the recovery path and replies.`;
  const onboardingLandings = input.metrics.onboardingLanded7d
    ?? input.metrics.onboardingSteps7d?.find((step) => step.step === 1)?.viewed
    ?? 0;
  if (onboardingLandings >= 5 && input.metrics.onboardingStarted7d / Math.max(1, onboardingLandings) < 0.5) return `Fix the first answer: ${onboardingLandings} founders opened onboarding but only ${input.metrics.onboardingStarted7d} chose a starting point in seven days. Clarify the entry decision before changing the deeper journey.`;
  if (input.metrics.onboardingStarted7d >= 5 && input.metrics.planRevealViewed7d / input.metrics.onboardingStarted7d < 0.35) {
    const drop = input.metrics.onboardingLargestDrop7d;
    return drop
      ? `Fix diagnostic completion: ${drop.fromScreen} → ${drop.toScreen} retained ${Math.round(drop.retentionRate * 100)}% (${drop.fromViewed} → ${drop.toViewed}) in seven days. Change that transition before adding traffic.`
      : `Fix diagnostic completion: ${input.metrics.onboardingStarted7d} onboarding starts produced ${input.metrics.planRevealViewed7d} plan reveals in seven days. Inspect the largest question-level drop before adding traffic.`;
  }
  const captured = input.metrics.onboardingCaptured7d ?? input.metrics.accountSaveCompleted7d;
  if (input.metrics.onboardingStarted7d >= 5 && captured / input.metrics.onboardingStarted7d < 0.35) return `Fix early account capture: ${input.metrics.onboardingStarted7d} founders chose a starting point but only ${captured} saved an account in seven days. Keep Google primary and the continue-on-device escape visible.`;
  if (captured >= 5 && input.metrics.planRevealViewed7d / Math.max(1, captured) < 0.35) return `Fix post-capture completion: ${captured} founders saved their place but only ${input.metrics.planRevealViewed7d} reached a plan in seven days. Inspect the first question after auth and reminder return.`;
  if (input.metrics.paywallViewed7d >= 5 && input.metrics.checkoutStarted7d === 0) return `Fix the buying decision: ${input.metrics.paywallViewed7d} paywall views produced no Checkout starts in seven days. Review the promise, proof and CTA before buying more reach.`;
  if (remaining > 0) return `Create demand: get ${remaining} more paid founder${remaining === 1 ? "" : "s"}. Today, learn from real founder conversations before adding more product surface.`;
  return "Protect founder outcomes: study who starts, completes Day 1, and returns before increasing acquisition spend.";
}

export function buildOwnerCompanyBrief(input: CompanyBriefInput) {
  const goal = goalProgress(input.goals, input.metrics);
  const remaining = Math.max(0, goal.target - goal.current);
  const priority = priorityFor(input, remaining);
  const progress = `${goal.current}/${goal.target} paid founders`;
  const accessTruth = `${input.metrics.activeEntitlements} active access (${input.metrics.paidFounders} paid, ${input.metrics.testerAccess} no-cost)`;
  const revenueAmbition = `$${MONTHLY_REVENUE_AMBITION_USD.toLocaleString("en-US")}/month ambition = ${MONTHLY_FULL_PRICE_SALES_TARGET} new $${PRICE_USD} sales/month; one-time revenue, not MRR`;
  const operations = `${input.pendingDecisions} decisions waiting · ${input.failedActions24h} action failures · ${input.failedRuns24h} agent failures`;
  const founderProgress = `${input.metrics.tasksCompleted24h} tasks completed · ${input.metrics.coachMessages24h} Bo messages in 24h`;
  const funnel = `${input.metrics.onboardingLanded7d ?? input.metrics.onboardingSteps7d?.find((step) => step.step === 1)?.viewed ?? 0} onboarding opens → ${input.metrics.onboardingStarted7d} starts → ${input.metrics.onboardingCaptured7d ?? input.metrics.accountSaveCompleted7d} early accounts → ${input.metrics.planRevealViewed7d} plan reveals → ${input.metrics.paywallViewed7d} paywall views → ${input.metrics.checkoutStarted7d} Checkout starts (7d)`;
  const ceoSummary = input.latestCeoSummary?.trim().replace(/\s+/g, " ").slice(0, 500) || null;
  const phase = input.phase ?? "morning";
  const plan = input.dailyPlan;
  const evidenceLine = experimentEvidenceLine(input);
  const preparedMove = input.preparedMove;
  const warmInstruction = warmOutreachInstruction(input);
  const planPriority = plan?.objective || priority;
  const planLines = plan ? [
    `Bottleneck: ${plan.bottleneck}`,
    `Hypothesis: ${plan.hypothesis}`,
    `Signal: ${plan.leading_signal}`,
    `Stop rule: ${plan.stop_condition}`,
    ...(plan.assignments?.length ? [`Assigned team: ${plan.assignments.map((item) => `${item.agentId} — ${item.deliverable}`).join(" · ")}`] : []),
  ] : [];
  const capital = input.capital ? `Capital evidence: ${input.capital.gatesMet}/${input.capital.gatesTotal} gates met · ${input.capital.stage.replaceAll("_", " ")}.` : null;
  const messaging = input.messagingPilot ? `iMessage pilot: ${input.messagingPilot.connectedTotal}/10 connected · ${input.messagingPilot.repliedWithinDay1} replied Day 1 · ${input.messagingPilot.repliedOnDay3} replied Day 3 · ${input.messagingPilot.taskCompleters7d} completed a task · ${input.messagingPilot.deliveryFailures7d} delivery failures · ${input.messagingPilot.reportedWrongUserIncidents} wrong-user reports.` : null;
  const paragraphs = [
    `${phase === "evening" ? "Chairman evening scorecard" : "Chairman morning brief"} for ${input.localDate}. ${goal.title}: ${progress}. ${accessTruth}.`,
    `Revenue pace: ${revenueAmbition}.`,
    `Founder activity: ${founderProgress}. Operations: ${operations}.`,
    `Funnel: ${funnel}.`,
    `${phase === "evening" ? "Today’s company plan" : "Today's priority"}: ${planPriority}`,
    ...planLines,
    ...(warmInstruction ? [warmInstruction.paragraph] : []),
    ...(preparedMove ? [`Prepared move: ${preparedMove.title}\n${preparedMove.content}`] : []),
    ...(ceoSummary ? [`CEO signal: ${ceoSummary}`] : []),
  ];
  const telegram = [
    phase === "evening" ? "🦡 Badger CEO → Chairman · evening scorecard" : "🦡 Badger CEO → Chairman · morning plan",
    `TARGET · ${progress}`,
    `Access truth: ${accessTruth}`,
    `Revenue pace: ${revenueAmbition}`,
    `${phase === "evening" ? "TODAY" : "YESTERDAY"} · ${founderProgress}`,
    `FUNNEL · ${funnel}`,
    ...(messaging ? [messaging] : []),
    ...(capital ? [capital] : []),
    `OPERATIONS · ${operations}`,
    `${phase === "evening" ? "LEARNING" : "TODAY"} · ${planPriority}`,
    ...(warmInstruction ? warmInstruction.telegram : []),
    ...(plan ? [`EXPERIMENT · ${plan.experiment?.title ?? plan.hypothesis} via ${plan.experiment?.channel ?? "product"}`, `TEAM · ${plan.assignments?.map((item) => item.agentId).join(" → ") || "CEO"}`, `SIGNAL · ${plan.leading_signal}`, `STOP · ${plan.stop_condition}`] : []),
    ...(evidenceLine ? [`EVIDENCE · ${evidenceLine}`] : []),
    ...(input.experimentEvidence?.targetMetric ? [`TARGET SIGNAL · ${metricLabel(input.experimentEvidence.targetMetric)} ${input.experimentEvidence.targetValue ?? 0}/${input.experimentEvidence.successThreshold ?? 0}${input.experimentEvidence.targetReached ? " ✓" : ""}`] : []),
    ...(preparedMove ? [`READY · ${preparedMove.title}`, preparedMove.content] : []),
    `DECISIONS · ${input.pendingDecisions} waiting`,
    `${input.site}/ops/company`,
  ].join("\n");
  return {
    subject: `Badger CEO ${phase === "evening" ? "scorecard" : "plan"} · ${progress}${input.pendingDecisions ? ` · ${input.pendingDecisions} decision${input.pendingDecisions === 1 ? "" : "s"}` : ""}`,
    preview: `${phase === "evening" ? "Today’s learning" : "Today's priority"}: ${planPriority}`,
    paragraphs,
    telegram,
    progress: { ...goal, remaining },
    priority: planPriority,
  };
}
