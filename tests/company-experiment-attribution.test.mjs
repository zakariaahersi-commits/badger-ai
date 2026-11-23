import test from "node:test";
import assert from "node:assert/strict";

import { buildExperimentTrackingUrl, canonicalExperimentMetric, withExperimentTrackingLink } from "../lib/company-os/experiment-attribution.ts";

test("raw funnel events resolve to the metrics stored by the evidence collector", () => {
  assert.equal(canonicalExperimentMetric("onboarding_started"), "attributed_onboarding_starts");
  assert.equal(canonicalExperimentMetric("checkout_completed"), "attributed_checkout_completions");
  assert.equal(canonicalExperimentMetric("instagram_reach"), "instagram_reach");
});

test("experiment links use the campaign field consumed by attribution", () => {
  const url = buildExperimentTrackingUrl({ sourceCode: "badger-20260821-other", channel: "other" });
  assert.equal(url, "https://badger.example.com/start?utm_source=badger_company_os&utm_medium=other&utm_campaign=badger-20260821-other");
});

test("a stale warm-DM link is repaired before it reaches the owner brief", () => {
  const trackingUrl = buildExperimentTrackingUrl({ sourceCode: "badger-20260821-other", channel: "other" });
  const content = withExperimentTrackingLink("See your Day 1: https://badger.example.com/start?utm_content=badger-20260821-other", trackingUrl);
  assert.match(content, /utm_campaign=badger-20260821-other/);
  assert.doesNotMatch(content, /utm_content=/);
});
