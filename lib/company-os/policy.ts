import type { AgentAutonomy, CompanyActionType, CompanyMode, CompanyRisk } from "@/lib/company-os/types";

type ActionPolicy = { risk: CompanyRisk; requiresApproval: boolean; standingApprovalEligible?: boolean; description: string };

export const COMPANY_ACTION_POLICY: Record<CompanyActionType, ActionPolicy> = {
  record_observation: { risk: "read", requiresApproval: false, description: "Record an internal observation" },
  create_internal_report: { risk: "internal", requiresApproval: false, description: "Create an owner-only report" },
  send_owner_alert: { risk: "internal", requiresApproval: false, description: "Alert the configured owner channel" },
  draft_customer_message: { risk: "draft", requiresApproval: false, description: "Draft, but do not send, customer support" },
  draft_campaign: { risk: "draft", requiresApproval: false, description: "Draft, but do not publish, campaign content" },
  prepare_social_content: { risk: "draft", requiresApproval: false, description: "Prepare structured social content without publishing it" },
  queue_ugc_video: { risk: "financial", requiresApproval: true, description: "Spend provider credits to render one approved AI-avatar video without publishing it" },
  prepare_bug_fix: { risk: "draft", requiresApproval: false, description: "Prepare a fix proposal without changing code" },
  propose_experiment: { risk: "draft", requiresApproval: false, description: "Propose a measurable experiment" },
  queue_engineering_work: { risk: "internal", requiresApproval: false, description: "Queue a bounded maintenance job with the configured engineering worker" },
  send_customer_email: { risk: "external", requiresApproval: true, standingApprovalEligible: true, description: "Send communication to an opted-in customer" },
  reply_company_email: { risk: "external", requiresApproval: true, description: "Reply in a verified company inbox thread" },
  publish_social_content: { risk: "external", requiresApproval: true, standingApprovalEligible: true, description: "Publish from a connected company social account" },
  deploy_code: { risk: "code", requiresApproval: true, description: "Change or deploy production code" },
  change_price: { risk: "financial", requiresApproval: true, description: "Change customer pricing" },
  issue_refund: { risk: "financial", requiresApproval: true, description: "Issue a customer refund" },
  change_permissions: { risk: "permissions", requiresApproval: true, description: "Change access or credentials" },
  change_budget: { risk: "financial", requiresApproval: true, description: "Change an operating budget" },
  sign_contract: { risk: "legal", requiresApproval: true, description: "Accept a legal commitment" },
};

export const ENGINEERING_CIRCUIT_COOLDOWN_MS = 24 * 60 * 60_000;
export const OWNER_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;

const PERMANENT_PROVIDER_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422]);

function providerStatus(code: string): number | null {
  const match = code.match(/_(\d{3})$/);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isInteger(status) ? status : null;
}

export function isPermanentCompanyActionFailure(code: string): boolean {
  if (code.startsWith("invalid_") || code.endsWith("_not_configured")) return true;
  const status = providerStatus(code);
  return status !== null && PERMANENT_PROVIDER_STATUSES.has(status);
}

export function isEngineeringConnectorCircuitFailure(code: string | null | undefined): boolean {
  if (!code || (!code.startsWith("github_engineering_provider_") && !code.startsWith("engineering_provider_"))) return false;
  const status = providerStatus(code);
  return status !== null && PERMANENT_PROVIDER_STATUSES.has(status);
}

export function companyOwnerAlertTopic(value: string): string {
  const text = value.toLowerCase();
  if (/(ai|deepseek|coach_chat|plan_full|onboarding)[\s\S]{0,80}(fail|timeout|invalid|empty)|(?:fail|timeout|invalid|empty)[\s\S]{0,80}(ai|deepseek|coach_chat|plan_full|onboarding)/.test(text)) return "ai_reliability";
  if (/no active goal|company goal|strategic direction/.test(text)) return "company_goals";
  if (/checkout|payment|stripe|revenue/.test(text)) return "payments";
  if (/security|privacy|consent|permission|credential/.test(text)) return "security";
  return text.replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 8).join("_") || "general";
}

export function companyActionFailureAlert(input: { actionType: CompanyActionType; title: string; code: string }): string {
  if (input.actionType === "queue_engineering_work" && isEngineeringConnectorCircuitFailure(input.code)) {
    return [
      "🦡 Engineering connector unavailable",
      "The GitHub-native DeepSeek worker rejected the handoff. Automatic engineering jobs are paused for 24 hours; DeepSeek agents and customer workflows are still running.",
      `Reference: ${input.code}`,
    ].join("\n");
  }
  return `🦡 Company action failed\n${input.title}\n${input.code}`;
}

export function isCompanyActionType(value: string): value is CompanyActionType {
  return Object.prototype.hasOwnProperty.call(COMPANY_ACTION_POLICY, value);
}

export function agentMayPropose(actionType: CompanyActionType, allowedActions: readonly string[]): boolean {
  return allowedActions.includes(actionType);
}

export function companyFailureRetryMinutes(consecutiveFailures: number): number {
  const boundedFailures = Math.max(1, Math.min(3, Math.floor(consecutiveFailures) || 1));
  return Math.min(30, 15 * (2 ** (boundedFailures - 1)));
}

export function actionDecision(input: {
  actionType: CompanyActionType;
  mode: CompanyMode;
  autonomy: AgentAutonomy;
  allowedActions: readonly string[];
  standingApproval?: boolean;
}): { risk: CompanyRisk; requiresApproval: boolean; canExecute: boolean; reason: string } {
  const policy = COMPANY_ACTION_POLICY[input.actionType];
  if (input.mode === "observe") return { ...policy, requiresApproval: true, canExecute: false, reason: "Company OS is observing only" };
  if (input.autonomy === "disabled" || input.autonomy === "observe") return { ...policy, requiresApproval: true, canExecute: false, reason: "Agent has no execution authority" };
  if (!agentMayPropose(input.actionType, input.allowedActions)) return { ...policy, requiresApproval: true, canExecute: false, reason: "Action is outside the agent allowlist" };
  if (policy.requiresApproval && !(policy.standingApprovalEligible && input.standingApproval && input.mode === "active" && input.autonomy === "bounded")) return { ...policy, canExecute: false, reason: "Consequential action requires owner or standing approval" };
  if (policy.requiresApproval) return { ...policy, requiresApproval: false, canExecute: true, reason: "Bounded action covered by an explicit standing approval" };
  return { ...policy, canExecute: true, reason: "Bounded internal or draft action" };
}
