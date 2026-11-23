"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  CommunityPost,
  Connection,
  Outcome,
  Profile,
  SprintTask,
  TaskLog,
} from "./types";
import { buildFallbackPlan } from "./planEngine";
import { badgesForCompletion } from "./badges";
import { mergeGeneratedPlan } from "./plan-merge";
import { repairGeneratedTasks } from "./plan-quality";
import { calendarSprintDay } from "./sprint-calendar";

interface ByggaState {
  onboarded: boolean;
  paid: boolean;
  profile: Profile | null;
  planStart: string | null; // ISO date of Day 1
  demoDayOffset: number; // time-travel for previewing the sprint
  tasks: SprintTask[];
  logs: Record<number, TaskLog>;
  badges: Record<string, string>; // badgeId -> ISO unlocked
  outcome: Outcome;
  outcomeNote: string;
  day14Decision: "committed" | "killed" | "pivoted" | null;
  gateDismissedDay: number;
  intentions: Record<number, string>; // day -> planned time ("Morning", "6:30pm"…)
  posts: CommunityPost[];
  comments: Record<string, string[]>; // postId -> comment bodies
  chat: ChatMessage[];
  connections: Connection[];
  notify: boolean; // Bo's morning email opt-in (cloud mode only)
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  planPartial: boolean; // true while only week 1 is AI-made; rest fills in later
  lastCheckinDay: number; // last day Bo opened the chat proactively (device-local)
  cloudHydratedUserId: string | null; // transient sync gate for cross-device sign-in

  completeOnboarding: (profile: Profile, tasks?: SprintTask[], partial?: boolean) => void;
  updateProfile: (changes: Partial<Profile>) => void;
  markCheckin: (day: number) => void;
  upgradePlan: (tasks: SprintTask[]) => void;
  setPaid: (v: boolean) => void;
  activateSprint: (startedAt: string) => void;
  setNotify: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  logTask: (day: number, log: Omit<TaskLog, "loggedAt" | "day">) => string[];
  setIntention: (day: number, time: string) => void;
  decideDay14: (d: "committed" | "killed" | "pivoted") => void;
  decideFinal: (o: Outcome, note: string) => void;
  dismissGate: (day: number) => void;
  addPost: (body: string, tag?: CommunityPost["tag"]) => void;
  firePost: (id: string) => void;
  addComment: (postId: string, body: string) => void;
  pushChat: (m: ChatMessage) => void;
  updateChatAction: (id: string, status: NonNullable<ChatMessage["actions"]>[number]["status"]) => void;
  toggleConnection: (kind: Connection["kind"]) => void;
  advanceDay: (n: number) => void;
  resetAll: () => void;
}

const DEFAULT_CONNECTIONS: Connection[] = [
  { kind: "twitter", label: "X / Twitter", sub: "DMs, replies, post drafts", connected: false },
  { kind: "linkedin", label: "LinkedIn", sub: "DMs, connection requests", connected: false },
  { kind: "gmail", label: "Gmail", sub: "Cold email + warm follow-ups", connected: false },
  { kind: "call", label: "Phone (call log)", sub: "Bo briefs, you dial. Outcomes logged", connected: false },
  { kind: "stripe", label: "Stripe", sub: "So we know when a real customer pays", connected: false },
];

