import test from "node:test";
import assert from "node:assert/strict";

import { mergeGeneratedPlan } from "../lib/plan-merge.ts";

const plan = (prefix) => Array.from({ length: 28 }, (_, index) => ({
  day: index + 1,
  week: Math.floor(index / 7) + 1,
  type: "build",
  title: `${prefix} ${index + 1}`,
  detail: "Do the work",
  minutes: 25,
  verify: "Save proof",
}));

test("background planning preserves the promised first week and completed later days", () => {
  const current = plan("shown");
  const generated = plan("new");
  const merged = mergeGeneratedPlan(current, generated, { 12: { did: "done" } });

  assert.ok(merged);
  assert.deepEqual(merged.slice(0, 7).map((task) => task.title), current.slice(0, 7).map((task) => task.title));
  assert.equal(merged[7].title, "new 8");
  assert.equal(merged[11].title, "shown 12");
  assert.equal(merged[27].title, "new 28");
});

test("invalid background plans are rejected", () => {
  assert.equal(mergeGeneratedPlan(plan("shown"), plan("new").slice(0, 27), {}), null);
});
