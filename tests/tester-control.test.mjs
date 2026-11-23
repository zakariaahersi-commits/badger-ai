import test from "node:test";
import assert from "node:assert/strict";
import { eventRelease, testerAttention, testerJourney } from "../lib/tester-control.ts";

const now = new Date("2026-08-10T12:00:00.000Z");
const base = {
  now,
  status: "active",
  invitedAt: "2026-08-09T00:00:00.000Z",
  joinedAt: "2026-08-09T00:00:00.000Z",
  emailConfirmedAt: "2026-08-09T00:10:00.000Z",
  paidAt: "2026-08-09T01:00:00.000Z",
  day: 2,
  tasksCompleted: 1,
  lastActiveAt: "2026-08-10T10:00:00.000Z",
  events: [
    { event_name: "task_completed", created_at: "2026-08-09T02:30:00.000Z" },
    { event_name: "task_started", created_at: "2026-08-09T02:00:00.000Z" },
    { event_name: "onboarding_completed", created_at: "2026-08-09T00:40:00.000Z" },
  ],
  failedDeliveries: 0,
  openBugs: [],
};

test("healthy tester has no attention flags and a complete first-task journey", () => {
  assert.deepEqual(testerAttention(base), []);
  assert.equal(testerJourney(base).complete, 6);
  assert.equal(testerJourney(base).current, 5);
});

test("flags confirmation, abandoned onboarding, day one, delivery, and feedback problems", () => {
  const alerts = testerAttention({
    ...base,
    emailConfirmedAt: null,
    tasksCompleted: 0,
    events: [{ event_name: "onboarding_started", created_at: "2026-08-09T00:15:00.000Z" }],
    failedDeliveries: 2,
    openBugs: [{ severity: "high" }],
  });
  assert.deepEqual(alerts.map((alert) => alert.code), ["confirmation", "onboarding", "day_one", "delivery", "bug"]);
});

test("flags a task start with no later completion but ignores paused testers", () => {
  const unfinished = { ...base, events: [{ event_name: "task_started", created_at: "2026-08-10T08:00:00.000Z" }] };
  assert.equal(testerAttention(unfinished).some((alert) => alert.code === "unfinished_task"), true);
  assert.deepEqual(testerAttention({ ...unfinished, status: "paused" }), []);
});

test("reads bounded release metadata", () => {
  assert.equal(eventRelease({ release: "abcdef123456" }), "abcdef123456");
  assert.equal(eventRelease({ release: 123 }), null);
});
