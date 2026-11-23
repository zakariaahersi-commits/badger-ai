export const WARM_OUTREACH_SIZE = 5;

export const WARM_OUTREACH_OPENER = "Hey — quick one. I made something for people who have an idea but keep putting off the next step. It gives you one thing to do each day and checks in when you get stuck. Want me to send it?";

export const WARM_OUTREACH_FOLLOW_UP = "Here it is. You can see your plan before paying. It’s $49 once, not a subscription.";

export type WarmOutreachContactStatus = "ready" | "sent" | "replied" | "interested" | "not_interested";

const ALLOWED_TRANSITIONS: Record<WarmOutreachContactStatus, WarmOutreachContactStatus[]> = {
  ready: ["sent"],
  sent: ["replied", "not_interested"],
  replied: ["interested", "not_interested"],
  interested: [],
  not_interested: [],
};

export function mayRecordWarmOutreachStatus(current: string, next: string): next is WarmOutreachContactStatus {
  if (!(current in ALLOWED_TRANSITIONS)) return false;
  return ALLOWED_TRANSITIONS[current as WarmOutreachContactStatus].includes(next as WarmOutreachContactStatus);
}

export function warmOutreachTrackingUrl(input: { sourceCode: string; slot: number; site?: string }): string {
  const site = new URL(input.site?.trim() || "https://badger.example.com");
  const url = new URL("/start", site.origin);
  url.searchParams.set("utm_source", "warm_founder_message");
  url.searchParams.set("utm_medium", "warm_dm");
  url.searchParams.set("utm_campaign", input.sourceCode.slice(0, 64));
  url.searchParams.set("utm_content", `contact_${Math.min(WARM_OUTREACH_SIZE, Math.max(1, Math.trunc(input.slot)))}`);
  return url.toString();
}

export function warmOutreachReply(input: { sourceCode: string; slot: number; site?: string }): string {
  return `${WARM_OUTREACH_FOLLOW_UP}\n\n${warmOutreachTrackingUrl(input)}`;
}

export function warmOutreachCounts(statuses: unknown[]): { sent: number; replies: number; linksShared: number } {
  const clean = statuses.filter((status): status is string => typeof status === "string");
  return {
    sent: clean.filter((status) => status !== "ready").length,
    replies: clean.filter((status) => ["replied", "interested", "not_interested"].includes(status)).length,
    linksShared: clean.filter((status) => status === "interested").length,
  };
}
