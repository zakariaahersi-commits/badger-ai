export const TESTER_STATUSES = ["active", "paused", "completed", "withdrawn"] as const;
export type TesterStatus = (typeof TESTER_STATUSES)[number];

export const TESTER_FEEDBACK_TAGS = [
  "bug",
  "confusing_copy",
  "visual_inconsistency",
  "bo_quality",
  "task_quality",
  "payment",
  "notification",
  "positive",
  "blocked",
] as const;
export type TesterFeedbackTag = (typeof TESTER_FEEDBACK_TAGS)[number];

export type TesterEvent = {
  event_name: string;
  created_at: string;
  path?: string | null;
  properties?: Record<string, unknown> | null;
};

export type TesterAttention = {
  code: "confirmation" | "onboarding" | "day_one" | "unfinished_task" | "inactive" | "delivery" | "bug";
  severity: "medium" | "high";
  label: string;
  detail: string;
};

type TesterHealthInput = {
  now: Date;
  status: TesterStatus;
  invitedAt: string;
  joinedAt: string;
  emailConfirmedAt: string | null;
  paidAt: string | null;
  day: number | null;
  tasksCompleted: number;
  lastActiveAt: string | null;
  events: TesterEvent[];
  failedDeliveries: number;
  openBugs: Array<{ severity: string }>;
};

const HOUR = 3_600_000;

function ageMs(now: Date, value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : 0;
}

function latest(events: TesterEvent[], name: string): TesterEvent | undefined {
  return events.find((event) => event.event_name === name);
}

export function testerJourney(input: Pick<TesterHealthInput, "emailConfirmedAt" | "paidAt" | "events" | "tasksCompleted">) {
  const onboarded = Boolean(latest(input.events, "onboarding_completed"));
  const started = Boolean(latest(input.events, "task_started"));
  const completed = input.tasksCompleted > 0 || Boolean(latest(input.events, "task_completed"));
  const steps = [true, Boolean(input.emailConfirmedAt), onboarded, Boolean(input.paidAt), started, completed];
  const labels = ["Account created", "Email confirmed", "Onboarding complete", "Access active", "Day 1 started", "First task complete"];
  const complete = steps.filter(Boolean).length;
  const firstMissing = steps.findIndex((step) => !step);
  return {
    complete,
    total: steps.length,
    current: firstMissing === -1 ? steps.length - 1 : firstMissing,
    label: complete === steps.length ? "First task complete" : labels[firstMissing],
    steps: labels.map((label, index) => ({ label, complete: steps[index] })),
  };
}

export function testerAttention(input: TesterHealthInput): TesterAttention[] {
  if (input.status !== "active") return [];
  const alerts: TesterAttention[] = [];
  const accountStart = Date.parse(input.invitedAt) > Date.parse(input.joinedAt) ? input.invitedAt : input.joinedAt;
  const onboardingStarted = latest(input.events, "onboarding_started");
  const onboardingCompleted = latest(input.events, "onboarding_completed");
  const taskStarted = latest(input.events, "task_started");
  const taskCompleted = latest(input.events, "task_completed");

  if (!input.emailConfirmedAt && ageMs(input.now, accountStart) >= 6 * HOUR) {
    alerts.push({ code: "confirmation", severity: "high", label: "Email not confirmed", detail: "Account has waited at least 6 hours for confirmation." });
  }
  if (onboardingStarted && !onboardingCompleted && ageMs(input.now, onboardingStarted.created_at) >= 6 * HOUR) {
    alerts.push({ code: "onboarding", severity: "medium", label: "Onboarding unfinished", detail: "The tester started onboarding but did not finish it." });
  }
  if (input.paidAt && !taskStarted && ageMs(input.now, input.paidAt) >= 24 * HOUR) {
    alerts.push({ code: "day_one", severity: "high", label: "Day 1 not started", detail: "Access began more than 24 hours ago without a task start." });
  }
  if (taskStarted && (!taskCompleted || Date.parse(taskStarted.created_at) > Date.parse(taskCompleted.created_at)) && ageMs(input.now, taskStarted.created_at) >= 2 * HOUR) {
    alerts.push({ code: "unfinished_task", severity: "medium", label: "Task left unfinished", detail: "The latest task start has no later completion event." });
  }
  if (input.day && input.day > 1 && input.tasksCompleted < input.day && input.lastActiveAt && ageMs(input.now, input.lastActiveAt) >= 48 * HOUR) {
    alerts.push({ code: "inactive", severity: "medium", label: "Tester has gone quiet", detail: "No recorded activity for at least 48 hours while the programme is active." });
  }
  if (input.failedDeliveries > 0) {
    alerts.push({ code: "delivery", severity: "high", label: "Message delivery failed", detail: `${input.failedDeliveries} recent Bo message${input.failedDeliveries === 1 ? "" : "s"} failed.` });
  }
  if (input.openBugs.length > 0) {
    const blocking = input.openBugs.some((bug) => bug.severity === "blocking" || bug.severity === "high");
    alerts.push({ code: "bug", severity: blocking ? "high" : "medium", label: "Open feedback", detail: `${input.openBugs.length} open report${input.openBugs.length === 1 ? "" : "s"} from this tester.` });
  }
  return alerts;
}

export function eventRelease(properties: Record<string, unknown> | null | undefined): string | null {
  const value = properties?.release;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null;
}
