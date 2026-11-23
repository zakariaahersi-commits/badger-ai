import test from "node:test";
import assert from "node:assert/strict";

import {
  alignReplyWithPendingApproval,
  classifyCoachSafety,
  deriveCoachMode,
  missingContextReply,
  normalizeCoachReply,
} from "../lib/coach-policy.ts";
import { coachReplyNeedsRetry, sanitizeCoachReply } from "../lib/coach-rescue.ts";

const base = {
  mode: "sprint",
  day: 6,
  hasProfile: true,
  hasVenture: true,
  hasCurrentTask: true,
  currentTaskLogged: false,
  verifiedPaymentCount: 0,
};

test("derives the four Bo modes from durable state", () => {
  assert.equal(deriveCoachMode({ day: 1, hasProfile: false }), "onboarding");
  assert.equal(deriveCoachMode({ day: 8, hasProfile: true }), "sprint");
  assert.equal(deriveCoachMode({ day: 14, hasProfile: true }), "checkpoint");
  assert.equal(deriveCoachMode({ day: 9, hasProfile: true, outcome: "shipped" }), "graduate");
});

test("does not let Bo complete a task without a saved log", () => {
  const reply = normalizeCoachReply("The task is complete. Nice work.", base);
  assert.match(reply, /don’t have a saved log/i);
  assert.match(normalizeCoachReply("That's done.", base), /don’t have a saved log/i);
});

test("does not let Bo claim an unverified payment", () => {
  const reply = normalizeCoachReply("You got a payment from a customer.", base);
  assert.match(reply, /don’t have a verified payment/i);
  assert.match(normalizeCoachReply("Your first paying customer is real.", base), /don’t have a verified payment/i);
});

test("preserves payment questions that do not claim an outcome", () => {
  const reply = normalizeCoachReply("Have you asked anyone to pay yet?", base);
  assert.equal(reply, "Have you asked anyone to pay yet?");
});

test("states the context gap instead of guessing", () => {
  const reply = missingContextReply({ ...base, hasCurrentTask: false });
  assert.match(reply, /can’t see a Day 6 task/i);
});

test("routes high-stakes requests outside founder coaching", () => {
  assert.equal(classifyCoachSafety("Can you diagnose these symptoms?"), "medical");
  assert.equal(classifyCoachSafety("Which stock should I buy?"), "financial");
  assert.equal(classifyCoachSafety("I want to kill myself"), "crisis");
  assert.equal(classifyCoachSafety("How should I price this offer?"), "none");
});

test("keeps default replies concise", () => {
  const reply = normalizeCoachReply("One. Two. Three. Four. Five.", { ...base, currentTaskLogged: true });
  assert.equal(reply, "One. Two. Three. Four.");
});

test("keeps closing quotation marks attached to concise replies", () => {
  const reply = normalizeCoachReply('Text them: "Quick question?" Then ask: "What happened next?"', { ...base, currentTaskLogged: true });
  assert.equal(reply, 'Text them: "Quick question?" Then ask: "What happened next?"');
});

test("validates the concise reply the founder will actually see", () => {
  const reply = normalizeCoachReply(
    "Being lost is part of the work. You have spoken to two parents. Those conversations gave you evidence. We can find the next step. What feels unclear right now?",
    base,
  );
  assert.doesNotMatch(reply, /\?/);
  assert.equal(coachReplyNeedsRetry(reply, "I'm lost", []), true);
});

test("does not show a task-log warning beside a pending commitment approval", () => {
  const reply = alignReplyWithPendingApproval(
    "I don’t have a saved log for Day 13 yet. Save what you did before we count the task as complete.",
    [{ type: "create_commitment", title: "Create commitment", details: { commitmentTitle: "Call one parent today" } }],
  );
  assert.match(reply, /prepared this for your approval/i);
  assert.match(reply, /Call one parent today/);
  assert.doesNotMatch(reply, /saved log/i);
});

test("does not claim a commitment is set before the founder approves it", () => {
  const reply = alignReplyWithPendingApproval(
    "I've set the commitment and I'll hold you to it.",
    [{ type: "create_commitment", title: "Create commitment", details: { commitmentTitle: "Call one parent today" } }],
  );
  assert.match(reply, /prepared this for your approval/i);
  assert.doesNotMatch(reply, /I've set|I’ll hold|I'll hold/i);
});

test("a pending commitment cannot reintroduce a machine timestamp", () => {
  const reply = sanitizeCoachReply(alignReplyWithPendingApproval(
    "I prepared the commitment.",
    [{ type: "create_commitment", title: "Create commitment", details: { commitmentTitle: "Call one parent by 2026-08-17T12:00:00.000Z" } }],
  ));
  assert.doesNotMatch(reply, /2026-08-17T/);
  assert.match(reply, /the time you chose/);
});
