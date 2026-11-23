import type { CoachMode, SafetyOutcome } from "../coach-policy";

export type CoachActionType =
  | "inspect_sprint"
  | "summarize_evidence"
  | "prepare_checkpoint"
  | "draft_outreach"
  | "remember_lesson"
  | "create_commitment"
  | "schedule_nudge"
  | "send_email"
  | "publish_content"
  | "deploy_code"
  | "issue_refund"
  | "change_permissions";

export type ActionRisk =
  | "read"
  | "draft"
  | "external"
  | "financial"
  | "code"
  | "permissions"
  | "memory";

export type CoachStopReason =
  | "reply"
  | "approval_required"
  | "completed"
  | "blocked"
  | "budget_exhausted";

export interface CoachStateUpdate {
  kind: "memory_candidate";
  memoryKind: "fact" | "preference" | "commitment" | "blocker" | "intervention" | "lesson";
  content: string;
  confidence: number;
  reason?: string;
}

export interface CoachProposedAction {
  type: CoachActionType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  risk?: ActionRisk;
  requiresApproval?: boolean;
}

export interface CoachTurn {
  say: string;
  facts: string[];
  interpretation?: string;
  stateUpdates: CoachStateUpdate[];
  proposedActions: CoachProposedAction[];
  nextTrigger?: { type: string; at?: string };
  stopReason: CoachStopReason;
}

export interface CoachToolResult {
  actionType: CoachActionType;
  ok: boolean;
  output: Record<string, unknown>;
}

export interface CoachUsage {
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  model: string;
  fallback: boolean;
}

export interface CoachKernelBudget {
  maxSteps: number;
  maxPromptTokens: number;
  maxCompletionTokens: number;
  maxDurationMs: number;
  maxActions: number;
}

export interface CoachKernelResult {
  turn: CoachTurn;
  usage: CoachUsage;
  steps: number;
  toolResults: CoachToolResult[];
  budgetExhausted: boolean;
}

export interface CoachRunResult {
  reply: string;
  turn: CoachTurn;
  actions: PublicActionRequest[];
  source: "deepseek" | "fallback" | "safety" | "context" | "replay";
  mode: CoachMode;
  runId: string;
  durability: "durable" | "ephemeral";
}

export interface PublicActionRequest {
  id: string;
  type: CoachActionType;
  title: string;
  summary: string;
  risk: ActionRisk;
  status: "preview" | "pending" | "approved" | "rejected" | "completed" | "failed";
  approvalRequired: boolean;
  details?: {
    to?: string;
    subject?: string;
    body?: string;
    scheduledAt?: string;
    commitmentTitle?: string;
    outcome?: string;
    evidenceRequired?: string;
    followUpPolicy?: string;
  };
}

export interface CoachRunTelemetry {
  mode: CoachMode;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  fallback: boolean;
  safetyOutcome: SafetyOutcome;
  steps: number;
  status: "waiting_approval" | "completed" | "failed" | "budget_exhausted";
  failure?: string;
}
