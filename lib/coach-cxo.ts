// ──────────────────────────────────────────────────────────
// Bo v2 — CXO Mode Extensions
// These are the CXO-specific capabilities Bo can propose.
// Not a separate interface — Bo suggests, user approves in chat.
// ──────────────────────────────────────────────────────────

// CXO actions Bo can propose, each with an approval gate
export interface CxoProposal {
  id: string;
  type: "code" | "email" | "ad" | "support" | "content" | "research" | "revenue";
  title: string;
  description: string;
  effort: "quick" | "session" | "day";
  approval: "auto" | "required"; // auto for low-risk, required for anything touching money/code/customers
  preview?: string; // Bo shows this before the user approves
}

// CXO mode detection — should CXO capabilities be available?
export function isCxoGraduate(outcome: string | null | undefined, day: number): boolean {
  return outcome === "shipped" && day >= 1;
}

// Phase-specific Bo personality shift
export function getPhaseInstructions(
  day: number,
  outcome: string | null,
  mode?: "onboarding" | "sprint" | "checkpoint" | "graduate"
): string {
  if (mode === "onboarding") {
    return `CURRENT PHASE: ONBOARDING. Ask one question at a time and fill the
missing founder, venture, customer, constraint, and outcome fields. Do not assign
a sprint task until the minimum context exists.`;
  }

  if (mode === "checkpoint") {
    return `CURRENT PHASE: CHECKPOINT. Separate the saved metrics from your
interpretation. On Day 14, require commit, change one angle, or kill. On Day 28,
require ship or kill. Never imply that self-attested evidence is verified.`;
  }

  if (mode === "graduate" || outcome === "shipped") {
    return `CURRENT PHASE: GRADUATE / CXO. The user has a recorded ship outcome.
Your job: propose the next operating action, prepare safe drafts, and ask for
approval immediately before anything sends, publishes, deploys, spends, refunds,
or changes access. Say "we" now.`;
  }

  if (!outcome && day <= 14) {
    return `CURRENT PHASE: Week 1-2 (COMMIT). The user is validating their idea.
Your job: push them to talk to humans. Tasks are about outreach, reflection, calls.
Do NOT suggest building features, ads, or pricing yet. They need evidence first.
Key Day 14 question: "The receipts decide. Commit, change one angle, or kill."`;
  }

  if (!outcome && day <= 28) {
    return `CURRENT PHASE: Weeks 3-4 (SELL). The user committed at Day 14.
Your job: push them to ask for money. Tasks are about revenue, builds, closes.
Key Day 28 question: "Ship or kill. Two customers, or a clean exit."`;
  }

  if (outcome === "killed") {
    return `CURRENT PHASE: POST-KILL. The user killed their idea cleanly.
Your job: help them extract the lesson and decide what's next.
Ask: "What did this teach you? Want to start a new sprint with what you know?"`;
  }

  return `CURRENT PHASE: SPRINT. Keep the founder on one small, evidence-producing task.`;
}

// CXO proposal templates — Bo uses these to structure autonomous suggestions
export const CXO_PROPOSAL_TEMPLATES = {
  code: {
    title: "Code task",
    effort: "session" as const,
    approval: "required" as const,
    description: "Bo writes code in an isolated worktree, tests pass, shows you the diff.",
  },
  email_draft: {
    title: "Email draft",
    effort: "quick" as const,
    approval: "required" as const,
    description: "Bo drafts an email for your review. You send it.",
  },
  support_summary: {
    title: "Support summary",
    effort: "quick" as const,
    approval: "auto" as const,
    description: "Bo reads your inbox, summarizes customer issues, flags urgent ones.",
  },
  ad_check: {
    title: "Ad performance check",
    effort: "quick" as const,
    approval: "auto" as const,
    description: "Bo reviews your ad spend and results, flags what to cut or scale.",
  },
  content_draft: {
    title: "Content draft",
    effort: "quick" as const,
    approval: "required" as const,
    description: "Bo drafts a post or tweet in your voice. Nothing publishes until you say yes.",
  },
  revenue_flag: {
    title: "Revenue flag",
    effort: "quick" as const,
    approval: "required" as const,
    description: "Bo spots an at-risk or upsell-ready customer and drafts the nudge for your approval.",
  },
} as const;