export const useBygga = create<ByggaState>()(
  persist(
    (set, get) => ({
      onboarded: false,
      paid: false,
      profile: null,
      planStart: null,
      demoDayOffset: 0,
      tasks: [],
      logs: {},
      badges: {},
      outcome: null,
      outcomeNote: "",
      day14Decision: null,
      gateDismissedDay: 0,
      intentions: {},
      posts: [],
      comments: {},
      chat: [],
      connections: DEFAULT_CONNECTIONS,
      notify: true,
      soundEnabled: false,
      hapticsEnabled: true,
      planPartial: false,
      lastCheckinDay: 0,
      cloudHydratedUserId: null,

      completeOnboarding: (profile, tasks, partial = false) =>
        set((state) => ({
          onboarded: true,
          profile,
          // Day 1 begins only after the payment entitlement is active. Keep an
          // existing paid sprint start if the founder revisits onboarding.
          planStart: state.paid ? state.planStart : null,
          tasks: repairGeneratedTasks(tasks, buildFallbackPlan(profile)),
          planPartial: partial,
          chat: [
            {
              from: "bo",
              body: `${profile.name}. Day 1 starts now. One clear step is waiting on your Today tab. It takes under 30 minutes. Save what happened and I will check in tomorrow.`,
              time: timeNow(),
            },
          ],
        })),

      updateProfile: (changes) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...changes } : null,
        })),

      // Swap in days 8–28 once the background plan finishes. Week 1 is the
      // exact plan the founder saw and accepted during onboarding.
      upgradePlan: (tasks) =>
        set((s) => {
          const merged = mergeGeneratedPlan(s.tasks, tasks, s.logs);
          if (!merged) return {};
          return { tasks: merged, planPartial: false };
        }),

      setPaid: (v) => set({ paid: v }),
      activateSprint: (startedAt) => {
        const timestamp = Date.parse(startedAt);
        if (!Number.isFinite(timestamp)) return;
        set({ paid: true, planStart: new Date(timestamp).toISOString(), demoDayOffset: 0 });
      },

      setNotify: (v) => set({ notify: v }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),

      logTask: (day, log) => {
        const s = get();
        const logs = {
          ...s.logs,
          [day]: { ...log, day, loggedAt: new Date().toISOString() },
        };
        const task = s.tasks.find((t) => t.day === day);
        const streak = computeStreak(logs, currentDayOf(s));
        const earned = badgesForCompletion({
          day,
          taskType: task?.type ?? "build",
          streak,
          evidenceText: `${log.did} ${log.learned} ${log.proof ?? ""}`,
        }).filter((id) => !s.badges[id]);
        const badges = { ...s.badges };
        for (const id of earned) badges[id] = new Date().toISOString();
        set({ logs, badges });
        return earned;
      },

      setIntention: (day, time) =>
        set((s) => ({ intentions: { ...s.intentions, [day]: time } })),

      decideDay14: (d) =>
        set((s) => ({
          day14Decision: d,
          outcome: d === "killed" ? "killed" : s.outcome,
          badges:
            d === "killed"
              ? { ...s.badges, "killed-smart": new Date().toISOString() }
              : { ...s.badges, "survived-kill-day": new Date().toISOString() },
        })),

      decideFinal: (o, note) =>
        set((s) => ({
          outcome: o,
          outcomeNote: note,
          badges: {
            ...s.badges,
            ...(o === "shipped"
              ? { shipped: new Date().toISOString() }
              : o === "killed"
                ? { "killed-smart": new Date().toISOString() }
                : {}),
          },
        })),

      dismissGate: (day) => set({ gateDismissedDay: day }),

      addPost: (body, tag) =>
        set((s) => ({
          posts: [
            {
              id: `p${Date.now()}`,
              who: s.profile?.name || "You",
              initial: (s.profile?.name || "Y")[0].toUpperCase(),
              when: "now",
              week: `Week ${Math.min(4, Math.ceil(currentDayOf(s) / 7))}`,
              body,
              fire: 0,
              comments: 0,
              tag,
              mine: true,
            },
            ...s.posts,
          ],
        })),

      firePost: (id) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === id ? { ...p, fire: p.fire + 1 } : p)),
        })),

      addComment: (postId, body) =>
        set((s) => ({
          comments: { ...s.comments, [postId]: [...(s.comments[postId] ?? []), body] },
          posts: s.posts.map((p) =>
            p.id === postId ? { ...p, comments: p.comments + 1 } : p
          ),
        })),

      pushChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
      updateChatAction: (id, status) => set((s) => ({
        chat: s.chat.map((message) => ({
          ...message,
          actions: message.actions?.map((action) => action.id === id ? { ...action, status } : action),
        })),
      })),
      markCheckin: (day) => set({ lastCheckinDay: day }),

      toggleConnection: (kind) =>
        set((s) => ({
          connections: s.connections.map((c) =>
            c.kind === kind ? { ...c, connected: !c.connected } : c
          ),
        })),

      advanceDay: (n) =>
        set((s) => ({ demoDayOffset: Math.max(0, s.demoDayOffset + n) })),

      resetAll: () =>
        set({
          onboarded: false,
          paid: false,
          profile: null,
          planStart: null,
          demoDayOffset: 0,
          tasks: [],
          logs: {},
          badges: {},
          outcome: null,
          outcomeNote: "",
          day14Decision: null,
          gateDismissedDay: 0,
          intentions: {},
          posts: [],
          comments: {},
          chat: [],
          connections: DEFAULT_CONNECTIONS,
          planPartial: false,
          lastCheckinDay: 0,
          cloudHydratedUserId: null,
        }),
    }),
    {
      name: "bygga-v1",
      version: 2,
      migrate: (persisted) => repairPersistedSnapshot(persisted as Partial<ByggaState>),
    }
  )
);

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---- Derived selectors (pure functions over state) ----

type Snapshot = Pick<ByggaState, "planStart" | "demoDayOffset" | "logs">;

export function currentDayOf(s: Pick<Snapshot, "planStart" | "demoDayOffset">): number {
  return Math.min(28, calendarSprintDay(s.planStart) + s.demoDayOffset);
}

export function repairPersistedSnapshot<T extends Partial<ByggaState>>(state: T): T {
  if (!state?.profile) return state;
  const fallback = buildFallbackPlan(state.profile);
  return {
    ...state,
    tasks: repairGeneratedTasks(state.tasks, fallback),
    profile: {
      ...state.profile,
      days: Array.isArray(state.profile.days)
        ? state.profile.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [0, 2, 4],
    },
  };
}

// Streak: consecutive days with a log, walking back from today.
// One "streak shield" per week forgives a single missed day (Duolingo model,
// per PRD §4.6 — never 75-Hard restarts).
export function computeStreak(logs: Record<number, TaskLog>, today: number): number {
  let streak = 0;
  const shieldUsedInWeek: Record<number, boolean> = {};
  let d = logs[today] ? today : today - 1;
  for (; d >= 1; d--) {
    if (logs[d]) {
      streak++;
      continue;
    }
    const week = Math.ceil(d / 7);
    if (!shieldUsedInWeek[week]) {
      shieldUsedInWeek[week] = true; // shield absorbs the miss
      continue;
    }
    break;
  }
  return streak;
}

export function missedInARow(logs: Record<number, TaskLog>, today: number): number {
  let n = 0;
  for (let d = today - 1; d >= 1; d--) {
    if (logs[d]) break;
    n++;
  }
  if (!logs[today] && n >= 1) return n; // mid-gap: count days since last log
  return logs[today] ? 0 : n;
}

export function weekStats(
  tasks: SprintTask[],
  logs: Record<number, TaskLog>,
  week: number
) {
  const wTasks = tasks.filter((t) => t.week === week);
  const done = wTasks.filter((t) => logs[t.day]).length;
  return { done, total: wTasks.length };
}
