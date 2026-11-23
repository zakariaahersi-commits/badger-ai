// Core Byqqa domain types.

export type Track = "A" | "B" | "C";
// A: no idea yet · B: stuck on an idea · C: built but not selling

export type Fear =
  | "Nobody will pay for it."
  | "I'll be embarrassed when it flops."
  | "Charging feels gross."
  | "I don't know who to ask."
  | "I'll do it later. (You won't.)";

export type TaskType =
  | "validate"
  | "build"
  | "market"
  | "revenue"
  | "reflection"
  | "call"
  | "kill";

export interface SprintTask {
  day: number; // 1..28
  week: number; // 1..4
  type: TaskType;
  title: string;
  detail: string;
  minutes: number;
  verify: string; // what counts as proof
}

export interface TaskLog {
  day: number;
  did: string;
  learned: string;
  next: string;
  proof?: string; // link / handle / screenshot
  loggedAt: string; // ISO
}

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  condition: string;
}

export interface CommunityPost {
  id: string;
  who: string;
  initial: string;
  when: string;
  week: string;
  body: string;
  fire: number;
  comments: number;
  tag?: "win" | "kill" | "stuck";
  mine?: boolean;
}

export interface ChatMessage {
  from: "bo" | "me";
  body: string;
  time: string;
  actions?: ChatAction[];
}

export interface ChatAction {
  id: string;
  type: string;
  title: string;
  summary: string;
  risk: string;
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

export interface Profile {
  name: string;
  avatarUrl?: string;
  idea: string;
  ideaShort: string;
  industry: string;
  track: Track;
  monthsCarried: string;
  fear: Fear;
  thinkingTime: string;
  days: number[]; // 0=Mon..6=Sun selected work days
  sessionMinutes: number;
  timezone?: string; // IANA timezone used for calendar days and scheduled check-ins
  consequence: string; // ghost contract choice
  spot?: number; // legacy field retained for older saved profiles

  // Richer, funnel-specific inputs that drive the individualized plan.
  // All optional so older saved profiles keep working.
  stage?: string; // how far along: "just an idea" … "people are paying"
  audience?: string; // how easily they can reach potential customers
  experience?: string; // first time / started before / shipped before
  whoFor?: string; // who they think it's for (B/C)
  skills?: string; // what they're good at (A)
  interests?: string; // areas they're drawn to (A)
  problemsNoticed?: string; // problems they keep noticing (A)
  builtWhat?: string; // what they've already made (C)
  triedSelling?: string; // what they've tried to get customers (C)
  goal?: string; // what a win in 28 days looks like to them
  commitment?: string; // their "why this deserves 28 days", extracted at the gate
  blocker?: string; // the founder's self-identified execution blocker
  confidence?: string; // self-rated confidence at the start of the journey
  planSource?: "ai" | "fallback"; // how the plan was generated
}


export type Outcome = "shipped" | "killed" | "committed" | null;

export interface Connection {
  kind: "twitter" | "linkedin" | "gmail" | "call" | "stripe";
  label: string;
  sub: string;
  connected: boolean;
}
