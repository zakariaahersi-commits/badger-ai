import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachContext } from "../coach-service.ts";
import { calendarSprintDay } from "../sprint-calendar.ts";
import type { ChatMessage, Profile, SprintTask, TaskLog } from "../types.ts";

export interface SprintSnapshot {
  profile?: Profile;
  planStart?: string | null;
  tasks?: SprintTask[];
  logs?: Record<string, TaskLog>;
  intentions?: Record<string, string>;
  chat?: ChatMessage[];
  outcome?: string | null;
}

export async function loadSprintSnapshot(service: SupabaseClient, userId: string): Promise<SprintSnapshot | null> {
  const { data, error } = await service.from("sprints").select("state").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("sprint_unavailable");
  return data?.state && typeof data.state === "object" ? data.state as SprintSnapshot : null;
}

function streak(logs: Record<string, TaskLog>, today: number): number {
  let value = 0;
  for (let day = logs[String(today)] ? today : today - 1; day >= 1; day--) {
    if (!logs[String(day)]) break;
    value++;
  }
  return value;
}

function missed(logs: Record<string, TaskLog>, today: number): number {
  let value = 0;
  for (let day = today - 1; day >= 1; day--) {
    if (logs[String(day)]) break;
    value++;
  }
  return logs[String(today)] ? 0 : value;
}

export function sprintDay(snapshot: SprintSnapshot, now = new Date()): number {
  return Math.min(28, calendarSprintDay(snapshot.planStart ?? null, now, snapshot.profile?.timezone));
}

export function coachContextFromSprint(snapshot: SprintSnapshot, message: string, clientRequestId: string): Partial<CoachContext> {
  const profile = snapshot.profile ?? {};
  const logs = snapshot.logs ?? {};
  const day = sprintDay(snapshot);
  const week = Math.min(4, Math.ceil(day / 7));
  const currentTask = snapshot.tasks?.find((task) => task.day === day);
  const currentLog = logs[String(day)];
  const recentLogs = Object.values(logs).sort((a, b) => a.day - b.day).slice(-28);
  return {
    clientRequestId,
    message,
    profile,
    day,
    week,
    streak: streak(logs, day),
    missedDays: missed(logs, day),
    completedThisWeek: recentLogs.filter((log) => Math.ceil(log.day / 7) === week).length,
    outcome: snapshot.outcome,
    currentTask: currentTask ? { title: currentTask.title, type: currentTask.type, minutes: currentTask.minutes, proofRequirement: currentTask.verify } : undefined,
    currentTaskLog: currentLog ? { day, did: currentLog.did, learned: currentLog.learned, proof: currentLog.proof, proofStatus: "self_attested" } : undefined,
    commitment: snapshot.intentions?.[String(day)] ? {
      plannedTime: snapshot.intentions[String(day)],
      ifThen: `When it is ${snapshot.intentions[String(day)]}, I will start “${currentTask?.title ?? "today's task"}.”`,
    } : undefined,
    recentLogs: recentLogs.map((log) => ({ day: log.day, did: log.did, learned: log.learned, proof: log.proof })),
    recentEvidence: recentLogs.filter((log) => Boolean(log.proof?.trim())).slice(-10).map((log) => ({ day: log.day, summary: log.proof!, source: "task log", status: "self_attested" })),
    history: (snapshot.chat ?? []).slice(-12),
  };
}

export async function saveSprintSnapshot(service: SupabaseClient, userId: string, snapshot: SprintSnapshot): Promise<void> {
  const { error } = await service.from("sprints").update({ state: snapshot, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new Error("sprint_save_failed");
}

export function appendChat(snapshot: SprintSnapshot, from: "bo" | "me", body: string, at = new Date()): SprintSnapshot {
  const chat = [...(snapshot.chat ?? []), {
    from,
    body: body.slice(0, 4_000),
    time: at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }];
  return { ...snapshot, chat: chat.slice(-80) };
}
