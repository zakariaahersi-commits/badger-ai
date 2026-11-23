import { actionFingerprint, ACTION_POLICY, budgetExceeded, DEFAULT_COACH_BUDGET } from "./policy.ts";
import type {
  CoachKernelBudget,
  CoachKernelResult,
  CoachProposedAction,
  CoachToolResult,
  CoachTurn,
  CoachUsage,
} from "./types.ts";

export interface AutoToolContext {
  day: number;
  currentTask?: { title: string; type: string; minutes: number; proofRequirement?: string };
  currentTaskLogged: boolean;
  recentLogs: { day: number; did: string; learned: string; proof?: string }[];
  recentEvidence: { day: number; summary: string; source: string; status?: string }[];
  verifiedPaymentCount: number;
}

export type GenerateCoachStep = (input: {
  step: number;
  toolResults: CoachToolResult[];
}) => Promise<{ turn: CoachTurn; usage: CoachUsage }>;

function emptyUsage(): CoachUsage {
  return { promptTokens: 0, completionTokens: 0, latencyMs: 0, model: "none", fallback: false };
}

export function executeAutoTool(action: CoachProposedAction, context: AutoToolContext): CoachToolResult {
  switch (action.type) {
    case "inspect_sprint":
      return { actionType: action.type, ok: true, output: { day: context.day, currentTask: context.currentTask ?? null, currentTaskLogged: context.currentTaskLogged } };
    case "summarize_evidence":
      return { actionType: action.type, ok: true, output: { verifiedPaymentCount: context.verifiedPaymentCount, evidence: context.recentEvidence.slice(-10), logs: context.recentLogs.slice(-7) } };
    case "prepare_checkpoint":
      return { actionType: action.type, ok: true, output: { day: context.day, completedDays: context.recentLogs.map((log) => log.day), evidenceCount: context.recentEvidence.length, verifiedPaymentCount: context.verifiedPaymentCount } };
    case "draft_outreach":
      return { actionType: action.type, ok: true, output: { draft: typeof action.payload.draft === "string" ? action.payload.draft.slice(0, 2_000) : "", destination: action.payload.destination ?? null, sent: false } };
    default:
      return { actionType: action.type, ok: false, output: { error: "approval_required" } };
  }
}

export async function runCoachKernel({
  generate,
  executeAuto,
  budget = DEFAULT_COACH_BUDGET,
}: {
  generate: GenerateCoachStep;
  executeAuto: (action: CoachProposedAction) => Promise<CoachToolResult> | CoachToolResult;
  budget?: CoachKernelBudget;
}): Promise<CoachKernelResult> {
  const startedAt = Date.now();
  const usage = emptyUsage();
  const toolResults: CoachToolResult[] = [];
  const seen = new Set<string>();
  const executedAutoTypes = new Set<CoachProposedAction["type"]>();
  const retainedActions = new Map<string, CoachProposedAction>();
  const retainedUpdates = new Map<string, CoachTurn["stateUpdates"][number]>();
  let steps = 0;
  let executedAutoActionOnFinalStep = false;
  let turn: CoachTurn = { say: "", facts: [], stateUpdates: [], proposedActions: [], stopReason: "reply" };

  while (!budgetExceeded(usage, steps, startedAt, budget)) {
    executedAutoActionOnFinalStep = false;
    const generated = await generate({ step: steps + 1, toolResults: [...toolResults] });
    steps += 1;
    usage.promptTokens += generated.usage.promptTokens;
    usage.completionTokens += generated.usage.completionTokens;
    usage.latencyMs += generated.usage.latencyMs;
    usage.model = generated.usage.model;
    usage.fallback ||= generated.usage.fallback;
    turn = generated.turn;
    for (const update of turn.stateUpdates) retainedUpdates.set(`${update.memoryKind}:${update.content}`, update);

    const autoActions: CoachProposedAction[] = [];
    for (const action of turn.proposedActions.slice(0, budget.maxActions)) {
      const fingerprint = actionFingerprint(action);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      retainedActions.set(fingerprint, action);
      if (ACTION_POLICY[action.type].auto && !executedAutoTypes.has(action.type)) autoActions.push(action);
    }

    if (!autoActions.length) break;
    for (const action of autoActions) {
      executedAutoTypes.add(action.type);
      toolResults.push(await executeAuto(action));
      executedAutoActionOnFinalStep = true;
    }
  }

  const exhausted = budgetExceeded(usage, steps, startedAt, budget) && executedAutoActionOnFinalStep;
  const pendingActions = [...retainedActions.values()].filter((action) => !ACTION_POLICY[action.type].auto);
  turn = {
    ...turn,
    stateUpdates: [...retainedUpdates.values()],
    proposedActions: pendingActions,
    stopReason: exhausted ? "budget_exhausted" : pendingActions.length ? "approval_required" : turn.stopReason,
  };
  return { turn, usage, steps, toolResults, budgetExhausted: exhausted };
}
