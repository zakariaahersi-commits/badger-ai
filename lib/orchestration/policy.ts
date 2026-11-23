import type {
  ActionRisk,
  CoachActionType,
  CoachKernelBudget,
  CoachProposedAction,
  CoachStateUpdate,
  CoachTurn,
  CoachUsage,
} from "./types";

export const DEFAULT_COACH_BUDGET: CoachKernelBudget = {
  maxSteps: 3,
  maxPromptTokens: 48_000,
  maxCompletionTokens: 6_000,
  maxDurationMs: 90_000,
  maxActions: 5,
};

export const ACTION_POLICY: Record<CoachActionType, { risk: ActionRisk; approval: boolean; auto: boolean }> = {
  inspect_sprint: { risk: "read", approval: false, auto: true },
  summarize_evidence: { risk: "read", approval: false, auto: true },
  prepare_checkpoint: { risk: "read", approval: false, auto: true },
  draft_outreach: { risk: "draft", approval: false, auto: true },
  remember_lesson: { risk: "memory", approval: true, auto: false },
  create_commitment: { risk: "memory", approval: true, auto: false },
  schedule_nudge: { risk: "external", approval: true, auto: false },
  send_email: { risk: "external", approval: true, auto: false },
  publish_content: { risk: "external", approval: true, auto: false },
  deploy_code: { risk: "code", approval: true, auto: false },
  issue_refund: { risk: "financial", approval: true, auto: false },
  change_permissions: { risk: "permissions", approval: true, auto: false },
};

const ACTION_TYPES = new Set(Object.keys(ACTION_POLICY));
const MEMORY_KINDS = new Set(["fact", "preference", "commitment", "blocker", "intervention", "lesson"]);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 8_000) return JSON.parse(serialized) as Record<string, unknown>;
    return { truncated: serialized.slice(0, 7_500) };
  } catch {
    return {};
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(stripped);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

export function normalizeProposedAction(value: unknown): CoachProposedAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = text(raw.type, 40) as CoachActionType;
  if (!ACTION_TYPES.has(type)) return null;
  const policy = ACTION_POLICY[type];
  const payload = object(raw.payload);
  if (type === "send_email" || type === "schedule_nudge") {
    const to = text(payload.to, 320);
    const subject = text(payload.subject, 200);
    const body = text(payload.text, 4_000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !body) return null;
    if (type === "schedule_nudge") {
      const scheduledAt = text(payload.scheduledAt, 80);
      const timestamp = Date.parse(scheduledAt);
      if (!scheduledAt || !Number.isFinite(timestamp) || timestamp <= Date.now() || timestamp > Date.now() + 28 * 86_400_000) return null;
    }
  }
  if (type === "create_commitment") {
    const followUp = text(payload.followUpPolicy, 30);
    if (!text(payload.title, 200)
      || !text(payload.outcome, 1_000)
      || !text(payload.dueAt, 80)
      || !Number.isFinite(Date.parse(String(payload.dueAt)))
      || !text(payload.evidenceRequired, 1_000)
      || !["remind", "challenge", "checkpoint"].includes(followUp)) return null;
  }
  if (type === "remember_lesson" && !text(payload.memoryId, 80)) return null;
  return {
    type,
    title: text(raw.title, 160) || type.replaceAll("_", " "),
    summary: text(raw.summary, 500),
    payload,
    risk: policy.risk,
    requiresApproval: policy.approval,
  };
}

function normalizeStateUpdate(value: unknown): CoachStateUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "memory_candidate") return null;
  const memoryKind = text(raw.memoryKind, 30);
  const content = text(raw.content, 1_000);
  if (!MEMORY_KINDS.has(memoryKind) || !content) return null;
  return {
    kind: "memory_candidate",
    memoryKind: memoryKind as CoachStateUpdate["memoryKind"],
    content,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    reason: text(raw.reason, 300) || undefined,
  };
}

export function normalizeCoachTurn(value: unknown, fallbackSay: string, maxActions = 5): CoachTurn {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const proposedActions = Array.isArray(raw.proposedActions)
    ? raw.proposedActions.flatMap((action) => {
        const normalized = normalizeProposedAction(action);
        return normalized ? [normalized] : [];
      }).slice(0, maxActions)
    : [];
  const stateUpdates = Array.isArray(raw.stateUpdates)
    ? raw.stateUpdates.flatMap((update) => {
        const normalized = normalizeStateUpdate(update);
        return normalized ? [normalized] : [];
      }).slice(0, 5)
    : [];
  const stop = text(raw.stopReason, 40);
  const stopReason = ["reply", "approval_required", "completed", "blocked", "budget_exhausted"].includes(stop)
    ? (stop as CoachTurn["stopReason"])
    : proposedActions.some((action) => action.requiresApproval)
      ? "approval_required"
      : "reply";
  return {
    say: text(raw.say, 4_000) || text(raw.reply, 4_000) || text(raw.message, 4_000) || text(raw.content, 4_000) || fallbackSay,
    facts: Array.isArray(raw.facts) ? raw.facts.map((fact) => text(fact, 300)).filter(Boolean).slice(0, 8) : [],
    interpretation: text(raw.interpretation, 800) || undefined,
    stateUpdates,
    proposedActions,
    nextTrigger: raw.nextTrigger && typeof raw.nextTrigger === "object"
      ? {
          type: text((raw.nextTrigger as Record<string, unknown>).type, 80),
          at: text((raw.nextTrigger as Record<string, unknown>).at, 80) || undefined,
        }
      : undefined,
    stopReason,
  };
}

