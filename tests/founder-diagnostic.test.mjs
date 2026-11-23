import test from "node:test";
import assert from "node:assert/strict";

import { buildFounderDiagnostic } from "../lib/founder-diagnostic.ts";

const base = {
  name: "Maya",
  idea: "A weekly meal-planning tool for busy parents",
  ideaShort: "meal planning",
  industry: "Consumer",
  track: "B",
  monthsCarried: "six months",
  fear: "I'll be embarrassed when it flops.",
  thinkingTime: "Sunday",
  days: [1, 3, 5],
  sessionMinutes: 25,
  consequence: "Push me. Hard.",
  whoFor: "busy parents",
};

test("builds a specific diagnosis from the founder's own answers", () => {
  const result = buildFounderDiagnostic(base);
  assert.equal(result.pattern, "The cautious validator");
  assert.match(result.summary, /meal planning/i);
  assert.match(result.summary, /busy parents/i);
  assert.match(result.blocker, /judged/i);
  assert.equal(result.priorities.length, 3);
});

test("changes the diagnosis and path for a founder who has already built", () => {
  const result = buildFounderDiagnostic({
    ...base,
    track: "C",
    builtWhat: "a working meal planning app",
    fear: "Charging feels gross.",
  });
  assert.equal(result.pattern, "The hidden builder");
  assert.match(result.summary, /working meal planning app/i);
  assert.match(result.coachingStyle, /payment plainly/i);
  assert.deepEqual(result.path, ["Find", "Ask", "Sell", "Decide"]);
});

test("uses an idea explorer's existing observations instead of generic startup advice", () => {
  const result = buildFounderDiagnostic({
    ...base,
    track: "A",
    idea: "(finding my idea)",
    ideaShort: "the problem you pick",
    problemsNoticed: "parents wasting food after busy workdays",
  });
  assert.equal(result.pattern, "The thoughtful explorer");
  assert.match(result.summary, /parents wasting food/i);
  assert.match(result.priorities[0], /parents wasting food/i);
});
