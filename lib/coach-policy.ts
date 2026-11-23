export type CoachMode = "onboarding" | "sprint" | "checkpoint" | "graduate";

export type SafetyOutcome = "none" | "crisis" | "medical" | "legal" | "financial";

export interface CoachPolicyContext {
  mode: CoachMode;
  day: number;
  hasProfile: boolean;
  hasVenture: boolean;
  hasCurrentTask: boolean;
  currentTaskLogged: boolean;
  verifiedPaymentCount: number;
}

const COMPLETION_CLAIM =
  /\b(?:task|day|work)\s+(?:is\s+)?(?:complete|completed|done|logged)\b|\b(?:that(?:'s| is)|it(?:'s| is))\s+(?:complete|completed|done|logged|saved)\b|\b(?:i(?:'ve| have)\s+)?(?:logged|saved)\s+(?:it|that|today|the task|your task)\b/i;

const PAYMENT_CLAIM =
  /\b(?:you|we)\s+(?:got|received|made|earned|have|landed)\s+(?:a|one|\d+|your first)?\s*(?:verified\s+)?(?:payment|paying customer|sale)\b|\b[1-9]\d*\s+(?:verified\s+)?payments?\b|\b(?:a|the)\s+customer\s+(?:has\s+)?paid\b|\byour\s+(?:first|new)\s+(?:payment|paying customer|sale)\b/i;

export function deriveCoachMode(input: {
  day: number;
  outcome?: string | null;
  taskType?: string;
  hasProfile: boolean;
}): CoachMode {
  if (!input.hasProfile) return "onboarding";
  if (input.outcome === "shipped") return "graduate";
  if (input.taskType === "kill" || input.day === 14 || input.day === 28) return "checkpoint";
  return "sprint";
}

export function classifyCoachSafety(text: string): SafetyOutcome {
  const value = text.toLowerCase();
  if (/\b(?:kill myself|end my life|suicide|self[- ]harm|hurt myself|don't want to live|do not want to live)\b/i.test(value)) {
    return "crisis";
  }
  if (/\b(?:diagnose|diagnosis|medication|prescription|dosage|medical emergency|chest pain|symptoms?)\b/i.test(value)) {
    return "medical";
  }
  if (/\b(?:lawsuit|sue|legal advice|is this legal|attorney|lawyer|contract clause|terms of service)\b/i.test(value)) {
    return "legal";
  }
  if (/\b(?:investment advice|which stock|buy this stock|sell this stock|tax advice|tax deduction|securities|personal debt|bankruptcy)\b/i.test(value)) {
    return "financial";
  }
  return "none";
}

export function safetyBoundaryReply(outcome: Exclude<SafetyOutcome, "none">): string {
  if (outcome === "crisis") {
    return "I’m not the right support for this. Contact local emergency services or a crisis line now, and tell someone you trust who can stay with you.";
  }
  if (outcome === "medical") {
    return "I can help with the business, but I can’t assess medical symptoms or treatment. Contact a qualified healthcare professional, or emergency services if this feels urgent.";
  }
  if (outcome === "legal") {
    return "I can help you list the business facts and questions, but I can’t give legal advice. Have a qualified lawyer review this before you act.";
  }
  return "I can help you organize the business facts, but I can’t give regulated financial, investment, or tax advice. Check this with a qualified professional before you act.";
}

export function missingContextReply(ctx: CoachPolicyContext): string | null {
  if (!ctx.hasProfile) {
    return "I don’t know enough about you yet. Tell me what you want to test in the next 28 days.";
  }
  if (!ctx.hasVenture) {
    return "I’m missing the venture you want to test. Tell me the idea and who it is for.";
  }
  if (ctx.mode !== "graduate" && !ctx.hasCurrentTask) {
    return `I can’t see a Day ${ctx.day} task. Open Today and restore the plan before I tell you what to do next.`;
  }
  return null;
}

function withoutFalseClaims(reply: string, ctx: CoachPolicyContext): string {
  if (!ctx.currentTaskLogged && COMPLETION_CLAIM.test(reply)) {
    return `I don’t have a saved log for Day ${ctx.day} yet. Save what you did and what you learned before we count the task as complete.`;
  }
  if (ctx.verifiedPaymentCount < 1 && PAYMENT_CLAIM.test(reply)) {
    return "I don’t have a verified payment on record. Treat any payment mentioned in chat as unverified until a trusted payment event confirms it.";
  }
  return reply;
}

export function normalizeCoachReply(reply: string, ctx: CoachPolicyContext): string {
  const cleaned = reply
    .replace(/[—–]/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const guarded = withoutFalseClaims(cleaned, ctx);
  const sentences = guarded.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? [guarded];
  return sentences
    .slice(0, 4)
    .map((sentence) => sentence.trim())
    .join(" ")
    .trim();
}

export function alignReplyWithPendingApproval(
  reply: string,
  actions: Array<{ type: string; title: string; details?: { commitmentTitle?: string } }>,
): string {
  if (!actions.length) return reply;
  const action = actions[0];
  const subject = action.type === "create_commitment"
    ? action.details?.commitmentTitle || action.title
    : action.title;
  return `I’ve prepared this for your approval: ${subject}. Check the details below, then approve it if it matches what you want.`;
}
