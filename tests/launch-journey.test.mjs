import test from "node:test";
import assert from "node:assert/strict";

import { badgesForCompletion } from "../lib/badges.ts";
import { buildFallbackPlan } from "../lib/planEngine.ts";

const profile = {
  name: "Alex",
  idea: "A pricing assistant for freelance designers",
  ideaShort: "pricing help for designers",
  industry: "Creator tools",
  track: "B",
  monthsCarried: "3 months",
  fear: "Nobody will pay for it.",
  thinkingTime: "Sunday morning",
  days: [0, 2, 4],
  sessionMinutes: 25,
  consequence: "Push me. Hard.",
  spot: 128,
  whoFor: "freelance designers",
  goal: "first-customer",
};

test("a founder can move through all 28 days without a missing or broken step", () => {
  const plan = buildFallbackPlan(profile);
  assert.equal(plan.length, 28);
  assert.deepEqual(plan.map((task) => task.day), Array.from({ length: 28 }, (_, index) => index + 1));
  assert.deepEqual(plan.map((task) => task.week), Array.from({ length: 28 }, (_, index) => Math.floor(index / 7) + 1));
  assert.equal(plan[13].type, "kill");
  assert.equal(plan[27].type, "kill");

  const earned = new Set();
  for (const task of plan) {
    assert.ok(task.title.length > 5, `Day ${task.day} has a usable title`);
    assert.ok(task.detail.length > 10, `Day ${task.day} has clear guidance`);
    assert.ok(task.minutes >= 10 && task.minutes <= 30, `Day ${task.day} fits the time promise`);
    assert.ok(task.verify.length > 3, `Day ${task.day} explains what counts`);
    const paymentEvidence = task.day === 25 ? "Customer paid. Stripe payment receipt saved." : "Task completed with proof.";
    for (const badge of badgesForCompletion({ day: task.day, taskType: task.type, streak: task.day, evidenceText: paymentEvidence })) {
      earned.add(badge);
    }
  }

  for (const expected of ["idea-written", "first-conversation", "first-signal", "something-built", "shared-strangers", "survived-kill-day", "first-ask", "first-paying-user", "7-day-streak", "14-day-streak"]) {
    assert.ok(earned.has(expected), `${expected} unlocks during a successful journey`);
  }
});

test("all three onboarding tracks produce a complete launch journey", () => {
  for (const track of ["A", "B", "C"]) {
    const plan = buildFallbackPlan({ ...profile, track });
    assert.equal(plan.length, 28, `track ${track}`);
    assert.equal(plan[0].day, 1, `track ${track} starts on Day 1`);
    assert.equal(plan[27].day, 28, `track ${track} ends on Day 28`);
    assert.equal(plan[27].type, "kill", `track ${track} ends with the final decision`);
  }
});
