import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_POLICY, DEFAULT_COACH_BUDGET, enforceCoachConsent, normalizeCoachTurn, normalizeProposedAction, parseCoachTurn } from "../lib/orchestration/policy.ts";
import { runCoachKernel } from "../lib/orchestration/kernel.ts";

const validCommitmentPayload = {
  title: "Make one call",
  outcome: "One conversation completed",
  dueAt: "2026-08-18T12:00:00.000Z",
  evidenceRequired: "Call notes",
  followUpPolicy: "remind",
};

test("parses a fenced structured coach turn", () => {
  const turn = parseCoachTurn('```json\n{"say":"Do the small thing.","facts":["Day 3"],"proposedActions":[],"stateUpdates":[],"stopReason":"reply"}\n```', "fallback");
  assert.equal(turn.say, "Do the small thing.");
  assert.deepEqual(turn.facts, ["Day 3"]);
});

test("accepts safe coach response aliases instead of discarding the answer", () => {
  assert.equal(parseCoachTurn('{"reply":"Start with one message."}', "fallback").say, "Start with one message.");
  assert.equal(parseCoachTurn("Start with the first five minutes.", "fallback").say, "Start with the first five minutes.");
});

test("the policy, not the model, assigns risk and approval", () => {
  const action = normalizeProposedAction({
    type: "send_email",
    title: "Send it",
    risk: "read",
    requiresApproval: false,
    payload: { to: "a@example.com", subject: "Question", text: "Can we talk?" },
  });
  assert.equal(action?.risk, "external");
  assert.equal(action?.requiresApproval, true);
  assert.equal(ACTION_POLICY.send_email.auto, false);
});

test("unknown tools are dropped and action count is bounded", () => {
  const turn = normalizeCoachTurn({
    say: "Here is the plan.",
    stateUpdates: [],
    proposedActions: [
      { type: "steal_password", title: "No" },
      ...Array.from({ length: 8 }, (_, index) => ({ type: "inspect_sprint", title: `Read ${index}` })),
    ],
  }, "fallback", 3);
  assert.equal(turn.proposedActions.length, 3);
  assert.ok(turn.proposedActions.every((action) => action.type === "inspect_sprint"));
});

test("memory is always approval gated", () => {
  const action = normalizeProposedAction({ type: "remember_lesson", title: "Remember", payload: { memoryId: "memory-id" } });
  assert.equal(action?.risk, "memory");
  assert.equal(action?.requiresApproval, true);
});

test("does not create memory or commitment approvals from a passing struggle", () => {
  const proposed = normalizeCoachTurn({
    say: "Let's work through it.",
    stateUpdates: [{ kind: "memory_candidate", memoryKind: "blocker", content: "Jimmy feels lost", confidence: 0.8 }],
    proposedActions: [{
      type: "create_commitment",
      title: "Make one call",
      payload: validCommitmentPayload,
    }],
  }, "fallback");
  const gated = enforceCoachConsent(proposed, "I feel lost and don't know where to start");
  assert.equal(gated.stateUpdates.length, 0);
  assert.equal(gated.proposedActions.length, 0);
});

test("does not create external approvals the founder did not request", () => {
  const proposed = normalizeCoachTurn({
    say: "Let's make the call smaller.",
    proposedActions: [{
      type: "schedule_nudge",
      title: "Remind them",
      payload: {
        to: "founder@example.com",
        subject: "Make the call",
        text: "Call one parent.",
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      },
    }],
  }, "fallback");

  assert.equal(enforceCoachConsent(proposed, "I'm scared they will think the idea is silly").proposedActions.length, 0);
  assert.equal(enforceCoachConsent(proposed, "Remind me to make the call").proposedActions.length, 1);
});

test("drops an incomplete or expired scheduled nudge before the approval UI", () => {
  assert.equal(normalizeProposedAction({
    type: "schedule_nudge",
    title: "Bad nudge",
    payload: { to: "made-up", scheduledAt: "2025-04-09T18:00:00Z" },
  }), null);
});

test("keeps an approval only after the founder explicitly requests it", () => {
  const proposed = normalizeCoachTurn({
    say: "I'll keep that with your approval.",
    stateUpdates: [{ kind: "memory_candidate", memoryKind: "preference", content: "Ask one question at a time", confidence: 0.9 }],
    proposedActions: [{ type: "create_commitment", title: "Make one call", payload: validCommitmentPayload }],
  }, "fallback");
  assert.equal(enforceCoachConsent(proposed, "Remember this: ask one question at a time").stateUpdates.length, 1);
  assert.equal(enforceCoachConsent(proposed, "Yes, I'll do that. Hold me to it").proposedActions.length, 1);
});

test("a founder commitment is always approval gated", () => {
  const action = normalizeProposedAction({ type: "create_commitment", title: "Promise", payload: validCommitmentPayload });
  assert.equal(action?.risk, "memory");
  assert.equal(action?.requiresApproval, true);
  assert.equal(ACTION_POLICY.create_commitment.auto, false);
});

test("drops a malformed commitment before it can reach the approval UI", () => {
  assert.equal(normalizeProposedAction({ type: "create_commitment", title: "Looks valid", payload: {} }), null);
  assert.equal(normalizeProposedAction({ type: "remember_lesson", title: "Remember", payload: {} }), null);
});

test("orchestration budget allows retries without unbounded tool loops", () => {
  assert.equal(DEFAULT_COACH_BUDGET.maxSteps, 3);
  assert.equal(DEFAULT_COACH_BUDGET.maxActions, 5);
  assert.ok(DEFAULT_COACH_BUDGET.maxCompletionTokens >= 6_000);
  assert.ok(DEFAULT_COACH_BUDGET.maxDurationMs >= 90_000);
});

test("a repeated automatic tool is executed once and does not exhaust the turn", async () => {
  let generated = 0;
  let executed = 0;
  const result = await runCoachKernel({
    generate: async () => {
      generated += 1;
      return {
        turn: normalizeCoachTurn({
          say: generated === 1 ? "Let me check today's exact move." : "Call the third person on your list and log what they say.",
          proposedActions: [{ type: "inspect_sprint", title: `Inspect attempt ${generated}`, payload: { attempt: generated } }],
          stateUpdates: [],
          stopReason: "reply",
        }, "fallback"),
        usage: { promptTokens: 100, completionTokens: 50, latencyMs: 10, model: "deepseek-v4-flash", fallback: false },
      };
    },
    executeAuto: async (action) => {
      executed += 1;
      return { actionType: action.type, ok: true, output: { title: "Conversation 3" } };
    },
  });

  assert.equal(generated, 2);
  assert.equal(executed, 1);
  assert.equal(result.steps, 2);
  assert.equal(result.budgetExhausted, false);
  assert.equal(result.turn.stopReason, "reply");
});
