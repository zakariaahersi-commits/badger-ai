import test from "node:test";
import assert from "node:assert/strict";

import { journeyReadyReminderDue, latestJourneyRecoveryCandidates, recoveryReminderDue } from "../lib/checkout-recovery-policy.ts";

const NOW = new Date("2026-08-18T12:00:00.000Z");

test("journey-ready recovery waits an hour and expires after fourteen days", () => {
  assert.equal(journeyReadyReminderDue("2026-08-18T11:01:00.000Z", NOW), false);
  assert.equal(journeyReadyReminderDue("2026-08-18T11:00:00.000Z", NOW), true);
  assert.equal(journeyReadyReminderDue("2026-08-04T12:00:00.000Z", NOW), true);
  assert.equal(journeyReadyReminderDue("2026-08-04T11:59:59.000Z", NOW), false);
  assert.equal(journeyReadyReminderDue("not-a-date", NOW), false);
});

test("journey recovery includes saved accounts even when the paywall never rendered", () => {
  const candidates = latestJourneyRecoveryCandidates([
    { user_id: "saved-only", event_name: "account_save_completed", created_at: "2026-08-18T10:00:00.000Z" },
    { user_id: "saw-paywall", event_name: "account_save_completed", created_at: "2026-08-18T09:00:00.000Z" },
    { user_id: "saw-paywall", event_name: "paywall_viewed", created_at: "2026-08-18T09:01:00.000Z" },
    { user_id: null, event_name: "paywall_viewed", created_at: "2026-08-18T10:00:00.000Z" },
    { user_id: "ignored", event_name: "plan_reveal_viewed", created_at: "2026-08-18T10:00:00.000Z" },
  ]);
  assert.deepEqual(candidates, [
    { userId: "saved-only", signalledAt: "2026-08-18T10:00:00.000Z", source: "account_save" },
    { userId: "saw-paywall", signalledAt: "2026-08-18T09:01:00.000Z", source: "saved_paywall" },
  ]);
});

test("checkout recovery still sends at one hour and twenty-four hours only", () => {
  assert.equal(recoveryReminderDue({ user_id: "user", checkout_started_at: "2026-08-18T11:00:00.000Z", reminder_count: 0 }, NOW), 1);
  assert.equal(recoveryReminderDue({ user_id: "user", checkout_started_at: "2026-08-17T12:00:00.000Z", reminder_count: 1 }, NOW), 2);
  assert.equal(recoveryReminderDue({ user_id: "user", checkout_started_at: "2026-08-17T12:00:00.000Z", reminder_count: 2 }, NOW), null);
});
