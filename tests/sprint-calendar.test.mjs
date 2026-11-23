import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarSprintDay,
  isSelectedNudgeDay,
  journeyNudgeReason,
  localSchedule,
  scheduledNudgeHour,
  sprintDaysAfterToday,
} from "../lib/sprint-calendar.ts";

test("Day 1 is the local calendar date of payment and Day 2 is the next date", () => {
  const paidAt = "2026-08-05T22:30:00.000Z"; // 00:30 on Aug 6 in Stockholm
  assert.equal(calendarSprintDay(paidAt, new Date("2026-08-06T20:00:00.000Z"), "Europe/Stockholm"), 1);
  assert.equal(calendarSprintDay(paidAt, new Date("2026-08-06T22:01:00.000Z"), "Europe/Stockholm"), 2);
});

test("the sprint uses real calendar dates rather than completed tasks", () => {
  assert.equal(calendarSprintDay("2026-08-05T08:00:00.000Z", new Date("2026-08-08T08:00:00.000Z"), "Europe/Stockholm"), 4);
  assert.equal(sprintDaysAfterToday(4), 24);
});

test("regular nudges only run on selected local weekdays and at local hours", () => {
  const monday = localSchedule(new Date("2026-08-03T06:00:00.000Z"), "Europe/Stockholm");
  assert.equal(monday.weekday, 0);
  assert.equal(monday.hour, 8);
  assert.equal(isSelectedNudgeDay([0, 3, 6], monday.weekday), true);
  assert.equal(isSelectedNudgeDay([1, 3, 6], monday.weekday), false);
  assert.equal(scheduledNudgeHour("morning", "21:00", "08:00"), 8);
  assert.equal(scheduledNudgeHour("evening", "21:00", "08:00"), 20);
});

test("key journey checkpoints send even when that weekday was not selected", () => {
  assert.equal(journeyNudgeReason([0, 2], 0, 6), "selected_day");
  assert.equal(journeyNudgeReason([0, 2], 4, 6), null);
  assert.equal(journeyNudgeReason([0, 2], 4, 7), "checkpoint");
  assert.equal(journeyNudgeReason([0, 2], 4, 14), "checkpoint");
  assert.equal(journeyNudgeReason([0, 2], 4, 21), "checkpoint");
  assert.equal(journeyNudgeReason([0, 2], 4, 28), "checkpoint");
});