export function parseCoachTurn(raw: string, fallbackSay: string, maxActions = 5): CoachTurn {
  const parsed = parseJsonObject(raw);
  if (parsed) return normalizeCoachTurn(parsed, fallbackSay, maxActions);
  const plain = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const safePlain = plain && !plain.startsWith("{") && !plain.startsWith("[") ? text(plain, 4_000) : "";
  return normalizeCoachTurn(safePlain ? { say: safePlain, stopReason: "reply" } : null, fallbackSay, maxActions);
}

export function userRequestedCoachMemory(message: string): boolean {
  return /\b(?:remember (?:this|that|it)|(?:keep|save) (?:this|that|it) in mind|don['’]?t forget|do not forget)\b/i.test(message);
}

export function userExplicitlyAcceptedCommitment(message: string): boolean {
  return /\b(?:i commit|i promise|hold me to (?:this|that|it)|set (?:a|the|that) commitment|yes,? i(?:'|’)ll do (?:this|that|it)|yes,? i will do (?:this|that|it)|let(?:'|’)s do (?:this|that|it)|schedule (?:this|that|it))\b/i.test(message);
}

export function userExplicitlyRequestedAction(type: CoachActionType, message: string): boolean {
  if (ACTION_POLICY[type].auto) return true;
  if (type === "remember_lesson") return userRequestedCoachMemory(message);
  if (type === "create_commitment") return userExplicitlyAcceptedCommitment(message);
  if (type === "schedule_nudge") return /\b(?:remind me|nudge me|schedule (?:a |the )?(?:reminder|nudge))\b/i.test(message);
  if (type === "send_email") return /\b(?:send (?:this|that|the|an?) email|email (?:this|that|it|them|him|her))\b/i.test(message);
  if (type === "publish_content") return /\b(?:publish|post|share publicly)\b/i.test(message);
  if (type === "deploy_code") return /\b(?:deploy|ship (?:this|the) code)\b/i.test(message);
  if (type === "issue_refund") return /\brefund\b/i.test(message);
  if (type === "change_permissions") return /\b(?:permission|access)\b/i.test(message) && /\b(?:change|grant|give|remove|revoke)\b/i.test(message);
  return false;
}

export function enforceCoachConsent(turn: CoachTurn, latestUserMessage: string): CoachTurn {
  const memoryAllowed = userRequestedCoachMemory(latestUserMessage);
  return {
    ...turn,
    stateUpdates: memoryAllowed ? turn.stateUpdates.slice(0, 1) : [],
    proposedActions: turn.proposedActions.filter((action) => userExplicitlyRequestedAction(action.type, latestUserMessage)),
  };
}

export function coachTurnJsonInstruction(): string {
  return `Return one JSON object only with this shape:
{
  "say": "the short user-facing Bo response",
  "facts": ["only deterministic facts from context or tool results"],
  "interpretation": "one concise sentence stating what the founder is communicating or asking for in the latest message",
  "stateUpdates": [{"kind":"memory_candidate","memoryKind":"fact|preference|commitment|blocker|intervention|lesson","content":"...","confidence":0.0,"reason":"..."}],
  "proposedActions": [{"type":"inspect_sprint|summarize_evidence|prepare_checkpoint|draft_outreach|remember_lesson|create_commitment|schedule_nudge|send_email|publish_content|deploy_code|issue_refund|change_permissions","title":"...","summary":"...","payload":{}}],
  "nextTrigger": {"type":"optional trigger","at":"optional ISO time"},
  "stopReason": "reply|approval_required|completed|blocked"
}
For send_email, payload must be {"to":"recipient email","subject":"exact subject","text":"exact plain-text body"}. For schedule_nudge, use the same fields plus "scheduledAt" as an ISO timestamp no more than 28 days ahead. The user must see these exact fields before approval.
For create_commitment, payload must be {"title":"the exact promise","outcome":"what will be true when done","dueAt":"ISO timestamp within 28 days","evidenceRequired":"what proves it happened","followUpPolicy":"remind|challenge|checkpoint"}. When the founder explicitly asks you to create, set or hold them to a commitment and provides a clear promise, time and proof, propose exactly one create_commitment action. Do not substitute schedule_nudge.
The "say" must respond to that interpretation and continue the recent conversation. It must not default to an inactivity nudge, repeat a question the founder already answered, or push a task before addressing what they said.
Only propose one memory_candidate when the founder explicitly asks you to remember, save, keep in mind or not forget something. Never turn a passing mood into memory. A create_commitment action is allowed only after the founder explicitly agrees to that exact promise.
Use an action only when it adds real value. Each automatic action type may run at most once in a founder message. When Tool results already contain an actionType, use that result to answer and do not request that action again. Never propose an approval action unless the founder explicitly asked for that exact action in their latest message. Never invent an email address, recipient or schedule. External, financial, code, permission, notification, publishing, and memory actions always stop for approval. Never put prose outside the JSON.`;
}

export function budgetExceeded(usage: CoachUsage, steps: number, startedAt: number, budget: CoachKernelBudget): boolean {
  return steps >= budget.maxSteps ||
    usage.promptTokens >= budget.maxPromptTokens ||
    usage.completionTokens >= budget.maxCompletionTokens ||
    Date.now() - startedAt >= budget.maxDurationMs;
}

export function actionFingerprint(action: CoachProposedAction): string {
  return `${action.type}:${action.title.toLowerCase()}:${JSON.stringify(action.payload)}`.slice(0, 1_000);
}
