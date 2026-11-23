import test from "node:test";
import assert from "node:assert/strict";

import { experimentDeliverableKey } from "../lib/company-os/deliverable-gate.ts";

test("one specialist deliverable has one durable slot per experiment", () => {
  assert.equal(
    experimentDeliverableKey({ experimentId: 9, agentId: "content", actionType: "draft_campaign" }),
    "company:experiment:9:content:draft_campaign",
  );
  assert.equal(
    experimentDeliverableKey({ experimentId: 9, agentId: "content", actionType: "draft_campaign" }),
    "company:experiment:9:content:draft_campaign",
  );
});

test("external and event actions keep their normal idempotency semantics", () => {
  assert.equal(experimentDeliverableKey({ experimentId: 9, agentId: "content", actionType: "publish_social_content" }), null);
  assert.equal(experimentDeliverableKey({ experimentId: null, agentId: "content", actionType: "draft_campaign" }), null);
});
