import test from "node:test";
import assert from "node:assert/strict";

import { shouldExpireUnlaunchedExperiment } from "../lib/company-os/daily-plan.ts";
import { productObservations } from "../lib/company-os/experiment-funnel.ts";

test("a draft-only experiment expires after 36 hours without exposure", () => {
  assert.equal(shouldExpireUnlaunchedExperiment({
    planLocalDate: "2026-08-21",
    currentLocalDate: "2026-08-24",
    experimentCreatedAt: "2026-08-21T08:00:00.000Z",
    result: { latestObservations: [{ metric: "attributed_onboarding_starts", value: 0 }] },
    externalExecutions: 0,
    now: new Date("2026-08-24T08:00:00.000Z"),
  }), true);
});

test("real exposure keeps an experiment alive until its evidence threshold", () => {
  const base = {
    planLocalDate: "2026-08-21",
    currentLocalDate: "2026-08-24",
    experimentCreatedAt: "2026-08-21T08:00:00.000Z",
    externalExecutions: 0,
    now: new Date("2026-08-24T08:00:00.000Z"),
  };
  assert.equal(shouldExpireUnlaunchedExperiment({ ...base, result: { latestObservations: [{ metric: "attributed_onboarding_starts", value: 1 }] } }), false);
  assert.equal(shouldExpireUnlaunchedExperiment({ ...base, result: {}, externalExecutions: 1 }), false);
});

test("product experiments measure the current funnel without requiring campaign UTMs", () => {
  const rows = [
    { event_name: "onboarding_landed", user_id: "a", anonymous_id: null, properties: {} },
    { event_name: "onboarding_landed", user_id: "b", anonymous_id: null, properties: {} },
    { event_name: "onboarding_started", user_id: "a", anonymous_id: null, properties: {} },
    { event_name: "plan_reveal_viewed", user_id: "a", anonymous_id: null, properties: {} },
  ];
  const observations = productObservations({ experimentId: 4, sourceCode: "badger-product", channel: "product", targetMetric: "plan_reveal_rate", bucket: "2026082408", rows });
  assert.equal(observations.find((item) => item.metric === "onboarding_start_rate")?.value, 0.5);
  assert.equal(observations.find((item) => item.metric === "plan_reveal_rate")?.value, 1);
});
