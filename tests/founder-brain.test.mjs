import test from "node:test";
import assert from "node:assert/strict";
import { buildFounderBrainBrief, normalizeCommitmentPayload } from "../lib/founder-brain.ts";

const NOW = new Date("2026-08-04T12:00:00.000Z");

function entity(kind, summary, sourceType = "proof") {
  return {
    id: `${kind}-1`,
    kind,
    name: kind,
    summary,
    status: "active",
    confidence: 0.8,
    source_type: sourceType,
    source_ref: "test",
    occurred_at: NOW.toISOString(),
    last_verified_at: NOW.toISOString(),
    stale_after: "2026-08-20T00:00:00.000Z",
    metadata: {},
    updated_at: NOW.toISOString(),
  };
}

test("brief exposes the highest-value missing commercial fact", () => {
  const brief = buildFounderBrainBrief([
    entity("hypothesis", "Pricing help for creators", "onboarding"),
    entity("customer", "Independent designers", "onboarding"),
    entity("evidence", "Two designers lose time deciding their rate"),
  ], [], NOW);
  assert.match(brief.missing, /verified payment/i);
  assert.match(brief.nextMove, /pay/i);
  assert.equal(brief.known[0].text, "Two designers lose time deciding their rate");
});

test("an overdue promise becomes the next move", () => {
  const brief = buildFounderBrainBrief([], [{
    id: "c1",
    title: "Send the offer to Lina",
    outcome: "Lina receives the offer",
    due_at: "2026-08-04T11:00:00.000Z",
    evidence_required: "Sent screenshot",
    evidence_status: "pending",
    status: "open",
    follow_up_policy: "challenge",
  }], NOW);
  assert.match(brief.nextMove, /complete or honestly change/i);
  assert.equal(brief.commitment?.id, "c1");
});

test("commitment payload is bounded and requires a future date", () => {
  const payload = normalizeCommitmentPayload({
    title: "Send two offers",
    outcome: "Two people receive the offer",
    dueAt: "2026-08-05T12:00:00.000Z",
    evidenceRequired: "Two sent-message screenshots",
    followUpPolicy: "challenge",
  }, NOW.getTime());
  assert.equal(payload.followUpPolicy, "challenge");
  assert.throws(() => normalizeCommitmentPayload({ ...payload, dueAt: "2026-08-04T11:00:00.000Z" }, NOW.getTime()), /due_at/);
});
