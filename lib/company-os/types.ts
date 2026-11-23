export const COMPANY_AGENT_IDS = [
  "ceo", "engineering", "customer_success", "growth", "content", "revenue", "compliance", "qa",
] as const;

export type CompanyAgentId = typeof COMPANY_AGENT_IDS[number];
export const COMPANY_METRIC_IDS = [
  "paying_founders",
  "active_entitlements",
  "total_users",
  "tasks_completed_24h",
  "coach_messages_24h",
  "product_events_24h",
  "pending_checkouts",
  "open_bugs",
  "ai_failures_today",
] as const;
export type CompanyMetricId = typeof COMPANY_METRIC_IDS[number];
export type CompanyMode = "observe" | "guarded" | "active";
export type AgentAutonomy = "observe" | "draft" | "bounded" | "disabled";
export type CompanyRisk = "read" | "draft" | "internal" | "external" | "code" | "financial" | "permissions" | "legal";

export type CompanyActionType =
  | "record_observation"
  | "create_internal_report"
  | "send_owner_alert"
  | "draft_customer_message"
  | "draft_campaign"
  | "prepare_social_content"
  | "queue_ugc_video"
  | "prepare_bug_fix"
  | "propose_experiment"
  | "queue_engineering_work"
  | "send_customer_email"
  | "reply_company_email"
  | "publish_social_content"
  | "deploy_code"
  | "change_price"
  | "issue_refund"
  | "change_permissions"
  | "change_budget"
  | "sign_contract";

export interface ProposedCompanyAction {
  type: string;
  title: string;
  rationale: string;
  payload?: Record<string, unknown>;
}

export interface CompanyDailyPlanProposal {
  objective: string;
  bottleneck: string;
  hypothesis: string;
  leadingSignal: string;
  stopCondition: string;
  experiment: {
    title: string;
    audience: string;
    channel: "instagram" | "social" | "email" | "product" | "imessage" | "partnership" | "warm_dm" | "other";
    cta: string;
    targetMetric: string;
    successThreshold: number;
  };
}

export interface CompanyAgentOutput {
  summary: string;
  health: "healthy" | "watch" | "critical";
  observations: string[];
  actions: ProposedCompanyAction[];
  dailyPlan?: CompanyDailyPlanProposal;
}

export interface CompanyMetrics {
  generatedAt: string;
  totalUsers: number;
  activeEntitlements: number;
  paidFounders: number;
  testerAccess: number;
  newPaidFounders24h: number;
  onboardingLanded7d?: number;
  onboardingStarted7d: number;
  onboardingCaptured7d?: number;
  onboardingResumeScheduled7d?: number;
  onboardingCompleted7d: number;
  planRevealViewed7d: number;
  planRevealCtaClicked7d: number;
  journeySaveViewed7d: number;
  accountSaveStarted7d: number;
  accountSaveCompleted7d: number;
  paywallViewed7d: number;
  paywallCtaClicked7d: number;
  checkoutStarted7d: number;
  onboardingSteps7d?: Array<{
    screen: string;
    phase: string;
    step: number;
    viewed: number;
    completed: number;
  }>;
  onboardingStepCohort7d?: string | null;
  onboardingLargestDrop7d?: {
    fromScreen: string;
    toScreen: string;
    fromViewed: number;
    toViewed: number;
    retentionRate: number;
  } | null;
  activatedPaidFounders28d: number;
  returningPaidFounders28d: number;
  openBugs: number;
  blockingBugs: number;
  checkoutPending: number;
  aiCallsToday: number;
  aiFailuresToday: number;
  aiCostTodayUsd: number;
  productEvents24h: number;
  tasksCompleted24h: number;
  coachMessages24h: number;
  failedDeliveries24h: number;
}
