import type { CompanyActionType, CompanyAgentId } from "./types.ts";
import { buildExperimentTrackingUrl } from "./experiment-attribution.ts";

export type CompanyExperimentChannel = "instagram" | "social" | "email" | "product" | "imessage" | "partnership" | "warm_dm" | "other";

export type CompanyWorkOrderAssignment = {
  agentId: CompanyAgentId;
  deliverable: string;
  actionTypes: CompanyActionType[];
};

export type CompanyDailyWorkOrder = {
  objective: string;
  experimentTitle: string;
  channel: CompanyExperimentChannel;
  sourceCode: string | null;
  trackingUrl: string | null;
  assignments: CompanyWorkOrderAssignment[];
  operatingRule: string;
};

type PlanLike = {
  objective?: unknown;
  company_experiments?: unknown;
  experiment?: unknown;
};

type ExperimentLike = {
  title?: unknown;
  status?: unknown;
  channel?: unknown;
  source_code?: unknown;
};

const CEO_ASSIGNMENT: CompanyWorkOrderAssignment = {
  agentId: "ceo",
  deliverable: "Own the hypothesis, resolve one material blocker and keep every specialist on this experiment.",
  actionTypes: ["record_observation", "create_internal_report", "send_owner_alert"],
};

const CHANNEL_ASSIGNMENTS: Record<CompanyExperimentChannel, CompanyWorkOrderAssignment[]> = {
  product: [
    { agentId: "growth", deliverable: "Write the single-variable funnel experiment: baseline, exact change, event sequence, success threshold and stop rule.", actionTypes: ["propose_experiment", "create_internal_report"] },
    { agentId: "qa", deliverable: "Verify the affected journey and its instrumentation; return reproducible evidence and a testable acceptance gate.", actionTypes: ["create_internal_report", "prepare_bug_fix", "queue_engineering_work"] },
    { agentId: "engineering", deliverable: "Turn verified evidence into the smallest reviewable implementation handoff; do not widen scope or deploy.", actionTypes: ["prepare_bug_fix", "queue_engineering_work"] },
  ],
  instagram: [
    { agentId: "growth", deliverable: "Define one audience, hook, CTA, attribution code and next-day success signal for this post.", actionTypes: ["propose_experiment"] },
    { agentId: "content", deliverable: "Produce one complete, human-sounding Instagram asset brief and caption that demonstrates Bo's real behaviour.", actionTypes: ["draft_campaign", "publish_social_content"] },
    { agentId: "revenue", deliverable: "Check that the CTA, landing promise, one-time price and payment path match the experiment without adding a new offer.", actionTypes: ["create_internal_report"] },
  ],
  social: [
    { agentId: "growth", deliverable: "Define one X/TikTok audience, hook, CTA, attribution code and stop rule. LinkedIn is out of scope.", actionTypes: ["propose_experiment"] },
    { agentId: "content", deliverable: "Prepare one complete X post and one transparent TikTok production brief that demonstrate Bo's real behaviour. Do not publish and do not create LinkedIn content.", actionTypes: ["prepare_social_content"] },
    { agentId: "revenue", deliverable: "Verify that the CTA, landing promise, one-time price and buying path match the attributed X/TikTok experiment.", actionTypes: ["create_internal_report"] },
  ],
  email: [
    { agentId: "growth", deliverable: "Define the opted-in segment, one message hypothesis, CTA, attribution code and stop rule.", actionTypes: ["propose_experiment"] },
    { agentId: "content", deliverable: "Draft the complete acquisition email in Badger's plain-spoken voice; do not send it or invent proof.", actionTypes: ["draft_campaign"] },
    { agentId: "revenue", deliverable: "Verify that the email promise, one-time price and checkout path are consistent before any send is approved.", actionTypes: ["create_internal_report"] },
  ],
  imessage: [
    { agentId: "growth", deliverable: "Define the iPhone pilot cohort, connection CTA and reply/task-completion signal for this experiment.", actionTypes: ["propose_experiment", "create_internal_report"] },
    { agentId: "customer_success", deliverable: "Draft the first contextual Bo conversation and follow-up based on the founder's real plan and commitment days.", actionTypes: ["draft_customer_message", "create_internal_report"] },
    { agentId: "qa", deliverable: "Verify linking, consent, STOP/PAUSE, identity isolation and duplicate-nudge protection before expansion.", actionTypes: ["create_internal_report", "prepare_bug_fix", "queue_engineering_work"] },
  ],
  partnership: [
    { agentId: "growth", deliverable: "Define the partner audience, pilot offer, CTA, attribution and success threshold without inventing demand.", actionTypes: ["propose_experiment", "draft_campaign"] },
    { agentId: "revenue", deliverable: "Prepare the commercial shape and decision points without changing price or committing the company.", actionTypes: ["create_internal_report"] },
    { agentId: "compliance", deliverable: "List the minimum privacy, branding, data-processing and approval conditions for a reversible pilot.", actionTypes: ["create_internal_report", "send_owner_alert"] },
  ],
  warm_dm: [
    { agentId: "growth", deliverable: "Own the five-person warm-message test: confirm the audience, tracked outcome and five-send stop rule. The approved message is already in the cohort panel; do not write an alternative.", actionTypes: ["propose_experiment"] },
    { agentId: "revenue", deliverable: "Check replies, attributed starts, paywall views and payments before recommending another batch.", actionTypes: ["create_internal_report"] },
  ],
  other: [
    { agentId: "growth", deliverable: "Turn the hypothesis into one measurable acquisition test with a named audience, CTA and stop rule.", actionTypes: ["propose_experiment"] },
    { agentId: "content", deliverable: "Create the smallest complete campaign artifact required by the experiment; do not publish it.", actionTypes: ["draft_campaign"] },
    { agentId: "revenue", deliverable: "Verify the experiment can create a traceable buying signal and does not introduce a new commercial promise.", actionTypes: ["create_internal_report"] },
  ],
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function experimentFrom(plan: PlanLike): ExperimentLike | null {
  if (plan.experiment && typeof plan.experiment === "object" && !Array.isArray(plan.experiment)) return plan.experiment as ExperimentLike;
  if (Array.isArray(plan.company_experiments)) {
    const candidate = plan.company_experiments[0];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate as ExperimentLike;
  }
  return null;
}

function channel(value: unknown): CompanyExperimentChannel {
  return ["instagram", "social", "email", "product", "imessage", "partnership", "warm_dm"].includes(String(value))
    ? value as CompanyExperimentChannel
    : "other";
}

export function buildCompanyDailyWorkOrder(plan: PlanLike | null | undefined): CompanyDailyWorkOrder | null {
  if (!plan) return null;
  const experiment = experimentFrom(plan);
  if (!experiment) return null;
  if (typeof experiment.status === "string" && !["planned", "running", "measuring"].includes(experiment.status)) return null;
  const experimentChannel = channel(experiment.channel);
  const sourceCode = typeof experiment.source_code === "string" && experiment.source_code.trim() ? experiment.source_code.trim() : null;
  return {
    objective: text(plan.objective, "Advance the current verified company goal."),
    experimentTitle: text(experiment.title, "Current company experiment"),
    channel: experimentChannel,
    sourceCode,
    trackingUrl: buildExperimentTrackingUrl({ sourceCode, channel: experimentChannel }),
    assignments: [CEO_ASSIGNMENT, ...CHANNEL_ASSIGNMENTS[experimentChannel]],
    operatingRule: "One company experiment at a time. Assigned agents produce their named deliverable; unassigned agents stay quiet unless verified evidence shows a critical reliability, payment, privacy or safety risk.",
  };
}

export function assignmentForAgent(workOrder: CompanyDailyWorkOrder | null, agentId: string): (CompanyWorkOrderAssignment & { assigned: true; experimentTitle: string; channel: CompanyExperimentChannel; sourceCode: string | null; trackingUrl: string | null; operatingRule: string }) | { assigned: false; experimentTitle: string; channel: CompanyExperimentChannel; sourceCode: string | null; trackingUrl: string | null; operatingRule: string } | null {
  if (!workOrder) return null;
  const assignment = workOrder.assignments.find((item) => item.agentId === agentId);
  if (!assignment) return { assigned: false, experimentTitle: workOrder.experimentTitle, channel: workOrder.channel, sourceCode: workOrder.sourceCode, trackingUrl: workOrder.trackingUrl, operatingRule: workOrder.operatingRule };
  return { ...assignment, assigned: true, experimentTitle: workOrder.experimentTitle, channel: workOrder.channel, sourceCode: workOrder.sourceCode, trackingUrl: workOrder.trackingUrl, operatingRule: workOrder.operatingRule };
}

export function workOrderAllowsAction(assignment: unknown, actionType: CompanyActionType, health: "healthy" | "watch" | "critical"): boolean {
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return true;
  const value = assignment as { assigned?: unknown; actionTypes?: unknown };
  if (health === "critical" && actionType === "send_owner_alert") return true;
  if (value.assigned !== true || !Array.isArray(value.actionTypes)) return false;
  return value.actionTypes.includes(actionType);
}
