import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWakePolicy } from "../lib/wake-engine.ts";

function orders(overrides = {}) {
  return {
    timezone: "Europe/Stockholm",
    quietStart: "21:00",
    quietEnd: "08:00",
    maxDailyNudges: 2,
    minIntervalMinutes: 180,
    accountabilityLevel: "direct",
    emailEnabled: true,
    pushEnabled: true,
    pausedUntil: null,
    ...overrides,
  };
}

test("wake policy reschedules during local quiet hours", () => {
  const result = evaluateWakePolicy({
    now: new Date("2026-08-04T21:30:00.000Z"),
    orders: orders(),
    deliveredInLast24Hours: 0,
    lastDeliveredAt: null,
  });
  assert.equal(result.decision, "reschedule");
  assert.equal(result.reason, "quiet_hours");
});

test("wake policy applies a rolling delivery cap", () => {
  const result = evaluateWakePolicy({
    now: new Date("2026-08-04T12:00:00.000Z"),
    orders: orders(),
    deliveredInLast24Hours: 2,
    lastDeliveredAt: "2026-08-04T08:00:00.000Z",
  });
  assert.deepEqual(result, { decision: "suppress", reason: "daily_limit" });
});

test("wake policy reschedules inside the cooldown", () => {
  const result = evaluateWakePolicy({
    now: new Date("2026-08-04T12:00:00.000Z"),
    orders: orders(),
    deliveredInLast24Hours: 1,
    lastDeliveredAt: "2026-08-04T11:00:00.000Z",
  });
  assert.equal(result.decision, "reschedule");
  assert.equal(result.reason, "cooldown");
  assert.equal(result.retryAt, "2026-08-04T14:00:00.000Z");
});
