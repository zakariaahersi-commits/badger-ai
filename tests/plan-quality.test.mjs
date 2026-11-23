import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGeneratedPlan, repairGeneratedPlan, repairGeneratedTasks } from "../lib/plan-quality.ts";
import { buildFallbackPlan } from "../lib/planEngine.ts";

function validPlan(count = 7) {
  return Array.from({ length: count }, (_, index) => ({
    type: "market",
    title: `Message one possible customer on day ${index + 1}`,
    detail: "Ask what they do today and save their exact words.",
    minutes: 15,
    verify: "A note or screenshot added",
  }));
}

test("normalizes a clear generated plan", () => {
  const plan = normalizeGeneratedPlan(validPlan(), 7);
  assert.equal(plan?.length, 7);
  assert.equal(plan?.[0].day, 1);
  assert.equal(plan?.[6].week, 1);
});

test("rejects broken generated grammar instead of showing it to a founder", () => {
  const raw = validPlan();
  raw[0].title = "Message 3 people who might need If they had experience in cultural";
  assert.equal(normalizeGeneratedPlan(raw, 7), null);
});

test("rejects the unfinished task and placeholder seen in production feedback", () => {
  const raw = validPlan();
  raw[0].title = 'Write If they had experience in cultural in one sentence: "I help Families looking for them do [what]."';
  assert.equal(normalizeGeneratedPlan(raw, 7), null);
});

test("rejects placeholders and startup jargon", () => {
  const placeholder = validPlan();
  placeholder[0].detail = "Ask {who} about the problem today.";
  assert.equal(normalizeGeneratedPlan(placeholder, 7), null);

  const jargon = validPlan();
  jargon[0].title = "Create an outreach funnel today";
  assert.equal(normalizeGeneratedPlan(jargon, 7), null);

  const unexplainedMethod = validPlan();
  unexplainedMethod[0].verify = "Three Mom Test questions written down";
  assert.equal(normalizeGeneratedPlan(unexplainedMethod, 7), null);

  const pressure = validPlan();
  pressure[0].detail = "Check whether parents beg to try the product today.";
  assert.equal(normalizeGeneratedPlan(pressure, 7), null);
});

test("repairs a few invalid AI tasks without discarding the personalised plan", () => {
  const fallback = buildFallbackPlan({ name: "Maya", track: "B", ideaShort: "Meal planning", sessionMinutes: 20 });
  const raw = validPlan(28);
  raw[3].title = "Create an outreach funnel today";
  raw[18].detail = "Ask {who} about the problem today.";
  const repaired = repairGeneratedPlan(raw, fallback);
  assert.equal(repaired?.repairedCount, 2);
  assert.equal(repaired?.plan[3].title, fallback[3].title);
  assert.equal(repaired?.plan[0].title, raw[0].title);
});

test("does not label a mostly invalid plan as AI generated", () => {
  const fallback = buildFallbackPlan({ name: "Maya", track: "B", ideaShort: "Meal planning", sessionMinutes: 20 });
  const raw = validPlan(28);
  for (let index = 0; index < 8; index += 1) raw[index].title = "Create an outreach funnel today";
  assert.equal(repairGeneratedPlan(raw, fallback), null);
});

test("fallback plan never joins a sentence fragment to the Day 1 task", () => {
  const plan = buildFallbackPlan({
    name: "Jimmy",
    track: "B",
    idea: "If they had experience in cultural work",
    ideaShort: "If they had experience in cultural",
    industry: "Culture",
    monthsCarried: "One year",
    fear: "Nobody will pay for it.",
    thinkingTime: "Often",
    days: [0],
    sessionMinutes: 25,
    consequence: "Push me. Hard.",
  });
  assert.equal(plan[0].title, "Message 3 people who might have this problem. Ask what they do now.");
  assert.doesNotMatch(plan[0].detail, /looking into If\b/);
});

test("repairs an already-saved broken task with the safe fallback", () => {
  const profile = {
    name: "Jimmy",
    track: "B",
    idea: "If they had experience in cultural work",
    ideaShort: "If they had experience in cultural",
    industry: "Culture",
    monthsCarried: "One year",
    fear: "Nobody will pay for it.",
    thinkingTime: "Often",
    days: [0],
    sessionMinutes: 25,
    consequence: "Push me. Hard.",
  };
  const fallback = buildFallbackPlan(profile);
  const broken = fallback.map((task) => ({ ...task }));
  broken[1].title = "Write If they do [what]";
  const repaired = repairGeneratedTasks(broken, fallback);
  assert.equal(repaired[1].title, fallback[1].title);
});
