import { usableTaskCopy } from "./plan-quality.ts";

export interface DailyMailContext {
  day: number;
  name: string;
  taskTitle: string;
  minutes: number;
  missed: number;
}

export type DailyMailCopy = { subject: string; paragraphs: string[] };

export function cleanTaskTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  return usableTaskCopy(clean, 3) ? clean : null;
}

export function dailyMailCopy(edition: "morning" | "evening", context: DailyMailContext): DailyMailCopy {
  const name = context.name.trim().split(/\s+/)[0] || "there";
  const task = cleanTaskTitle(context.taskTitle);
  const taskLine = task
    ? `Today’s step is: ${task}.`
    : "Open Badger AI to see today’s step. Bo will help you turn it into one clear action.";
  const minutes = Math.max(5, Math.min(30, Number(context.minutes) || 20));

  if (edition === "evening") {
    return {
      subject: `${name}, how did today’s step go?`,
      paragraphs: [
        task ? `Did you complete today’s step: ${task}?` : "Did you complete today’s step?",
        "If yes, reply with what happened. If not, open the app and do a ten-minute version, or tell me what blocked you.",
      ],
    };
  }

  if (context.day === 14) {
    return {
      subject: `${name}, today we decide from the evidence`,
      paragraphs: [
        "You now have two weeks of evidence.",
        "Today we decide whether to continue, change the approach or stop this idea clearly. Open Badger AI and I will help you make the decision.",
      ],
    };
  }
  if (context.day === 28) {
    return {
      subject: `${name}, this is Day 28`,
      paragraphs: [
        "Today we finish the 28-day challenge.",
        "Open Badger AI to launch what is ready, choose the next move or close the idea with a clear reason.",
      ],
    };
  }
  if (context.missed >= 1) {
    return {
      subject: `${name}, let’s restart with one clear step`,
      paragraphs: [
        context.missed === 1
          ? "Yesterday’s step was not logged. That is not failure, but we should restart today."
          : `You have been quiet for ${context.missed} days. Tell me what got in the way so we can make the work smaller.`,
        `${taskLine} Give it about ${minutes} minutes, then reply with what happened.`,
      ],
    };
  }

  return {
    subject: context.day === 1 ? `${name}, your first step is ready` : `${name}, your Day ${context.day} step is ready`,
    paragraphs: [
      taskLine,
      `Give it about ${minutes} minutes. When you finish, reply with what happened, even if the result is messy.`,
    ],
  };
}
