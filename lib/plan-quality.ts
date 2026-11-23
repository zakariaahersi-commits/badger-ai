import type { SprintTask, TaskType } from "./types.ts";

const TASK_TYPES: TaskType[] = ["validate", "build", "market", "revenue", "reflection", "call", "kill"];
const JARGON = /\b(outreach|pivot|mvp|traction|funnel|leverage|synergy|mom test)\b/i;
const HYPE_OR_PRESSURE = /\b(?:beg(?:ged|ging)? to try|desperate to use|dying to use)\b/i;
const PLACEHOLDER_OR_BROKEN_VALUE = /[{}\[\]]|\b(undefined|null|not sure yet)\b/i;
const BROKEN_GRAMMAR = /\b(?:might need|need|for)\s+(?:if|when|because|how|whether)\b|^(?:write|message|ask|describe|find|list)\s+(?:if|when|whether|because|how|that|why)\b|\b(?:do|is|are|was|were)\s+[.?!]*$/i;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalizeTask(input: unknown, index: number): SprintTask | null {
  if (!input || typeof input !== "object") return null;
  const task = input as Record<string, unknown>;
  const title = cleanText(task.title, 120);
  const detail = cleanText(task.detail, 400);
  const verify = cleanText(task.verify, 160);
  if (!usableTaskCopy(title, 3) || !usableTaskCopy(detail, 4) || !usableTaskCopy(verify, 2)) return null;

  return {
    day: index + 1,
    week: Math.floor(index / 7) + 1,
    type: TASK_TYPES.includes(task.type as TaskType) ? task.type as TaskType : "build",
    title,
    detail,
    minutes: Math.min(30, Math.max(10, Number(task.minutes) || 20)),
    verify,
  };
}

export function usableTaskCopy(value: string, minimumWords: number): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= minimumWords
    && !JARGON.test(value)
    && !HYPE_OR_PRESSURE.test(value)
    && !PLACEHOLDER_OR_BROKEN_VALUE.test(value)
    && !BROKEN_GRAMMAR.test(value);
}

export function normalizeGeneratedPlan(raw: unknown, count = 28): SprintTask[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const tasks: SprintTask[] = [];

  for (let index = 0; index < count; index += 1) {
    const task = normalizeTask(raw[index], index);
    if (!task) return null;
    tasks.push(task);
  }

  if (count === 28) {
    tasks[13].type = "kill";
    tasks[27].type = "kill";
  }
  return tasks;
}

export function repairGeneratedPlan(
  raw: unknown,
  fallback: SprintTask[],
  minimumGenerated = Math.ceil(fallback.length * 0.75),
): { plan: SprintTask[]; repairedCount: number } | null {
  if (!Array.isArray(raw) || raw.length !== fallback.length || fallback.length === 0) return null;
  let generatedCount = 0;
  const plan = fallback.map((safeTask, index) => {
    const task = normalizeTask(raw[index], index);
    if (!task) return safeTask;
    generatedCount += 1;
    return task;
  });
  if (generatedCount < minimumGenerated) return null;
  if (plan.length === 28) {
    plan[13].type = "kill";
    plan[27].type = "kill";
  }
  return { plan, repairedCount: plan.length - generatedCount };
}

export function repairGeneratedTasks(tasks: unknown, fallback: SprintTask[]): SprintTask[] {
  if (!Array.isArray(tasks) || fallback.length !== 28) return fallback;
  return fallback.map((safeTask, index) => {
    const task = tasks[index] as SprintTask | undefined;
    if (!task || task.day !== index + 1) return safeTask;
    const title = cleanText(task.title, 120);
    const detail = cleanText(task.detail, 400);
    const verify = cleanText(task.verify, 160);
    if (!usableTaskCopy(title, 3) || !usableTaskCopy(detail, 4) || !usableTaskCopy(verify, 2)) return safeTask;
    return {
      ...task,
      day: index + 1,
      week: Math.floor(index / 7) + 1,
      title,
      detail,
      verify,
      minutes: Math.min(30, Math.max(10, Number(task.minutes) || safeTask.minutes)),
    };
  });
}
