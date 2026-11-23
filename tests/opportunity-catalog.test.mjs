import test from "node:test";
import assert from "node:assert/strict";

import { matchOpportunities, OPPORTUNITY_CATALOG } from "../lib/opportunity-catalog.ts";
import { OPPORTUNITY_EVIDENCE } from "../lib/opportunity-evidence.ts";

test("the founder-facing opportunity catalogue is rewritten and contains no vendor links or income promises", () => {
  assert.equal(new Set(OPPORTUNITY_CATALOG.map((item) => item.id)).size, OPPORTUNITY_CATALOG.length);
  for (const item of OPPORTUNITY_CATALOG) {
    const publicCopy = `${item.label} ${item.detail}`;
    assert.doesNotMatch(publicCopy, /https?:\/\/|ideabrowser|trustmrr|\$\d|\b(?:arr|mrr)\b/i);
    assert.match(item.rights, /^(?:badger_original|open_licence)$/);
  }
});

test("every paid signal has auditable, openly licensed evidence", () => {
  const evidenceById = new Map(OPPORTUNITY_EVIDENCE.map((item) => [item.id, item]));
  const paidSignals = OPPORTUNITY_CATALOG.filter((item) => item.signal === "Paid market signal");
  assert.ok(paidSignals.length > 0);

  for (const item of paidSignals) {
    assert.equal(item.rights, "open_licence");
    assert.ok(item.evidenceIds?.length);
    for (const evidenceId of item.evidenceIds || []) {
      const evidence = evidenceById.get(evidenceId);
      assert.ok(evidence, `missing evidence ${evidenceId}`);
      assert.equal(evidence.licence, "Open Government Licence v3.0");
      assert.match(evidence.noticeUrl, /^https:\/\/www\.contractsfinder\.service\.gov\.uk\/Notice\//i);
      assert.ok(evidence.awardedValueGbp > 0);
    }
  }
});

test("open lanes are original Badger prompts, not unverified paid claims", () => {
  for (const item of OPPORTUNITY_CATALOG.filter((entry) => entry.signal === "Open lane")) {
    assert.equal(item.rights, "badger_original");
    assert.equal(item.evidenceIds, undefined);
  }
});

test("idea-less founders receive a varied bounded set matched to their interests", () => {
  const matches = matchOpportunities("I know local restaurants and hate paperwork", "independent restaurant owners", 6);
  assert.equal(matches.length, 6);
  assert.equal(matches[0].id, "restaurant-inspections");
  assert.equal(matches.some((item) => item.signal === "Open lane"), true);
});

test("matching is deterministic but does not give every founder the same default six", () => {
  const design = matchOpportunities("I enjoy design and writing", "freelancers", 6);
  const designAgain = matchOpportunities("I enjoy design and writing", "freelancers", 6);
  const care = matchOpportunities("I have worked in care and health", "families", 6);

  assert.deepEqual(design.map((item) => item.id), designAgain.map((item) => item.id));
  assert.notDeepEqual(design.map((item) => item.id), care.map((item) => item.id));
  assert.equal(design[0].id, "freelance-scope");
  assert.equal(care.slice(0, 3).some((item) => item.category === "Care"), true);
});
