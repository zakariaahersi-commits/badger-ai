import type { SprintTask } from "./types";

export function mergeGeneratedPlan(
  current: SprintTask[],
  generated: SprintTask[],
  loggedDays: Record<number, unknown>,
): SprintTask[] | null {
  if (!Array.isArray(generated) || generated.length !== 28) return null;
  return generated.map((task) => {
    // Week 1 is the plan shown during onboarding. Keep that promise stable;
    // also preserve any later day the founder has already completed.
    if (task.day <= 7 || loggedDays[task.day]) {
      return current.find((existing) => existing.day === task.day) ?? task;
    }
    return task;
  });
}
