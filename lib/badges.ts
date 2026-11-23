import type { BadgeDef } from "./types";

export const BADGES: BadgeDef[] = [
  { id: "idea-written", name: "Idea Written", emoji: "✍️", condition: "First task logged on Day 1" },
  { id: "first-conversation", name: "First Conversation", emoji: "💬", condition: "First customer conversation logged" },
  { id: "first-signal", name: "First Signal", emoji: "📡", condition: "Something live: page, form, or post" },
  { id: "something-built", name: "Something Built", emoji: "🔨", condition: "First artifact created and shared" },
  { id: "shared-strangers", name: "Shared With Strangers", emoji: "🌍", condition: "Shared outside your inner circle" },
  { id: "survived-kill-day", name: "Survived Kill Day", emoji: "⚠️", condition: "Passed the Day 14 checkpoint" },
  { id: "first-ask", name: "The Ask", emoji: "🤲", condition: "First direct ask for money" },
  { id: "first-paying-user", name: "First Paying Customer", emoji: "💸", condition: "A verified payment is logged" },
  { id: "7-day-streak", name: "7-Day Builder", emoji: "🔥", condition: "7-day streak" },
  { id: "14-day-streak", name: "14-Day Builder", emoji: "🔥", condition: "14-day streak" },
  { id: "shipped", name: "Shipped", emoji: "🚀", condition: "Day 28 Ship Day declared" },
  { id: "killed-smart", name: "Killed Smart", emoji: "🪦", condition: "Kill Day declared and logged. Celebrated" },
];

// Which badge unlocks when a given plan day's task is completed.
export function badgesForCompletion(opts: {
  day: number;
  taskType: string;
  streak: number;
  evidenceText?: string;
}): string[] {
  const out: string[] = [];
  if (opts.day === 1) out.push("idea-written");
  if (opts.taskType === "call" && opts.day <= 14) out.push("first-conversation");
  if (opts.taskType === "build" && opts.day >= 15) out.push("something-built");
  if (opts.taskType === "market" && opts.day >= 15) out.push("first-signal");
  if (opts.taskType === "market" && opts.day >= 22) out.push("shared-strangers");
  if (opts.taskType === "revenue") out.push("first-ask");
  if (
    opts.taskType === "revenue" &&
    /\b(paid|payment received|customer paid|receipt|stripe payment|sold)\b/i.test(opts.evidenceText ?? "")
  ) out.push("first-paying-user");
  if (opts.day === 14) out.push("survived-kill-day");
  if (opts.streak >= 7) out.push("7-day-streak");
  if (opts.streak >= 14) out.push("14-day-streak");
  return out;
}
